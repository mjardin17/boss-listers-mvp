"""Real Etsy listing creation via the Open API v3.

Etsy's create flow differs from eBay's in ways that matter:

1. **Request body is form-encoded, not JSON** — every value becomes a
   string on the wire, which sidesteps the float-repr hazard eBay's price
   handling has to guard against with Decimal (a JSON `24.99` can
   serialize as `24.990000000000002`; form-encoding never does).
2. **Draft-first, always.** ``createDraftListing`` cannot set the listing
   live — it always produces a ``draft``. Going live is a *separate*
   ``PATCH .../listings/{listing_id}`` with ``state=active``, which costs
   Etsy's per-listing fee. This module exposes that as a distinct,
   separately-gated step, not folded into creation.
3. **Images are binary uploads, not URLs.** eBay *pulls* images by URL;
   Etsy requires the file bytes via a separate
   ``POST .../listings/{listing_id}/images`` call per image, and returns
   an ``image_id`` used nowhere else. Fetching a remote URL to re-upload it
   is new SSRF surface eBay's path never had — restricted to https,
   redirects refused, response size capped.
4. **No idempotency on create.** eBay's inventory-item PUT replaces on
   retry; Etsy's ``createDraftListing`` is a POST with no idempotency key —
   calling it twice makes two drafts. This module never auto-retries a
   partial failure; ``EtsyListingError.listing_id`` is set whenever a draft
   already exists on Etsy's side, so a caller can resume instead of
   duplicating.

Field values verified against Etsy's own OpenAPI-derived parameter tables
(who_made/when_made enums, title character-set rule, is_supply optionality,
shippingProfileId's conditional requirement) — 2026-08-20. When Etsy last
touched createDraftListing is unknown to this module; the docstring on
``WHEN_MADE_VALUES`` explains the one field that is known to drift.

5. **Digital files are a third separately-gated upload step, not part of
   createDraftListing either.** Confirmed 2026-08-20 against
   gordonturner/etsy-open-api-client's ShopListingFileApi.md and Etsy's own
   Listings Tutorial: ``uploadListingFile`` is
   ``POST .../listings/{listing_id}/files``, multipart field name ``file``
   plus ``name`` (the buyer-visible filename) and ``rank``. Etsy's docs
   state explicitly that a file cannot be assigned at draft-creation time —
   same shape as images. who_made/when_made are required on ALL listing
   types, including ``download`` — confirmed via a real API example in a
   public etsy/open-api GitHub discussion, not assumed to carry over from
   the physical case. Etsy enforces a 20MB-per-file, 5-files-per-listing
   cap (from Etsy's seller help docs, not the API schema — a platform
   limit, not a request-validation rule, so a request that violates it may
   still round-trip a 200 before failing elsewhere in Etsy's pipeline).

⚠ Not yet exercised against a live Etsy account — no ETSY_REFRESH_TOKEN
exists in this repo yet (see CHANNEL_SETUP.md). Field names and the call
sequence are [Likely], verified against documentation, not a live request.
The payload builders are pure functions specifically so they can be diffed
against a real request once credentials exist — same reasoning as
lib/ebay_listing.py.

Auth: OAuth 2.0 + PKCE, an access token with the ``listings_w`` scope
(``listings_r``/``shops_r`` also needed elsewhere in this app for reads).

Two *different* credentials are in play, and conflating them is the most
common way to get a confusing 403 here:

* ``Authorization: Bearer <access_token>`` — the per-shop OAuth token. Etsy's
  PKCE flow takes no client secret at the token-exchange step.
* ``x-api-key: <keystring>:<shared_secret>`` — app-level identity, sent on
  EVERY request including unauthenticated ones.

The ``x-api-key`` format is VERIFIED against the live production API
(2026-08-20), not inferred from docs. Probing
``GET /v3/application/openapi-ping``:

* ``x-api-key: <keystring>``                 -> 403 "Shared secret is required
  in x-api-key header."
* ``x-api-key: <shared_secret>``             -> 403 "API key not found or not
  active, or incorrect shared secret for API key."
* ``x-api-key: <keystring>:<shared_secret>`` -> **200** ``{"application_id": ...}``

So ``ETSY_SHARED_SECRET`` IS required — just by the API-key header rather than
by the token exchange. A prior revision of the sibling Node client asserted the
opposite and was verified only against a mocked fetch, which confirmed the code
matched its author's intent without ever showing the intent was wrong. Pass the
colon-joined pair as ``api_key``; ``EtsyListingClient`` will reject a bare
keystring rather than let it fail as an opaque 403 at call time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Callable, ClassVar, Optional

ETSY_BASE_URL = "https://openapi.etsy.com/v3/application"

TITLE_MAX = 140  # [Likely] — not confirmed by the parameter table itself,
# carried from documentation search; verify against a live 400 response
# before trusting it as a hard ceiling rather than a safe-under-estimate.

# Etsy allows letters, numbers, punctuation, mathematical symbols,
# whitespace, and ™©®, but at most ONE occurrence each of % : & + across
# the whole title. Confirmed via Etsy's own parameter documentation.
_SINGLE_USE_CHARS = "%:&+"
_TITLE_ALLOWED_RE = re.compile(r"^[\w\s.,!?'\"()\[\]/@#*™©®%:&+-]*$", re.UNICODE)

WHO_MADE_VALUES = frozenset({"i_did", "someone_else", "collective"})

# Etsy's own enum, confirmed 2026-08-20. This list is documented (by the
# planner review that preceded this file) as one that ROLLS FORWARD as the
# 20-year vintage cutoff advances — do not assume this exact set is still
# current without re-checking developers.etsy.com if this file is more
# than a few months old.
WHEN_MADE_VALUES = frozenset({
    "made_to_order",
    "2020_2023", "2010_2019", "2004_2009", "2000_2003", "before_2004",
    "1990s", "1980s", "1970s", "1960s", "1950s", "1940s", "1930s",
    "1920s", "1910s", "1900s", "1800s", "1700s", "before_1700",
})

# Etsy's baseline "vintage" requirement — a listing whose when_made value
# lands here should have who_made == "someone_else" or the listing risks
# a policy violation even though the API itself will accept the mismatch.
_VINTAGE_WHEN_MADE = frozenset({
    "before_2004", "1990s", "1980s", "1970s", "1960s", "1950s", "1940s",
    "1930s", "1920s", "1910s", "1900s", "1800s", "1700s", "before_1700",
})

LISTING_TYPES = frozenset({"physical", "download", "both"})


class EtsyListingError(RuntimeError):
    """A listing step failed. Carries which step and, once a draft exists
    on Etsy's side, the listing_id — the same reasoning as
    lib/ebay_listing.py's EbayListingError.offer_id: Etsy's create call is
    NOT idempotent, so a caller catching this must be able to resume from
    the existing draft rather than blindly retrying create_listing(),
    which would produce a second, duplicate draft."""

    def __init__(self, step: str, message: str, status: Optional[int] = None,
                 body: Any = None, listing_id: Optional[str] = None) -> None:
        super().__init__(f"[{step}] {message}")
        self.step = step
        self.status = status
        self.body = body
        self.listing_id = listing_id


class EtsyValidationError(ValueError):
    """Input rejected before any network call."""


@dataclass(frozen=True)
class EtsyImageSource:
    """One image to attach. Exactly one of url/local_path must be set.
    url is fetched server-side (new SSRF surface vs. eBay's client-pulled
    model — restricted to https, no redirects followed, size-capped by the
    caller); local_path reads a file already on disk, which is both safer
    and matches how Boss Listers already has photos available."""

    url: Optional[str] = None
    local_path: Optional[str] = None

    def __post_init__(self) -> None:
        has_url = bool(self.url)
        has_path = bool(self.local_path)
        if has_url == has_path:
            raise EtsyValidationError(
                "EtsyImageSource requires exactly one of url or local_path, "
                f"got url={self.url!r} local_path={self.local_path!r}"
            )
        if has_url and not str(self.url).startswith("https://"):
            raise EtsyValidationError(
                f"image url must be https://, got {self.url!r} — Etsy/this "
                "module refuses to fetch over plain http"
            )


@dataclass(frozen=True)
class EtsyDigitalFileSource:
    """One digital-download file to attach to a 'download' or 'both'
    listing. Same url/local_path exclusivity as EtsyImageSource, plus a
    required `filename` — unlike images, Etsy shows this name to the buyer
    in their download, and has no default for it.

    Etsy caps digital files at 20MB each, 5 files per listing (confirmed
    2026-08-20 via Etsy's own seller help docs — this is a platform limit,
    not part of the createDraftListing/uploadListingFile API schema, so it
    isn't in the parameter table the rest of this module's validation is
    sourced from). A local_path source is checked against the cap
    immediately, since the size is knowable up front; a url source is not
    — it can only be checked after the server-side fetch, at upload time.
    """

    url: Optional[str] = None
    local_path: Optional[str] = None
    filename: str = ""

    MAX_FILE_BYTES: ClassVar[int] = 20 * 1024 * 1024  # Etsy's 20MB/file cap

    def __post_init__(self) -> None:
        has_url = bool(self.url)
        has_path = bool(self.local_path)
        if has_url == has_path:
            raise EtsyValidationError(
                "EtsyDigitalFileSource requires exactly one of url or "
                f"local_path, got url={self.url!r} local_path={self.local_path!r}"
            )
        if has_url and not str(self.url).startswith("https://"):
            raise EtsyValidationError(
                f"digital file url must be https://, got {self.url!r} — this "
                "module refuses to fetch over plain http"
            )
        if not str(self.filename or "").strip():
            raise EtsyValidationError(
                "filename is required for a digital file — it's the name "
                "Etsy shows the buyer in their download; Etsy has no default"
            )
        if has_path:
            path = Path(self.local_path)
            if not path.exists():
                raise EtsyValidationError(
                    f"local_path does not exist: {self.local_path!r}"
                )
            size = path.stat().st_size
            if size > self.MAX_FILE_BYTES:
                raise EtsyValidationError(
                    f"{self.local_path!r} is {size} bytes; Etsy's per-file "
                    f"limit is {self.MAX_FILE_BYTES} bytes (20MB)"
                )


@dataclass(frozen=True)
class EtsyProduct:
    """A product to list as an Etsy draft.

    who_made/when_made/is_supply jointly determine whether the listing is
    handmade, vintage, or a craft supply — Etsy enforces policy rules on
    the combination, not just on each field alone. See
    __post_init__ for the cross-field check this module can catch locally;
    it cannot catch everything Etsy's policy team might flag by hand.
    """

    sku: str
    title: str
    description: str
    price: str | float | Decimal
    who_made: str
    when_made: str
    taxonomy_id: str | int
    quantity: int = 1
    is_supply: bool = False
    listing_type: str = "physical"
    materials: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    images: tuple[EtsyImageSource, ...] = ()
    digital_files: tuple[EtsyDigitalFileSource, ...] = ()
    shipping_profile_id: Optional[str | int] = None
    return_policy_id: Optional[str | int] = None

    def __post_init__(self) -> None:
        if not str(self.sku or "").strip():
            raise EtsyValidationError("sku is required")
        if not str(self.title or "").strip():
            raise EtsyValidationError("title is required")
        if len(self.title) > TITLE_MAX:
            raise EtsyValidationError(
                f"title is {len(self.title)} chars; Etsy's limit is "
                f"{TITLE_MAX}. Shorten it deliberately rather than letting "
                "Etsy reject the request."
            )
        if not _TITLE_ALLOWED_RE.match(self.title):
            raise EtsyValidationError(
                f"title {self.title!r} contains a character Etsy does not "
                "allow in listing titles"
            )
        for ch in _SINGLE_USE_CHARS:
            if self.title.count(ch) > 1:
                raise EtsyValidationError(
                    f"title uses {ch!r} more than once ({self.title.count(ch)}x) "
                    f"— Etsy allows at most one occurrence of each of {_SINGLE_USE_CHARS!r}"
                )
        if self.who_made not in WHO_MADE_VALUES:
            raise EtsyValidationError(
                f"who_made {self.who_made!r} is not valid. "
                f"Valid: {', '.join(sorted(WHO_MADE_VALUES))}"
            )
        if self.when_made not in WHEN_MADE_VALUES:
            raise EtsyValidationError(
                f"when_made {self.when_made!r} is not valid. "
                f"Valid: {', '.join(sorted(WHEN_MADE_VALUES))}"
            )
        # Cross-field policy check — the thing eBay's condition enum has no
        # analogue for. Not exhaustive; Etsy's actual policy team is the
        # final authority, but this catches the most common shape of
        # mistake before it reaches a real shop.
        if self.who_made == "someone_else" and not self.is_supply:
            if self.when_made not in _VINTAGE_WHEN_MADE:
                raise EtsyValidationError(
                    f"who_made='someone_else' with when_made={self.when_made!r} "
                    "and is_supply=False doesn't fit handmade, vintage, or "
                    "supply — Etsy requires vintage items (someone_else) to "
                    "be from a when_made bucket of before_2004 or older. "
                    "Either the item isn't Etsy-eligible, or one of these "
                    "three fields is wrong."
                )
        if not str(self.taxonomy_id or "").strip():
            raise EtsyValidationError(
                "taxonomy_id is required — Etsy has no default category, "
                "fetch a real one via getSellerTaxonomyNodes"
            )
        if self.listing_type not in LISTING_TYPES:
            raise EtsyValidationError(
                f"listing_type {self.listing_type!r} is not valid. "
                f"Valid: {', '.join(sorted(LISTING_TYPES))}"
            )
        if self.listing_type == "physical" and not self.shipping_profile_id:
            raise EtsyValidationError(
                "shipping_profile_id is required when listing_type is "
                "'physical' — Etsy has no default, guessing produces the "
                "wrong shipping terms (same reasoning as eBay's policy IDs)"
            )
        if self.quantity < 1:
            raise EtsyValidationError(f"quantity must be >= 1, got {self.quantity}")
        if len(self.images) > 10:
            raise EtsyValidationError(
                f"{len(self.images)} images supplied; Etsy accepts at most 10"
            )
        if len(self.tags) > 13:
            raise EtsyValidationError(
                f"{len(self.tags)} tags supplied; Etsy accepts at most 13"
            )
        for t in self.tags:
            if len(t) > 20:
                raise EtsyValidationError(
                    f"tag {t!r} is {len(t)} chars; Etsy's limit is 20"
                )
        if self.digital_files:
            if self.listing_type not in ("download", "both"):
                raise EtsyValidationError(
                    f"digital_files were supplied but listing_type is "
                    f"{self.listing_type!r} — digital files require "
                    "listing_type 'download' or 'both'"
                )
            if len(self.digital_files) > 5:
                raise EtsyValidationError(
                    f"{len(self.digital_files)} digital files supplied; "
                    "Etsy allows at most 5 per listing"
                )
        object.__setattr__(self, "price", _normalise_price(self.price))


def _normalise_price(price: str | float | Decimal) -> str:
    """Return a 2-decimal string, same reasoning as eBay's price handling:
    Decimal so 24.99 never becomes 24.990000000000002 or 24.98."""
    try:
        value = Decimal(str(price))
    except (InvalidOperation, ValueError) as exc:
        raise EtsyValidationError(f"price is not a number: {price!r}") from exc
    if not value.is_finite():
        raise EtsyValidationError(f"price must be a finite number, got {price!r}")
    if value <= 0:
        raise EtsyValidationError(f"price must be positive, got {price!r}")
    try:
        return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except InvalidOperation as exc:
        raise EtsyValidationError(
            f"price is too large to express in cents: {price!r}"
        ) from exc


def build_create_draft_payload(product: EtsyProduct) -> dict[str, Any]:
    """Form-encodable body for createDraftListing. Kept as a plain dict of
    strings/primitives (not pre-encoded) so it's easy to diff against a
    real request and easy for a test to assert on."""
    payload: dict[str, Any] = {
        "quantity": product.quantity,
        "title": product.title,
        "description": product.description,
        "price": product.price,
        "who_made": product.who_made,
        "when_made": product.when_made,
        "taxonomy_id": product.taxonomy_id,
        "is_supply": product.is_supply,
        "type": product.listing_type,
    }
    if product.shipping_profile_id:
        payload["shipping_profile_id"] = product.shipping_profile_id
    if product.return_policy_id:
        payload["return_policy_id"] = product.return_policy_id
    if product.materials:
        payload["materials"] = list(product.materials)
    if product.tags:
        payload["tags"] = list(product.tags)
    return payload


@dataclass
class EtsyListingResult:
    """Outcome of a listing attempt. `listing_id` set as soon as the draft
    exists; `published` True only after a real activation succeeded."""

    sku: str
    listing_id: Optional[str] = None
    images_uploaded: int = 0
    files_uploaded: int = 0
    published: bool = False
    dry_run: bool = False
    steps: list[str] = field(default_factory=list)
    payloads: dict[str, Any] = field(default_factory=dict)


class EtsyListingClient:
    """Creates Etsy draft listings, uploads images, and optionally
    activates them — three separately-gated stages, not one call.

    `transport` is injectable, matching lib/ebay_listing.py's pattern: it
    receives (method, url, headers, body_kind, body) where body_kind is
    "form" or "multipart", and must return an object exposing
    `.status_code` and `.json()`.
    """

    def __init__(self, access_token: str, shop_id: str, api_key: str,
                 transport: Optional[Callable[..., Any]] = None) -> None:
        if not str(access_token or "").strip():
            raise EtsyValidationError(
                "access_token is required (OAuth token with listings_w scope)"
            )
        if not str(shop_id or "").strip():
            raise EtsyValidationError("shop_id is required")
        if not str(api_key or "").strip():
            raise EtsyValidationError(
                "api_key is required (the x-api-key header — its absence "
                "produces a 401 that reads like a bad access token, not a "
                "missing header)"
            )
        # Etsy requires x-api-key to be "<keystring>:<shared_secret>". A bare
        # keystring is accepted by every local check and then fails remotely
        # with 403 "Shared secret is required in x-api-key header." — an error
        # that reads like an auth/permission problem rather than a malformed
        # header, which is how it went undetected before. Fail here instead,
        # where the message can say what is actually wrong. See module docstring
        # for the live probe this is based on.
        if ":" not in str(api_key):
            raise EtsyValidationError(
                "api_key must be '<keystring>:<shared_secret>' (colon-joined). "
                "A bare keystring returns 403 'Shared secret is required in "
                "x-api-key header.' from Etsy."
            )
        self.access_token = access_token
        self.shop_id = str(shop_id)
        self.api_key = api_key
        self._transport = transport or _requests_transport

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Authorization": f"Bearer {self.access_token}",
        }

    def create_listing(
        self, product: EtsyProduct,
        target_state: str = "draft",
        dry_run: bool = True,
    ) -> EtsyListingResult:
        """Create a draft, upload its images, and — only if
        target_state == "active" — activate it. Defaults to draft-only:
        activation spends Etsy's per-listing fee and makes the listing
        public, draft creation does neither.

        Raises EtsyListingError naming the failing step and, once a draft
        exists, its listing_id — never returns a result claiming success
        for a step that failed.
        """
        if target_state not in ("draft", "active"):
            raise EtsyValidationError(
                f"target_state must be 'draft' or 'active', got {target_state!r}"
            )

        create_payload = build_create_draft_payload(product)
        result = EtsyListingResult(
            sku=product.sku,
            payloads={"create_draft": create_payload},
        )

        if dry_run:
            result.dry_run = True
            result.steps = ["dry_run: no request sent"]
            return result

        # 1. Create the draft. NOT idempotent — never call this twice for
        # the same sku without the caller having a listing_id already.
        create_url = f"{ETSY_BASE_URL}/shops/{self.shop_id}/listings"
        create_response = self._call(
            "createDraftListing", "POST", create_url,
            body_kind="form", body=create_payload,
            ok_statuses=(200, 201),
        )
        listing_id = _extract(create_response, "listing_id")
        if not listing_id:
            raise EtsyListingError(
                "createDraftListing",
                "Etsy accepted the request but returned no listing_id; "
                "cannot upload images or activate",
                status=getattr(create_response, "status_code", None),
                body=_safe_body(create_response),
            )
        result.listing_id = str(listing_id)
        result.steps.append(f"createDraftListing: ok (listing_id={listing_id})")

        # 2. Upload images. A failure here still leaves a real, valid draft
        # (buyer-invisible, no fee) — surfaced with listing_id so the
        # caller can resume at this step rather than re-create.
        for i, image in enumerate(product.images):
            image_url = f"{ETSY_BASE_URL}/shops/{self.shop_id}/listings/{quote(result.listing_id)}/images"
            try:
                self._call(
                    "uploadListingImage", "POST", image_url,
                    body_kind="multipart", body={"image": image, "rank": i + 1},
                    ok_statuses=(200, 201),
                    listing_id=result.listing_id,
                )
                result.images_uploaded += 1
            except EtsyListingError:
                raise
        result.steps.append(f"uploadListingImage: ok ({result.images_uploaded} images)")

        # 2b. Upload digital files, if any. Same reasoning as images: a
        # failure here still leaves a real, valid (buyer-invisible) draft,
        # surfaced with listing_id so the caller can resume. Etsy's own docs
        # say a file cannot be attached at createDraftListing time, so this
        # is always a separate call, same as images.
        for i, dfile in enumerate(product.digital_files):
            file_url = f"{ETSY_BASE_URL}/shops/{self.shop_id}/listings/{quote(result.listing_id)}/files"
            self._call(
                "uploadListingFile", "POST", file_url,
                body_kind="multipart",
                body={"file": dfile, "name": dfile.filename, "rank": i + 1},
                ok_statuses=(200, 201),
                listing_id=result.listing_id,
            )
            result.files_uploaded += 1
        if product.digital_files:
            result.steps.append(f"uploadListingFile: ok ({result.files_uploaded} files)")

        if target_state != "active":
            return result

        if not result.images_uploaded and product.images:
            # All uploads were requested but all failed silently upstream —
            # should not be reachable given the raise above, but guard
            # explicitly rather than activate an image-less listing anyway.
            raise EtsyListingError(
                "activate", "No images were successfully uploaded; refusing "
                "to activate an image-less listing",
                listing_id=result.listing_id,
            )

        if product.listing_type in ("download", "both"):
            if not product.digital_files:
                raise EtsyListingError(
                    "activate",
                    f"listing_type is {product.listing_type!r} but no "
                    "digital_files were supplied — a download listing with "
                    "nothing to download cannot be activated",
                    listing_id=result.listing_id,
                )
            if not result.files_uploaded:
                raise EtsyListingError(
                    "activate", "No digital files were successfully "
                    "uploaded; refusing to activate a download listing "
                    "with nothing to download",
                    listing_id=result.listing_id,
                )

        # 3. Activate — the only step that spends money and goes public.
        activate_url = f"{ETSY_BASE_URL}/shops/{self.shop_id}/listings/{quote(result.listing_id)}"
        activate_response = self._call(
            "activateListing", "PATCH", activate_url,
            body_kind="form", body={"state": "active"},
            ok_statuses=(200, 201),
            listing_id=result.listing_id,
        )
        state = _extract(activate_response, "state")
        if state != "active":
            raise EtsyListingError(
                "activateListing",
                f"activation call succeeded but listing state is "
                f"{state!r}, not 'active' — listing {result.listing_id} "
                "exists but is NOT live",
                status=getattr(activate_response, "status_code", None),
                body=_safe_body(activate_response),
                listing_id=result.listing_id,
            )
        result.published = True
        result.steps.append("activateListing: ok")
        return result

    def _call(self, step: str, method: str, url: str, body_kind: str, body: Any,
              ok_statuses: tuple[int, ...], listing_id: Optional[str] = None) -> Any:
        response = self._transport(method, url, self._headers(), body_kind, body)
        status = getattr(response, "status_code", None)
        if status not in ok_statuses:
            raise EtsyListingError(
                step, f"Etsy returned HTTP {status}",
                status=status, body=_safe_body(response), listing_id=listing_id,
            )
        return response


def quote(value: str) -> str:
    from urllib.parse import quote as _urlquote
    return _urlquote(value, safe="")


def _requests_transport(method: str, url: str, headers: dict[str, str],
                        body_kind: str, body: Any) -> Any:
    """Default transport. Imported lazily so tests need no `requests` install."""
    import requests  # noqa: PLC0415 - deliberate lazy import

    if body_kind == "multipart":
        return requests.request(method, url, headers=headers, files=body, timeout=30)
    return requests.request(method, url, headers=headers, data=body, timeout=30)


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
    try:
        return response.json()
    except Exception:
        try:
            return getattr(response, "text", None)
        except Exception:
            return None
