# Re-Charge Backend

The website (`/`) is a static site on GitHub Pages. This backend adds the things
a static site can't do on its own: an internal project database, automatic Yoco
payment reconciliation, and (phase 2) a GA4 + Search Console analytics dashboard.
It runs on **Supabase** (Postgres + Auth + Edge Functions).

> **Status: Phase 1 fully live.** Website forms → `project-intake` → Postgres +
> inbox email; deposits and admin-created payment links go through Yoco
> checkouts that `yoco-webhook` reconciles to the exact project; the admin
> panel (`ADMIN.md`, Phases A–C) runs on top. Only Phase 2 (analytics
> dashboard + monthly reports) is still untouched.

## Resume checklist

Done:
- [x] Database schema deployed and in sync (`migrations/0001_init.sql`, `0002_care_reports.sql`) — `0003_admin.sql` pending (see below)
- [x] Edge functions deployed: `project-intake`, `create-yoco-checkout`, `yoco-webhook`
- [x] Secrets set on Supabase: `YOCO_SECRET_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL`
- [x] `project-intake` verified: a POST stores a `projects` row and returns `{ id, ref }`

Done (cont.):
- [x] **Email delivery (Resend) working, inbox-grade.** Root cause was a stale `RESEND_API_KEY`; regenerated it and re-ran `supabase secrets set`. Then verified `re-charge.co.za` in Resend and set `NOTIFY_FROM=Re-Charge <no-reply@re-charge.co.za>` — notifications now land in the inbox (not spam).

To do (each step is safe and independently reversible):
- [x] **Yoco webhook** registered and `YOCO_WEBHOOK_SECRET` set. The webhook also reads `metadata.kind` / `requestId` (deposit, balance, care) from admin-created payment links and marks the request paid.
- [x] **Enquiries go to the database.** `ENQUIRY_ENDPOINT` points at `project-intake`, which handles all three form types (project / call / mockup) with the customer as reply-to. Revert = set it back to the Formspree URL.
- [x] **Admin panel migration `0003_admin.sql`** applied; admin live at `/admin/`.
- [x] **Admin Phase B** deployed (`0004_templates_meta.sql`, `send-message`).
- [x] **Admin Phase C** deployed (`0005_money.sql`, `create-yoco-checkout`, `yoco-webhook`); payment links verified against Yoco.
- [x] **Admin Marketing** deployed (`0006_marketing.sql`: campaigns, posts, private `marketing` image bucket).
- [ ] **Security-review fixes:** `supabase db push` (`0007_member_visibility.sql`) + `supabase functions deploy yoco-webhook create-yoco-checkout send-message`. See `ADMIN.md` §8e.
- [x] **Auto-reconciled deposits.** `CHECKOUT_ENDPOINT` is set, so the website's R500 deposit button creates a per-project Yoco checkout (falls back to the static pay link if the function is unreachable). Revert = clear it.
- [ ] **Phase 2 (analytics dashboard + monthly reports).** Not started — see the Phase 2 section below.

Function base URL: `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/<name>`

```
 Website (GitHub Pages, static)
        │  POST project  │  POST { projectId }
        ▼                ▼
 project-intake     create-yoco-checkout ──► Yoco (hosted checkout)
        │                                          │ payment.succeeded (webhook)
        ▼                                          ▼
   Postgres  ◄──────────────────────────────  yoco-webhook  (reconciles → project)
   projects / project_events / payments / clients / oauth / analytics_cache
        ▲
        │  read (RLS: staff see all, each client sees only their own)
   Dashboard (phase 2)  ◄── ga4-sync / gsc-sync (scheduled)  ◄── Google APIs
```

## Layout

```
supabase/
  config.toml                     Supabase project + per-function JWT settings
  .env.example                    names of the secrets (no values)
  migrations/0001_init.sql        schema + Row-Level Security (multi-client)
  functions/
    _shared/cors.ts               CORS + json helpers
    _shared/db.ts                 service-role client + optional email
    project-intake/               store a Project Builder submission
    create-yoco-checkout/         Yoco checkout: R500 deposit (website) or any amount (admin, staff JWT)
    yoco-webhook/                 reconcile Yoco payments → projects
    send-message/                 admin panel → Resend email (staff-only, JWT)
    resend-webhook/               optional: Resend delivery events → messages
```

## Phase 1 — projects + payment reconciliation (this scaffolding)

### 1. Create the project and link the CLI
```bash
npm i -g supabase           # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>   # from the Supabase dashboard URL
```

### 2. Push the schema
```bash
supabase db push            # applies migrations/0001_init.sql
```

### 3. Set secrets
```bash
cp supabase/.env.example supabase/.env    # fill in real values (git-ignored)
supabase secrets set --env-file supabase/.env
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically — don't
add them. For phase 1 you only need `YOCO_SECRET_KEY`, `YOCO_WEBHOOK_SECRET`, and
(optionally) `RESEND_API_KEY` + `NOTIFY_EMAIL` for email alerts.

### 4. Deploy the functions
```bash
supabase functions deploy project-intake create-yoco-checkout yoco-webhook
```
Each function's public URL is `https://<project-ref>.supabase.co/functions/v1/<name>`.

### 5. Point the website at the backend
Two independent switches, both in `config.js` (safe to do one at a time):

- **Store submissions in the database.** Set
  `ENQUIRY_ENDPOINT` to the `project-intake` URL. The builder already posts JSON;
  no other change is needed. (Leave it on Formspree until you've tested the
  function.)
