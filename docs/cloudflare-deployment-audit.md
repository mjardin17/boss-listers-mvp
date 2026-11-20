# Cloudflare deployment compatibility audit

This repository is a full-stack Next.js application, not a static-only site:

- It contains App Router route handlers under `app/api`.
- It contains Pages Router API routes under `pages/api`.
- It uses Next.js middleware.
- `next.config.js` does not set `output: "export"`.
- The package build script runs `next build`.
- `wrangler.toml` currently declares Cloudflare Pages build output as `out`.

Those settings do not, by themselves, establish a valid full-stack Cloudflare deployment. Cloudflare's Pages static Next.js guide uses `out` for a project configured for static export; a static export does not provide request-time API routes or middleware. Cloudflare currently recommends vinext on Workers for full-stack Next.js, and recommends running `npx vinext check` before migrating an existing application.

This branch adds only a non-destructive compatibility-check workflow. It does not install vinext as an application dependency, change the build scripts, change `wrangler.toml`, or deploy anything.

## Decision gate

Before changing production deployment configuration, confirm the actual hosting target and inspect its current build command, output directory, environment variables, custom domain, and secrets. If Cloudflare Workers is the target, review the compatibility-check results and test a separate preview deployment before changing production. If the app is hosted elsewhere, do not migrate it to Cloudflare merely because a Wrangler file exists.
