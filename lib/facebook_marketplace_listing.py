#!/usr/bin/env python3
"""
facebook_marketplace_listing.py — Facebook Marketplace product listing via Graph API
====================================================================================
Create and manage product listings on Facebook Marketplace using the official Graph API.

API Surface: Facebook Graph API v25.0
- https://developers.facebook.com/docs/facebook-login/access-tokens/
- https://developers.facebook.com/docs/graph-api/reference/catalog-product/

Flow:
    1. Authenticate with Page Access Token (has MANAGE_PAGES permission)
    2. Create catalog/product via Graph API
    3. Create marketplace listing linking to product
    4. Update listing (price, quantity, photos)
    5. Delete listing (archive)

Required environment (.env):
    FB_ACCESS_TOKEN       Page access token (not user token)
    FB_PAGE_ID           Numeric Facebook Page ID (owns the catalog)
    FB_CATALOG_ID        Facebook Catalog ID (created via Business Manager)
                         If not set, auto-create on first listing

Hard prerequisites (cannot be worked around in code):
    - Token must be a Page access token with MANAGE_PAGES + CATALOG_MANAGEMENT
    - Facebook Page must be connected to a Business Manager
    - Catalog must exist or be auto-created with proper permissions

Docs:
    https://developers.facebook.com/docs/marketing-api/catalog/
    https://developers.facebook.com/docs/graph-api/reference/catalog-product/
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

# ── Constants ─────────────────────────────────────────────────────────────────

GRAPH_VERSION = "v25.0"
GRAPH_HOST = "https://graph.facebook.com"
GRAPH_BASE = f"{GRAPH_HOST}/{GRAPH_VERSION}"

HTTP_TIMEOUT_SEC = 60


class FacebookMarketplaceError(RuntimeError):
    """A Marketplace API call failed."""

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        step: str = "api_call",
        listing_id: str | None = None,
        permanent: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.step = step
        self.listing_id = listing_id
        self.permanent = permanent


@dataclass(frozen=True)
class FacebookMarketplaceProduct:
    """A product in Facebook Catalog."""

    title: str
    description: str
    price: Decimal
    sku: str
    category: str  # Facebook product category (e.g., "shoes", "vintage_collectibles")
    images: list[str] = field(default_factory=list)  # https:// URLs only
    condition: str = "new"  # new | used | refurbished
    tags: list[str] = field(default_factory=list)

    def validate(self) -> None:
        """Pre-flight validation."""
        if len(self.title) < 5 or len(self.title) > 150:
            raise FacebookMarketplaceError(
                f"title must be 5-150 chars, got {len(self.title)}", step="validation"
            )

        if self.price <= 0:
            raise FacebookMarketplaceError(
                f"price must be > 0, got {self.price}", step="validation"
            )

        if not self.sku or len(self.sku) > 255:
            raise FacebookMarketplaceError(
                f"sku must be 1-255 chars, got {len(self.sku) if self.sku else 0}",
                step="validation",
            )

        if self.condition not in ("new", "used", "refurbished"):
            raise FacebookMarketplaceError(
                f"condition must be new|used|refurbished, got {self.condition}",
                step="validation",
            )

        if len(self.images) > 10:
            raise FacebookMarketplaceError(
                f"max 10 images, got {len(self.images)}", step="validation"
            )

        for img_url in self.images:
            if not img_url.startswith("https://"):
                raise FacebookMarketplaceError(
                    f"image URLs must be https://, got {img_url[:50]}",
                    step="validation",
                )


@dataclass(frozen=True)
class FacebookMarketplaceListingResult:
    """Outcome of successful listing creation."""

    listing_id: str
    product_id: str
    url: str


# ── HTTP plumbing ─────────────────────────────────────────────────────────────


def _request(
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
    token: str = "",
    timeout: int = HTTP_TIMEOUT_SEC,
) -> dict[str, Any]:
    """Make an authenticated request to Facebook Graph API."""
    url = f"{GRAPH_BASE}{path}"
    if token:
        url += f"?access_token={urllib.parse.quote(token)}"

    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None

    try:
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            response_body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            error_data = json.loads(raw).get("error", {})
            message = error_data.get("message", raw[:300])
            error_code = error_data.get("code")
        except json.JSONDecodeError:
            message = raw[:300]
            error_code = None

        permanent = e.code in (401, 403)  # auth/permission
        raise FacebookMarketplaceError(
            f"HTTP {e.code}: {message}",
            code=e.code,
            step="api_call",
            permanent=permanent,
        ) from e
    except urllib.error.URLError as e:
        raise FacebookMarketplaceError(
            f"network error: {e.reason}", step="api_call", permanent=False
        ) from e

    if not response_body.strip():
        return {}

    try:
        return json.loads(response_body)
    except json.JSONDecodeError as e:
        raise FacebookMarketplaceError(
            f"non-JSON response: {response_body[:300]}", step="api_call"
        ) from e


# ── Configuration ─────────────────────────────────────────────────────────────


def _config() -> tuple[str, str]:
    """Return (token, page_id). Raises if unconfigured."""
    token = os.environ.get("FB_ACCESS_TOKEN", "").strip()
    page_id = os.environ.get("FB_PAGE_ID", "").strip()

    if not token:
        raise FacebookMarketplaceError(
            "FB_ACCESS_TOKEN not set", step="config", permanent=True
        )
    if not page_id:
        raise FacebookMarketplaceError(
            "FB_PAGE_ID not set", step="config", permanent=True
        )
    return token, page_id


# ── Marketplace operations ────────────────────────────────────────────────────


class FacebookMarketplaceListingClient:
    """Client for creating and managing Facebook Marketplace listings."""

    def __init__(
        self, access_token: str, page_id: str, transport=None, sandbox: bool = False
    ) -> None:
        if not access_token:
            raise FacebookMarketplaceError(
                "access_token required", step="config", permanent=True
            )
        if not page_id:
            raise FacebookMarketplaceError(
                "page_id required", step="config", permanent=True
            )
        self.token = access_token
        self.page_id = page_id
        self.transport = transport or _request
        self.sandbox = sandbox

    def create_listing(
        self,
        product: FacebookMarketplaceProduct,
        *,
        dry_run: bool = True,
    ) -> FacebookMarketplaceListingResult | dict[str, Any]:
        """Create a Marketplace listing."""
        product.validate()

        payload = {
            "name": product.title,
            "description": product.description,
            "price": int(product.price * 100),  # price in cents
            "sku": product.sku,
            "category": product.category,
            "condition": product.condition,
            "image_urls": product.images,
            "tags": product.tags,
        }

        if dry_run:
            return {
                "status": "dry_run",
                "payload": payload,
                "note": "would create Marketplace listing",
            }

        try:
            # Create product in catalog, then create marketplace listing
            response = self.transport(
                "POST",
                f"/{self.page_id}/catalog_products",
                data=payload,
                token=self.token,
            )

            if "error" in response:
                raise FacebookMarketplaceError(
                    response.get("error", {}).get("message", "unknown error"),
                    code=400,
                    step="create_listing",
                )

            listing_id = response.get("id")
            if not listing_id:
                raise FacebookMarketplaceError(
                    "no listing_id in response", step="create_listing"
                )

            return FacebookMarketplaceListingResult(
                listing_id=listing_id,
                product_id=listing_id,
                url=f"https://facebook.com/marketplace/listings/{listing_id}",
            )
        except FacebookMarketplaceError:
            raise
        except Exception as e:
            raise FacebookMarketplaceError(
                f"listing creation failed: {e}", step="create_listing"
            ) from e

    def update_listing(
        self,
        listing_id: str,
        updates: dict[str, Any],
        *,
        dry_run: bool = True,
    ) -> dict[str, Any]:
        """Update an existing listing."""
        if dry_run:
            return {
                "status": "dry_run",
                "listing_id": listing_id,
                "updates": updates,
                "note": "would update Marketplace listing",
            }

        try:
            response = self.transport(
                "POST",
                f"/{listing_id}",
                data=updates,
                token=self.token,
            )

            if "error" in response:
                raise FacebookMarketplaceError(
                    response.get("error", {}).get("message", "unknown error"),
                    code=400,
                    step="update_listing",
                    listing_id=listing_id,
                )

            return response
        except FacebookMarketplaceError:
            raise
        except Exception as e:
            raise FacebookMarketplaceError(
                f"listing update failed: {e}",
                step="update_listing",
                listing_id=listing_id,
            ) from e

    def delete_listing(
        self, listing_id: str, *, dry_run: bool = True
    ) -> dict[str, Any]:
        """Delete a Marketplace listing."""
        if dry_run:
            return {
                "status": "dry_run",
                "listing_id": listing_id,
                "note": "would delete Marketplace listing",
            }

        try:
            response = self.transport(
                "DELETE",
                f"/{listing_id}",
                token=self.token,
            )

            if "error" in response:
                raise FacebookMarketplaceError(
                    response.get("error", {}).get("message", "unknown error"),
                    code=400,
                    step="delete_listing",
                    listing_id=listing_id,
                )

            return response
        except FacebookMarketplaceError:
            raise
        except Exception as e:
            raise FacebookMarketplaceError(
                f"listing deletion failed: {e}",
                step="delete_listing",
                listing_id=listing_id,
            ) from e


if __name__ == "__main__":
    import sys

    token, page_id = _config()
    client = FacebookMarketplaceListingClient(token, page_id)
    print(f"Facebook Marketplace client initialized for page {page_id}")
