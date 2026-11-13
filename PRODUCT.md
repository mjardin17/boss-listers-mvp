# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Josh Jardin, the owner, works from a laptop and phone. Later, a few helpers may log in with the same owner view. Situation: many storefronts (eBay, Shopify, a website, Facebook, Instagram, Etsy and Amazon planned). Job: see every listing and sale in one place, and act on it quickly.

## Product Purpose
BossListers is the control room for a small publishing and reselling business. The storefronts page is the one screen where the owner sees, per channel, what is active, what is a draft, and what sold, and where he can publish a draft or end a live listing. Success: the owner can answer "what is live, what is waiting, what sold" in a few seconds, and can act without leaving the page.

## Positioning
One owner's control room across every storefront, with listing state and sales on the same screen. Not a generic marketplace dashboard: it is built around the owner's own books, ebooks and products, and it confirms before anything goes live.

## Operating Constraints
- Destructive or public actions (publish, end listing) require an explicit confirmation step.
- Read-only sources (sold orders) may be unavailable; show the reason, do not hide the section.
- Data shape comes from /api/storefronts and must not change.
