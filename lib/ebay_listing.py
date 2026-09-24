"""Real eBay listing creation via the Sell Inventory API.

Replaces the fabricated `EbayConnector.create_listing` in
`lib/platform_connectors.py`, which POSTed an invented payload
(`{title, description, price, images}`) to `/inventory_item` — an endpoint
that does not accept POST and a body eBay does not define. It could never
have created a listing.

Creating an eBay listing is **three calls**, not one:

1. ``PUT  /sell/inventory/v1/inventory_item/{sku}``   (createOrReplaceInventoryItem)
2. ``POST /sell/inventory/v1/offer``                  (createOffer -> offerId)
3. ``POST /sell/inventory/v1/offer/{offerId}/publish``(publishOffer -> listingId)

Price does **not** live on the inventory item — it lives on the offer. An
inventory item alone is not a listing and is not visible to buyers. Only a
published offer produces a real listing ID.

⚠ Written from eBay's published API documentation and NOT exercised against a
live seller account — no eBay credentials exist in this repo yet. Field names
and the call sequence are [Likely], not verified. The payload builders are
pure functions specifically so they can be diffed against a real request when
credentials arrive.

Auth: an OAuth 2.0 **user access token** with the ``sell.inventory`` scope,
passed as ``Authorization: Bearer <token>``. This is a genuinely different
credential from the Auth'n'Auth **user token** the ``ebay-sync`` Edge Function
uses for the legacy Trading API. Both are legitimate; they are not
interchangeable, and this repo has historically confused them.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Callable, Optional
from urllib.parse import quote

EBAY_BASE_URL = "https://api.ebay.com/sell/inventory/v1"
EBAY_SANDBOX_BASE_URL = "https://api.sandbox.ebay.com/sell/inventory/v1"

# eBay hard limits, from the Inventory API field docs.
TITLE_MAX = 80
MAX_IMAGE_URLS = 24

# Condition enum accepted by createOrReplaceInventoryItem. Restricted on
# purpose: an unrecognised condition is rejected by eBay at publish time with
# an opaque error, so it is cheaper to fail here with a readable message.
VALID_CONDITIONS = frozenset({
    "NEW",
    "LIKE_NEW",
    "NEW_OTHER",
    "NEW_WITH_DEFECTS",
    "USED_EXCELLENT",
    "USED_VERY_GOOD",
    "USED_GOOD",
    "USED_ACCEPTABLE",
    "FOR_PARTS_OR_NOT_WORKING",
})


class EbayListingError(RuntimeError):
    """A listing step failed. Carries which step, so failures are diagnosable.

    `offer_id` is set whenever an offer already exists on eBay's side at the
    time of failure (i.e. any failure at or after the publishOffer call). A
    caller that wants to safely resume — rather than blindly re-running
    `create_listing()`, which would call `createOffer` again and can create a
    second, duplicate offer for the same SKU — needs this as a structured
    field, not something parsed out of the message string.
    """

    def __init__(self, step: str, message: str, status: Optional[int] = None,
                 body: Any = None, offer_id: Optional[str] = None) -> None:
        super().__init__(f"[{step}] {message}")
        self.step = step
        self.status = status
        self.body = body
        self.offer_id = offer_id


class EbayValidationError(ValueError):
    """Input rejected before any network call."""


@dataclass(frozen=True)
class EbayListingPolicies:
    """Seller account policy IDs required to publish an offer.

    All four are REQUIRED and have no defaults on purpose. They are specific
    to the seller account and must be fetched from the Account API
    (``/sell/account/v1/fulfillment_policy`` etc.) or read from the eBay
    Business Policies UI. Guessing them produces listings with the wrong
    shipping, returns, or payment terms — a real-money error, not a typo.
    """

    fulfillment_policy_id: str
    payment_policy_id: str
    return_policy_id: str
    merchant_location_key: str

    def __post_init__(self) -> None:
        for name in ("fulfillment_policy_id", "payment_policy_id",
                     "return_policy_id", "merchant_location_key"):
            if not str(getattr(self, name) or "").strip():
                raise EbayValidationError(f"{name} is required and cannot be empty")


@dataclass(frozen=True)
class EbayProduct:
    """A product to list. `category_id` is required — eBay has no default."""

    sku: str
    title: str
    description: str
    price: str | float | Decimal
    category_id: str
    quantity: int = 1
    condition: str = "USED_GOOD"
    image_urls: tuple[str, ...] = ()
    marketplace_id: str = "EBAY_US"
    currency: str = "USD"
    aspects: dict[str, list[str]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not str(self.sku or "").strip():
            raise EbayValidationError("sku is required")
        if not str(self.title or "").strip():
            raise EbayValidationError("title is required")
        if len(self.title) > TITLE_MAX:
            raise EbayValidationError(
                f"title is {len(self.title)} chars; eBay's limit is {TITLE_MAX}. "
                "Shorten it deliberately rather than letting eBay truncate it."
            )
        if not str(self.category_id or "").strip():
            raise EbayValidationError(
                "category_id is required — eBay has no default category, and a "
                "wrong one buries the listing in search"
            )
        if self.condition not in VALID_CONDITIONS:
            raise EbayValidationError(
                f"condition {self.condition!r} is not a recognised eBay condition. "
                f"Valid: {', '.join(sorted(VALID_CONDITIONS))}"
            )
        if self.quantity < 1:
            raise EbayValidationError(f"quantity must be >= 1, got {self.quantity}")
        if not self.image_urls:
            # eBay rejects a publish with no picture for essentially every
            # category. Failing here names the problem; failing at publishOffer
            # returns an error code that does not mention images.
            raise EbayValidationError(
                "at least one image URL is required — eBay will not publish a "
                "listing without a picture"
            )
        if len(self.image_urls) > MAX_IMAGE_URLS:
            raise EbayValidationError(
                f"{len(self.image_urls)} images supplied; eBay accepts at most "
                f"{MAX_IMAGE_URLS}"
            )
        for url in self.image_urls:
            if not str(url).startswith(("http://", "https://")):
                raise EbayValidationError(
                    f"image URL must be publicly fetchable http(s), got {url!r}. "
                    "eBay pulls images by URL; local paths and data: URIs fail."
                )
        # Normalising here means the price string in the payload is exact.
        object.__setattr__(self, "price", _normalise_price(self.price))


def _normalise_price(price: str | float | Decimal) -> str:
    """Return a 2-decimal string. Uses Decimal so 24.99 never becomes 24.98.

    The is_finite() guard is not decoration: `Decimal('Infinity') <= 0` is
    False, so without it a non-finite price passed validation and was sent to
    eBay as the literal string "Infinity" in pricingSummary. `Decimal('NaN')
    <= 0` raises InvalidOperation from outside the try, surfacing an
    undocumented exception type. Both shipped here before review caught them.

    ROUND_HALF_UP because Decimal formatting rounds half-to-even by default:
    f"{Decimal('0.125'):.2f}" is '0.12', which underprices at the tie.
    """
    try:
        value = Decimal(str(price))
    except (InvalidOperation, ValueError) as exc:
        raise EbayValidationError(f"price is not a number: {price!r}") from exc
    if not value.is_finite():
        raise EbayValidationError(f"price must be a finite number, got {price!r}")
    if value <= 0:
        raise EbayValidationError(f"price must be positive, got {price!r}")
    try:
        return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except InvalidOperation as exc:
        raise EbayValidationError(
            f"price is too large to express in cents: {price!r}"
        ) from exc


def build_inventory_item_payload(product: EbayProduct) -> dict[str, Any]:
    """Body for createOrReplaceInventoryItem. Note: no price — that's the offer."""
    payload: dict[str, Any] = {
        "product": {
            "title": product.title,
            "description": product.description,
        },
        "condition": product.condition,
        "availability": {
            "shipToLocationAvailability": {"quantity": product.quantity},
        },
    }
    if product.image_urls:
        payload["product"]["imageUrls"] = list(product.image_urls)
    if product.aspects:
        payload["product"]["aspects"] = product.aspects
    return payload


