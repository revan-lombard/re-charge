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
- [x] **Security-review fixes** deployed (`0007_member_visibility.sql`; webhook/checkout/send-message redeployed).
- [x] **Admin Sites** deployed (`0008_sites.sql`, `publish-site`, `GITHUB_TOKEN` set).
- [x] **Online quotes** deployed (`0010_quotes.sql`, `quote`).
- [x] **Re-Charge potential** on leads (`0011_potential.sql` applied).
- [x] **Simple mode** (`0012_simple_stages.sql` applied: six stages, automatic stage moves, payment side effects).
- [x] **Prospect replies merge** into the existing lead (`project-intake` deployed).
- [x] **Signature photo** (`0013_branding.sql` applied, `send-message` deployed).
- [x] **Lead location + website monitoring** (`0014`, `0015` applied; `project-intake`, `build-sync`, `site-monitor` deployed).
- [ ] **Prospect finder**: `supabase db push` (`0016_finder.sql`), `supabase functions deploy finder`, Settings → Prospect finder → Set up, attach the repo to the "Re-Charge: find prospects" Routine.
- [x] **Mockup builder functions** deployed (`build-sync`, `project-intake`).
- [ ] **Mockup builder Routine:** paste the private key into the Routine's KEY section, then enable it. See `ADMIN.md` §8g.
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
    publish-site/                 admin panel → commit previews/<slug>/ to this repo (staff-only, JWT)
    build-sync/                   admin ↔ GitHub-based mockup builder: encrypted briefs out, results in (staff JWT)
    quote/                        public online quote: view / accept (+ Yoco deposit) / decline, by token
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


---

## Pre-launch security review (2026-10-16)


Plain-words notes for the manual. Nothing has been deployed yet. Do the three steps
below in order.

### Step 1: run the SQL (before deploying anything)

Open Supabase → SQL Editor, paste the whole of
`supabase/migrations/0034_security_review.sql` and run it. (Or `supabase db push`.)
You can run it more than once; nothing breaks if you do.

It does three things:

1. **Monthly billing can't charge anyone twice.** Each care payment request now records
   which due date it is for (`payment_requests.period`), and the database allows only one
   live request per client per due date. If two billing runs overlap, the second one stops
   before it charges or emails.
2. **Only the daily job (or you, signed in) can run billing.** It creates a long random
   password in Supabase Vault called `care_billing_secret`, and reschedules the daily 07:37
   billing job so it sends that password in an `x-billing-secret` header. The function
   checks it and refuses everyone else. The password never appears in code or git; you
   don't need to copy it anywhere.
3. **Website forms find the matching prospect in the database** (`find_prospect`,
   `norm_phone`), instead of loading up to 2,000 prospects every time.

Check it worked (in the SQL Editor):

```sql
select jobname, schedule from cron.job where jobname = 're-charge-care-billing';
select name, created_at from vault.secrets where name = 'care_billing_secret';
```

Both should return one row. If the second is empty, billing will refuse to run. Create
the secret by hand with
`select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'care_billing_secret');`
then run 0034 again.

To run billing by hand (for example to test it), paste this in the SQL Editor:

```sql
select net.http_post(
  url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/care-billing',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-billing-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'care_billing_secret')),
  body := '{"source": "manual"}'::jsonb);
```

The day after deploying, check the 07:37 run got through (200, not 403):
`select status_code, created from net._http_response order by created desc limit 5;`

### Step 2: secrets

- **SYNC_SECRET** (analytics-sync): now **required**. Before, if it wasn't set, anyone
  could trigger the Google Analytics / Search Console pull. Now, with it unset, every call
  is refused. If you use analytics, make sure it's set and that your analytics cron job
  sends `x-sync-secret` (BACKEND.md).
