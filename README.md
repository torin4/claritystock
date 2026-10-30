# claritystock

## Ingest API

`POST /api/ingest/photos` lets another app (today: AutoFocus 2) send one photo at a time into the library, server to server. There is no user session: each request is signed with a per-source HMAC-SHA256 (`X-Stock-Source`, `X-Stock-Timestamp`, `X-Stock-Signature` over `timestamp + "." + raw_body`, 300 s window). The photo is attributed to the `public.users` row whose email matches `photographer_email` on `ALLOWED_EMAIL_DOMAIN`. A resend of the same `source_ref`, or of the same image bytes, returns the existing photo instead of a copy.

Env vars:

- `AF2_INGEST_SECRET`: shared secret for `X-Stock-Source: af2`. Empty means af2 requests are rejected.
- `INGEST_IMAGE_HOSTS`: comma-separated exact hostnames `image_url` may use (https only). Empty means every download is refused.
- Also uses `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and `ALLOWED_EMAIL_DOMAIN`.

Before switching AF2 on, apply `supabase/migrations/20261030120000_photos_ingest_provenance.sql` to the Supabase project. It adds the provenance columns (`source_app`, `source_ref`, `sent_by_email`, `consent_text`, `consented_at`) and the unique index the endpoint relies on for idempotency.
