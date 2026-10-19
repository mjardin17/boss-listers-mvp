#!/usr/bin/env python3
"""
listing_service.py — internal HTTP bridge for lib/ebay_listing.py and
lib/etsy_listing.py.

Renamed from ebay_listing_service.py: a file named ebay_* that also serves
Etsy is a naming lie waiting to mislead a future reader. Same architecture,
now two platforms.

boss-listers-mvp (Node/Next.js, separate repo) has no eBay or Etsy listing
logic of its own — that logic lives here, tested, and these two lib modules
are the canonical implementations (see CLAUDE.md: a prior JS eBay connector
attempt in a different repo duplicated this logic and shipped real bugs
already fixed here). This service exposes them over localhost HTTP so the
Node app can call them without a second implementation in JavaScript.

This service holds NO marketplace credentials of its own. The caller (Node)
passes a fresh access_token per request — see CLAUDE.md's "Decision: how
the service gets an access token" for why (this repo has a documented
history of committed secrets; a credential-free service is inert unless
handed a token, which matters for something that can spend money).

Going live requires TWO independent gates PER PLATFORM, checked separately
so no single request, bug, or unauthorized caller can flip both alone, and
so arming eBay does NOT also arm Etsy:
  1. This process must be started with --allow-live ebay,etsy (or
     LISTING_SERVICE_ALLOW_LIVE=ebay,etsy) naming which platforms are
     armed — a freshly started service can never publish anywhere.
  2. The request body must set "dry_run": false AND "confirm": "PUBLISH_LIVE"
     (the exact literal). Anything else stays a dry run / draft.
Live requests additionally require an X-Listing-Service-Token header
matching LISTING_SERVICE_TOKEN — loopback binding is not an auth boundary
on a shared machine; another local process could otherwise reach this port.

Port: 8791 (unchanged from the eBay-only version — GG/ED/etc. video
pipeline uses 8002, StoryForge 8001, CrossPost 3000, Empire OS Hub 5173,
OmniRoute 20128).

Start (dry-run/draft only, safe default):
    python scripts/listing_service.py

Start with eBay live publishing armed, Etsy still draft-only:
    python scripts/listing_service.py --allow-live ebay

Start with both armed (deliberately inconvenient — never the default):
    python scripts/listing_service.py --allow-live ebay,etsy
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

# lib/ is a package at repo root; scripts/ is not, so make the import work
# regardless of the working directory this is launched from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from pydantic import BaseModel, Field, StrictBool  # noqa: E402

from lib.ebay_listing import (  # noqa: E402
    EbayListingClient,
    EbayListingError,
    EbayListingPolicies,
    EbayProduct,
    EbayValidationError,
)
from lib.etsy_listing import (  # noqa: E402
    EtsyImageSource,
    EtsyListingClient,
    EtsyListingError,
    EtsyProduct,
    EtsyValidationError,
)
from lib.facebook_marketplace_listing import (  # noqa: E402
    FacebookMarketplaceError,
    FacebookMarketplaceListingClient,
    FacebookMarketplaceProduct,
)
from lib.bonanza_listing import (  # noqa: E402
    BonanzaError,
    BonanzaListing,
    BonanzaListingClient,
)

CONFIRM_LITERAL = "PUBLISH_LIVE"
PLATFORMS = ("ebay", "etsy", "facebook", "bonanza")


# ── eBay request/response models (unchanged from ebay_listing_service.py) ──

class EbayProductIn(BaseModel):
    """Presence/type checks only. Business-rule validation lives in
    EbayProduct.__post_init__ and must not be duplicated here."""

    sku: str
    title: str
    description: str
    price: str | float
    category_id: str
    quantity: int = 1
    condition: str = "USED_GOOD"
    image_urls: list[str] = Field(default_factory=list)
    marketplace_id: str = "EBAY_US"
    currency: str = "USD"
    aspects: dict[str, list[str]] = Field(default_factory=dict)


class EbayPoliciesIn(BaseModel):
    fulfillment_policy_id: str
    payment_policy_id: str
    return_policy_id: str
    merchant_location_key: str


class EbayCreateListingRequest(BaseModel):
    access_token: str
    product: EbayProductIn
    policies: EbayPoliciesIn
    dry_run: StrictBool = True
    confirm: Optional[str] = None
    sandbox: bool = False


# ── Etsy request/response models ──

class EtsyImageIn(BaseModel):
    """Presence/type checks only — EtsyImageSource.__post_init__ does the
    real validation (exactly one of url/local_path, https-only url)."""

    url: Optional[str] = None
    local_path: Optional[str] = None


class EtsyProductIn(BaseModel):
    sku: str
    title: str
    description: str
    price: str | float
    who_made: str
    when_made: str
    taxonomy_id: str | int
    quantity: int = 1
    is_supply: bool = False
    listing_type: str = "physical"
    materials: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    images: list[EtsyImageIn] = Field(default_factory=list)
    shipping_profile_id: Optional[str | int] = None
    return_policy_id: Optional[str | int] = None


class EtsyCreateListingRequest(BaseModel):
    access_token: str
    shop_id: str
    api_key: str
    product: EtsyProductIn
    # StrictBool: same reasoning as eBay's dry_run — a JS caller that
    # stringified this flag must not silently arm a live publish.
    dry_run: StrictBool = True
    # "draft" is always safe (free, buyer-invisible) even when live
    # publishing isn't armed for Etsy — only "active" is gated. See
    # _etsy_is_live_request() below.
    target_state: str = "draft"
    confirm: Optional[str] = None


# ── Facebook Marketplace request/response models ──

class FacebookProductIn(BaseModel):
    """Presence/type checks only. Business-rule validation lives in
    FacebookMarketplaceProduct.validate() and must not be duplicated here."""

    title: str
    description: str
    price: str | float
    sku: str
    category: str
    images: list[str] = Field(default_factory=list)
    condition: str = "new"
    tags: list[str] = Field(default_factory=list)


class FacebookCreateListingRequest(BaseModel):
    access_token: str
    page_id: str
    product: FacebookProductIn
    dry_run: StrictBool = True
    confirm: Optional[str] = None
    sandbox: bool = False


# ── Bonanza request/response models ──

class BonanzaListingIn(BaseModel):
    """Presence/type checks only. Business-rule validation lives in
    BonanzaListing.validate() and must not be duplicated here."""

    title: str
    description: str
    price: str | float
    quantity: int = 1
    sku: str
    category_id: int
    condition: str = "new"
    tags: list[str] = Field(default_factory=list)  # not sent to Bonanza — see BonanzaListing docstring
    image_urls: list[str] = Field(default_factory=list)
    ships_within_days: int = 3
    shipping_cost: str | float | None = None
    free_shipping: bool = False
    returns_accepted: bool = True


class BonanzaCreateListingRequest(BaseModel):
    # Bonapitit auth is three credentials, not one — dev_id/cert_id are
    # per-developer-account, access_token is the per-seller bonanzleAuthToken
    # obtained via fetchToken + the seller approving authenticationURL.
    dev_id: str
    cert_id: str
    access_token: str
    listing: BonanzaListingIn
    dry_run: StrictBool = True
    confirm: Optional[str] = None


def _parse_armed_platforms(raw: Optional[str]) -> frozenset[str]:
    if not raw:
        return frozenset()
    names = {p.strip().lower() for p in raw.split(",") if p.strip()}
    unknown = names - set(PLATFORMS)
    if unknown:
        raise ValueError(f"Unknown platform(s) in --allow-live: {', '.join(sorted(unknown))}")
    return frozenset(names)


def create_app(armed_platforms: frozenset[str]) -> FastAPI:
    app = FastAPI(title="Listing Service", version="2.0.0")
    # No CORS middleware, deliberately. The only intended caller is the
    # Next.js API route calling this server-side; there is no browser-facing
    # surface here that needs cross-origin access, and adding
    # allow_origins=["*"] would let any page a user has open reach an
    # endpoint that can spend real money.

    service_token = os.environ.get("LISTING_SERVICE_TOKEN") or os.environ.get("EBAY_LISTING_SERVICE_TOKEN")

    def check_live_gates(platform: str, confirm: Optional[str],
                         x_listing_service_token: Optional[str]) -> None:
        if platform not in armed_platforms:
            raise HTTPException(
                status_code=403,
                detail={
                    "ok": False,
                    "code": "live_publish_disabled",
                    "message": (
                        f"This service was started without {platform} in "
                        f"--allow-live. Restart with --allow-live {platform} "
                        "to enable real publishing for this platform."
                    ),
                },
            )
        if confirm != CONFIRM_LITERAL:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "code": "confirmation_required",
                    "message": (
                        f'A live publish requires "confirm": "{CONFIRM_LITERAL}" '
                        "in the request body, in addition to dry_run: false."
                    ),
                },
            )
        if not service_token or x_listing_service_token != service_token:
            raise HTTPException(
                status_code=401,
                detail={"ok": False, "code": "unauthorized",
                        "message": "Missing or invalid X-Listing-Service-Token."},
            )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "live_publish_allowed": {p: p in armed_platforms for p in PLATFORMS},
            "version": "2.0.0",
        }

    @app.post("/ebay/create-listing")
    def create_ebay_listing(
        req: EbayCreateListingRequest,
        x_listing_service_token: Optional[str] = Header(default=None),
    ) -> dict[str, Any]:
        if req.dry_run is False:
            check_live_gates("ebay", req.confirm, x_listing_service_token)

        try:
            product = EbayProduct(
                sku=req.product.sku,
                title=req.product.title,
                description=req.product.description,
                price=req.product.price,
                category_id=req.product.category_id,
                quantity=req.product.quantity,
                condition=req.product.condition,
                image_urls=tuple(req.product.image_urls),
                marketplace_id=req.product.marketplace_id,
                currency=req.product.currency,
                aspects=req.product.aspects,
            )
            policies = EbayListingPolicies(
                fulfillment_policy_id=req.policies.fulfillment_policy_id,
                payment_policy_id=req.policies.payment_policy_id,
                return_policy_id=req.policies.return_policy_id,
                merchant_location_key=req.policies.merchant_location_key,
            )
            # Constructed inside this try block deliberately: EbayListingClient
            # also raises EbayValidationError (empty access_token) in __init__.
            # Previously this line sat AFTER the try/except below it, so that
            # validation error propagated as an unhandled 500 instead of the
            # clean 400 every other validation failure gets.
            client = EbayListingClient(req.access_token, sandbox=req.sandbox)
        except EbayValidationError as exc:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "code": "validation_error", "message": str(exc)},
            ) from exc

        try:
            result = client.create_listing(product, policies, dry_run=req.dry_run)
        except EbayListingError as exc:
            if exc.status in (401, 403):
                status_code, code = 401, "ebay_auth_failed"
            elif exc.offer_id:
                status_code, code = 409, "offer_created_not_published"
            else:
                status_code, code = 502, "ebay_error"
            raise HTTPException(
                status_code=status_code,
                detail={
                    "ok": False,
                    "code": code,
                    "step": exc.step,
                    "message": str(exc),
                    "ebay_status": exc.status,
                    "ebay_body": exc.body,
                    "offer_id": exc.offer_id,
                },
            ) from exc
        except ConnectionError as exc:
            raise HTTPException(
                status_code=504,
                detail={"ok": False, "code": "transport_error", "message": str(exc)},
            ) from exc

        return {
            "ok": True,
            "dry_run": result.dry_run,
            "published": result.published,
            "sku": result.sku,
            "offer_id": result.offer_id,
            "listing_id": result.listing_id,
            "steps": result.steps,
            "payloads": result.payloads,
        }

    @app.post("/etsy/create-listing")
    def create_etsy_listing(
        req: EtsyCreateListingRequest,
        x_listing_service_token: Optional[str] = Header(default=None),
    ) -> dict[str, Any]:
        if req.target_state not in ("draft", "active"):
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "code": "validation_error",
                        "message": f"target_state must be 'draft' or 'active', got {req.target_state!r}"},
            )

        # Only ACTIVATING a listing is the money/live-publish boundary —
        # creating a draft is free and buyer-invisible, so it doesn't need
        # the live-publish gates even when dry_run is False. This mirrors
        # Etsy's own API shape (draft-first always) rather than reusing
        # eBay's simpler dry_run-is-the-only-gate model.
        is_live_request = req.dry_run is False and req.target_state == "active"
        if is_live_request:
            check_live_gates("etsy", req.confirm, x_listing_service_token)

        try:
            images = tuple(
                EtsyImageSource(url=img.url, local_path=img.local_path)
                for img in req.product.images
            )
            product = EtsyProduct(
                sku=req.product.sku,
                title=req.product.title,
                description=req.product.description,
                price=req.product.price,
                who_made=req.product.who_made,
                when_made=req.product.when_made,
                taxonomy_id=req.product.taxonomy_id,
                quantity=req.product.quantity,
                is_supply=req.product.is_supply,
                listing_type=req.product.listing_type,
                materials=tuple(req.product.materials),
                tags=tuple(req.product.tags),
                images=images,
                shipping_profile_id=req.product.shipping_profile_id,
                return_policy_id=req.product.return_policy_id,
            )
            # Constructed inside this try block deliberately: EtsyListingClient
            # also raises EtsyValidationError — for an empty access_token/
            # shop_id, AND for an api_key with no colon (Etsy's x-api-key must
            # be "<keystring>:<shared_secret>"; see lib/etsy_listing.py). This
            # line previously sat AFTER the try/except below it, so any of
            # those raised an unhandled 500 instead of a clean 400.
            client = EtsyListingClient(req.access_token, req.shop_id, req.api_key)
        except EtsyValidationError as exc:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "code": "validation_error", "message": str(exc)},
            ) from exc

        try:
            result = client.create_listing(
                product, target_state=req.target_state, dry_run=req.dry_run,
            )
        except EtsyListingError as exc:
            if exc.status in (401, 403):
                status_code, code = 401, "etsy_auth_failed"
            elif exc.listing_id and exc.step == "uploadListingImage":
                status_code, code = 409, "draft_created_images_incomplete"
            elif exc.listing_id and exc.step == "activateListing":
                status_code, code = 409, "draft_created_not_activated"
            else:
                status_code, code = 502, "etsy_error"
            raise HTTPException(
                status_code=status_code,
                detail={
                    "ok": False,
                    "code": code,
                    "step": exc.step,
                    "message": str(exc),
                    "etsy_status": exc.status,
                    "etsy_body": exc.body,
                    "listing_id": exc.listing_id,
                },
            ) from exc
        except ConnectionError as exc:
            raise HTTPException(
                status_code=504,
                detail={"ok": False, "code": "transport_error", "message": str(exc)},
            ) from exc

        return {
            "ok": True,
            "dry_run": result.dry_run,
            "published": result.published,
            "sku": result.sku,
            "listing_id": result.listing_id,
            "images_uploaded": result.images_uploaded,
            "steps": result.steps,
            "payloads": result.payloads,
        }

    @app.post("/facebook/create-listing")
    def create_facebook_listing(
        req: FacebookCreateListingRequest,
        x_listing_service_token: Optional[str] = Header(default=None),
    ) -> dict[str, Any]:
        if req.dry_run is False:
            check_live_gates("facebook", req.confirm, x_listing_service_token)

        try:
            client = FacebookMarketplaceListingClient(
                req.access_token, req.page_id, sandbox=req.sandbox,
            )
            product = FacebookMarketplaceProduct(
                title=req.product.title,
                description=req.product.description,
                price=Decimal(str(req.product.price)),
                sku=req.product.sku,
                category=req.product.category,
                images=list(req.product.images),
                condition=req.product.condition,
                tags=list(req.product.tags),
            )
        except FacebookMarketplaceError as exc:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "code": "validation_error", "message": str(exc)},
            ) from exc

        try:
            result = client.create_listing(product, dry_run=req.dry_run)
        except FacebookMarketplaceError as exc:
            if exc.step == "validation":
                status_code, code = 400, "validation_error"
            elif exc.permanent:
                status_code, code = 401, "facebook_auth_failed"
            else:
                status_code, code = 502, "facebook_error"
            raise HTTPException(
                status_code=status_code,
                detail={
                    "ok": False,
                    "code": code,
                    "step": exc.step,
                    "message": str(exc),
                    "facebook_status": exc.code,
                    "listing_id": exc.listing_id,
                },
            ) from exc
        except ConnectionError as exc:
            raise HTTPException(
                status_code=504,
                detail={"ok": False, "code": "transport_error", "message": str(exc)},
            ) from exc

        if isinstance(result, dict):
            # dry_run path returns a plain dict (status/payload/note), not
            # a FacebookMarketplaceListingResult — surface it as-is.
            return {"ok": True, "dry_run": True, **result}

        return {
            "ok": True,
            "dry_run": False,
            "listing_id": result.listing_id,
            "product_id": result.product_id,
            "url": result.url,
        }

    @app.post("/bonanza/create-listing")
    def create_bonanza_listing(
        req: BonanzaCreateListingRequest,
        x_listing_service_token: Optional[str] = Header(default=None),
    ) -> dict[str, Any]:
        if req.dry_run is False:
            check_live_gates("bonanza", req.confirm, x_listing_service_token)

        try:
            client = BonanzaListingClient(req.dev_id, req.cert_id, req.access_token)
            listing = BonanzaListing(
                title=req.listing.title,
                description=req.listing.description,
                price=Decimal(str(req.listing.price)),
                quantity=req.listing.quantity,
                sku=req.listing.sku,
                category_id=req.listing.category_id,
                condition=req.listing.condition,
                tags=list(req.listing.tags),
                image_urls=list(req.listing.image_urls),
                ships_within_days=req.listing.ships_within_days,
                shipping_cost=(
                    Decimal(str(req.listing.shipping_cost))
                    if req.listing.shipping_cost is not None
                    else None
                ),
                free_shipping=req.listing.free_shipping,
                returns_accepted=req.listing.returns_accepted,
            )
        except BonanzaError as exc:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "code": "validation_error", "message": str(exc)},
            ) from exc

        try:
            result = client.create_listing(listing, dry_run=req.dry_run)
        except BonanzaError as exc:
            if exc.step == "validation":
                status_code, code = 400, "validation_error"
            elif exc.permanent:
                status_code, code = 401, "bonanza_auth_failed"
            else:
                status_code, code = 502, "bonanza_error"
            raise HTTPException(
                status_code=status_code,
                detail={
                    "ok": False,
                    "code": code,
                    "step": exc.step,
                    "message": str(exc),
                    "bonanza_status": exc.code,
                },
            ) from exc
        except ConnectionError as exc:
            raise HTTPException(
                status_code=504,
                detail={"ok": False, "code": "transport_error", "message": str(exc)},
            ) from exc

        if isinstance(result, dict):
            return {"ok": True, "dry_run": True, **result}

        return {
            "ok": True,
            "dry_run": False,
            "listing_id": result.listing_id,
            "selling_state": result.selling_state,
            "url": result.url,
        }

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-live", type=str, default="", metavar="ebay,etsy",
        help="Comma-separated platforms to arm for live publishing. Off by default on purpose.",
    )
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()

    try:
        cli_armed = _parse_armed_platforms(args.allow_live)
        env_armed = _parse_armed_platforms(os.environ.get("LISTING_SERVICE_ALLOW_LIVE"))
    except ValueError as exc:
        print(f"REFUSING TO START: {exc}", file=sys.stderr)
        sys.exit(1)

    armed_platforms = cli_armed | env_armed

    if armed_platforms and not (os.environ.get("LISTING_SERVICE_TOKEN") or os.environ.get("EBAY_LISTING_SERVICE_TOKEN")):
        print(
            "REFUSING TO START: arming any platform requires LISTING_SERVICE_TOKEN "
            "to be set (the shared secret live requests must present). "
            "Set it in the environment before using --allow-live.",
            file=sys.stderr,
        )
        sys.exit(1)

    app = create_app(armed_platforms)

    import uvicorn

    if armed_platforms:
        print("=" * 70)
        print(f"  LIVE PUBLISHING IS ARMED FOR: {', '.join(sorted(armed_platforms))}")
        print("  Requests with dry_run:false + the correct confirm literal +")
        print("  service token WILL create real, public listings on the real")
        print("  production seller account for these platforms only.")
        not_armed = set(PLATFORMS) - armed_platforms
        if not_armed:
            print(f"  NOT armed (still dry-run/draft-only): {', '.join(sorted(not_armed))}")
        print("=" * 70)

    # 127.0.0.1 only — never 0.0.0.0. This service can spend real money;
    # it must not be reachable from the LAN.
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
