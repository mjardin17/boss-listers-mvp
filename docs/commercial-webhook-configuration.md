# BossListers commercial webhook configuration

The commercial pipeline is a server-to-server integration. Do not put webhook secrets in browser code, public environment variables, `wrangler.toml`, or committed `.env` files.

## BossListers environment

Configure the webhook URL as a non-secret variable and the two secrets through Cloudflare's secret store:

- `VIDEO_PIPELINE_WEBHOOK_URL=https://<your-video-pipeline-host>/webhook`
- `VIDEO_PIPELINE_WEBHOOK_SECRET`: new random secret, at least 32 bytes.
- `VIDEO_PIPELINE_CALLBACK_SECRET`: a separate new random secret, at least 32 bytes.

Example secret commands:

```sh
wrangler secret put VIDEO_PIPELINE_WEBHOOK_SECRET
wrangler secret put VIDEO_PIPELINE_CALLBACK_SECRET
```

Do not paste secret values into GitHub files, issues, or chat.

## Video-pipeline environment

Set these in the video pipeline's private environment:

- `WEBHOOK_SECRET`: exactly the same value as BossListers' `VIDEO_PIPELINE_WEBHOOK_SECRET`.
- `COMMERCIAL_IMAGE_ALLOWED_HOSTS`: exact public HTTPS image hostnames used by BossListers inventory.
- `BOSSLISTERS_CALLBACK_URL=https://<your-bosslisters-host>/api/commercials/callback`
- `BOSSLISTERS_CALLBACK_SECRET`: exactly the same value as BossListers' `VIDEO_PIPELINE_CALLBACK_SECRET`.

The receiver fails closed if its inbound secret or image-host allowlist is missing. The callback fails closed if its URL or secret is missing.

## Lifecycle

1. BossListers authenticates the tenant and confirms the listing belongs to it.
2. It validates the payload and creates a `pending` commercial job.
3. It sends a timestamped HMAC-SHA256 request using `X-Webhook-Timestamp` and `X-Webhook-Signature`.
4. The receiver validates the signature, replay window, identifiers, and image sources before returning HTTP 202.
5. BossListers changes `pending` to `queued` only if the row is still pending, avoiding a race with a fast completion callback.
6. The video pipeline sends a separately signed `completed` or `failed` callback. BossListers updates only the row matching both `job_id` and the signed `tenant_id`.

## Important rotation warning

The previous inbound webhook secret was committed in the public BossListers repository. Removing it from the current branch does not revoke it or remove it from Git history. Generate a new random value and rotate both the BossListers and video-pipeline settings before enabling the integration. Do not reuse the exposed value.