- **ALLOW_ORIGIN** (optional): which websites may call the functions from a browser. Unset
  is now safe: it allows only https://re-charge.co.za, https://www.re-charge.co.za and the
  local test server (http://127.0.0.1:8199 and http://localhost:8199). Before, unset meant
  every website. If you set it to `https://re-charge.co.za` earlier, that still works, but
  www and local testing won't. Either delete the secret or set a comma-separated list. No
  function needs `*`: everything that calls them from a browser is on re-charge.co.za, and
  webhooks, pg_cron and the office PC aren't affected by it.
- **New, optional:**
  - `INBOX_DRAFT_MODEL`: the Claude model the Inbox Assistant drafts with (client pages and
    connected inboxes). Unset keeps the current one. Only change it after comparing a
    week of drafts.
  - `INBOX_TRIAL_PER_IP_HOUR` (default 150) and `INBOX_TRIAL_PER_PAGE_DAY` (default 250):
    the caps on a client's Inbox Assistant page.
- No other new secrets. `ASSISTANT_CLAUDE_FALLBACK` stays **off** by default: the website
  chat and "try it on your own email" still use the office PC only.

### Step 3: deploy the functions

The shared CORS file changed, so every function a browser calls needs redeploying. The
simplest way is `supabase functions deploy` (all of them). If you list them:

```
supabase functions deploy ai-hub analytics-properties analytics-sync assistant build-sync care-billing create-yoco-checkout facebook-post finder google-oauth-callback google-oauth-start inbox-connect inbox-run inbox-trial live-demo monthly-report notify-push offer paystack-link paystack-webhook project-intake publish-site quote send-message site-monitor weekly-wins
```

(call-jobs, inbox-oauth-callback, resend-webhook and yoco-webhook didn't change.)

Run Step 1 first: the new care-billing refuses to run without it, and project-intake uses it
when it's there.

### What changed, in plain words

**Monthly billing (care-billing).** Before, anyone on the internet could start a billing run,
and two runs at the same moment could both charge a client's saved card. Now:
- Only the daily job (with the Vault password) or a signed-in staff user can run it.
- A client's month is claimed in the database before anything happens, so overlapping runs
  can't both charge.
- The card charge has a fixed Paystack reference (`care-<client>-<due date>`), so Paystack
  itself refuses a second charge for the same month.
- If Paystack times out or answers unclearly, the function checks with Paystack what really
  happened. If it charged, the client gets a receipt. If it didn't, they get the payment
  link as before. If it still isn't clear, the client gets **no** email and no second charge,
  and your billing summary email says which client to check in Paystack.
- The billing summary email now also lists anything that went wrong (not billed, email
  failed, needs checking), not only the successes.

**Website forms (project-intake).** Before, anyone could send unlimited form submissions,
and each one emailed whatever address was typed in, from our domain, partly with their text.
Now:
- Bodies over 32 KB are refused, every field is capped, and only 40 extra fields are kept.
- 5 submissions an hour from one connection, and 5 a day per email address. Beyond that the
  request is quietly dropped (and logged).
- 150 a day in total. Past that, submissions are still saved (so a real lead in a flood isn't
  lost) but go to **Spam**, with no emails, phone alerts or AI sort, and you get one warning
  email that day. Check Leads → Spam and use "Not spam" on real ones. Past 1,000 a day
  nothing more is saved.
- The automatic thank-you goes to an address **at most once a day**. It only contains our
  own text plus a first name, a business name (dropped if it has a link, an address or a phone
  number) and calculator figures that pass strict checks. The opportunity-scores email is
  rebuilt line by line. So nobody can use it to send their own message or link from our
  domain.
- If a prospect you contacted fills in a form, the record is no longer overwritten. It moves
  to New (so you see it), but its name, business, goal, location and so on are kept; the form
  only fills empty fields. Everything the form sent, and the planned next step it replaced,
  goes in the timeline.
- The "free mockup" thank-you no longer promises a free mockup. It's a normal "got your
  details, I'll come back to you by 17:00 tomorrow" reply.
- Unknown form types are stored as "Enquiry".

**Website chat and "try it on your own email" (assistant).**
- Each feature now has its own daily limit: the chat (1,500), try-it (300), client pages and
  forms are counted separately, so a busy client page can't switch off the chat.
- If the limit can't be checked, the free office PC still answers, but the paid Claude path is
  refused.
- New wording: the "I'm not sure" answer now points to the free 30-minute call (Book a call
  button) and WhatsApp. The assistant no longer suggests the free mockup by itself; it only
  mentions it if someone asks about a website. It now knows "no VAT is added; we're not
  VAT-registered", and that the paid Inbox Assistant drafts with Claude (Anthropic), while
  the website chat and demos run on a smaller model on our own computer.

**Client Inbox Assistant pages (inbox-trial).**
- 150 drafts an hour from one office connection (was 40), configurable. When it's hit, the
  message reads: "Lots of drafts from your office this hour. Message us on WhatsApp and we'll
  raise the limit."
- The 250-a-day cap per page now counts every paid AI call from the page, including pasted
  text that turned out not to be a customer email (before, those were free to repeat).
- If the caps can't be checked, the page says "try again in a minute" instead of drafting
  uncounted.
- It still drafts with Claude, not the office PC. That's the product clients pay for, the
  privacy page says client emails go to Anthropic, and the PC route can't guarantee the same
  reply format. The model can now be changed with `INBOX_DRAFT_MODEL`.
- The drafting rules now flag anything "legal, tax or medical" for a person to check.

**Lead reply drafts in the panel (draft_lead).** The retired "free online check" and "free
website mockup" line is gone. Prove now reads "half the Prove fee back if it misses the agreed
target".

**Live demos: missed calls (live-demo).** The "calls" demo no longer shows an AI answering the
phone. Now callers leave a voicemail or are pointed to WhatsApp, and the assistant turns each
one into a job card and drafts a WhatsApp/SMS reply with times and the call-out price. It never
gives safety instructions. Demos you've already built keep their old content: press build again
to get the new version.

**Old R500 deposit link (create-yoco-checkout).** The website hasn't used it for a while.
Calling it without an amount now returns "retired". Deposits come from the quote page (40%),
and the Inbox Assistant's R1,500 deposit is still requested from the panel ("Request payment"
works as before).

**Google connect links (google-oauth-start/callback).** A Google Analytics connect link now
expires after 30 minutes, like the Facebook one.

**Analytics sync.** Refuses every call unless SYNC_SECRET is set and sent (see Step 2).