def build_offer_payload(product: EbayProduct,
                        policies: EbayListingPolicies) -> dict[str, Any]:
    """Body for createOffer. This is where price, category, and policies live."""
    return {
        "sku": product.sku,
        "marketplaceId": product.marketplace_id,
        "format": "FIXED_PRICE",
        "availableQuantity": product.quantity,
        "categoryId": product.category_id,
        "listingDescription": product.description,
        "listingPolicies": {
            "fulfillmentPolicyId": policies.fulfillment_policy_id,
            "paymentPolicyId": policies.payment_policy_id,
            "returnPolicyId": policies.return_policy_id,
        },
        "pricingSummary": {
            "price": {"value": product.price, "currency": product.currency},
        },
        "merchantLocationKey": policies.merchant_location_key,
    }


@dataclass
class EbayListingResult:
    """Outcome of a listing attempt. `listing_id` is set ONLY on a real publish."""

    sku: str
    listing_id: Optional[str] = None
    offer_id: Optional[str] = None
    dry_run: bool = False
    steps: list[str] = field(default_factory=list)
    payloads: dict[str, Any] = field(default_factory=dict)

    @property
    def published(self) -> bool:
        """True only when eBay returned a real listing ID. A dry run is False."""
        return bool(self.listing_id) and not self.dry_run


