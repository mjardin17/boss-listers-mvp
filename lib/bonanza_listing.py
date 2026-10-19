#!/usr/bin/env python3
"""
bonanza_listing.py — Bonanza marketplace listing integration via Bonapitit
==========================================================================
Bonanza is a marketplace alternative to eBay. Its API ("Bonapitit") is
NOT a modern per-resource REST API — it's a single-endpoint, envelope-style
API closer in shape to eBay's legacy Trading API. Confirmed against the
real docs at api.bonanza.com/docs 2026-08-24, replacing an earlier version
of this file that assumed a REST shape (`/listings/create`, Bearer token)
which does not match the real API at all and would have failed on first
live use — the earlier version was only ever verified against a dry-run
payload, never against Bonanza's own documentation.

API Surface: Bonapitit (https://api.bonanza.com/docs)
- Single endpoint for everything: POST /api_requests/secure_request
- Every request body has ONE root key named "{methodName}Request"
  (e.g. "addFixedPriceItemRequest")
- Every response body has ONE root key named "{methodName}Response"

Auth model (three credentials, not one):
    1. devID + certID — issued once per developer account, sent as HTTP
       headers on every request (X-BONANZLE-API-DEV-NAME / -CERT-NAME).
       Get these at https://api.bonanza.com/accounts/new.
    2. A per-seller user token (bonanzleAuthToken) — obtained by calling
       fetchToken, then sending the seller to `authenticationURL` to
       approve access. The token is NOT a header — it goes inside the
       request body under `requesterCredentials.bonanzleAuthToken`.
       fetchToken itself does not need requesterCredentials.

Flow:
    1. fetchToken() -> {authToken, authenticationURL}
    2. Seller visits authenticationURL, approves access
    3. authToken is now usable as bonanzleAuthToken on every other call
    4. addFixedPriceItem() to create a listing
    5. reviseFixedPriceItem() to update, endFixedPriceItem() to remove

Required environment (.env):
    BONANZA_DEV_ID         Dev ID from api.bonanza.com/accounts/new
    BONANZA_CERT_ID        Cert ID from the same page
    BONANZA_ACCESS_TOKEN   The verified bonanzleAuthToken (from fetchToken,
                            after the seller approves via authenticationURL)

Bonanza API docs:
    https://api.bonanza.com/docs
    https://api.bonanza.com/docs/reference/fetch_token
    https://api.bonanza.com/docs/reference/add_fixed_price_item
    https://api.bonanza.com/docs/basics/secure_requests
    https://api.bonanza.com/docs/basics/user_tokens
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional

# ── Constants ─────────────────────────────────────────────────────────────────

BONANZA_API_HOST = "https://api.bonanza.com"
BONANZA_REQUEST_URL = f"{BONANZA_API_HOST}/api_requests/secure_request"

HTTP_TIMEOUT_SEC = 60


class BonanzaError(RuntimeError):
    """A Bonanza API call failed."""

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        step: str = "api_call",
        permanent: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.step = step
        self.permanent = permanent


@dataclass(frozen=True)
class BonanzaListing:
    """A Bonanza marketplace listing."""

    title: str
    description: str
    price: Decimal
    quantity: int
    sku: str
    category_id: int
    condition: str = "new"  # new | like_new | good | acceptable
    tags: list[str] = field(default_factory=list)  # not sent to Bonanza directly (no tags field in addFixedPriceItem); kept for callers, unused in payload
    image_urls: list[str] = field(default_factory=list)  # primary image first
    ships_within_days: int = 3
    shipping_cost: Optional[Decimal] = None
    free_shipping: bool = False
    returns_accepted: bool = True

    def validate(self) -> None:
        """Pre-flight validation before calling addFixedPriceItem."""
        if not self.title or len(self.title) > 80:
            raise BonanzaError(
                f"title is required, max 80 chars, got {len(self.title)}", step="validation"
            )

        if self.description and len(self.description) > 60000:
            raise BonanzaError(
                f"description max 60000 chars, got {len(self.description)}", step="validation"
            )

        if self.price <= 0:
            raise BonanzaError(
                f"price must be > 0, got {self.price}", step="validation"
            )

        if self.quantity < 1:
            raise BonanzaError(
                f"quantity must be >= 1, got {self.quantity}", step="validation"
            )

        if self.condition not in ("new", "like_new", "good", "acceptable"):
            raise BonanzaError(
                f"condition must be new|like_new|good|acceptable, got {self.condition}",
                step="validation",
            )

        if len(self.image_urls) > 12:
            raise BonanzaError(
                f"max 12 images, got {len(self.image_urls)}", step="validation"
            )

    def to_item_payload(self) -> dict[str, Any]:
        """Build the `item` object addFixedPriceItem expects — field names
        and nesting come directly from api.bonanza.com/docs/reference/add_fixed_price_item,
        not guessed."""
        item: dict[str, Any] = {
            "title": self.title,
            "description": self.description,
            "price": float(self.price),
            "quantity": self.quantity,
            "sku": self.sku,
            "primaryCategory": {"categoryId": self.category_id},
            "itemSpecifics": {
                "specifics": [["condition", self.condition]],
            },
            "shippingDetails": {
                "shipsWithinDays": self.ships_within_days,
                "shippingServiceOptions": [
                    {
                        "shippingType": "Free" if self.free_shipping else "Fixed",
                        "shippingServiceCost": float(self.shipping_cost) if self.shipping_cost else 0.0,
                        "freeShipping": self.free_shipping,
                    }
                ],
            },
            "returnPolicy": {
                "returnsAcceptedOption": "ReturnsAccepted" if self.returns_accepted else "ReturnsNotAccepted",
            },
        }
        if self.image_urls:
            item["pictureDetails"] = {"pictureURL": list(self.image_urls)}
        return item


@dataclass(frozen=True)
class BonanzaListingResult:
    """Outcome of a successful addFixedPriceItem call."""

    listing_id: str
    selling_state: str
    url: str


@dataclass(frozen=True)
class BonanzaTokenResult:
    """Outcome of a successful fetchToken call — the seller must visit
    authentication_url and approve before auth_token is usable."""

    auth_token: str
    authentication_url: str
    hard_expiration_time: Optional[str] = None


# ── HTTP plumbing ─────────────────────────────────────────────────────────────


def _request(
    dev_id: str,
    cert_id: str,
    request_name: str,
    body: dict[str, Any],
    *,
    timeout: int = HTTP_TIMEOUT_SEC,
) -> dict[str, Any]:
    """POST one envelope call to Bonapitit's single endpoint.

    `request_name` is the bare method name (e.g. "addFixedPriceItem") —
    this wraps it as {request_name}Request / unwraps {request_name}Response
    per the envelope convention documented at
    api.bonanza.com/docs/basics/secure_requests.
    """
    payload = {f"{request_name}Request": body}
    headers = {
        "Content-Type": "application/json",
        "X-BONANZLE-API-DEV-NAME": dev_id,
        "X-BONANZLE-API-CERT-NAME": cert_id,
    }
    data = json.dumps(payload).encode()

    try:
        req = urllib.request.Request(
            BONANZA_REQUEST_URL, data=data, method="POST", headers=headers
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            response_body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            error_data = json.loads(raw)
            response_key = f"{request_name}Response"
            message = (
                error_data.get(response_key, {}).get("errorMessage")
                or error_data.get("errorMessage")
                or raw[:300]
            )
        except json.JSONDecodeError:
            message = raw[:300]
        permanent = e.code in (401, 403, 400)
        raise BonanzaError(
            f"HTTP {e.code}: {message}", code=e.code, step="api_call", permanent=permanent
        ) from e
    except urllib.error.URLError as e:
        raise BonanzaError(f"network error: {e.reason}", step="api_call", permanent=False) from e

    if not response_body.strip():
        return {}

    try:
        parsed = json.loads(response_body)
    except json.JSONDecodeError as e:
        raise BonanzaError(f"non-JSON response: {response_body[:300]}", step="api_call") from e

    response_key = f"{request_name}Response"
    return parsed.get(response_key, parsed)


# ── Configuration ─────────────────────────────────────────────────────────────


def _config() -> tuple[str, str, str]:
    """Return (dev_id, cert_id, access_token). Raises if unconfigured."""
    dev_id = os.environ.get("BONANZA_DEV_ID", "").strip()
    cert_id = os.environ.get("BONANZA_CERT_ID", "").strip()
    token = os.environ.get("BONANZA_ACCESS_TOKEN", "").strip()

    if not dev_id or not cert_id:
        raise BonanzaError(
            "BONANZA_DEV_ID and BONANZA_CERT_ID not set — get these at "
            "https://api.bonanza.com/accounts/new",
            step="config",
            permanent=True,
        )
    if not token:
        raise BonanzaError(
            "BONANZA_ACCESS_TOKEN not set — call fetch_token() first, have the "
            "seller approve via the returned authentication_url, then set this",
            step="config",
            permanent=True,
        )
    return dev_id, cert_id, token


def fetch_token(dev_id: str, cert_id: str, transport=None) -> BonanzaTokenResult:
    """Get a new user token. The returned auth_token is NOT usable until the
    seller visits authentication_url and approves access — this call alone
    does not grant permission to act on their behalf."""
    if not dev_id or not cert_id:
        raise BonanzaError("dev_id and cert_id required", step="config", permanent=True)

    transport = transport or _request
    response = transport(dev_id, cert_id, "fetchToken", {})

    auth_token = response.get("authToken")
    auth_url = response.get("authenticationURL")
    if not auth_token or not auth_url:
        raise BonanzaError("fetchToken response missing authToken/authenticationURL", step="fetch_token")

    return BonanzaTokenResult(
        auth_token=auth_token,
        authentication_url=auth_url,
        hard_expiration_time=response.get("hardExpirationTime"),
    )


# ── Listing operations ────────────────────────────────────────────────────────


class BonanzaListingClient:
    """Client for creating and managing Bonanza listings via Bonapitit."""

    def __init__(
        self, dev_id: str, cert_id: str, access_token: str, transport=None
    ) -> None:
        if not dev_id or not cert_id:
            raise BonanzaError("dev_id and cert_id required", step="config", permanent=True)
        if not access_token:
            raise BonanzaError("access_token (bonanzleAuthToken) required", step="config", permanent=True)
        self.dev_id = dev_id
        self.cert_id = cert_id
        self.token = access_token
        self.transport = transport or _request

    def create_listing(
        self, listing: BonanzaListing, *, dry_run: bool = True
    ) -> BonanzaListingResult | dict[str, Any]:
        """Create a listing on Bonanza via addFixedPriceItem."""
        listing.validate()

        body = {
            "requesterCredentials": {"bonanzleAuthToken": self.token},
            "item": listing.to_item_payload(),
        }

        if dry_run:
            return {
                "status": "dry_run",
                "payload": body,
                "note": "would call addFixedPriceItem on Bonanza",
            }

        try:
            response = self.transport(self.dev_id, self.cert_id, "addFixedPriceItem", body)

            if response.get("errorMessage"):
                raise BonanzaError(
                    str(response.get("errorMessage")), code=400, step="create_listing"
                )

            item_id = response.get("itemId")
            if not item_id:
                raise BonanzaError("no itemId in response", step="create_listing")

            return BonanzaListingResult(
                listing_id=str(item_id),
                selling_state=response.get("sellingState", "Unknown"),
                url=f"https://www.bonanza.com/booths/items/{item_id}",
            )
        except BonanzaError:
            raise
        except Exception as e:
            raise BonanzaError(f"listing creation failed: {e}", step="create_listing") from e

    def update_listing(
        self, listing_id: str, item_updates: dict[str, Any], *, dry_run: bool = True
    ) -> dict[str, Any]:
        """Update an existing listing via reviseFixedPriceItem."""
        body = {
            "requesterCredentials": {"bonanzleAuthToken": self.token},
            "item": {"itemId": int(listing_id), **item_updates},
        }

        if dry_run:
            return {
                "status": "dry_run",
                "listing_id": listing_id,
                "payload": body,
                "note": "would call reviseFixedPriceItem on Bonanza",
            }

        try:
            response = self.transport(self.dev_id, self.cert_id, "reviseFixedPriceItem", body)
            if response.get("errorMessage"):
                raise BonanzaError(str(response.get("errorMessage")), code=400, step="update_listing")
            return response
        except BonanzaError:
            raise
        except Exception as e:
            raise BonanzaError(f"listing update failed: {e}", step="update_listing") from e

    def delete_listing(self, listing_id: str, *, dry_run: bool = True) -> dict[str, Any]:
        """Remove a listing via endFixedPriceItem."""
        body = {
            "requesterCredentials": {"bonanzleAuthToken": self.token},
            "itemId": int(listing_id),
        }

        if dry_run:
            return {
                "status": "dry_run",
                "listing_id": listing_id,
                "payload": body,
                "note": "would call endFixedPriceItem on Bonanza",
            }

        try:
            response = self.transport(self.dev_id, self.cert_id, "endFixedPriceItem", body)
            if response.get("errorMessage"):
                raise BonanzaError(str(response.get("errorMessage")), code=400, step="delete_listing")
            return response
        except BonanzaError:
            raise
        except Exception as e:
            raise BonanzaError(f"listing deletion failed: {e}", step="delete_listing") from e


if __name__ == "__main__":
    import sys

    dev_id, cert_id, token = _config()
    client = BonanzaListingClient(dev_id, cert_id, token)
    print("Bonanza client configured (dev_id/cert_id/token present). Real listing calls need --live and real item data.", file=sys.stderr)