- **Automatic payment reconciliation.** In the Yoco dashboard, add a webhook
  pointing at the `yoco-webhook` URL and copy its signing secret into
  `YOCO_WEBHOOK_SECRET`. For *reliable* matching, switch the deposit button from
  the static pay-link to a per-project checkout: after intake returns a
  `projectId`, call `create-yoco-checkout` and redirect the visitor to the
  returned `redirectUrl`. The webhook then matches by `metadata.projectId`
  exactly. (Wiring this into `script.js` is a small follow-up — ask when ready.)

### 6. Make yourself staff
So you can read everything through the dashboard later:
```sql
insert into staff (user_id) values ('<your-auth-user-uuid>');
-- create the Re-Charge tenant too:
insert into clients (name, slug) values ('Re-Charge', 're-charge');
```

## How reconciliation works (answering "how hard is it?")

- **With per-project checkouts (recommended): reliable and automatic.** The
  payment carries `metadata.projectId`, so `yoco-webhook` flips that exact
  project to `deposit_paid` with zero guessing. Effort: the three functions here
  plus a ~15-line change to the deposit button.
- **With the existing static pay-link: best-effort.** Yoco still posts a webhook,
  but the only link to a project is whatever reference the customer typed. The
  webhook stores every payment and matches when it can find an `RC-#####` ref;
  the rest sit in the `payments` table as unmatched for you to match by hand.

The static link can't be made fully automatic — that's exactly why the
per-project checkout path exists. Both are supported; use the checkout path once
you're comfortable replacing the static link.

## Phase 2 — GA4 + Search Console dashboard (built, untested)

The dashboard and its backend now exist in the repo, but **none of it has been
run** — Google API request shapes, OAuth, token refresh and the sync all need
verifying against your live project. Treat it as v0 to deploy and debug.

Pieces:
- `functions/google-oauth-start` / `google-oauth-callback` — Google consent +
  token exchange; refresh token stored **encrypted** (AES-GCM) in
  `oauth_credentials`. State is HMAC-signed to prevent tampering.
- `functions/analytics-properties` — list the account's GA4 + Search Console
  properties, and save the chosen ones.
- `functions/analytics-sync` — pull the metrics (users, sessions, new users,
  page views, sources, top pages, devices, countries, events/conversions;
  clicks, impressions, CTR, position, top queries/pages, trends) into
  `analytics_cache`. Scheduled + guarded by `SYNC_SECRET`.
- `dashboard/` — a signed-in page (Supabase Auth magic link) that reads only
  `analytics_cache` for the caller's client via the anon key + RLS. Never calls
  Google directly, never sees tokens.
- `functions/monthly-report` — emails each client on an active hosting/care
  plan a plain 30-day summary (from `analytics_cache`) via Resend. Scheduled
  monthly + guarded by `REPORT_SECRET`. Reads the `care_active`, `report_emails`
  and `site_label` columns added in migration `0002_care_reports.sql`; a client
  gets the report only while `care_active = true` and `report_emails` is set.
  Manual/dry-run test:
  `curl -X POST "$FN/monthly-report" -H "x-report-secret: <REPORT_SECRET>" -H "content-type: application/json" -d '{"clientId":"<uuid>","dryRun":true}'`
  Schedule (SQL editor, 1st of the month at 06:00):
  ```sql
  select cron.schedule('monthly-report', '0 6 1 * *', $$
    select net.http_post(
      url := 'https://<ref>.supabase.co/functions/v1/monthly-report',
      headers := jsonb_build_object('x-report-secret','<REPORT_SECRET>'),
      body := '{}'::jsonb
    );
  $$);
  ```

### Deploy phase 2
1. **Google Cloud**: create a project; enable the *Google Analytics Data API*,
   *Google Analytics Admin API* and *Search Console API*; create an OAuth 2.0
   **Web** client. Add the authorised redirect URI:
   `https://<ref>.supabase.co/functions/v1/google-oauth-callback`. Copy the
   client id/secret into `.env` and set `GOOGLE_OAUTH_REDIRECT` to that URI.
2. **Secrets**: also set `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) and
   `SYNC_SECRET` (any long random string), then
   `supabase secrets set --env-file supabase/.env`.
3. **Deploy the functions**:
   ```
   supabase functions deploy google-oauth-start google-oauth-callback \
     analytics-properties analytics-sync
   ```
4. **Dashboard config**: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in
   `config.js` (both public). Enable Email auth in Supabase → Authentication.
5. **Schedule the sync** (Supabase SQL editor, needs pg_cron + pg_net):
   ```sql
   select cron.schedule('analytics-nightly', '0 3 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/analytics-sync',
       headers := jsonb_build_object('x-sync-secret','<SYNC_SECRET>')
     );
   $$);
   ```
6. **Try it**: open `/dashboard/`, sign in, click *Connect Google Analytics*,
   pick your GA4 property + Search Console site, Save, then trigger a sync
   (the cron job, or call `analytics-sync` once with the secret header).

### Verification checklist (because it's untested)
- OAuth round-trip returns to `/dashboard/?connected=1` and a row appears in
  `oauth_credentials` (refresh token is ciphertext, not plain).
- `analytics-properties?clientId=...` returns your GA4 + GSC lists.
- A manual `analytics-sync` call writes rows to `analytics_cache`; the dashboard
  then shows numbers. Watch the function logs for Google API errors — the
  request shapes are the most likely thing to need a tweak.

## Security notes

- RLS is on for every table. Browsers use the anon key and get only what the
  policies allow; the Edge Functions use the service-role key server-side.
- OAuth tokens have **no** browser-readable policy — only the service role can
  touch `oauth_credentials`. Refresh tokens are encrypted at rest (phase 2).
- The Yoco webhook verifies the Standard-Webhooks signature before trusting a
  payload. Payment inserts are idempotent (`unique(provider, provider_id)`).
- `supabase/.env` is git-ignored; only `.env.example` (names, no values) is
  committed. No secret belongs in the public repo or in any frontend file.
