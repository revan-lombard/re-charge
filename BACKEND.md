# Re-Charge Backend

The website (`/`) is a static site on GitHub Pages. This backend adds the things
a static site can't do on its own: an internal project database, automatic Yoco
payment reconciliation, and (phase 2) a GA4 + Search Console analytics dashboard.
It runs on **Supabase** (Postgres + Auth + Edge Functions).

> **Status: scaffolding, not yet deployed.** The code here has not been run
> against a live Supabase project. Follow the setup below to deploy it, then
> verify each function. The live website is unchanged and keeps working
> (Formspree intake + the static Yoco pay link) until you switch it over.

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
    create-yoco-checkout/         create a Yoco checkout tagged with projectId
    yoco-webhook/                 reconcile Yoco payments → projects
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

## Phase 2 — GA4 + Search Console dashboard (planned, not built)

The schema is already in place (`oauth_credentials`, `analytics_properties`,
`analytics_cache`, all locked to the service role or the owning client by RLS).
The build, in order:

1. **Google Cloud project**: enable the *Google Analytics Data API* and *Search
   Console API*; create an OAuth 2.0 client (web); set the redirect to
   `GOOGLE_OAUTH_REDIRECT`. Never put the client secret in the browser.
2. **`google-oauth-start` / `google-oauth-callback` functions**: run the consent
   flow, exchange the code for tokens server-side, and store the refresh token
   **encrypted** (`TOKEN_ENCRYPTION_KEY`) in `oauth_credentials`.
3. **Property pickers**: list the user's GA4 + Search Console properties and save
   the chosen ids in `analytics_properties`.
4. **`ga4-sync` / `gsc-sync` functions** on a schedule (Supabase cron): refresh
   the access token, pull the metrics the spec lists (users, sessions, top pages,
   sources, events, conversions; clicks, impressions, CTR, position, top
   queries), and write them to `analytics_cache`.
5. **Dashboard page** (`/dashboard/`): a signed-in page that reads only
   `analytics_cache` for the current user's client via the anon key + RLS — never
   Google directly, never tokens in the browser.

Multi-client is built in from the start: every analytics row is keyed by
`client_id`, and RLS guarantees one client can never read another's data. The
first client is Re-Charge itself.

## Security notes

- RLS is on for every table. Browsers use the anon key and get only what the
  policies allow; the Edge Functions use the service-role key server-side.
- OAuth tokens have **no** browser-readable policy — only the service role can
  touch `oauth_credentials`. Refresh tokens are encrypted at rest (phase 2).
- The Yoco webhook verifies the Standard-Webhooks signature before trusting a
  payload. Payment inserts are idempotent (`unique(provider, provider_id)`).
- `supabase/.env` is git-ignored; only `.env.example` (names, no values) is
  committed. No secret belongs in the public repo or in any frontend file.