class EbayListingClient:
    """Creates eBay listings through the three-call Inventory API flow.

    `transport` is injectable so the flow can be tested without credentials or
    network. It receives (method, url, headers, body) and must return an object
    exposing `.status_code` and `.json()` — `requests` responses satisfy this.
    """

    def __init__(self, access_token: str,
                 transport: Optional[Callable[..., Any]] = None,
                 sandbox: bool = False) -> None:
        if not str(access_token or "").strip():
            raise EbayValidationError(
                "access_token is required (OAuth user token with sell.inventory scope)"
            )
        self.access_token = access_token
        self.base_url = EBAY_SANDBOX_BASE_URL if sandbox else EBAY_BASE_URL
        self._transport = transport or _requests_transport

    def _headers(self, content_language: bool = False) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if content_language:
            # Required by createOrReplaceInventoryItem; omitting it returns a
            # 400 whose message does not mention the header.
            headers["Content-Language"] = "en-US"
        return headers

    def _call(self, step: str, method: str, url: str, body: Any,
              ok_statuses: tuple[int, ...], content_language: bool = False,
              offer_id: Optional[str] = None) -> Any:
        response = self._transport(
            method, url, self._headers(content_language=content_language), body,
        )
        status = getattr(response, "status_code", None)
        if status not in ok_statuses:
            raise EbayListingError(
                step,
                f"eBay returned HTTP {status}",
                status=status,
                body=_safe_body(response),
                offer_id=offer_id,
            )
        return response

    def create_listing(self, product: EbayProduct, policies: EbayListingPolicies,
                       dry_run: bool = True) -> EbayListingResult:
        """Run the full flow. Defaults to a dry run — publishing is real money.

        Raises EbayListingError naming the failing step. Never returns a
        result claiming success when a step failed.
        """
        item_payload = build_inventory_item_payload(product)
        offer_payload = build_offer_payload(product, policies)
        result = EbayListingResult(
            sku=product.sku,
            payloads={"inventory_item": item_payload, "offer": offer_payload},
        )

        if dry_run:
            result.dry_run = True
            result.steps = ["dry_run: no request sent"]
            return result

        # 1. Inventory item. 204 = replaced an existing SKU, 200/201 = created.
        # SKU is quoted before it reaches a URL path — nothing upstream
        # restricts its character set, and an unquoted "/" or "?" would
        # alter the request path or append an unintended query string.
        self._call(
            "createOrReplaceInventoryItem", "PUT",
            f"{self.base_url}/inventory_item/{quote(product.sku, safe='')}",
            item_payload, ok_statuses=(200, 201, 204), content_language=True,
        )
        result.steps.append("createOrReplaceInventoryItem: ok")

        # 2. Offer — carries price, category, and policies.
        # content_language=True: eBay's Inventory API requires the
        # Content-Language header on any call carrying free-text content
        # (offer_payload includes listingDescription), not just
        # createOrReplaceInventoryItem. Its absence here was undiscovered
        # until a real live call returned errorId 25709 "Invalid value for
        # header Content-Language" at this exact step.
        offer_response = self._call(
            "createOffer", "POST", f"{self.base_url}/offer",
            offer_payload, ok_statuses=(200, 201), content_language=True,
        )
        offer_id = _extract(offer_response, "offerId")
        if not offer_id:
            raise EbayListingError(
                "createOffer",
                "eBay accepted the offer but returned no offerId; cannot publish",
                status=getattr(offer_response, "status_code", None),
                body=_safe_body(offer_response),
            )
        result.offer_id = offer_id
        result.steps.append(f"createOffer: ok (offerId={offer_id})")

        # 3. Publish — only this makes the listing live and buyer-visible.
        # offer_id is passed to _call so a non-2xx here still tells the
        # caller which offer is now orphaned, not just that publish failed.
        publish_response = self._call(
            "publishOffer", "POST",
            f"{self.base_url}/offer/{quote(offer_id, safe='')}/publish",
            None, ok_statuses=(200, 201), offer_id=offer_id,
        )
        listing_id = _extract(publish_response, "listingId")
        if not listing_id:
            # An offer exists but is unpublished. Say so plainly — this state
            # is recoverable by hand and must not be reported as a success.
            raise EbayListingError(
                "publishOffer",
                f"publish returned no listingId; offer {offer_id} exists but is "
                "NOT live. Publish it manually or retry before creating a new offer.",
                status=getattr(publish_response, "status_code", None),
                body=_safe_body(publish_response),
                offer_id=offer_id,
            )
        result.listing_id = listing_id
        result.steps.append(f"publishOffer: ok (listingId={listing_id})")
        return result


def _requests_transport(method: str, url: str, headers: dict[str, str],
                        body: Any) -> Any:
    """Default transport. Imported lazily so tests need no `requests` install."""
    import requests  # noqa: PLC0415 - deliberate lazy import

    return requests.request(
        method, url, headers=headers,
        data=json.dumps(body) if body is not None else None,
        timeout=30,
    )


def _extract(response: Any, key: str) -> Optional[str]:
    try:
        payload = response.json()
    except Exception:
        return None
    if isinstance(payload, dict):
        value = payload.get(key)
        return str(value) if value else None
    return None


def _safe_body(response: Any) -> Any:
    """Best-effort error body — never let error reporting raise."""
    try:
        return response.json()
    except Exception:
        try:
            return getattr(response, "text", None)
        except Exception:
            return None
