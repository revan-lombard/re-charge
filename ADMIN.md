# Re-Charge Admin Panel — Design

A private, login-protected control room at **`/admin/`** on re-charge.co.za, from
which the whole business is run: every lead and project, every client, every
payment, and every email/WhatsApp you send — in one place, on desktop or phone.

> **Status: Phases A, B, C, Marketing, Sites, online quotes and the automatic mockup builder (via GitHub) built and deployed.** A (sign-in,
> pipeline, workbench, calls, search) and B (templates, email via Resend,
> WhatsApp, outreach, settings) are live and in use. C (Money screen, request
> any payment, quote builder, EFT recording, clients & care renewals, time
> logging) is deployed on the site and needs the commands in **§8c**. Phase D
> items are listed in §11. Try the UI with demo data any time at
> `/admin/?mock=1` (no network, nothing saved). Phase C setup (§8c) is done:
> migration applied, functions deployed, Yoco webhook registered, payment links
> verified, `CHECKOUT_ENDPOINT` switched on.

This document is the design and build record. It is grounded in what already
exists: the Supabase database (`supabase/migrations/`),
the `staff` table and row-level security (RLS), the deployed `project-intake`
function that is already writing every website enquiry into `projects`, and the
sign-in pattern in `dashboard/`.

---

## 1. What you get

| You asked for | What it is |
|---|---|
| A hidden admin login | `/admin/` — unlinked, `noindex`, opens a sign-in screen. Sign in by one-time email link. Only accounts listed in the `staff` table get past it; anyone else sees "not authorised" and is signed out. |
| Track clients, sales, projects | **Pipeline** — every lead from first contact to live site, in 5 stage groups. **Overview** — KPIs and a "needs attention" list. **Clients** — who you host / care for, renewals due. **Payments** — every Yoco payment (auto) and EFTs you record by hand, with revenue totals. |
| Email templates sent from the panel | Templates with variables (`{{first_name}}`, `{{ref}}`, `{{quote}}` …). From a lead's page: pick template → preview with the blanks filled → edit → **Send**. Goes out via Resend from `no-reply@re-charge.co.za`, replies land in your inbox, and the send is logged on the lead's timeline. |
| WhatsApp templates | Same template picker → **Open in WhatsApp** opens a chat with that client with the message pre-filled; you tap send. Logged on the timeline. (See §7 for why it works this way.) |
| Manage everything from a single place | Yes. The website feeds it automatically; you add cold-outreach prospects by hand; every action (status change, note, email, WhatsApp, payment) lands on one timeline per project. |

**Not in scope for now** (all possible later, listed in §11): client-facing portal,
automated WhatsApp sending, quote PDFs, inbound email threads, more than one staff user.

---

## 2. The pipeline (the heart of it)

The database already has a 12-stage `project_status`. The plan adds two stages
*before* it so cold outreach lives in the same pipeline as website enquiries,
and groups the 14 stages into 5 columns you actually look at:

```
 OUTREACH          LEADS              SCOPING              BUILD                  DONE
 prospect      →   new            →   under_review     →   approved           →   live
 contacted         deposit_paid       clarification        in_development         care
                                      quote_sent           client_review
                                                           final_payment
                                                                              (declined: hidden, filterable)
```

- **Website enquiry / call request / mockup request** → arrives as `new`
  automatically (already happening today).
- **Cold email you send** → you add the business as `prospect`; sending the
  outreach template moves it to `contacted`; if they reply or submit the form,
  `new`.
- **Deposit paid** → set automatically by the Yoco webhook once it's switched
  on (§8), or by you with one click when an EFT arrives.

Every status change writes a timeline event automatically (database trigger), so
the history is never lost even when something else (the webhook) moves a project.

---

## 3. Screens

All screens share the site's look (dark, Space Grotesk / Inter, same `styles.css`),
and are built **phone-first**: on mobile you get a bottom tab bar
(Overview · Pipeline · Clients · Money · Templates) and full-screen detail views;
on desktop, a left rail and a two-pane layout.

### 3.1 Sign in
Email → "Send link" → click the link in your email → you're in. The session
persists on that device until you sign out, so in practice you sign in rarely.

### 3.2 Overview (home)
```
┌────────────────────────────────────────────────────────────────────┐
│ This month     New leads 7 │ Deposits 3 (R1,500) │ Quotes out 4     │
│                Revenue R9,200 │ Pipeline value R31,000 │ Care 5     │
├────────────────────────────────────────────────────────────────────┤
│ Needs attention                                                    │
│  ● RC-00051  Bella Hair Studio   new, no reply for 26h   [Open]    │
│  ● RC-00047  Follow-up due today: "send revised quote"   [Open]    │
│  ● Payment R500 from j.smith@…  unmatched                [Match]   │
│  ● Mike's Plumbing  care renews in 12 days               [Open]    │
├────────────────────────────────────────────────────────────────────┤
│ Recent activity   (latest 20 timeline events across all projects)  │
└────────────────────────────────────────────────────────────────────┘
```
KPIs are computed in the browser from `projects` + `payments` (tiny volumes; no
server code). "Needs attention" rules: `new` older than 24h with no outbound
message; `next_action_at` due/overdue; unmatched payments; care renewals ≤30 days.

### 3.3 Pipeline
- **List view** (default on phone) and **board view** (desktop) with the 5 columns above.
- Filters: stage group, category (Websites/Dashboards/…), source
  (website / call / mockup / outreach / referral / whatsapp), free-text search
  (name, business, email, ref).
- Each card: ref, business, name, category chips, stage, days in stage, next action.
- **+ Add lead** button: name, business, email, phone, source, note → creates a
  `prospect` (for outreach) or `new` (for a phone/WhatsApp enquiry).

### 3.4 Project detail (the workbench)
```
┌ RC-00051 · Bella Hair Studio ──────────────────────  Stage: new ▾  ┐
│ Sipho Dlamini · sipho@…  · 082 000 0000                             │
│ [Email] [WhatsApp] [Call]        Quote: R____  Next action: ____ 📅 │
├─────────────────────────────────────────────────────────────────────┤
│ Submission          │ Timeline                                      │
│ Type: Project enq.  │ ● Today 09:14  Email sent: "Enquiry received" │
│ Category: Websites  │ ● Today 09:10  Note: "wants booking + gallery"│
│ Goal: …             │ ● Yesterday    Created — submitted from website│
│ Budget: R2–4k       │                                               │
│ Deadline: …         │ [ Add note … ]                                │
│ Indicative: R2,000  │                                               │
│ Attachments: 2 files│                                               │
├─────────────────────┴───────────────────────────────────────────────┤
│ Payments: R500 deposit · 12 Sep · Yoco          [Record EFT payment]│
│ Client: — not yet —                             [Convert to client] │
└─────────────────────────────────────────────────────────────────────┘
```
- **Stage ▾** moves it through the pipeline (with "Declined" + reason).
- **Email** → template picker → live preview with variables filled from this
  project → edit freely → Send (option: "send me a copy"). Logged.
- **WhatsApp** → template picker → preview → *Open in WhatsApp* (number
  normalised `082…` → `2782…`). Logged as "WhatsApp opened".
- **Call** → `tel:` link on phone; on desktop shows the number.
- Everything submitted by the visitor is rendered as **text, never HTML**
  (form content is untrusted; this protects the admin from injected markup).

### 3.5 Templates
- Two kinds: **Email** (name, subject, body) and **WhatsApp** (name, body).
- Variable chips you click to insert:
  `{{first_name}} {{name}} {{business}} {{ref}} {{category}} {{goal}}
  {{indicative_price}} {{quote}} {{deposit_link}} {{start_link}} {{my_name}}
  {{my_whatsapp}}`.
- Live preview against a sample project; duplicate; archive.
- **Seeded starter set** (editable): Enquiry received · Call confirmed · Mockup
  ready · Quote · Deposit reminder · Project live · Care renewal due · Cold
  outreach (the general email drafted earlier) · Follow-up 1 · Follow-up 2 ·
  WhatsApp: quick hello / quote sent / site live.

### 3.6 Clients
- Who you host/care for: name, site, plan (Hosting / Care / Business), renewal
  date, report emails, active toggle. These are the existing `clients` columns
  plus a renewal date.
- Client page: their projects, payments, care status. "Convert to client" from a
  project pre-fills it.

### 3.7 Money
- All payments: Yoco (automatic from the webhook) and manual EFT entries.
- Unmatched Yoco payments → "Match to project" picker.
- Totals: this month / last 30 days / year, deposits vs balances vs care.
- (Yoco is the source of truth for card money; this is your ledger view. No
  invoicing engine — Yoco invoices/EFT stay as they are.)

### 3.8 Settings
Reply-to address, email signature, your name (for `{{my_name}}`), WhatsApp
number, "bcc me on every send". Stored in a small `settings` table.

---

## 4. Architecture (what runs where)

```
 Browser  /admin/  (static HTML/JS/CSS on GitHub Pages, like the rest of the site)
    │  supabase-js (anon key + your login token)
    ├──► Postgres directly, through RLS ── read/write projects, events, clients,
    │                                       payments, templates, settings
    └──► Edge Function  send-message  ── verifies you are staff, sends via Resend,
                                         logs to messages + project_events
 Website forms ──► project-intake (already live) ──► projects (status: new)
 Yoco ──► yoco-webhook (to switch on) ──► payments + projects.deposit_paid
```

- **No new server for the UI** — it is static files, same deploy flow as the site.
- **One new Edge Function**: `send-message` (email needs the Resend secret,
  which must never be in the browser). Deployed with `verify_jwt = true` and a
  hard `is_staff` check using the existing `getCaller()` helper.
- **Everything else talks to Postgres directly** under RLS. The anon key in
  `config.js` is public by design; RLS is the wall.

---

## 5. Database changes (one migration: `0003_admin.sql`)

Additive only — nothing existing changes shape.

**Pipeline / sales fields on `projects`**
- `source text` — website | call | mockup | outreach | referral | whatsapp | other
- `quote_cents integer` — the quoted/expected value (drives "pipeline value")
- `next_action text`, `next_action_at timestamptz` — follow-up reminders
- `declined_reason text`
- enum: add `prospect` and `contacted` *before* `new`
- trigger: on status change → insert `project_events(kind='status', note='new → quote_sent')`

**New tables (all RLS: staff only)**
- `templates` — id, kind (email|whatsapp), name, subject, body, archived, timestamps
- `messages` — id, project_id, kind, to_address, subject, body, template_id,
  provider_id (Resend id), status, created_at — the send log
- `settings` — key text primary key, value jsonb

**`clients`**: add `care_renews_at date`, `phone`, `email`.

**RLS additions** (today staff can only *read* most tables and *update* projects)
- `projects`: staff insert (add lead), staff delete (spam clean-up)
- `project_events`: staff insert (notes)
- `clients`: staff insert/update
- `payments`: staff insert/update (record EFT, match payment)
- `templates`, `messages`, `settings`: staff select/insert/update/delete

Compatibility: `project-intake` and `yoco-webhook` keep working unchanged
(`source` defaults from `channel`/form type in the function later; the trigger
simply adds an extra event when the webhook flips a status).

---

## 6. Security model

- **The login is the protection, not the hidden URL.** `/admin/` is unlinked
  and `noindex`, but treat it as public knowledge; nothing on it renders
  without a valid staff session.
- **Sign-in**: Supabase Auth magic link (no password to leak or reuse). Sessions
  refresh silently; "Sign out" kills it.
- **Two locks on every read/write**: (1) RLS policies keyed on `is_staff()`,
  enforced by Postgres regardless of what the JavaScript does; (2) the UI's own
  staff check, which shows a clean "not authorised" screen instead of empty tables.
- **Public sign-ups turned off** in Supabase after your account exists, so
  nobody can even create an account with the anon key.
- **Secrets stay server-side**: Resend key only in Edge Function secrets; the
  browser never sends email itself.
- **XSS-safe rendering**: all database text (which includes whatever visitors
  typed into forms) is inserted as text nodes / escaped, never as HTML.
- **Email content**: sent as plain text plus a minimal HTML version with escaped
  content and your signature; no remote images or tracking.
- **CORS** for `send-message` is limited to `https://re-charge.co.za`
  (already the `ALLOW_ORIGIN` setting).
- **Audit trail**: every send, status change, note and payment is a row in
  `project_events` / `messages` with a timestamp.

---

## 7. Honest caveats

- **WhatsApp cannot be sent automatically** without Meta's WhatsApp Business
  API (paid, per-message, and every template must be pre-approved by Meta). The
  pre-filled-link approach is free, instant, works from your phone or WhatsApp
  Desktop, and keeps the conversation in your normal WhatsApp. If volume ever
  justifies it, the template table and send log are already shaped for a
  Business-API upgrade.
- **Magic-link emails use Supabase's built-in mailer by default**, which is
  rate-limited to a handful per hour and can land in spam. Recommended (10-min
  job, in §8): point Supabase Auth at Resend's SMTP so login emails also come
  from `re-charge.co.za`.
- **Resend free tier**: 3,000 emails/month, 100/day — far above need. The
  panel shows a running count so you'd notice long before.
- **No offline mode**: it needs a connection (it's a live view of the database).
- **Single staff user** is assumed for the UI wording; adding a second person is
  one `insert into staff` — the security model already supports it.

---

## 8. What you'd do (one-time setup, ~20 minutes total)

Nothing here is needed until the build is ready; listed now so there are no surprises.

1. **Supabase → Authentication → URL Configuration**
   Site URL `https://re-charge.co.za`; add Redirect URL `https://re-charge.co.za/admin/`.
2. **Supabase → Project Settings → API**: copy the **anon public** key (safe to
   publish) — it goes into `config.js` as `SUPABASE_ANON_KEY`, with
   `SUPABASE_URL = https://aqwdncyihcbktbbuvvzd.supabase.co`.
3. **Apply the migration** (from your repo folder, same as before; pull the
   latest `main` first so `0003_admin.sql` is there):
   ```
   git pull
   supabase db push
   ```
   (`supabase functions deploy send-message` comes with Phase B.)
4. **Create your account**: open `/admin/`, enter your email, click the link.
   Then in Supabase → SQL Editor, run (with your email):
   ```sql
   insert into staff (user_id)
     select id from auth.users where email = 'you@example.com'
     on conflict do nothing;
   insert into clients (name, slug) values ('Re-Charge', 're-charge')
     on conflict do nothing;
   ```
   Reload `/admin/` — you're in.
5. **Lock the door**: Supabase → Authentication → Sign In / Up → turn **off**
   "Allow new users to sign up".
5b. **Put the 6-digit code in the sign-in email** so you can request a sign-in
   on your laptop and read the code off your phone (a magic link only signs in
   the device that opens it). Supabase → Authentication → Email Templates →
   **Magic Link** → add a line to the body, e.g.
   `<p>Or enter this code: <b>{{ .Token }}</b></p>` → Save. The sign-in
   screen accepts either the link or the code.
6. *(Recommended)* **Auth emails via Resend**: Supabase → Authentication → SMTP
   Settings → enable custom SMTP: host `smtp.resend.com`, port `465`, user
   `resend`, password = your Resend API key, sender `no-reply@re-charge.co.za`.
7. *(When ready, unrelated to the admin but unlocks "Deposits" automation)*
   Yoco webhook → `YOCO_WEBHOOK_SECRET`, and set `CHECKOUT_ENDPOINT` in
   `config.js` (both already documented in `BACKEND.md`).

### 8b. Phase B setup (templates & sending)

1. From the repo folder:
   ```
   git pull
   supabase db push                                   # applies 0004_templates_meta.sql
   supabase functions deploy send-message resend-webhook
   ```
2. In `/admin/` → **Settings**: your name, reply-to address, signature, review
   link. These fill `{{my_name}}`, `{{signature}}`, `{{review_link}}` …
3. `/admin/` → **Templates** → **Add starter set** (11 emails + 5 WhatsApp,
   all editable). Then send yourself a test from any lead's **Email** button.
4. *(Optional)* Delivery status on the timeline: Resend → Webhooks → Add
   endpoint → `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/resend-webhook`
   → events `email.delivered`, `email.bounced`, `email.complained` → copy the
   signing secret into `supabase\.env` as `RESEND_WEBHOOK_SECRET` →
   `supabase secrets set --env-file supabase\.env`.

### 8c. Phase C setup (money & clients)

1. From the repo folder:
   ```
   git pull
   supabase db push                                   # applies 0005_money.sql
   supabase functions deploy create-yoco-checkout yoco-webhook
   ```
2. **Yoco webhook** (this is what makes payments show up by themselves):
   Yoco dashboard → Sell online → Webhooks → add
   `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/yoco-webhook` →
   copy the signing secret into `supabase\.env` as `YOCO_WEBHOOK_SECRET` →
   `supabase secrets set --env-file supabase\.env`.
3. *(Optional)* In `config.js` set `CHECKOUT_ENDPOINT` to
   `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/create-yoco-checkout`
   so the website's R500 deposit button also uses a per-project checkout
   (reconciles exactly instead of by typed reference).

What you get: **Money** (rail, or More on the phone) with month / 30-day /
year totals, a 12-month revenue chart split by deposit / balance / care, revenue
by category, effective hourly rate where time is logged, open payment links,
every payment (Yoco automatic, EFT/cash recorded by hand), CSV export. On a
project: **Request payment** creates a Yoco link for any amount tagged to that
project (copy it, or "Email it" with `{{payment_link}}` filled in); **Record
EFT / cash**; a **Quote** builder with line items that fills `{{quote}}` and
`{{quote_items}}`; **Log time**; **Convert to client**. On a client: care plan,
price, renewal date, "Create renewal payment link", "Email renewal notice",
"Mark renewed (+1 year)". The website shows a "Payment received" banner when
someone returns from a checkout.

### 8g. Automatic mockup builder (via GitHub)

A scheduled Claude session (Opus) builds queued mockups by itself. Its cloud
environment can reach GitHub but not Supabase, so everything travels through
the repository:

1. You queue a lead (**Queue mockup build**, or Settings → auto-queue new
   free-mockup requests). The `build-sync` function (or `project-intake`, for
   auto-queue) encrypts the brief with the builder's **public** key and commits
   it to `_build/queue/<slug>.json`. The repo is public, so the brief is never
   stored readable; `_`-folders aren't published by GitHub Pages either.
2. Hourly, every day from 06:00 to 20:00, the Routine decrypts the queue with the **private** key
   (kept only in the Routine's prompt), builds `previews/<slug>/` from
   `previews/_template/` per `previews/GUIDE.md`, checks it in Chromium, and
   pushes the mockup plus `_build/results/<slug>.json`.
3. Next time the admin panel loads (at most every 90 s), `build-sync` reads
   the results, marks the lead "Mockup built — review before sending",
   publishes the Sites record, and deletes the result file. "Check for result"
   on the lead does it on demand.

Nothing goes to the prospect automatically: you open the mockup and press
**Email the link**.

Setup (from the repo folder; no new Supabase secrets — it reuses `GITHUB_TOKEN`):
```
git pull
supabase functions deploy build-sync project-intake
```
Then, in claude.ai → Routines → **"Re-Charge: build queued mockups"** → edit
the prompt: replace the line under **KEY** with the builder's private key (the
whole block, BEGIN to END lines). Enable the Routine. Test: queue one lead,
press Run, wait for its notification, then open the lead in the panel.

The private key must match the public key in
`supabase/functions/_shared/build_pubkey.ts`. To make a fresh pair on your own
computer (also the way to rotate it): `node scripts/make_build_key.js` — it
writes the private key one folder above the repo and updates the public key
file; commit that file, redeploy `build-sync` and `project-intake`, and paste
the new private key into the Routine.

Privacy: the repository is public (GitHub Pages), so mockups in `previews/`
are unlisted, not secret. Briefs in `_build/queue/` are encrypted; result files
hold no personal details.

### 8f. Sites setup (demos, mockups, previews, client sites)

1. **GitHub token** so the panel can publish files to this repo: GitHub →
   Settings → Developer settings → Personal access tokens → **Fine-grained
   tokens** → Generate: name "Re-Charge admin publish", repository access
   **Only select repositories → re-charge**, permissions **Contents: Read and
   write** (nothing else), expiry 1 year. Copy it into `supabase\.env` as
   `GITHUB_TOKEN=github_pat_…` (also keep `GITHUB_REPO=revan-lombard/re-charge`
   and `GITHUB_BRANCH=main` from `.env.example`), then
   `supabase secrets set --env-file supabase\.env`.
2. From the repo folder:
   ```
   git pull
   supabase db push                                   # 0008_sites.sql
   supabase functions deploy publish-site
   ```

**What you get** (Sites in the rail, or under More): an inventory of
everything built — demos, mockups, previews and client sites hosted elsewhere —
each linked to a project and/or client, with a screenshot and notes. For
on-domain kinds, the **Publish** card takes a folder, files or a .zip (needs an
`index.html` at the top level; up to 300 files / 20 MB), commits them to
`previews/<path>/` on `main` in one commit, and the site is live at
`re-charge.co.za/previews/<path>/` about a minute later. Paths are unguessable
by default; every HTML file gets `noindex,nofollow` injected and `/previews/`
is disallowed in `robots.txt`. Publishing also sets the project's
`preview_url`, adds a timeline note, and **Email the link** opens the "Mockup
ready" template with the URL filled in. **Publish new version** replaces the
files (removed files are deleted); **Unpublish** removes the folder.
`listed` is stored for a future demos page generated from this list.

### 8h. Online quotes (accept + pay deposit)

Setup (from the repo folder):
```
git pull
supabase db push                      # 0010_quotes.sql
supabase functions deploy quote
```
Then edit your **Quote** email template (and the WhatsApp "Quote sent" one)
to include `{{quote_link}}` in place of `{{deposit_link}}` — the starter set
only changes for new installs. Suggested line: "You can see the full quote and
accept it here — the R500 deposit is paid from the same page: {{quote_link}}".

Use: on a lead, fill the Quote card (lines, plus the Timeline and Notes the
client will see) → Save quote → **Create quote link** (valid 7/14/30 days) →
**Email it** / **WhatsApp it**. The client opens `re-charge.co.za/quote?t=…`,
sees the scope, total, deposit and balance, types their name + ticks the
terms, and is sent to a Yoco checkout for the R500 (skipped if already paid).
The lead moves to **Approved**, you get an email, and the timeline records
opened / accepted (with the typed name) / declined (with the reason). The
Overview flags "accepted, deposit not paid" and "opened 3+ days ago, no
answer". Saving the quote again updates the same link until it's accepted;
**Turn off** disables it; **New link** replaces it. The page is noindex, and
the function returns only the quote — never contact details or notes.

### 8j. Simple mode (six stages, one next step)
Rebuilt so someone new can run the panel without training. Run `supabase db push` for
`0012_simple_stages.sql`; no functions need redeploying.

- **Six stages:** To contact → Talking (was "Enquired") → Quoted → Building → Live, plus Lost. Old stage values are
  mapped (under review/clarification → Talking; approved → Quoted or Building; deposit paid →
  Building if quoted, else Talking; client review/final payment → Building; care → Live). "Contacted"
  stays as a value (outreach needs it) and shows as a badge inside To contact.
- **Stages move by themselves** (trigger `projects_normalize_stage`): quote page created → Quoted;
  declined online → Lost with the reason; deposit paid (Yoco or a saved EFT) → Building. It also maps
  any old value an older Edge Function still writes, so `quote` and `yoco-webhook` work unchanged.
- **Payments** (trigger `payments_side_effects`): a deposit sets `deposit_paid`; a manual payment
  closes the matching open payment link; a care payment moves the client's renewal date on a year
  (not if it renews more than 90 days out, e.g. just set up at go-live). "Mark renewed" is gone.
- **Deposit after the quote:** /start no longer takes payment; every page says the R500 is paid when
  the client accepts the quote. `{{deposit_link}}` now fills in the lead's quote page.
- **Panel:** Today (was Overview) lists every lead whose next step is due, with one button each;
  each lead opens with a *Next step* box, a clickable stage bar, and Details tucked away; Money,
  Clients, Websites, Social posts and Settings keep their jobs with plainer wording. Calls and
  Message wording (Templates) moved under Today and Settings. "Site is live" opens one dialog that
  sets up the client and care plan. Unmatched card payments get a "Which lead is this?" picker.
- **Hidden until switched on** (Settings → Extra features): campaign tracking, time tracking,
  star & hide. Data is kept.
- **Messages:** the panel refuses to send text still containing a `[placeholder]`; starter messages
  were rewritten to use `{{opportunity}}` and `{{quote_link}}` (0012 updates the saved copies where
  the old wording is unchanged). A *How it works* page (Settings / More) explains the whole thing.

### 8o. Prospect finder (weekly)
A Claude Routine, **"Re-Charge: find prospects"** (Mondays 06:49 SAST, fresh session, push
notification), researches local businesses with web search: name, type, area, public phone/email,
whether it has a real website (or only Facebook / a directory / a free builder page), Google rating
and review count, signs of recent activity, a fit rating and what we could sell them. Its
instructions are in `scripts/finder-routine.md`.

Flow: Settings → Prospect finder saves areas / types / how many, and the `finder` function commits
them to `_build/finder/config.json`. The Routine reads that, researches, and runs
`node scripts/finder.js pack`, which encrypts the list with `_build/finder/pubkey.pem` into
`_build/finder/results/`. The `finder` function (hourly via pg_cron, and whenever the panel opens)
decrypts with the private key kept in `private_keys` (service-role only), skips businesses already
in the pipeline (name, phone, email or website), adds the rest as To contact prospects with a
"Found by the prospect finder" note, and deletes the file.

Coverage: `node scripts/finder.js plan` hands the Routine the next dozen "type in area" searches
and keeps a cursor in `_build/finder/progress.json`, so every area × type combination gets covered
over the weeks. Defaults (Illiondale / Edenvale and surrounds, 11 business groups incl. mechanics,
panel beaters, engineering, printing, professionals) came from Revan's Places-API script.

**Search all of South Africa** (tick box above the areas, 2026-10-01): adds the 60 towns and cities in
`NATIONWIDE` (`scripts/finder.js`, all nine provinces) to your own areas, which become optional. The plan
alternates your areas with the national ones and gives each week every business type, each in a
different town, so a full cycle of the default 11 types and 60 towns plus your areas takes about a year at 12 searches a week. The
outreach messages already say "small businesses in {their town}", so they read right anywhere.
Needs the updated `finder` function (`supabase functions deploy finder`); until then the panel says so
when you save.

**What to look for** (dropdown, 2026-10-01): *All kinds of businesses* (the default) saves every group in
`FINDER_TYPES` (`admin/admin.js`, 17 groups: the original 11 plus guesthouses and venues, photographers and
florists, vets and medical, estate agents and brokers, solar and garden services, and boutiques and
repairs). *Only the types I pick* shows the tick list and an "Other types" box again (20 types at most).
The search still runs one group at a time ("photographers, florists… in George"), because a search for
just "businesses in George" gives poor results. Each week covers every group in a different town, so
a full cycle of all 17 groups in every town takes about two years at 12 searches a week. The goal is
about 25 good prospects a week, not covering everything.

Why not the Google Places API: it gives accurate "no website" data, but its terms only allow
storing place IDs — keeping names, phones, ratings or reviews in a CRM or CSV breaks them — and
Text Search with the website field bills at the Enterprise tier ($35 / 1,000 after 1,000 free a
month). The Routine works from public listings instead.

"Established" score (0–100, `activity_score`): Google reviews on a log scale (about 500 = full), a
good rating weighted by how many reviews it has, and recent activity. Prospects are ranked by fit
first, then by this score; Leads has a "Most established" sort; rating and reviews can be typed in
under Details or pasted in a list (Rating / Reviews columns).

Setup: `supabase db push` (0016), `supabase functions deploy finder`, then Settings → Prospect
finder → **Set up the prospect finder**. In the Routines page, open the Routine and attach the
repository revan-lombard/re-charge (like the mockup builder). Test it with "Run now".

### 8n. Website monitoring
`0015_monitoring.sql` adds `monitors` (current state per site), `site_checks` (30 days of history)
and `clients.monitor` (switch checking off per client), and schedules the `site-monitor` function
every 10 minutes with pg_cron + pg_net. The function checks re-charge.co.za and every client with a
website address (`clients.site_label`): HTTP status, a non-empty page, load time (slow > 6 s), HTTPS
and DNS errors. Two failures in a row mark a site down and email NOTIFY_EMAIL; you get another email
when it recovers. It's public but throttled (one run per 4 minutes); staff can force a check.

Panel: down sites at the top of Today; a status chip on each client; the client page has a
"Website health" card (7-day strip, uptime for 24 h / 7 days, usual load time, this week's problems,
Check now, stop checking); Settings → Website monitoring shows the last run.

Deploy: `supabase db push`, then `supabase functions deploy site-monitor`.
If the migration notice says it couldn't schedule the monitor, add the job by hand: Supabase
dashboard → Integrations → Cron → Create job → every 10 minutes (`*/10 * * * *`) → type
"Supabase Edge Function" → `site-monitor`, method POST, body `{}`.

### 8m. Message library
`STARTERS` in admin.js: ~48 messages (email + WhatsApp), several per moment, tagged with
`meta.moment` (intro, follow_up, enquiry, call, mockup, quote, quote_follow, deposit, building,
balance, live, review, referral, renewal, reactivate, thanks). `tplFor(kind, moment)` picks one for
each Next step button (rotating first-contact / follow-up versions); older untagged templates are
still found by name. Settings → Message wording groups them by moment, has an Email / WhatsApp tab,
a "Used for" picker on each message, and a one-click "Switch to the new messages" that archives the
first 18 starters (restorable). New variables: `{{in_area}}` (" in Edenvale", or nothing),
`{{location}}`, `{{balance}}`.

### 8l. Signature photo & your details
Settings → Your details now shows your real details (name, WhatsApp, reply address, signature) as
values, not grey examples, and they're used in messages even before you press Save. "Photo next to
your signature": pick a photo, it's cropped to a square, shrunk to 192 px and stored in the public
`branding` bucket (`0013_branding.sql`: anyone can view by URL so email apps can load it; staff-only
upload). `send-message` shows it beside the signature whenever an email ends with your saved
signature. Deploy: `supabase db push` then `supabase functions deploy send-message`.

### 8k. Prospects who reply through the website
`project-intake` now checks for an existing prospect (To contact / Contacted, not spam) with the same
email or phone before creating a lead. If there is one, that record is updated instead: it moves to
Enquired, keeps its notes, potential and history, gains the new form details, and gets a timeline
note "Replied through the website". A free-mockup request is auto-queued if that setting is on. The
notification email says "(a prospect you contacted)". Deploy: `supabase functions deploy project-intake`.

### 8i. Re-Charge potential + research-table import
Migration `0011_potential.sql` adds three lead fields: **potential** (Very high / High / Medium / Low),
**potential_note** (the opportunity in a few words, e.g. "new website + quote system") and **website**
(their current site). Run `supabase db push` once; nothing to deploy.

- Shown as a coloured chip on every lead row (green = go after it, amber = worth a look, red = unlikely).
- Editable on the lead page and on Add lead; Pipeline can filter by it ("Any potential") and sort by it.
- Outreach → Prospects is ordered by potential, best first.
- **Outreach → Add prospects** now takes a research table pasted straight from a spreadsheet, a web page
  or a chat (tab, `|` or comma separated). Detected columns: Business, Website ("Yes — site.co.za",
  "No website found"), a mixed Contact column ("082 … / 011 … / name@biz.co.za": first phone and email
  are used, the rest go in the notes) and a potential/opportunity column ("🟢 Very high — new website",
  "🟡 Redesign", "🔴 Low — …"). Rows already in the pipeline (same email, phone or business name) are
  skipped; prospects without a phone or email yet are still added.

### Free mockup landing page
`re-charge.co.za/free-mockup` (short alias `/mockup`) is the page to use in
marketing: offer, three-step explainer, demo examples, FAQ and the form
inline. `?b=<business name>` prefills the name and `?type=salon|plumb|…`
preselects the business type, so an outreach email can link straight to a
half-filled form; add `&src=<campaign code>` to credit a campaign. The
`{{mockup_link}}` template variable now points here with the lead's
business name prefilled. Old `…/#mockup` links open the pop-up on any page.
Requests arrive exactly like pop-up requests (Free mockup request), with
extra optional fields shown on the lead: type of business, current website,
and **liked demo**. Every demo and concept card on `/demos` links here with
`?demo=<id>&type=…&include=…`, so the form opens pre-set for that kind of
business and says which demo the visitor liked; the lead records it, which
tells you (and the automatic builder) what style to aim for.

### Quick actions
Every lead row (pipeline, outreach, search, campaign and client lists) has a
"⋯" button: move stage, set the next action with a due date (tomorrow / 3
days / 1 week), star, snooze 3 days, email, WhatsApp, archive — without
opening the lead.

### 8e2. Review round 2 (usability, Opus)

A second independent review (admin panel as a daily user; website as a
prospective client) produced ~30 fixes, all applied: no double-saves,
unsaved notes/quote lines survive re-renders, WhatsApp pop-up fallback keeps
the dialog open, default email/WhatsApp template chosen by stage, overdue
items shown as overdue, one definition of "unmatched payment", cost-per-lead
uses one time window, local dates for EFTs and CSV, spam hidden from recent
activity, quote/note forms styled, tab-bar "+" sized, pipeline sort + filter-
as-you-type, stage dropdown in the lead header, batched prospect import with
in-paste de-duplication, renewal confirmation, payments table paging, cached
data between screens (no spinner on every tab). Website: modals centred,
two-column form rows, feature-aware estimate (booking/payments/e-commerce →
from R4,500), consistent prices and category names, privacy notice names
Supabase/Resend, 404 uses the new mark, 8 KB header logo, copy fixes
(deposit order, "priced low", jargon), sitemap dates, search-friendly home
title.

### 8e. Security review fixes (after Marketing)

An independent review of the panel and functions found one high (XSS via a
crafted admin link), several medium (webhook failing open without its secret,
duplicate side effects on webhook redelivery, anonymous callers able to tag a
client on a checkout, cents lost in money formatting, two different "this
month" revenue numbers) and some low items. All are fixed. To pick them up:
```
git pull
supabase db push                                   # 0007_member_visibility.sql
supabase functions deploy yoco-webhook create-yoco-checkout send-message
```
The admin's sign-in form no longer creates accounts (`shouldCreateUser:
false`); add a second staff member from the Supabase dashboard (Authentication
→ Users → Invite) and then `insert into staff …`.

### 8d. Marketing setup

1. From the repo folder:
   ```
   git pull
   supabase db push                                   # applies 0006_marketing.sql
   ```
   That's all — no new functions. The migration also creates a private
   `marketing` storage bucket for post images (5 MB, images only, staff-only).

**What you get** (Marketing in the rail, or under More on the phone):
- **Calendar** — scheduled and posted posts, plus your calls and follow-ups, by
  month, with a "Coming up" list.
- **Posts** — a content library: title, channel, text, hashtags, link, image,
  status (idea → drafted → scheduled → posted), results (reach, likes, comments,
  clicks). **Publish** panel shows the final text with the tracked link filled
  in: *Copy text*, *Open composer* (Facebook / LinkedIn / X / WhatsApp
  pre-fill; Instagram, TikTok and Google Business open the app/site with the
  text copied), *Download image*, *Mark as posted* (paste the post URL).
  *Duplicate for…* makes the same post for another channel.
- **Campaigns** — name, tracking code, goal, audience, channels, dates, budget,
  spend/reach/clicks (typed in from the ad platform). **Return** is automatic:
  leads, deposits and revenue credited to the campaign, cost per lead.
- **Attribution** — every campaign has a link `re-charge.co.za/?src=<code>`.
  The website remembers `?src=` for 30 days (`localStorage`), so an enquiry
  submitted later, from any page or form, carries the code in
  `projects.channel`. Leads show a 📣 campaign chip in the pipeline.

Publishing is deliberately manual (copy + open the composer + paste the URL
back). Direct API posting to Meta/LinkedIn needs developer-app approval and
business verification; see §11 "Parked".

How sending works: the panel fills the template from the lead, you edit and
press Send, the browser calls the `send-message` function with your login
token, the function checks you are staff, sends via Resend from
`no-reply@re-charge.co.za` (reply-to = your Settings address, bcc to the inbox
if "send me a copy" is on), and records the message in `messages` plus a
timeline event. WhatsApp opens `wa.me` with the text pre-filled and logs that
you did so; nothing is sent automatically.

---

## 9. Build plan

Each phase ships on its own and is useful on its own.

| Phase | Contents | New backend | Effort |
|---|---|---|---|
| **A — Core** | Migration `0003`; `/admin/` shell + sign-in + staff gate; Overview (KPIs, needs-attention, today's calls, activity); Pipeline list + board + filters; global search; Add lead; Project detail with stage changes, notes, quote, next action, submission view; returning-contact badge; star, snooze, archive, spam; CSV export; PWA install; mobile layout | migration only | 1–2 working sessions |
| **B — Comms** | Templates screen + seeded set; `send-message` function; Email send flow with preview; WhatsApp pre-fill flow; send log on timeline; Outreach mode (prospect import + one-by-one sends); follow-up cadence; mockup tracker + `{{preview_link}}`; review-ask template; Settings; optional Resend delivery webhook | `send-message` (+ optional `resend-webhook`) | 1–2 sessions |
| **C — Money & clients** | Payments screen, record EFT, match Yoco payments; **Request any payment** (staff-generated Yoco checkout, `{{payment_link}}`); quote builder; Clients CRUD, care renewals with payment link, convert-to-client; revenue charts; real file attachments (Supabase Storage); light time logging; switch on Yoco webhook + per-project checkout | extend `create-yoco-checkout`; storage bucket | 1–2 sessions |
| **D — Later** (optional) | Public tracking link; daily digest; inbound replies on the timeline; per-stage checklists; traffic tile / analytics dashboard; quote PDF; client portal (`client_users` already exists); second staff user; WhatsApp Business API — see §11 | varies | as needed |

Quality bar, same as the site: 0 axe violations, no horizontal overflow at 390
and 1440, keyboard-navigable, works on the phone you actually use.

---

## 10. Open decisions (defaults chosen; say if you want otherwise)

1. **Path**: `/admin/` (default). Any name works — the login is the protection.
2. **Outreach stages** (`prospect`, `contacted`) in the same pipeline — default
   yes, so your cold-email list and your live clients share one view.
3. **Manual EFT payments in the panel** — default yes (needed for real revenue
   numbers, since balances are often EFT).
4. **Starter templates**: I'll seed the set in §3.5; you edit wording in the panel.
5. **Order**: A → B → C as above. If templates matter more to you than money
   right now, B before C is the natural swap; A stays first either way.

---

## 11. Enhancements added to the plan

Reviewed once more from the point of view of running the studio day to day.
The items below are **added to the phases** in §9 (the table there is updated);
the last group is parked so the build stays focused.

### Added to Phase A (core) — small, high daily value
- **Install it like an app (PWA).** A manifest + icon for `/admin/` so it sits
  on your phone's home screen and opens full-screen like a native app.
- **Search everywhere.** One search box (Ctrl/Cmd+K on desktop, top bar on
  phone) across refs, names, businesses, emails, phones and notes.
- **Today's calls.** Call requests already carry the chosen day and time; the
  Overview shows today's and upcoming calls with **Call now** (`tel:`) and an
  **Add to calendar** (.ics) button, so nothing gets missed.
- **Returning contact detection.** Same email or phone as an earlier project →
  a "returning" badge with links to the earlier records, so you never treat a
  repeat customer as a stranger (and duplicates are obvious).
- **Priority star + snooze.** Star a lead to pin it to the top; snooze a
  "needs attention" item for 1/3/7 days instead of dismissing it forever.
- **Archive instead of delete, and "mark as spam".** Spam submissions are hidden
  in one tap and the sender's email is remembered so repeats go straight to the
  spam view; nothing is ever hard-deleted by accident.
- **Export CSV** of the pipeline, clients and payments (for your accountant /
  SARS records, or a spreadsheet when you want one).

### Added to Phase B (comms) — turns it into a sales tool
- **Outreach mode.** Paste or upload a list of businesses (name, email, phone,
  town, notes) → they become `prospect` records. Then a **one-by-one send
  flow**: it steps through prospects, shows the cold-outreach template
  pre-filled, you tweak a line and send, next. Deliberately *not* bulk-send
  (see "not adding" below).
- **Follow-up cadence.** Sending an outreach or quote email automatically sets
  the next action ("Follow-up 1 · in 3 days", then "Follow-up 2 · in 7 days"),
  each with its template pre-selected. The Overview nags you; you decide.
- **Mockup tracker.** Mockup requests are your lead magnet, so they get their
  own mini-status (requested → in progress → delivered), a `preview_url` field
  for the mockup link, and a "Your mockup is ready" email with
  `{{preview_link}}` filled in. Works with the client-preview subdomain idea
  from earlier.
- **Delivery status on the timeline** (optional, one tiny webhook function):
  Resend reports delivered / bounced; bounces mark the email as bad so you
  don't chase a dead address in your outreach list.
- **Ask for a review.** A "Project live — would you leave a review?" template
  with your Google review link, plus a place to paste the testimonial they send
  back. Seeds the testimonial section the website doesn't have yet.

### Added to Phase C (money & clients) — answers the "how do I charge R3,000" question properly
- **Request any payment.** Extend `create-yoco-checkout` so that *you*
  (staff-only) can generate a Yoco checkout for **any amount** — deposit,
  balance, care renewal — tagged to the project. The link appears as
  `{{payment_link}}` in the email you send, and the existing webhook
  reconciles it automatically when paid. This replaces manual Yoco invoices for
  most cases; EFT remains for clients who prefer it.
- **Quote builder.** Line items (e.g. "Business website — R2,000",
  "Hosting & Care — R600/yr") → total → fills `{{quote}}` and the quote email,
  and sets the pipeline value. PDF export is a Phase D nicety.
- **Attachments that actually arrive.** Today the builder only *lists* file
  names because Formspree couldn't take uploads. With a private Supabase
  Storage bucket the website can upload the files at submission time, and the
  admin shows them with short-lived signed links. Removes the "please send
  your files again" step.
- **Revenue charts.** Monthly revenue, deposits vs balances vs care, and
  revenue by category, using the same bar styles as the analytics dashboard.
- **Care renewals with a payment link.** 30 days before `care_renews_at`, the
  Overview flags it and the renewal template comes with a `{{payment_link}}`
  for the plan amount.
- **Light time logging.** "Log 45 min" on a project. Over a few projects it
  tells you your real hourly rate per category, which is the best pricing
  data you can have.

### Parked for later (Phase D) — good ideas, not yet worth the weight
- **Direct posting via the Meta Graph API / LinkedIn API** (needs a Meta
  developer app, business verification and app review; LinkedIn partner
  approval). The `posts` table already holds everything an integration needs.
- **Ad spend import** from the Meta Marketing API (today spend/reach are typed
  in per campaign).
- **AI-assisted post drafts** (variants per channel from one idea).
- Public, login-free **project tracking link** for clients
  (`/track?ref=RC-00051` shows the stage only, no personal data). Nice trust
  signal once volume justifies it.
- **Daily 07:00 digest email** to you (follow-ups due, new leads, calls today).
- **Inbound replies on the timeline** (Resend inbound → parse → attach to the
  project). Until then, replies stay in your inbox with the ref in the subject.
- **Per-stage checklists** (e.g. go-live: domain, hosting, logins, review ask).
- **Website traffic tile** on the Overview (GoatCounter API) — or the full
  analytics dashboard once Phase 2 of the backend is live.
- **WhatsApp Business API**, testimonials pushed to the website, a second staff
  user with roles.

### Deliberately not adding
- **Bulk email sending.** Mass-mailing from a new domain is the fastest way to
  get `re-charge.co.za` blacklisted, and unsolicited bulk marketing sits badly
  with POPIA. One-by-one, personalised sends from Outreach mode get better
  replies anyway.
- **An invoicing/accounting engine.** Yoco invoices, EFT and your accountant
  already cover it; the panel is the ledger *view* and the payment-link
  generator, not a replacement for the books.
- **Automations that message clients without you pressing send.** Every
  outbound message is a human decision; the panel prepares, you approve.

### 8p. Message wording that sounds like a person (2026-09)
The ready-made messages were rewritten so they don't read like a mail merge:
- **One specific line about them:** `{{noticed}}` writes a single honest observation from the lead's
  Google listing and website, e.g. *"4.8 stars from 96 reviews on Google is really good going, but
  I couldn't find a website for you."* It only says "no website" when the lead is marked High / Very
  high potential (or its website is a Facebook/Instagram page), and it's left out when there's
  nothing worth saying, so the sentence around it still reads fine.
- **No scripted replies or ad phrases:** no *reply "yes"*, *no strings attached*, *no catch*,
  *had an idea for you: {{opportunity}}* or emojis in first messages. Each asks one easy question.
- **The way out is said like a person** (*"And if the answer's no, no problem, I won't keep
  emailing you."*). Keep a line like it in first messages: POPIA requires unsolicited marketing
  to give people a way to say stop.
- **Emails end with a sign-off** (Kind regards / Thanks / Cheers) before your signature.
- **Saved copies update themselves:** when the panel loads, any ready-made message that still has
  the previous wording word for word is switched to the new text. Ones you've edited are left alone.
  `{{opportunity}}` still works in your own messages.

### 8q. Website and Google links on every lead
- **Their website** links straight to the site. A Facebook/Instagram-only business shows as "None,
  only Facebook ↗", and a High / Very high lead with no site shows "None found". List rows get a
  **No website** / **Facebook only** tag.
- **Google:** "Their Google profile ↗" when a link is saved; otherwise "Look them up on Google Maps ↗"
  searches the business name and area. To save one: open them on Google Maps, tap Share, paste the
  link into Details → Google profile link (or Add lead). A Google link pasted into the website box
  is moved there automatically. The finder saves it when a search result shows one, and bulk
  import reads a "Google" / "Maps" column. Stored in `details.googleUrl`, so no database change.
- **No website? The pitch is just "A website".** New leads, imports and finder results with no site
  of their own get that as *What we could sell them*; `0017_simple_pitch.sql` does the same for
  prospects already in the list (run `supabase db push`).

### 8r. Numbers, the Re-Charge Standard, care upgrades
- **Numbers** (Money → Numbers, or More → Numbers): for the last 90 days / 12 months / all time:
  - the line every lead travels: *in your list → in touch → talking → quoted → won → live*, with
    the % that make each step and the **biggest drop** marked (that's the step to work on);
  - each client: average job, enquiry-to-deposit and deposit-to-live times, hours per build and
    rand per hour (needs time tracking on: Settings → Extra features), messages and outreach
    contacts per client won, what each lead is worth;
  - recurring: hosting & care per year, average plan, renewals in the next 60 days, live clients
    without a plan;
  - wins by trade, area and source (win rate shown from 3 leads up), and a few plain-language
    lines on what the numbers say. Trades are recognised from the finder's type, the mockup form
    and the business name.
- **The Re-Charge Standard:** "Site is live" now has an 8-point checklist (works on a phone, mobile
  PageSpeed 80+ with a one-tap test link, Call/WhatsApp buttons, details checked, ready for
  Google, https on their domain, monitored and backed up, client approved in writing). The button
  unlocks when all 8 are ticked; the lead's history records that it passed. Editing an already
  live site's plan doesn't ask again.
- **Care upgrades:** Today mentions live clients with no plan, or on Hosting only; two new ready-made
  messages (*Hosting & care · Offer the upgrade*, email + WhatsApp) offer Hosting & Care for R200
  more a year. Add them with *Message wording → Add missing starters*.

### 8s. New plans, footer credit, referrals, monthly report (2026-09-29)
- **Plans:** Hosting R400/yr · **Care R900/yr** (recommended: small changes, Google Business Profile
  kept up to date, a review link, the monthly report) · Business Care R2,400/yr. New quotes include
  the first year of Care (quote preset *Care plan, first year*). Existing clients keep what they pay:
  their `care_amount_cents` isn't touched. In the panel the "care" plan now shows as **Care**.
- **Footer credit (R100 off):** "Site is live" has a tick box for it; the price drops by R100 and the
  client's notes record it. `previews/GUIDE.md` tells the builder to add the credit to live sites,
  linking to `re-charge.co.za/?ref=credit`; leads from those clicks show as *Client-site credit*.
- **Referrals:** every client has a link, `re-charge.co.za/free-mockup?ref=<client slug>` (client page
  → *Referral link* → Copy, and `{{referral_link}}` in messages). The site remembers the code for 60
  days and sends it with any form; `project-intake` marks the lead *Referral* and names the client.
  When that lead goes live, the referrer's renewal date moves a year later automatically (their free
  year), noted on both records.
- **Monthly report:** `monthly-report` now reports uptime, average load time and outages from the
  site monitor (plus visitors / Google searches where Analytics is connected) to clients on Care or
  Business Care, on the 1st of each month (`0018_monthly_report.sql` schedules it). It sends each
  client at most once every 25 days, so the scheduled call needs no secret. Client page → *Monthly
  report* → **Preview** / **Send now**. Replies go to `NOTIFY_EMAIL`.
- Terms §7 lists the plan prices, the footer-credit discount and the referral reward.
- **Instant thank-you email:** when someone fills in a form (project enquiry, free mockup, call
  request), `project-intake` emails them straight away from your sender address, in your voice,
  signed with your signature (photo included), saying what happens next and when. It's logged on
  the lead. Switch: Settings → Your details → *Send an instant thank-you email*. Spam-listed senders
  never get one. While it's on, the panel suggests *Enquiry · A few questions first* as the reply.
  Shared email layout: `supabase/functions/_shared/mail.ts`.
- **Client review links (Care):** client page → Edit → *Their Google review link*; shown with a Copy
  button, and `{{their_review_link}}` fills the new *Care · Your Google review link* messages.
- **Quotes start with Care:** a new quote for a website lead opens with a *Care plan, first year*
  line at R900 already in it (remove it if the client is hosting elsewhere).
- **Finder types with results:** Settings → Prospect finder shows, under each type of business,
  how many leads it produced, how many are talking and how many were won, so you can untick the
  types that don't convert.

### 8t. Monthly or yearly billing (2026-09-29)
- Every plan can be paid **monthly**, and **yearly is 2 months free**: Hosting R40/mo or R400/yr,
  Care R90/mo or R900/yr, Business Care R240/mo or R2,400/yr. The footer credit is R10/mo or R100/yr.
- `clients.billing` (`yearly` | `monthly`, migration 0019). `care_amount_cents` is the amount per
  period, so a monthly Care client has R90. Totals on Money and Numbers count monthly clients x12.
- "Site is live" and the client editor have *They pay: Yearly / Monthly*; the price and due date
  follow. A website quote still includes the first year of Care at the yearly price; billing can
  change at renewal.
- **Collection is automatic:** `care-billing` runs daily (pg_cron, 07:37 SAST). Three days before
  a monthly client's payment is due it creates a Yoco card payment link and emails it to them
  (offering a bank stop order instead), logs it, and emails you a one-line summary. When they pay,
  the payments trigger moves the due date on a month (a year for yearly clients). A client already
  sent a link for the period is skipped, so it never double-bills. Stop-order / EFT payments: save
  them on Money as usual, kind *Care*, and the date moves on the same way.
- Today only mentions a monthly client when a payment is more than 4 days late.

### 8u. Limited offer (2026-09-29)
- **Settings → Limited offer:** spots (10), end date (30 Nov), and the discount on the first year
  of Care (default 50%: R450 instead of R900). No area: it's simply the next N website clients. A spot is
  taken when a lead on the offer **pays the deposit**. The offer switches itself off when it's full or the date passes.
- **Site:** a slim gold banner above the nav on every page ("Limited offer · Our next 7 website clients get 50% off … ·
  Get a free mockup →", closable for 3 days) and a note on Pricing and Free mockup. The numbers
  come from the public, read-only `offer` function (cached 5 minutes), so they're always real.
  Banner clicks are tagged `?src=offer-banner`. Wording is always "our next N website clients"
  (N = spots left), never "first" or "founding", so it reads as an established studio.
- **Leads:** anyone who enquires while it runs is tagged (a gold *Offer* chip); tick or untick
  it under Details for leads who replied by phone/WhatsApp. Their quote opens with the discounted *Care plan, first year* line (R450 at 50%). `{{offer_line}}` adds one sentence about the offer (with spots left) to the
  two main first-contact messages while it runs, and disappears when it ends.
- Forms can no longer set reserved lead fields (offer, referral, Standard) themselves.

### 8v. Premium brand pass (2026-09-29)
- **Vector mark** (`assets/brand/mark.svg`, `mark-dark.svg`): the original R redrawn from its own
  pixels, with a clean cut where the leg crosses the bowl and subtle white/steel gradients. It
  replaces the raster PNG in the site header and footer, the panel, and the film end card.
- **Lockup:** the mark as the R + E–CHARGE in Space Grotesk 600, wider tracking (0.14em), and the
  hyphen drawn as a short blue-to-cyan "charge" bar. Guide: `assets/brand/README.md`.
- **Icons** re-rendered on a dark rounded tile (favicon, apple-touch, 192/512) so the white R is
  visible on light tab bars; transparent logo PNGs re-rendered from the vector; new share image
  (`og-image.png`, v=3).
- **Offer posts** in `/marketing/` (Status 9:16, feed 4:5, square) with the ad and post copy in
  `marketing/limited-offer.md`. Gold is reserved for limited offers.

### 8w. Prices rounded up (2026-09-29)
Hosting **R50/mo or R500/yr** · Care **R100/mo or R1,000/yr** · Business Care **R300/mo or R3,000/yr**
(yearly is still 2 months free). Business Care is R300, not R250: it includes about 8 hours of work a
year. The first year of Care in a quote is R1,000; the limited-offer discount (50%) makes it R500. The
pricing page's price list is now two columns (Websites; Software & automation). Clients already on a
plan keep what they pay.

### 8x. Homepage built for attention (2026-09-29)
Built on the "one promise, deliver it at once, re-engage, measure" idea from MrBeast's production memo.
- **Instant preview (hero):** visitors type their business name and pick a trade, and a mini website with their
  name appears in a phone (8 trade themes). Until they touch it, it types example names by itself. **Build the real
  one** opens the free-mockup pop-up with the name, "what you do" and type of business already filled in.
- **New order:** hero (preview) → live demos → pricing → how it works (the film moved here) → other services →
  why us → FAQ → final ask. The headline is the promise: *See your new website before you pay a cent.*
- **Headline test (A/B):** half of visitors see *"Watch your business get a website. Right now."* instead. Each
  visitor keeps their variant. In GoatCounter compare, per variant:
  `hero-view/hv-a` vs `hero-view/hv-b` (visitors), `preview-typed/hv-…`, `preview-cta/hv-…` and
  `mockup-request/hv-…` (conversions). Run it 2–4 weeks, then keep the winner: delete the small `<script>` under the
  headline in `src/index.body` (or swap the text in) and rebuild.
- **Attention events:** `scroll-25/50/75/100` (how far people get), `form-start` (+ `form-start/<form id>`),
  `preview-typed`, `preview-trade`, `preview-cta`. GA4 gets the same events with `hero_variant`.
- **Payoff:** after a mockup request the confirmation gives a date ("You'll have the link by Thursday 2 October",
  2 business days, weekends skipped), and says WhatsApp too when they gave a number. Keep that promise: the panel
  shows mockup requests at the top of Today.
- **Shorter mockup forms** (pop-up and /free-mockup): only **your name, business name and WhatsApp number** are
  needed. What they do, email, location, style etc. fold under "Add more detail". Email is optional (an email alone
  also works). The person's name now arrives as the lead's name (before, it was the business name), so greetings say
  "Hi Thandi". Leads without an email get **no automatic thank-you email**: reply on WhatsApp from the lead. There's a
  one-tap **WhatsApp us instead** link (`mockup-whatsapp` event) that carries whatever they typed. No function
  redeploy needed.

### 8y. Google profile setup: a R450 first product (2026-09-29)
A quick yes for businesses that aren't ready for a website. The website becomes the next step.
- **What it is:** R450 once-off, **paid when it's done** and they've checked it. It covers:
  - the profile claimed or created and verified;
  - category and area, hours, phone, WhatsApp and website;
  - services and prices, and a description;
  - photos, logo and cover, and their first 2 posts;
  - a review QR card.

  If they build a website within 90 days, the R450 comes off it (take it off the website quote by hand).
- **Site:** it has its own section on Services (`services#google`), a band on Pricing and a card on the homepage.
  **Set up my Google profile** opens a short booking pop-up (name, business, WhatsApp, "already on Google
  Maps?"). `services?google=1` opens the pop-up straight away (use this link in posts).
- **Panel:** bookings arrive as leads with category *Google profile setup*. They get their own steps:
  1. **Message them** asks for their details.
  2. **Start the work** moves them to In development and adds R450.
  3. **Make their review card**, **Ask for payment** (Yoco link for R450) and **It's done**.
  4. After that, **Offer a website**.

  The online quote page isn't used: it always asks for a R500 deposit. Prospects with fewer than 10 Google
  reviews also get an **Offer Google setup** button. 8 new ready-made messages (Google profile · Offer /
  Getting started / Done / Website next, email and WhatsApp) are added to your library automatically.
- **Review cards:** `admin/review-card.html` makes a printable A6 card and a 1080×1350 WhatsApp image with a
  QR code for any Google review link. Open it from a client's page (**Review card**) or from Settings (your
  own). Your own card is ready in `marketing/review-card/`.
- **Marketing:** `marketing/google-setup/` has a Status image, a chat image and the replies to use.
- **Optional:** run `supabase functions deploy project-intake` to send Google-profile bookings their own
  thank-you email. Until then they get the general "got your message" one.

### 8z. Building and looking after Google profiles (2026-09-29)
**Run `supabase db push` once** (migration 0020 adds `gbp_url`, `gbp_access` and `gbp_care_at` to clients). Until
then, everything else works, but saving Google access or ticking off Google care shows a "run the database update" message.
- **Access, never passwords:** the business owns its profile and adds your Gmail as a **Manager**. On a lead:
  **Ask for Manager access** sends the steps (WhatsApp or email). On a client: the **Google profile** card shows
  their profile link and your access (Not yet / Asked / Manager / Owner). Sending the request marks it "Asked".
  Set it to Manager under Edit once you've accepted Google's invite.
- **Checklist (Google-setup leads):** 11 steps, from access and verification to the review card, ticked as you
  go. The next step shows your progress, and **It's done** warns if steps are left. **Send verification steps**
  sends the owner what to film for Google's video check.
- **Monthly Google care:** every Care and Business Care client shows on **Today** once a month: 1–2 posts,
  reply to reviews, photos, and Google's suggested edits. Press **Done** there or on the client page.
- **Public holidays:** a week before each SA public holiday (including Easter and Monday-off days), Today asks
  you to set special hours on your clients' Google profiles. **Done** clears it for that holiday.
- **Review replies:** under **Reply to a Google review** (client page and Google-setup leads) there are ready
  replies for 5 stars, mixed and unhappy reviews, with a Copy button each.
- New ready-made messages: *Google profile · Manager access* and *Google profile · Verification steps*
  (email and WhatsApp), added automatically.

### 8aa. Sales sprint and before/after reels (2026-09-29)
- **Sales sprint (Settings → Sales sprint):** set a start date, how many days (30), how many new clients to
  win (5) and how many businesses to contact per day (5), then tick *Sprint running*. Today then shows:
  - clients won against the target (a client counts on their first payment inside the sprint);
  - today's contacts against the quota, as dots;
  - the last 7 days: contacts, follow-ups, mockups sent and clients won;
  - the whole sprint: contacted, replied, reply rate and the days you hit the quota.

  It counts contacts automatically, from the start of the start day (so what you did earlier today counts):
  first-contact messages, and any message (any template, or typed yourself) to a lead that's still To contact or
  came from outreach, plus messages sent to a number without a lead. Follow-ups don't count as new contacts.
  **End sprint** on the Today card (or untick *Sprint running* in Settings) switches it off. Starting a new one
  defaults to today. Press
  **+1 walk-in or call** for contacts made outside the panel. On Sundays (and when it ends) a short review
  line shows where the wins came from.
- **Before/after reel (`admin/reel.html`):** a 20-second 1080×1920 video with four parts:
  1. "We built X a new website in N days";
  2. their Google listing before (a screenshot, or a card drawn from their rating and reviews);
  3. the new site scrolling on a phone;
  4. "Want one? Reply: mockup" with your brand.

  It's made in the browser, frame by frame, and nothing is uploaded. Chrome or Edge on a computer save it as
  MP4 (H.264, fine for WhatsApp and iPhones); other browsers save WebM. Open it from a live lead (**Make a
  before/after reel**) or a client (**Before/after reel**): the name, trade, area, Google rating and build days
  are filled in. Add a full-page phone screenshot of the new site; a "before" screenshot is optional. Ask the
  client's permission before posting.

### 8ab. Leads board: drag between four columns (2026-10-01)
- The board has four columns: **To contact → Talking → Quoted → Won**. Drag a lead to another column to move it.
  Each move is noted on the lead's history.
- **Talking** (was "Enquired") means they've enquired or replied to you: you're in conversation, and the next
  step is to reply and send a quote.
- **Building and Live** are a pill on each card in **Won**, not columns. "Building · mark live" opens the usual
  go-live step (Standard checklist, client and care plan; for Google setups, "It's done"). "Live ✓" can be
  moved back to Building.
- The database still moves leads on its own when the facts change (quote created → Quoted, deposit paid →
  Building). Dragging to Quoted without a quote, or to Won without a deposit, reminds you to do that part.

### 8ac. "Before you go": a free online check popup, and the new logo (2026-10-01)
- **Popup:** a short offer for visitors who are reading but haven't reached out: *"Before you go: how does your
  business look online? We'll send you 3 quick fixes on WhatsApp."* It asks for the business name and WhatsApp
  number.
  - **When it shows:** on a computer when the mouse heads for the tab bar (after 12 s), on any device after
    ~40 s and half a page of reading, or on a phone's second page.
  - **Limits:** at most once every 14 days. Never after someone has sent a form or tapped WhatsApp (60 days).
    Never on the panel, quote, project builder or free-mockup pages, and never over the cookie banner or
    another pop-up.
  - **In the panel:** it arrives as a lead in Talking (*Free online check*), with the step *"look them up, then
    WhatsApp them 3 quick fixes"*. The buttons are **Send their 3 fixes** (a ready-made message with
    [brackets] to fill in), **Look them up on Google** and **Build a free mockup**.
  - **Good fixes to suggest:** no website, or no WhatsApp/booking button; Google profile missing hours, photos,
    services or prices; wrong or vague category; few reviews (offer the review card); site slow or hard to use
    on a phone; no prices anywhere.
  - **Events:** `cap-open` (with the trigger) and `cap-request`.
- **Logo:** the R icon is now followed by the full name RE-CHARGE everywhere (site, panel, 404, reel maker,
  film end card, marketing images, logo pack, share image v=4).

### 8ad. Phone alerts for new leads, accepted quotes and payments (2026-10-01)
**Setup (once):** `supabase db push` (migration 0021: `push_subscriptions`, `push_keys`), then deploy the
functions (new `notify-push`; `project-intake`, `quote` and `yoco-webhook` send the alerts). No keys to make: the
signing keys are generated on first use and kept in `push_keys`, which only the server can read.
- **Turn it on per device:** Settings → **Phone alerts** → **Turn on alerts on this device** → Allow. A test
  alert arrives straight away. **Send a test alert** and **Turn off on this device** are there too.
  - **Android / computer:** works in Chrome, Edge, Firefox and Safari (Mac).
  - **iPhone (iOS 16.4+):** in Safari, Share → *Add to Home Screen*, then open the panel from the icon and turn
    alerts on there.
- **What buzzes:**
  - *New lead: Mockup request / Call request / Google setup (R450) / Free online check / Project enquiry*, or
    *A prospect replied: …*, with the business, the area and whether they left a phone number or an email;
  - *Quote accepted: Business*, with the amount;
  - *R500 deposit paid*, *balance paid*, *care plan paid*, or *payment paid, not matched to a lead yet*.

  Tapping one opens that lead (or Money).
- The alert text is encrypted end to end (Google's or Apple's push service can't read it). A device that's gone
  (uninstalled, browser data cleared) is removed automatically. Alerts never hold up a form, quote or payment:
  if one fails, the rest carries on.
- Today shows a one-time "turn on phone alerts" nudge until alerts are on (or you press *Not now*) on that device.

### 8ae. A simpler panel (2026-10-01)

- **Menu:** Today, Leads, + Add lead, Money, Clients and Settings (on a phone: Today, Leads, +, Money, More).
  Pages that used to have their own menu item are now tabs: *Leads → All leads / To contact* (was
  Prospects), *Money → Payments / Numbers*, and *Clients → Clients / Websites & mockups*. Calls are on Today.
- **Today** shows only the to-do list, one line of detail per row. "Coming up this week" and "What happened
  recently" are folded away. There are no more banners, tips or stat tiles (the money numbers are on Money).
- **A lead** shows the next step, the contact buttons and the stage bar. Everything else folds away
  (*What they asked for* opens by itself for new enquiries). Sections that don't fit the stage are hidden:
  no quote or payments for a prospect, and no mockup for a job that isn't a website. "Show the other
  sections" brings them back, and any button that needs one (*Write the quote*, *Ask for the balance*)
  opens it.
- **To contact:** the prospect list comes first. Follow-ups show only when some are due. *Add prospects
  yourself* (paste or CSV) is folded away.
- **Settings** is one short list under four headings: You, Messages, Finding clients and Extras.
  Social posts, Sales sprint and Limited offer are now extras, off by default (Settings → Extras → Extra
  features). The Limited offer settings still show while an offer is running. Switching an extra off
  deletes nothing.

### 8af. Three-option quotes, pay monthly, and the content checklist (2026-10-05)

Needs `supabase db push` (migration 0022) and `supabase functions deploy quote care-billing`.

- **Three options.** In a lead's Quote section, choose *Up to 3 options*. It starts you with Quick
  website (R2,000 with the first year of Care), Business website (R3,000, marked *Most popular*) and Pay
  monthly. Edit the names, lines and prices; leave a name empty to drop an option. On the quote page the
  client picks one before accepting, and the panel then shows "they chose …". Until they choose, messages
  use `{{quote}}` = "3 options, from R2,000" and `{{quote_items}}` = one line per option.
- **Pay monthly** (an option with *Pay monthly* ticked): R249 a month for 12 months, then R100 a month for
  Care. There's no R500 deposit: the first month is paid by card when they accept, which counts as the
  deposit and moves the lead to Building. When you press *Site is live*, the dialog is already filled in
  (monthly, R249, next payment a month after the first). `care-billing` emails a link each month, and after
  the 12th payment it switches them to R100 a month by itself. The website copy and the terms (section 7)
  explain it, including the 12-month minimum.
- **Content checklist.** Once they've accepted, the quote page asks for their logo, photos, services and
  prices, hours and areas. Photos are shrunk on their phone before uploading, and files are stored
  privately (bucket `client-content`). You get a phone alert when the first content arrives, and it shows
  on the lead under *Their content*. While a website build has no content, the next step is *Ask for their
  content* (the new "Content · Photos and details" messages are added for you).

### 8ag. Referrals both ways, the launch pack, review timing and the year in review (2026-10-05)

Needs `supabase functions deploy quote analytics-sync` (no database change).

- **Two-sided referrals.** A business that arrives through a client's link (`?ref=…`) sees a gold "Referred:
  R250 off your website" bar, and new quotes for that lead start with a "Referral discount" line of
  −R250. Quote lines can now be negative, for discounts. The referring client still gets a free year of Care
  when the new site goes live. New "Referral · You both win" messages are added for you, and the terms say
  the same.
- **Launch pack.** *Site is live* now records the date. The lead's next step becomes *Send their launch pack*:
  *Make their announcement post* opens the share-image page ("We have a new website!", the site
  address and a QR code in their brand colour), and the "Launch · You're live" message tells them how to use
  it. Send the image on WhatsApp.
- **Reviews at the right moment.** Three days after the launch pack, the next step is *Ask for a Google
  review*. Each step has *Skip*.
- **Year in review.** Client page → *Year in review* opens a "Our year online" image filled in from the
  last 365 days of Google Analytics and Search Console where they're connected (`analytics-sync` now also
  caches a 365-day range); otherwise type the numbers in. From 1 to 24 December, Today reminds you to
  send them, with a "Year in review" message.
- The share images are at `/admin/share-card.html` (1080 × 1350, for Facebook, Instagram and WhatsApp
  status). Keep "Website by Re-Charge" on: every image a client posts advertises you.

### 8ah. Our two promises (2026-10-05)

Needs `supabase functions deploy project-intake` (the automatic thank-you emails now promise a reply within the hour).

- **A reply within 1 hour, every day 7am–9pm** (after 9pm: by 8am). A new enquiry's next step shows *Reply by
  14:32 (1-hour promise)* for its first day. Keep phone alerts on: they're what makes this possible.
- **Live within 7 days of approving the design, or the first month of Care is free.** When the client says
  they're happy with the design, press *They approved the design* on the lead: that starts the clock, and
  the next step shows "live by …" with the days left. It lands on Today 2 days before the date and turns red
  if it's late. If you go live late, the *Site is live* dialog ticks "give them their first month of Care
  free" for you, which moves the renewal (or the next monthly payment) a month later.
- The clock pauses while you wait on them (changes after approval, missing content) and on third parties
  (domain registrars, transfers). Larger builds (shops, booking, portals) get a promised date in the quote
  instead. All of this is in terms §8 and linked from the homepage, the pricing page and every quote.

### 8ai. AI qualifier and recurring-revenue (MRR) view (2026-10-05)

- **AI qualifier** (`/ai-for-business`, no backend change): a visitor picks the goal that sounds like them
  and the page names the AI product it would build, shows the price (from R3,500 + R300/mo + usage at cost),
  and captures the lead as `formType: "AI enquiry"` with `product` and `goal` filled in. It lands in the panel
  like any enquiry (the 1-hour reply promise applies), with the product shown under *What they asked for*.
  Tracked as `ai-qz-pick` and `ai-qz-request`.
- **Recurring revenue** on Money: a card showing MRR (what every active plan is worth per month), annualised,
  the client count (monthly vs yearly), the average per client, and a breakdown by plan. Website Care, Google
  care and AI maintenance plans all feed it. `careMonth(c)` normalises a plan to a monthly figure (yearly ÷ 12).
  The top tile row now shows "Recurring / month" too.

### 8aj. AI-first repositioning, and an About section (2026-10-05)

AI is now the lead business function across the site; websites stay as the entry product.

- **Homepage:** a new AI-led hero (headline "Put AI to work in your business", the three outcomes and the
  WhatsApp assistant visual). The instant-preview website widget moved down into a *Websites too* section
  (`#websites`) — it still works exactly as before. The separate AI pillar band was folded into the hero.
  The services grid now leads with the AI card. A new **About** section (`#about`) introduces Révan, with a
  brand-mark avatar: drop a real headshot in by swapping the image in `src/index.body` (a real face
  outperforms the logo here).
- **Navigation and meta:** "AI" is the first item in the header nav and in the footer's Build list. The
  homepage title/description lead with AI while keeping the website keyword. `src/build.sh` now also
  substitutes `{{CUR_ai-for-business}}`, so the nav highlights on that page.
- **Services page:** the AI section is first, the jump nav leads with AI, and tinted backgrounds were
  re-alternated after the reorder.
- **Templates:** a new `ai_intro` moment with email and WhatsApp "AI · Missing after-hours customers"
  starters (auto-added). A prospect's next step is now *Introduce yourself: offer AI, or a free mockup*,
  with **Offer AI** as the primary button; the website intro and Google-profile offer are still one tap away.
- **Deliberately unchanged:** the industry and area landing pages (`for-salons`, `website-design-*`) still
  target website searches, because that is what people search for and they are the top of the funnel.

### 8ak. A real AI assistant on our own site (2026-10-05)

Our first actual AI build — and the live proof for everything the AI pages claim.

**Switch it on (in this order):**
1. In the Supabase dashboard → Project Settings → Edge Functions → Secrets, add `ANTHROPIC_API_KEY`
   (get the key from console.anthropic.com). **Never paste an API key into a chat or a commit.**
2. `supabase db push` (migration 0023 — the rate-limit counter).
3. `supabase functions deploy assistant`.

Until the function is deployed the widget answers "I couldn't answer just now" and offers WhatsApp, so
deploy before pointing anyone at the page.

- **`functions/assistant`** answers from `KNOWLEDGE` in that file — Re-Charge's real services, prices,
  promises and process. **When a price changes on the website, change it there too**: that constant is
  the assistant's only source of truth, and it is told never to guess a price.
- It uses Claude Opus 5.5 at low effort with short answers (`max_tokens` 1024), which suits quick factual
  chat and keeps the cost per answer small. The system prompt is cached, so repeat questions are cheaper.
- **Cost control matters here**: the endpoint is public and every answer costs money, so it's capped at
  30 questions per person per hour and 1,500 a day in total (`assistant_hits`, hashed IPs — no personal
  data stored, rows older than two days are deleted automatically). Past those caps it politely points to
  WhatsApp instead of spending more. Watch your Anthropic usage for the first week and tune the caps.
- **On the site:** the AI page has it under "Don't take our word for it. Ask ours.", and the demos page's
  AI demo is now this real assistant instead of the old scripted "Ask BuildRight" keyword matcher (that
  demo's fake answer list has been deleted).
- Tracked as `assistant-answer` and `assistant-error`.

### 8al. Two pillars: Get found / Work smarter (2026-10-05)

Six separate services read like a menu. They're now grouped into two stories, without dropping a single
service, price or anchor.

- **Work smarter** (AI, automation, dashboards, custom software) — "AI and automation that take work off
  your hands". Leads, because AI is the headline.
- **Get found** (websites, Google profile) — "Be there when a customer goes looking for you". Framed as
  where most clients start before they grow into working smarter.
- **Services page:** a `.pillar` band introduces each group, then its services follow in order
  (ai, automation, dashboards, software — then websites, google), with tints re-alternated inside each
  pillar. **Every `#id` is unchanged**, so `services#websites`, `services#google` and the rest still work
  from the footer, the homepage and the industry pages. New anchors `#work-smarter` and `#get-found`.
- **Homepage:** the services grid is now two labelled groups (`.pillar-label` + `.services--pillar`),
  two cards per row on desktop so 4 and 2 both sit evenly.

### 8am. Demo assistants for prospects, and a finder that hunts AI pain (2026-10-05)

Needs `supabase db push` (0024) and `supabase functions deploy assistant finder`.

**Demo assistants — the free mockup, for AI.** On a prospect, *Build their demo assistant* opens a form
pre-filled from what we know. You write what it may know (public information only: services, prices,
hours, common questions), save, and it gets a link like `re-charge.co.za/demo?d=<slug>`. The prospect
opens it and talks to an assistant that answers **as their business**. The next step then becomes
*Send them the link*, with ready-made "AI demo · I built you one" messages (`{{demo_link}}`).
- The demo page is `noindex` and not in the sitemap: these are private, one per prospect.
- It is told never to invent a price and to send people to the business for anything it isn't sure of.
- Views are counted on the demo (`assistant_demos.views`), so you can see who actually opened it.
- Same rate limits as our own assistant, so a demo can't run up a bill.
- Edit what it knows any time; the link stays the same.

**The finder now hunts AI need as well.** Website need is visible from outside; AI need is not, so the
weekly research looks for the *published evidence*: reviews saying "never got back to me", a Facebook
"typically replies in a day" badge, busy businesses answering the same questions over and over,
contact-form-only businesses, and admin-heavy trades (attorneys, accountants, estate agents, practices).
It also prefers businesses with staff and volume over one-person operations — AI pays for itself where
there is volume.
- Settings → Prospect finder → **What evidence to weigh first**: Both (default), AI need, or Website need.
- Each find now carries `ai_signal` (the quoted evidence), `ai_potential` and `size_hint`, shown on the
  lead as **AI opportunity**.

### 8an. Proving it worked: baselines, usage and a report that leads with the AI (2026-10-05)

Needs `supabase db push` (0025) and `supabase functions deploy assistant monthly-report`.

A Care plan gets cancelled at month three when the client can't see what it did for them. Three
pieces close that gap: a number written down before the work starts, a count of what the assistant
actually handled, and a monthly email that puts the two next to each other.

**The baseline — one number, taken before anything changes.** When a job reaches *Building*, the next
step is now *Write down the number we're improving*, with a one-click **Nothing to measure here** if it
genuinely doesn't apply. Six common metrics (enquiries that never got a reply, hours spent on admin,
and so on), the number as it is today, and **how we know** — *they told us*, *from their reviews or
page*, or *we counted it*.
- An honest guess from the owner is fine. The report always says where the number came from, so it
  never looks like we measured something we didn't.
- It is kept on the job (`projects.details.baseline`) and shown on the lead; a timeline note records it.
- Reachable any time from the lead's **More ▾** menu, at any stage.

**Live assistants, and what they handled.** An assistant built for a prospect is a demo; once they're
paying, tick **This is their live assistant** in the same builder (the option appears once the lead has
a client). From then on it's tied to the client and everything it answers is counted.
- `assistant_usage` (0025) keeps per assistant, per day: chats, questions, and how many came in
  **after hours** — before 8am, from 5pm, or over a weekend, in South African time. That rule lives in
  the database so there is one definition of it.
- It is never deleted (one small row per assistant per day), so a year in it's also the year-on-year
  comparison. `assistant_hits` is still the two-day rate-limit counter and is unrelated.
- The client page shows **Their assistant — last 30 days** above everything else, with the baseline
  underneath. A month with no use is flagged in red: a quiet assistant is the most common reason a
  plan gets cancelled, and it's nearly always that nobody knows it's there.

**The monthly report now leads with it.** The email opens with the assistant's numbers and the
baseline sentence — *"When we started, you told us enquiries that never got a reply came to about 12 a
week — somewhere near 50 in a month like this one."* — and the website numbers follow.
- It deliberately **does not claim** the assistant recovered those enquiries. It puts the two numbers
  side by side and lets the client draw the conclusion. Anything stronger is a claim we can't defend.
- Clients with an assistant but no website now get a report (they used to be skipped for "no data").
- A month with no use says so, and offers help getting it in front of people.
- Preview it any time from the client page before it goes out.

### 8ao. A modern surface, and a developer-for-hire voice (2026-10-05)

No database or function deploy for the look; the assistant's own prompt changed, so
`supabase functions deploy assistant` when you get a chance.

**The look.** The content was fine; the surface read as 2021. What changed, all craft:
- Display type is bigger and tighter, and the homepage headline now spans the hero grid
  instead of being trapped in a column that capped it at 3rem — that cap was the single
  biggest reason the page looked dated.
- An atmosphere layer: a slow aurora wash and film grain. The grain is the cheapest fix
  for the banding that dark gradients show on the cheap phone panels most visitors use.
- The nav is a floating glass pill on desktop that tightens once you scroll.
- Buttons are pills with a sheen that sweeps on hover; cards have a masked gradient
  hairline and a spotlight that follows the cursor.
- Staggered scroll reveals, a scroll-progress line, and a marquee of the trades we build
  for that also links the four industry pages.

Held throughout: no libraries, no new fonts, no images (the grain is an inline SVG),
animation only on transform and opacity, and all of it off under `prefers-reduced-motion`.
Page weight is unchanged.

**The voice.** The site sold like a SaaS — "we", plans, packages. It now reads as hiring
one person:
- First person singular everywhere on the marketing pages, the industry generator, the
  forms and the assistant's own knowledge.
- The hero names Révan and says what he is: *"I'm the developer you'd hire in-house, if a
  small business could justify one full-time."*
- The old "Why Re-Charge" band is now **An in-house developer, without the in-house part**,
  making the case against both a payroll hire and an agency.
- Nav CTA is **Hire me**.

**What deliberately did NOT change voice,** because it is someone else speaking: the parody
2009 website in the before/after slider, the "after" mockup beside it, the instant-preview
templates in `script.js` (that is the *prospect's* site), the Google-review reply templates
(that is the *client's* business replying), and `terms`/`privacy`, where naming the business
as the contracting entity is the point. A blanket find-and-replace breaks all of these — it
also quietly renamed the `ai-chat__msg--us` class and the `#how-we-work` anchor the first
time round. Worth remembering if the copy is ever swept again.

### 8ap. Repriced: AI up, websites unchanged (2026-10-05)

Deploy: `supabase functions deploy assistant quote monthly-report`. No database change.

AI is the business now, so AI carries the price. Websites stay where they were and
act as the low-friction way in.

| | was | now |
|---|---|---|
| AI assistant | R3,500 | **R5,900** |
| AI assistant, full | — | **R11,500** |
| Automation / dashboards | R2,000 | **R7,500** |
| Custom software | R4,500 | **R17,500** |
| Quick website | R1,000 | R1,000 |
| Business website | R2,000 | R2,000 |
| Custom website | R4,500 | R4,500 |
| Google profile | R450 | R450 |
| Hosting | R50/mo | R50/mo |
| Care | R100/mo | **R150/mo** |
| Business Care → **AI Care** | R300/mo | **R550/mo** |
| **Partner retainer** (new) | — | **R6,500/mo**, 10 hours of development |
| Pay-monthly website | R249/mo | R249/mo |
| Deposit | flat R500 | **40%**, min R500, capped at the total |

Notes that matter:
- **Nobody already on a plan is repriced.** `care_amount_cents` is stored per client, so
  moving `PLAN_PRICE` only changes what new quotes start from. The site and the terms
  both say so.
- The stored plan keys are unchanged — `business` is simply labelled **AI Care** now.
  Renaming the key would have orphaned every existing client row.
- Care is the one website-side number that moved (R100 → R150). It covers small changes,
  the Google profile and the monthly report, and R100 did not pay for that.
- **Default quote options are AI-first for an AI lead** (`isAiLead`) and still
  website-first for a website lead. Offering an R11,500 assistant to someone who asked
  for a one-page site is how you lose a sale you already had.
- The deposit is computed in `functions/quote` (`depositOn`), not written into copy, so the
  site says "40% deposit" and the figure follows the job: R500 on a R1,000 site, R2,400 on
  an assistant. Capped at the total, so a job below the minimum is simply paid in full.

Every price lives in five places that have to agree: the pricing page, the page `<head>`
metadata and JSON-LD, `scripts/gen_industry.py`, the panel constants, and the
`KNOWLEDGE` block in `functions/assistant`. The assistant is the one that bites — it will
happily quote last month's price to a live prospect. `scratchpad/price_audit.py` greps the
built site for figures that are nobody's price any more; run it after any price change.

Two traps this change walked into, both worth remembering:
- A blanket number swap halved the pricing page **twice**, because it had already been
  edited by hand before the global pass ran. Reprice a file once, in one pass.
- `R4,500` legitimately means two different things (the custom website, and — before this
  change — the one-page one). Number-only replacements cannot tell them apart; anchor on the
  surrounding phrase. The same applies to every fictional price in the demos and the
  before/after mockup, which are a made-up plumber's and must never move.

**Still yours, not the code's:** quote the list price and discount it out loud — "early
client rate, because I'll use your results as my case study" — rather than quietly charging
less. The anchor is the asset.

### 8aq. A film in the hero, and a UI/UX pass (2026-10-05)

No deploy needed beyond the push — site only.

**The hero's static chat block is now a film.** `assets/video/ai-hero.mp4`, 24 s, muted,
looping, on the right of the hero where the old website film used to sit. It shows a
customer asking a salon at 11:47pm whether it's open on Sunday and what a wash and cut
costs, the assistant answering in seconds, the booking being taken, and the owner waking
to it at 7am. Source and render steps are in `scripts/film/README.md`.

Two decisions in there are easy to undo by accident:
- **It is drawn at 396×495 and rendered at 2×**, not at 720×900. The hero column is about
  396 CSS px wide, so a film designed at 720 halves on the page. The first cut nested a
  phone inside the frame and the message text came out around 7px — unreadable, which
  defeats the point of showing a conversation.
- **mp4 only, mp4 first.** For dark, mostly still, text-heavy footage x264 at crf 25 is
  356 KB where VP9 at crf 40 is 719 KB. The older `flow.*` films listed webm first, so
  every modern browser was fetching the larger file; that order is now mp4-first.

It costs nothing on load: `preload="none"` plus the existing on-screen-only playback means
a phone downloads 0 KB of video until the hero is scrolled to. Reduced motion gets the
poster and a play button, as before.

**What the UI/UX pass changed:**
- The Project Builder led with *Website* and had AI fourth. AI now leads, and the option
  is "AI assistant — answer customers day and night" rather than "AI Integration".
- Tap targets under 44px on a phone: the nav's own **Hire me** button (was 34px), every FAQ
  row (was 30px), inline links in body copy (16–19px, now extended with a transparent
  `::after` so the line doesn't move), and the marquee links (22px, now 44px).

**What the pass found and did NOT change** — these are judgement calls, not code:
- **The homepage is ~19 screens on a phone**, 13 full sections. Four of them (demos,
  pricing, process, websites) are full-length versions of pages that already exist. Most
  visitors will never reach About, the FAQ or the final call to action. Cutting those four
  to a short band plus a link would roughly halve it. That is a content decision.
- `services`, `demos` and `free-mockup` put their first call to action below the fold on a
  phone — `services` at 2481px, six screens down.
- Contrast was checked properly (compositing translucent backgrounds rather than treating
  them as opaque) and **passes everywhere in our own UI**. The only failures are inside the
  fictional mockup phones, which are deliberate.

### 8ar. Shorter homepage, denser layout, a moving background (2026-10-05)

Site only — no database or function deploy.

**The homepage went from ~19.6 phone screens to 13.8**, without putting anything out of
reach. Four sections that were full-length copies of pages that already exist are now
signposts: **services** is a two-pillar list instead of six cards, **demos** and
**websites** are one-idea bands with a link, and **how it works** lost a step and the old
website film (which still showed the R500 deposit). The FAQ keeps five of eight questions —
hosting, templates and starting small are answered in full on /pricing and /services.

The instant-preview widget moved to **/free-mockup**, where the visitor is already asking
for a mockup, rather than sitting on the homepage selling the secondary product.

**Dead space.** Both sites opened with a band of nothing: the floating nav sat 40px down
and the hero added its own top padding on top of that, and in the panel the main padding
and the page head's margin stacked. Section padding, head margins and grid gaps across the
site were also still tuned for a much longer page.

**The background now moves.** The first aurora was too faint to read as animated. It is now
two brighter layers turning against each other on different cycles, plus a grid drifting
behind the whole page (added from script.js, so it is on every page and only when motion is
allowed). Still two fixed elements being transformed — one composite per frame, no layout.

**"Hire me" became "Get a price".** It asked for the biggest commitment available on the
first click. The new label is free, concrete, and matches where the button actually goes.

**The personal name is off the public site** — the hero eyebrow, the About section and its
byline, the footer, and everything the assistant says. The voice stays first person. Nothing
in terms or privacy named anyone, so nothing contractual changed.

**First contact now leads with AI.** The default templates still opened with *"I build
websites for small businesses"* and a free mockup; the AI ones added earlier were extras
nobody would reach for first. Two of the three now open on a real AI pain (messages after
hours, the same questions all day) and the website mockup is the third.

**SEO.** The homepage title led with websites, the services title listed AI last, the
JSON-LD service catalogue had Websites first, and the organisation description called this a
"digital solutions studio building websites…". All now lead with AI, and two titles still
said "us"/"we".

**One real bug fixed on the way.** `renderSettings` wired the prospect-finder form after an
await without checking it still existed, so routing away mid-render threw. It was latent —
four runs on the previous build never hit it — and longer template strings shifted the
timing enough to expose it on two runs in three. Every other listener in that function was
already optional-chained; these two were not.

### 8as. Motion and interaction site-wide, LinkedIn (2026-10-05)

**What moves.** `motionSystem()` in `script.js`, with the MOTION SYSTEM block in `styles.css`:
- Main `h1`/`h2` headings rise in word by word (class `wsplit`; not `split`, which is the
  two-column layout class). Words inside an `<em>` carry the gradient themselves.
- The first section's eyebrow, lead, buttons and visual fade up in sequence (`.hin`).
- Sections reveal with varied entrances (rise, zoom, from the left, cascading children);
  prices count up; the process steps light up as you pass them; the marquee speeds up
  with scrolling; hero visuals drift with a light parallax (`--sy`).
- With a real mouse only: buttons lean towards the cursor, cards tilt, and a soft glow
  follows the cursor. Nothing of this runs on touch.
- The before/after slider sweeps once to show it can be dragged (skipped once touched).

**Safety rules.** Everything is additive: the resting state is the finished state and
animations fill backwards, so if JavaScript or the observer fails, nothing stays hidden. One
rAF loop does the scroll work and also reveals anything still pending as a safety net. Only
transform/opacity change, never layout. Under `prefers-reduced-motion` all of it is off.

**LinkedIn.** Footer pill "Follow on LinkedIn" (linkedin.com/company/re-charge-ai) on every
page built from `src/`, and `sameAs` in the homepage structured data, which also now carries
the current "from" prices and the new slogan.

**Name.** The site assistant no longer uses the developer's name; it says "the developer"
or "Re-Charge" and won't give a name if asked. Redeploy: `supabase functions deploy assistant`.

### 8at. The website speaks as "we" (2026-10-06)

Every page, the footer dialogs, the visitor messages in `script.js` and the industry
generator now use the company voice: "we / us / our", matching the LinkedIn company page.
The one-developer promise stays explicit ("One developer, start to finish"; "you're talking
to the developer who builds your website").

Left in the customer's voice on purpose: FAQ questions ("When do I pay the deposit?"),
the AI-page "pick your problem" buttons ("Customers message after hours and I miss them"),
quoted customer needs, chat suggestions ("Can I book?"), buttons the customer presses
("Send me my free mockup", "I accept the scope…", "I have a question"), form placeholders
and the WhatsApp messages pre-typed for the visitor. The AI assistant still says "I" as itself.

Writing new copy: "we" for Re-Charge, "I/my" only when the customer is speaking.

### 8au. Outcomes, not AI: the method, the commercial model, ROI everywhere (2026-10-06)

**Source of truth: `METHOD.md`.** Positioning, the 7-phase framework, the opportunity score
formula and gates, the ROI sums, the implementation/operations prices, the SLA and the
separately priced work. The site, the panel, the quotes and the assistant all follow it.

**Site.**
- Homepage: "Find the work your employees shouldn't be doing." Hero visual cycles three
  example processes (enquiry → extracted → knowledge base → reply; staff question; invoice
  capture) with the before/after time. Then Problem → Solution → Result examples (labelled as
  examples), an ROI estimate (people × hours × share, valued at salary × 1.3 ÷ 173), the 7
  phases, the commercial model, why us, websites as a secondary line, FAQ.
- Main call to action everywhere: **Book a process review** (`data-review-open`, the dialog
  in the footer; `?review=1` opens it). Lands as formType "Process review", category "AI
  process automation", with where the time goes, team size and hours in the goal. The intake
  function sends a matching thank-you email.
- `ai-for-business` is now **Solutions**: ten processes, each as the work / the system / what
  we measure; where it fits; under the hood; the live assistant; FAQ.
- New **`method`** page: the 7 phases with what you get at each, an interactive opportunity
  scorer (same formula as the panel), how ROI is measured, why each job makes the next faster.
- **Pricing**: implementation stages (review free, discovery R7,500 credited, PoC from
  R18,500, production from R45,000), Operations (Operate R4,500, Optimise R9,500, Partner
  R18,500 a month) with an SLA table, separate rates (change R850/h, consulting R1,250/h,
  emergency R1,650/h, new functionality quoted), a worked payback example, then websites.
- `services` is now "Websites & more": websites, Google, dashboards, custom software; AI and
  automation point to Solutions. Nav: Solutions · Method · Pricing · Websites & more · Book a
  review. Terms gained §7a (stages, operations, SLA, allowances, separate rates, results).
- The site assistant's facts were rewritten to match (redeploy `assistant`).

**Panel.**
- **The method card** on AI leads (or More → "Use the method"): the 7-phase tracker, the
  discovery map (people, processes, software, data, bottlenecks, repetitive work, decision
  points), scored and ranked opportunities with the gates, and "Copy the summary" for the
  client.
- **Baselines measure ROI now.** "Minutes to …" metrics take a volume; any baseline can take
  a loaded hourly cost. "Measure it now" records the after number on the same definition;
  the card shows before → after, % change, hours a month back, Rands a month and payback.
  The client page's impact card leads with the measured change.
- Plans: Operate / Optimise / Partner (AI ops) are monthly (go-live defaults AI work to
  Operate, monthly). AI Care and the R6,500 retainer stay as "earlier plan" for existing
  clients. AI leads' default quote options: Discovery · Discovery + proof of concept
  (recommended) · Full implementation (discovery credited).
- **Monthly report**: when an after number exists it opens with "What we improved" (before →
  after, hours, Rands) and the subject says so. Operations plans get the report.

**Deploy:** `supabase functions deploy assistant project-intake monthly-report quote`.

### 8av. Seven AI demos (2026-10-06)

New page **`ai-demos`** (nav: Demos; the old website/tool demos stay at `demos`). Code in
`ai-demos.js`, loaded only on that page; styles under "AI DEMOS" in `styles.css`. Each demo
has the work it replaces and what we'd measure, and is labelled honestly:

1. **Meeting attendant** — two sample meetings play as a live transcript while decisions,
   action items (owner + due date) and risks build up; a summary is written at the end. Click
   any item to see the line it came from. *Simulated.*
2. **Enhanced CRM** — a pipeline; "Run the AI pipeline review" scores every deal with reasons,
   flags stalled deals, totals what's at risk and a weighted forecast, and drafts a follow-up
   per deal. *Simulated.*
3. **Call taker** — an after-hours emergency or a dental booking; the job card fills in while
   the caller talks, urgency is flagged, and the outcome is shown. *Simulated.*
4. **Q&A / FAQ** — the live assistant (real AI, answering from our facts).
5. **Customer insight & representative** — 24 sample comments counted into themes with
   positive/negative splits; "speak for" a customer group and ask a question, and the answer
   is built from the counts with the comments it rests on. *Real aggregation over sample data.*
6. **Content creator** — business, topic, channel and tone in; a post or email out, with a
   length/CTA check and other versions. *Sample generator.*
7. **Document answers (RAG)** — real BM25 search over five sample policies, showing the top
   passages with scores and highlighted terms, then an extractive answer with its source; it
   says "isn't in the documents" when nothing matches, and respects documents switched off.

Under reduced motion everything appears at once. Tests: the demo test runs every one.

### 8aw. Messages for the process-review model, and case studies (2026-10-06)

**Templates.** First-contact messages (email and WhatsApp, rotating) now open with the work a
team shouldn't be doing and offer a free 30-minute process review; the "AI · first contact"
pair, the AI demo email, the quote/deposit wording (40% deposit, not R500) and the Care upgrade
(R150) were rewritten. Unedited saved copies upgrade themselves on the next load; edited ones
are left alone. New, added once to existing libraries:
- **Process review** — pick a time; next step after the call (proposes the R7,500 discovery).
- **AI follow-up** — nudge, "run the numbers" (links the ROI calculator), last one. AI leads
  (asked about AI, pitched AI, or with a demo/discovery) get these instead of the mockup ones.
- **Discovery · Your opportunity map** — includes `{{opportunities}}` (ranked, with scores).
- **Results · What we improved** — `{{result}}`: the measured before → after, hours, Rands.
- **Case study · May we share your result?**

**Next steps.** A "Process review" lead: book the 30-minute call. Discovery done (phase 2, with
scored opportunities) and no quote: send the map, then the proof-of-concept quote. A live AI
project: two weeks after go-live, measure the same number again → share the result → ask to
use it as a case study.

**Case study** (baseline card → "Write the case study", once there's a measured improvement):
drafts Problem / Solution / Result from the map, the top opportunity and the measured result;
record their approval; "Copy for LinkedIn" or "Copy for the website" (a card in the same
markup as the homepage examples — paste it over an example in `src/index.body` or
`src/ai-for-business.body`, then rebuild). It warns if you copy before they've approved.

### 8ax. Educate first, demonstrate, then sell (2026-10-09)

Strategy: visitors only need to recognise a problem; the site helps them discover, see it
working, understand the cost and take one easy step. `METHOD.md` §1/§5 record the decision.

- **Homepage: five sections.** Hero "Your business shouldn't have to work this hard." (with
  the enquiry-handling visual) → "What would you like to make easier?" (save time, get more
  customers, understand your numbers, improve how your business works) → three working
  examples (enquiry handling, dashboard, knowledge assistant) → starting prices + the 5-step
  process → "Not sure what you need? That's fine." The ROI calculator moved to `pricing#roi`.
- **Nav:** Solutions · Examples · Pricing · Get started. Method and Websites & more stay in
  the footer.
- **"Tell us what's slowing you down"** (every Get started button) asks what they want to make
  easier and what's frustrating them, in plain words. It posts formType "Problem enquiry" with a
  category per goal (Automation / Website / Dashboard / AI process automation / Not Sure), so
  the panel offers the right quote options. Three paths everywhere: see examples · tell us the
  problem · get an estimate (`start`).
- **Pricing, two tiers.** Starting prices first (websites R1,000, dashboards and automations
  R2,000, AI solutions R3,500, custom software R4,500), what affects cost, every ongoing cost,
  the 5-step process, the calculator; then "Larger AI process work" (discovery → proof of
  concept → production → operations). Builder estimates, services, terms, the prospect demo
  page, structured data and the assistant use the same numbers.
- **Examples** (`ai-demos`): each demo now says who it's good for and its limits, the page says
  they're prototypes on sample data, and it includes the quote calculator, dashboard and
  booking demos. **Solutions** opens with the five kinds of solution and their starting prices.
- **Panel:** AI leads get "Focused AI tool" (R3,500 + Care) recommended unless they came to
  improve a whole process; automation, dashboard and custom-software leads get their entry
  option. A Problem enquiry about a whole process gets the "book the call" step.
- **Measurement:** scroll depth 25/50/75/90% and a `data-track` click event on the main CTAs,
  problem choices, demo opens and pricing links (`cta-*`, `problem-*`, `demo-open-*`), plus
  `enquiry-open` / `enquiry-sent`. Read depth next to these, not on its own.

Deploy: `supabase functions deploy assistant`.

### 8ay. Smooth scrolling again (2026-10-09)

Scrolling and animations stuttered. Measured with a wheel-scroll test (headless, no GPU, so
absolute numbers are high but comparisons hold): median frame 283 ms before, 33 ms after on
desktop, 16.7 ms (60 fps) on phone.
- **The aurora background** (two 150vmax layers, 26–34px blur, rotating and scaling forever)
  was most of it. Now: no blur (the gradients are soft already), smaller, translate-only drift.
- **`--sy` on `<html>` every scroll frame** made every element recalculate its style (558 ms →
  56 ms of style work when removed). Parallax was dropped; nothing reads `--sy` now.
- Headings, counters and lit steps now trigger from IntersectionObservers instead of measuring
  elements on every frame; the scroll loop only does the reveal safety net and the marquee.
- Grain no longer uses mix-blend-mode; the hero card no longer blurs what's behind it.
Rule for future effects: animate transform/opacity only, never blur or blend a full-screen
layer, and never write a CSS variable on `<html>` or `<body>` per frame.

### 8az. Priced for bigger clients, and a simpler, modern look (2026-10-11)

**New prices (no small-business tier).** Starting prices are now: business websites R12,500,
platforms / web apps R35,000, dashboards R15,000, automations R15,000, AI solutions R25,000,
custom software R45,000. Larger AI process work: discovery R15,000, proof of concept from
R35,000, production from R85,000. Operations: Operate R7,500/month, Optimise R15,000/month,
Partner R35,000/month. Separate rates: changes R1,250/hour, consulting R1,850/hour (half-day
R7,500), emergency R2,450/hour. Managed hosting R450/month (R4,500/year), Care R1,450/month
(R14,500/year). Outside South Africa we quote in USD, EUR or GBP.

Gone from the site: one-page sites, pay-monthly websites and the R450 Google profile setup.
Existing clients keep the plan and price they signed up at; nothing already in the panel is
repriced. The panel's quote options, plan prices, stage prices and rates all use the new
figures, and a referred business now gets R1,250 off. The chat assistant knows the new
prices once you redeploy it (see below).

**The hero.** The film is replaced by a live example window: pick Enquiries, Documents or
Invoices to see the incoming item, what the system did, the result ready for a person to
approve, and the time per item before and after. It moves on by itself every 7 seconds while
it's on screen, stops when someone hovers or picks a tab, and works with the arrow keys.

**Simpler look.** No background grid, no watermark, no film grain: one still glow at the top
and calmer, tighter headings. Same layout and pages.

**To do:** from the re-charge folder, `git pull` then `supabase functions deploy assistant`.
`python3 scripts/price_audit.py` fails if any old price comes back.

**UI/UX pass (same day).** Under the homepage hero there's now a row of four promises (fixed
proposal, measured before and after, you own the code and data, a person approves what
matters): the reasons a bigger client trusts you before they've spoken to you. Card buttons
line up along the bottom of each row; the small capital labels inside cards are plain text
now; the "Example" label sits in the hero window's title bar. On a phone the cookie notice is
a slim bar on the bottom edge, and the four problem cards are half as tall. The Services page
no longer mentions Google profiles.

### 8ba. Acting on the five-perspective review (2026-10-12)

- **Small-business pages hidden from search.** The salon, plumber, restaurant and cleaner
  pages and the free-mockup page still work for old links, but they carry `noindex`, are out
  of the sitemap, and nothing on the main pages links to them. Services and Pricing no longer
  offer a free mockup.
- **Homepage.** It now says who it's for ("For teams of 5 to 200 people") and leads its price
  block with a typical process project (R120,000 to build, R7,500 a month, about 3 months to
  pay back) and a link to the ROI calculator. Websites are listed last.
- **Menu.** Solutions · How we work (the method page) · Examples · Pricing.
- **Pricing.** One "What things cost" summary at the top in three groups (build one thing,
  automate a whole process, keep it running); websites are priced once; 12 sections → 9.
- **Plain words.** "Model & API costs" is now "AI usage (what the AI provider charges)",
  "evaluation" is "accuracy check", SLA is "agreed response times", and each operations plan
  has a one-line description of what you get.
- **Email me my results.** Under the ROI calculator and the opportunity scorer. It lands in
  the panel as a lead ("ROI estimate" / "Opportunity scores") and emails the visitor their
  numbers straight away, even if automatic thank-yous are off in Settings.
  **Needs:** `supabase functions deploy project-intake`.
- **Phone.** The example window shows on the first screen, small labels are at least 11px,
  and the WhatsApp button is smaller with room left for it at the bottom of the page.

### 8bb. Mobile pass (2026-10-12)

- **Menu bug fixed.** On phones the open menu was drawn underneath the page, so its links sat
  on top of the hero text. Cause: an old rule (`.nav, main { position: relative; z-index: 2 }`)
  had also stopped the header sticking to the top on every screen size. The header now sticks
  again (the floating bar on desktop) and the menu is solid.
- **No zoom on iPhone.** Form fields are 16px on phones; smaller text made iOS zoom in.
- **Bigger tap areas.** Footer links, small buttons, chips, tabs, sliders and "See how"
  links are now 40–44px tall on phones.
- **Readable labels.** Small labels are at least 12px on phones (the sample dashboards on the
  Tools page keep their own app-sized text).
- **Builder.** The Next bar is solid, so cards no longer show through it.
- **Logo.** It turns once when a page opens instead of every 5 seconds (not at all if the
  phone asks for reduced motion).

### 8bc. Desktop pass (2026-10-12)

Checked at 1280, 1440 and 1920 wide: no sideways scrolling, and every link and button shows a
visible focus ring when you tab through. Fixed:
- **Pricing:** the five "how a project works" steps sit in one row (they were four plus one
  orphan); stage rows are narrower so each price sits near its name; small print is capped
  at a readable width; the ongoing-costs list no longer repeats hosting, Care and support
  (they're in "What things cost" at the top).
- **Homepage at 1920:** the headline stays on three lines.
- "Model and API use" → "AI usage" in the last place it appeared.

### 8bd. Shorter pricing page (2026-10-12)

Pricing went from 10 screens to about 7.5 on desktop (19 → 14 on a phone), with nothing removed:
summary → ROI calculator → bigger projects → monthly plans → everything else → questions.
- The worked example (R120,000, paid back in ~3.3 months) folds open under the calculator.
- The service-levels table folds open under the monthly plans ("Service levels").
- "Priced separately" and "passed through at cost" are one section, side by side.
- "How does a project work?" and "What affects the cost?" are now the first two questions.
- A link to a folded part (pricing#sla, #process, #cost) opens it automatically.

### 8be. The 5-second hero (2026-10-12)

Goal: someone with a problem who doesn't know AI can solve it gets that in 5 seconds.
- Label above the headline: "AI that does the admin, for teams of 5 to 200" (phones show the
  first part only).
- Under the headline, one large sentence replaces the longer intro: "AI can now read your
  emails, documents and invoices and do the typing your team does by hand. A person still
  checks it."
- The example window says AI did it: the step lines start with "AI …", and the result
  carries a "Done by AI in seconds" badge.

### 8bf. Solutions page rewrite and the Connected systems demo (2026-10-12)

**Solutions page.** Headline: "If your team reads it and types it up, AI can now do most of
it." One sentence under it (enquiries, quotes, invoices, documents, the same questions; a
person still checks it) and a proof line (~15 → ~3 min per enquiry, under a minute to find a
policy answer, invoices posted as draft bills). The five technology cards became six problem
cards ("Enquiries get answered late, or lost" → AI enquiry handling, and so on), with the
price at the bottom.

**Connected systems demo** (Examples page, #systems, demo 08). Two scenarios on sample data:
- *Supplier invoice:* the AI reads the email and PDF, matches the purchase order, flags a
  quantity mismatch, creates a draft bill, adds a spend-sheet row and asks Finance in Teams.
- *New enquiry:* it creates the customer in the CRM, opens the job, holds a site visit in the
  calendar and drafts the reply.
Nothing is posted or sent until you press Approve. Systems are named generically ("Accounting",
"CRM") until we decide which real tools to name. The data entry, onboarding and invoice cards
on Solutions link to it.

**To do:** `supabase functions deploy assistant` so the chat assistant knows about demo 08.

### 8bg. Examples page, problem first (2026-10-12)

- Headline: "Pick the work that slows your team down. Watch AI do it." One sentence under it;
  the sample-data note is now small print.
- Jump links are named after problems (Missed calls, Retyping into systems, Searching
  documents, The same questions, Chasing deals, Meeting write-ups, Customer feedback, Writing
  posts, Websites & tools).
- Demos reordered by how common the pain is: call taker, connected systems, document
  answers, Q&A, sales pipeline, meeting notes, customer insight, content creator. Each label
  reads "01 · Missed calls · Call taker" (problem first, product second).
- The call-taker demo plays once by itself when it scrolls into view; press the button to
  run it again.

### 8bh. Pricing page, value first (2026-10-12)

- Headline "Clear prices. Paid back in months." with one sentence: AI takes over work done by
  hand; a 40-person firm spends R120,000, gets ~208 hours a month back, paid off in ~3 months.
- Buttons: "Work out yours" (the calculator) and "Tell us what's slowing you down".
- Columns renamed "Fix one problem" / "Take over a whole process, in stages" / "Keep it
  running"; each price row now says the work it takes over.
- The worked example's one-line summary shows without opening it.

### 8bi. Prices in USD, EUR and GBP (2026-10-12)

**What visitors see.** Every price on Home, Solutions, Services and Pricing shows in the
visitor's currency: their earlier choice if they made one, otherwise their time zone (South
Africa → ZAR, UK → GBP, the rest of Europe → EUR, everywhere else → USD). A "Prices in ZAR ·
USD · EUR · GBP" switch sits by the prices and in every page footer, and remembers the choice.
Search engines and visitors without JavaScript see rand. The worked example, the payback
("about 2 months" abroad, where salaries are higher) and the ROI calculator's salary range
switch too.

**The list** (fixed, not a live rate; review once or twice a year): USD = rand ÷ 10, EUR ≈ USD ×
0.92, GBP ≈ USD × 0.8, rounded. It lives in `script.js` (`LIST` in the currency block),
`METHOD.md` §5 and the assistant's knowledge. Change all three together.

| | USD | EUR | GBP |
|---|---|---|---|
| Business website | 1,250 | 1,150 | 1,000 |
| Platform / web app | 3,500 | 3,200 | 2,800 |
| Dashboard / automation / discovery | 1,500 | 1,400 | 1,200 |
| AI solution | 2,500 | 2,300 | 2,000 |
| Custom software | 4,500 | 4,100 | 3,600 |
| Proof of concept (from) | 3,500 | 3,200 | 2,800 |
| Production (from) | 8,500 | 7,800 | 6,800 |
| Operate / Optimise / Partner a month | 750 / 1,500 / 3,500 | 700 / 1,400 / 3,200 | 600 / 1,200 / 2,800 |
| Hosting / Care a month | 45 / 145 | 40 / 135 | 35 / 115 |
| Changes / consulting / emergency an hour | 125 / 185 / 245 | 115 / 170 / 225 | 100 / 150 / 195 |

**Getting paid.** Larger invoices by bank transfer to a foreign-currency account (Wise
Business, Payoneer or your bank's FCA); monthly fees by card through Paystack (ask Paystack to
switch on international payments; payouts arrive in rand). Terms §7a says so. Confirm the VAT
treatment of exported services with your accountant before the first invoice.

**Not done yet:** the panel still quotes and invoices in rand. Once the foreign-currency account
and Paystack are set up, quotes need a currency per client.

**To do:** `supabase functions deploy assistant` (it now knows the international list).

### 8bj. Services page, problem first (2026-10-12)

Headline "Customers can't find you, or nobody sees the numbers? We fix that too." with one
sentence (not every problem needs AI; each at a fixed price). Jump links are named after
problems. The two centred in-between headings are gone; each service has a problem label above
its title and a "With AI" line saying what AI adds, linked to the matching demo.

### 8bk. How we work, plain first (2026-10-12)

- Headline: "We prove it works on your real work before you pay for the full build."
  One sentence; "You can stop after any step."
- New "Three steps, and a way out after each one": Find (1–2 weeks, R15,000), Prove (2–4
  weeks, from R35,000), Build and run (from R85,000, then from R7,500 a month). Prices follow
  the currency switch.
- The seven phases keep their detail but lead with plain names ("We try a small version on
  real work", with "Proof of concept" small underneath), are tagged Find / Prove / Build and
  run, and each says **Your part** (what we need from the client). Check these fit how you run
  projects; they're in `src/method.body`:
  discovery two or three one-hour sessions; opportunity map one hour; proof of concept a weekly
  30-minute check-in plus someone testing; ROI check a 30-minute decision; production system
  access and sign-off; training one session per team; operations the monthly report.
- The scorer asks plain questions ("How bad would a mistake be?"); same formula.
- A worked line under the ROI formulas; the closing CTA offers the free 30-minute review.

### 8bl. Terms tidy-up and softer promises (2026-10-13)

- **Terms:** a "Quick answers" box at the top (deposit, cancelling, ownership, monthly plans,
  data, international) and links to every section. AI projects and operations now come
  before websites (no more "7a"); Ownership is its own section. Fixed: the deposit is always
  40% (larger projects split the balance into milestones), hosting is monthly or yearly with a
  month's notice, no more free-mockup mentions, "AI usage" and "accuracy checks" wording.
- **Reply promise, everywhere** (terms, "Get started" form and its thank-you, chat
  assistant, automatic emails): "within one business day, usually within the hour". The panel
  still counts down an hour for you as the internal target.
- **Website promise:** live within **3 weeks** of approving the design (was 7 days), or the
  first month of Care is free: terms, quote page, the panel's countdown ("3-week promise").

**To do:** `supabase functions deploy assistant` and `supabase functions deploy project-intake`.
**Before your first international client:** a lawyer-drafted contract (liability cap,
confidentiality, governing law) and a data processing agreement (POPIA, plus GDPR for EU/UK).

### 8bm. Concise pass (2026-10-13)

Cut about a third of the words on the main pages and removed technical words:
Home 612 → ~420, Solutions 1,357 → ~700, Examples 1,250 → ~990, Pricing 1,705 → ~1,000,
Services 644 → ~435, How we work 1,013 → ~735.
- One set of plain step names everywhere on the site: **Find → Prove → Build** (instead of
  discovery / proof of concept / production). Terms and the panel keep the formal names.
- Solutions: each of the 10 cards is one before → after line; the technical "Under the hood"
  section is gone; FAQ answers are a sentence each.
- Examples: each demo keeps only "Good for" and "Limits".
- Pricing: the stages section was merged into the summary; plans have four bullets; FAQ is 5
  questions; no formulas.
- Services: no example tag lists or side notes.
- How we work: each phase is a plain title, what you get and your part; the formulas became
  three plain lines; the scorer explains itself in one sentence.
- Footer: "Monthly plans", "How we work", "Finding answers", "Invoices & documents".
Interactive parts and animations are unchanged.

### 8bn. Contracts (2026-10-13)

Five templates, written in plain language without an attorney (have them reviewed when you
can, and before your first client abroad). They live in `contracts.js`:
1. **Client Services Agreement**: once per client. Scope and changes, payment (40% deposit,
   monthly plans in advance, pause after 14 days overdue), acceptance (10 business days),
   ownership on full payment, AI mistakes and human checks, confidentiality, 30-day defect
   fixes, liability capped at 12 months' fees, ending it, South African law.
2. **Project Order**: per project: what we build, what we measure, dates, price, their part,
   where a person checks the result.
3. **Monthly Plan**: hosting, Care, Operate, Optimise or Partner, with response times.
4. **Data Processing Agreement**: POPIA, plus GDPR/UK GDPR for clients there; providers annex.
5. **Mutual NDA**: if a client wants confidentiality before the free review.

**In the panel:** Settings → Contracts. Fill in **Your company details** once (registered name,
registration and VAT numbers, address, who signs). On any lead, open **Contracts** → pick a
document: client details and quote lines are filled in, edit and Save, then **Print or save as
PDF**, send it, and press **Mark as sent / Mark as signed** (logged on the lead). Gaps to fill
show highlighted in [brackets].

**Online:** re-charge.co.za/agreement shows the services agreement and data processing
agreement (hidden from search). The quote page's acceptance box now reads "I accept … the
client agreement" with a link, so accepting a quote online accepts the agreement. The terms
page points to it too.

### 8bo. Booking a call (2026-10-13)

Your Google Calendar booking page (`https://calendar.app.google/58FYamh1ahXB4khM9`) is now the
main action: **Book a free call** in the header on every page, **Book a free 30-minute call** as
the homepage's first button and in the closing section of Home, Solutions, Examples, How we
work and Pricing (the written form is the second button there, "Or tell us in writing"). The
form itself offers the call at the top, the chat assistant offers the link, and the automatic
thank-you emails include it. Bookings arrive in your Google Calendar with a Meet link; they
don't create a lead in the panel, so add one (Add lead) after the call if it's worth pursuing.
The link is in `config.js` (BOOKING_URL), `src/header.html`, the page sources and both functions.
**To do:** `supabase functions deploy assistant` and `supabase functions deploy project-intake`.

### 8bp. Automatic card payments with Paystack (2026-10-13)

Monthly clients can have their card charged automatically instead of paying a link each month.
Rand only. The Paystack account is in **test mode** until compliance approval; test cards don't move real money.

- **How it works:**
  1. The client page → Hosting & care renewal → **Automatic card payments** → *Send card set-up link*.
  2. This creates a Paystack checkout for one month and opens an email with the link.
  3. When the client pays, `paystack-webhook` records the payment, moves the due date on a month and saves the card.
  4. From then on, `care-billing` charges that card on each due date and emails a receipt.
  5. If the bank declines, the client gets a Paystack link instead and you see "saved card was declined" on the timeline.
- **Clients not switched on** keep getting Yoco links as before.
- **Turn off / Remove saved card** are on the same card.
- **What we store:** Paystack keeps the card. We keep only a token, the last 4 digits and the expiry, in `settings` under `paystack:<client id>`. No database migration is needed.
- **Setup (once):**
  - `supabase secrets set PAYSTACK_SECRET_KEY=…` (done, test key).
  - `supabase functions deploy paystack-webhook paystack-link care-billing`.
  - Paystack → Settings → API Keys & Webhooks:
    - Test Webhook URL: `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/paystack-webhook`
    - Test Callback URL: `https://re-charge.co.za/start`
- **Going live:**
  - After approval, set the live secret key the same way.
  - Paste the same two URLs into the Live fields.
  - Redeploy the three functions.

### 8bq. Overseas quotes in USD, EUR or GBP (2026-10-13)

- **Quote card → Currency.** Pick USD, EUR or GBP and type the prices in that currency. The client's quote page, the email and WhatsApp templates, and the deposit all use it.
- **Deposit:** 40%, rounded to the nearest 10, with a minimum of 50.
- **How they pay:** card payments are rand only, so overseas clients pay by bank transfer (SWIFT). Once they accept, their quote page shows your bank details, with the project ref as the reference.
- **Where the bank details go:** Contracts → Your company details → Bank details for overseas clients. Fill in at least the account number and SWIFT code. Until then, the page tells the client you'll email the details.
- **When the money arrives:** save it under Payments → *I received a payment*, entering the rand amount your bank paid out. Money totals stay in rand.
- **Bug fixed:** the quote page still said "R500 deposit" in several places. It now shows the real deposit (40%).
- **Deploy:** `supabase functions deploy quote`.

### 8br. Showing the value: cost-first calculator, weekly email, first-week email (2026-10-13)

- **Calculator (Pricing → "What is that work costing you?")**
  - The result now leads with the cost of doing nothing: "Right now about R7,321 a month goes on work a system could do."
  - The emailed estimate leads the same way, in its subject line and first sentence, and ends with the booking link.
  - The figure comes from the visitor's own numbers.
- **Weekly email (`weekly-wins`)**
  - Goes out on Mondays to clients on a monthly plan that includes the report.
  - Says what their AI handled that week: questions answered and how many came after hours.
  - Includes hours saved only if a before-and-after has been measured.
  - A week with nothing to report sends nothing.
- **First-week email**
  - Sent once, 7–13 days after a project is marked live.
  - Lists what the AI did, says we'll measure against their starting number at month end, and invites small fixes.
  - With no usage data, it's a short "how has it been?" check-in.
- **Panel:** client page → *Weekly email*: on/off, and *Preview this week's*. What was sent and when is kept in settings under `wins:<client id>`.
- **Rule:** only real numbers. There are no estimates without a measurement behind them, and no padding.
- **Setup:**
  - `supabase functions deploy weekly-wins monthly-report project-intake`
  - Schedule it once: paste `supabase/migrations/0026_weekly_wins.sql` into Supabase → SQL Editor and run it. It runs the function daily at 07:22; the function decides who is due.

### 8bs. Realistic reply times, one main action (2026-10-13)

- **Reply times now match what one person can keep.** They're the same on Pricing, Terms, the plan contract (panel) and the chat assistant:

  | | Operate | Optimise | Partner |
  |---|---|---|---|
  | Critical | next business day | same business day | 4 business hours |
  | High | 2 business days | next business day | same business day |
  | Normal | 3 business days | 2 business days | next business day |

  - Partner says "A few places only".
  - Emergency work outside business hours is by arrangement.
  - Existing signed plans keep their wording. The panel's plan contract uses the new times for new contracts.
- **One main action everywhere:** "Book a free 30-minute call".
  - "Tell us in writing" is now a quiet text link under it ("Prefer to write?").
  - The WhatsApp button appears only after the first screen.
  - The cookie notice is one slim line.
- **Deploy:** `supabase functions deploy assistant` (it now quotes the new reply times).

### 8bt. Tagline, AR card and phone QR (2026-10-13)

- **Tagline:** "AI for the work that drains your team." It's used on:
  - the homepage label, page title, share and search descriptions, the manifest and the brand notes
  - the business card and the /card page
  - the share image (`og-image.png`, cache-busted to v=5)
  - the social covers (Facebook, LinkedIn, X, Google), all regenerated from `scripts/brand/covers.html`
  - the video end cards

  "A person still checks it" stays as the supporting line.
- **Business card:**
  - Front: logo and tagline. Back: QR only.
  - The QR opens **/card**: a spinning 3D logo on a plain background, then Book a call, WhatsApp, and Save contact (`assets/re-charge.vcf`). The camera AR was removed: it was more friction than value.
  - Sources are in `scripts/card/`; print files are in `marketing/business-card/`.
- **Phone cover-screen QR:** `marketing/phone-qr/` (Z Flip 6, 720×748). It's the same QR code.
- **Scan counts:** in GoatCounter as `card-scan`, `card-book`, `card-whatsapp` and `card-save-contact`.

### 8bu. Service-first: promises, the Prove guarantee, the principle (2026-10-13)

- **Principle** (BRAND.md, internal): *Every client should get back more than they paid.* It's the test for every quote, scope and extra.
- **Promises** a client can check. They're on the homepage strip (with a link) and in How we work → Our promises:
  - we say if AI isn't worth it
  - you'll see the number
  - half back if the trial misses
  - you talk to the builder
  - fixed price, stop after any stage
  - you own it all
- **The Prove guarantee:**
  - One target is agreed in writing before Prove starts. It goes in the Project Order under "What we'll measure".
  - If the target is missed (measured the agreed way), 50% of the Prove fee is refunded within 10 business days.
  - It doesn't apply if the agreed data, access or people weren't available, or if the client changed the scope.
  - It's in Terms (stages), the Client Services Agreement 10.3, Pricing (reassurance line), METHOD.md and the chat assistant.
  - **In practice:** set a target you're confident of, from the Find measurements, and write down exactly how it's measured.
- **Deploy:** `supabase functions deploy assistant`.

### 8bv. Objections FAQ and the costing in the emailed estimate (2026-10-14)

- **Pricing → Questions** now answers the usual worries in the buyer's own words: too expensive, we already have a system, what if the AI gets it wrong, will it replace my staff, our data, information without a call, maybe next year, why trust you. The FAQ schema in the page head mirrors all 13 questions.
- **Emailed estimate** (calculator → "Email it to me"): besides what the work costs them, it now lists what fixing it costs, in the currency they saw:
  - the starting prices
  - an honest payback on a one-off automation
  - whether an AI plan's monthly fee makes sense at their figure
  - if the payback is over two years, it says it may not be worth doing yet
- **Deploy:** `supabase functions deploy project-intake`.

### 8bw. What happens on the call, call recaps, dated reply promises (2026-10-14)

- **"What happens on the call"** strip under every main Book button (homepage, Solutions, How we work, Examples, Pricing, Services):
  - you tell us about the work
  - we say honestly if AI fits
  - no slides, no pitch
  - you leave with a rough price, or an honest "not worth it"

  **Keep that last promise on every call.**
- **Call recap templates** (Messages → Process review). Send them the same day:
  - **Next step after the call** (email; upgraded in place if you never edited it): their problem in their own words, their numbers, the simplest fix, and Find at R15,000 (the old wording said R7,500), with a date for the quote.
  - **Recap after the call** (WhatsApp): the same, short.
  - **Honest: not worth it yet** (email): what you heard, why AI isn't worth it at their numbers, what to do instead. Sets a 90-day check-in.
- **Reply promise:** "within one business day, usually within the hour" became **"by 17:00 the next business day, often sooner"**. Every form's thank-you and the automatic emails show the actual date ("by 17:00 on Thursday 15 October"). It's changed everywhere: Terms, the footer form, the assistant and the emails. The panel's internal 1-hour target is unchanged; it's our own goal, not a promise.
- **Deploy:** `supabase functions deploy project-intake assistant`.

### 8bx. Meta Pixel, behind the cookie banner (2026-10-14)

- **Pixel 1138107772114810** is in `config.js` (`META_PIXEL_ID`; empty switches it off). It's a public ID, safe in the page.
- **Consent:** it loads only after the visitor taps Accept, the same as Google Analytics (POPIA).
  - The banner now asks about "Analytics and ad cookies".
  - Anyone who accepted before the pixel existed is asked once more. GA keeps running for them meanwhile.
- **What Meta sees:**
  - **PageView** on every page.
  - **Lead** when someone actually sends their details: any enquiry form, the mockup or Google profile request, or "Email it to me".
  - **Contact** when someone taps Book a call or WhatsApp.
  - Form answers are never sent to Meta.
- **Privacy notice** updated: Meta is listed as a provider, and section 7 explains the pixel. The line "we don't use advertising cookies" is removed.
- **In Meta Events Manager:** Test events → enter re-charge.co.za → accept the banner → you should see PageView.

### 8by. Try it on your own email (2026-10-14)

- **Where:** Examples → first section (`ai-demos#try`). The homepage's second button, "Try it on your email", goes straight there.
- **What it does:**
  - A visitor pastes one real customer email (optionally saying what their business does) and the live AI drafts the reply.
  - Anything it can't know, such as prices, dates or policies, appears as a highlighted [placeholder] and is listed under "You check before sending". That's the "a person still checks it" promise, shown on their own work.
  - "Use a sample email" cycles three examples for people who don't want to paste their own.
- **Behind it:** the `assistant` function's new draft mode (same ANTHROPIC_API_KEY).
  - Nothing pasted is stored or logged.
  - It's counted in `assistant_usage` under the scope `try-email`.
  - The privacy notice now lists Anthropic.
- **Limits (cost control):**
  - 5 tries per person an hour, 300 a day in total, with a friendly message when they're reached.
  - Each try costs well under R1 in AI usage, so the most it can cost is about R100 a day.
  - Change the limits with `DRAFT_PER_IP_HOUR` / `DRAFT_DAY` in `supabase/functions/assistant/index.ts`.
- **Events:** try-email-draft, try-email-copy, try-email-sample, try-email-error, cta-try-book. A completed draft is not a Meta "Lead", because nobody has sent us their details.
- **Deploy:** `supabase functions deploy assistant`.

### 8bz. Cold outreach: "try it on your own email" templates, and "we" wording (2026-10-14)

- **New templates** (Messages; added to your library automatically):
  - **First contact · Try it on your own email** (email and WhatsApp): sends them to `{{try_link}}` (re-charge.co.za/ai-demos#try) to paste one customer email and see the AI's reply. No call needed. It follows up in 4 days.
  - **AI follow-up · Try it on one email** (email and WhatsApp): the same link as a second nudge, for anyone who got a different first message.
- **New placeholder:** `{{try_link}}`.
- **Wording:** claims about the work now say "we", to match the site: "We build AI systems…", "We do websites…", "We help small businesses…". Personal lines stay "I" ("I came across…", "I'll send…"). Saved copies you never edited update themselves; edited ones are left alone.
- **POPIA reminder:** email a business's published general address about a relevant problem, keep to the follow-ups the templates set, and honour any "no".

### 8ca. Founding clients offer (2026-10-14)

- **The offer:**
  - The first 5 AI clients get Prove at half price (from R17,500 instead of R35,000), in return for being measured before and after and letting us share the result, named or anonymous.
  - Everything else stays the same, including half back if the trial misses its target.
- **It replaces the old website "limited offer"** (50% off Care, "websites from R1,000"). That offer's prices were out of date.
- **Switch it on:** Settings → Founding clients (turn the feature on under Features if the card isn't there).
  - Set Places to 5, an end date, and the discount on Prove (%).
  - If you saved the old offer before, its settings carry over (10 places, 30 November), so check them.
- **On the site:**
  - a gold banner on every page ("Founding clients · Prove at half price · N places left", linking to Pricing)
  - a Founding clients section on Pricing (`#founding`), with the live number of places left, in the visitor's currency
  - nothing shows while the offer is off
- **In the panel:**
  - **Tagging:** new leads are tagged while it runs. Tick "Founding client" on a lead to add or remove the tag.
  - **Quote:** an AI lead on the offer opens its quote with a "Founding client: 50% off Prove" line, set against R35,000. **Check it matches the Prove price you quote.**
  - **Places:** a place is taken when they pay the deposit.
  - **`{{offer_line}}`** now describes this offer.
- **Chat assistant:** knows the offer, and that it only applies while the banner shows.
- **Marketing copy:** `marketing/founding-offer.md` (LinkedIn, WhatsApp Status, one-liner). The old `limited-offer.md` is marked retired.
- **Deploy:** `supabase functions deploy assistant project-intake`.

### 8cb. Inbox Assistant: the productized way in (2026-10-14)

- **The product** (`inbox-assistant.html`, linked from the homepage "Start here" band and the top of Pricing):
  - **What it does:** AI drafts a reply to every routine customer email in the client's own Gmail or Microsoft 365. A person checks and sends.
  - **Price:** R9,500 setup, R2,950 a month. AI usage is included up to 1,500 emails a month. 3-month minimum, then month to month.
  - **Speed:** live in 10 business days, about an hour of the client's time.
- **Guarantee:** if it doesn't save 5+ hours a week after 30 days live, measured the way agreed on day one, the setup fee is refunded in full. It doesn't apply if the agreed access or information wasn't available.
  - **Day one is where you protect yourself:** time their current email handling properly, and write down the target and how it will be measured.
- **Qualifier:** 20+ customer emails a day. Fewer than that, say so on the call; the page and FAQ promise you will.
- **Proof on the page:** the "try it on your own email" widget (now its own script, `try-email.js`, shared with Examples).
- **Founding clients** now apply to the Inbox Assistant:
  - the first 5 get the setup free (discount 100%), and can stop with no minimum term if it misses the target
  - their quote includes the first month up front, which reserves the place (the place counts when it's paid)
  - Settings → Founding clients → "Discount on the setup"
- **Panel:**
  - **New plan:** "Inbox Assistant" (R2,950/month) for go-live, billing, the monthly report, weekly wins and contracts (3-month minimum, 1 hour of updates).
  - **Quote default:** AI leads about email or enquiries, or on the founding offer, now default to an Inbox Assistant option first.
  - **New placeholder:** `{{inbox_link}}`.
- **Outreach:**
  - **"First contact · Before you hire"** (email and WhatsApp), for businesses advertising an admin, reception or customer-service job. Fill in **[role]** before sending (the panel warns you if you don't).
  - **The weekly prospect finder** now searches job ads ("admin assistant vacancy <area>") and records the role, site and date as the AI signal, with the opportunity "Inbox Assistant, before they hire".
  - **The finder routine** had kept its own copy of the old, website-only instructions. It now uses `scripts/finder-routine.md` in full.
- **Deploy:** `supabase functions deploy assistant project-intake care-billing monthly-report weekly-wins`.

### 8cc. Promise late, deliver early; give first, ask last (2026-10-14)

Two working rules, written into BRAND.md and applied everywhere they touch a promise:

- **Promise late, deliver early.** Publish a timeline you can always beat, then beat it.
  - **Inbox Assistant:** "live within 15 business days". Aim for 10.
  - **Mockups:** "within 3 business days", with the dated promise now 3 business days out. Aim for 2.
  - **Replies:** "by 17:00 the next business day, often sooner". Aim for the same day.
  - The panel's internal targets stay the tighter ones.
- **Give first, ask last** (Inbox Assistant). It's set up on the client's real inbox and runs for two weeks at no cost.
  - **If it saves 5+ hours a week** (measured the way agreed in writing on day one): the setup is invoiced, and the R2,950 plan starts. The 3-month minimum counts from then.
  - **If it doesn't:** nothing is payable, and you disconnect it and delete the data.
  - It replaces the earlier "setup refunded" guarantee: nobody pays first, so there's nothing to refund.
  - It's in Terms (stages), on the page, the homepage band, Pricing, the chat assistant, the estimate email, the quote lines and the "Before you hire" templates. Saved copies of those templates update themselves if you never edited them.
- **Founding clients:** the first 5 who keep it get the setup free, even when it works. A place is taken when they pay their first month.
- **The cost to you is your time on trials that don't convert.** Qualify hard on the call: 20+ customer emails a day, Gmail or Microsoft 365, and someone who can give you an hour on day one.
- **Custom projects keep the 40% deposit.** "Give first" there means the free demos, the mockup, the demo assistant and the Prove half-back guarantee.
- **Deploy:** `supabase functions deploy assistant project-intake care-billing monthly-report weekly-wins` (the same list as 8cb, if not done yet).

### 8cd. Inbox Assistant delivery: Gmail (2026-10-14)

**How it works**
- A lead's page has an **Inbox Assistant** card (AI leads). From it you:
  - start a trial
  - make the client's **connect link** (copy it, or send it on WhatsApp)
  - write **what it may know**: prices, policies, hours, tone, sign-off
  - set the day-one numbers: minutes per email by hand, minutes to check, and the target hours a week
- **The client opens the link.** They sign in with the Gmail they answer customers from and press Allow. They land on the Inbox Assistant page with a "You're connected" note, and you get an email.
- **Every 10 minutes, `inbox-run`:**
  - looks at new inbox mail from the last 2 days, and skips newsletters, notifications, automatic replies, the client's own mail and threads already answered
  - drafts a reply with the AI from the client's facts, leaving [gaps] for anything it doesn't know
  - saves the reply as a **Gmail draft in the same thread** and labels the email **"AI draft ready"**
  - never sends anything
- **Measuring:** when a draft disappears, it checks whether a reply went out in that thread and how much of the draft survived:
  - **≥75% the same:** counts the full saving
  - **40–75%:** counts half
  - **less, or not sent:** counts nothing
  - **untouched for 7 days:** counts as not used
- **The card shows hours saved in the last 7 days against the target, and the trial day (of 14).** At day 14 it tells you which way it went: send the quote, or switch it off.
- **Privacy:**
  - no email bodies are stored
  - the draft text is kept encrypted until it's measured, then deleted
  - Google tokens are encrypted
  - the privacy notice has a Gmail section with Google's "Limited Use" statement

**One-time setup (about 30 minutes)**
1. **Database:** paste `supabase/migrations/0027_inbox_assistant.sql` into the Supabase SQL editor and run it. It also schedules `inbox-run`.
2. **Google Cloud** (console.cloud.google.com, signed in as the Re-Charge Google account):
   1. Create a project called "Re-Charge" (or use the existing one).
   2. **APIs & Services → Library → Gmail API → Enable.**
   3. **OAuth consent screen:**
      - User type: External
      - App name: Re-Charge
      - Support email and logo
      - Home page: https://re-charge.co.za
      - Privacy policy: https://re-charge.co.za/privacy
   4. **Scopes:** add `.../auth/gmail.modify`, `openid` and `email`.
   5. **Publishing status: press "Publish app" (In production).** In "Testing", Google expires the access after 7 days, which would break every trial.
   6. **Credentials → Create credentials → OAuth client ID → Web application.** Authorised redirect URI: `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/inbox-oauth-callback`
3. **Secrets** (Command Prompt, in the project folder). First run `supabase secrets list` to see what's already there.
   - **If `TOKEN_ENCRYPTION_KEY` already exists, don't change it.** Changing it makes stored tokens unreadable. If it doesn't exist, make one in PowerShell:
     `[Convert]::ToBase64String((1..32 | % { Get-Random -Maximum 256 }) -as [byte[]])`
   - Then:
     `supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… TOKEN_ENCRYPTION_KEY=…`
     (the client ID and secret come from step 2.6).
4. **Deploy:** `supabase functions deploy inbox-connect inbox-oauth-callback inbox-run`
5. **Dry run on your own inbox** before any client:
   1. Make a lead for yourself with the category "AI".
   2. Start a trial and connect your own Gmail.
   3. Send yourself a customer-style email from another address.
   4. Press **Check their inbox now**.
   5. Open Gmail: the email should have the label, and a draft reply should be in the thread.

**What clients will see, and what that means for you**
- **Until Google verifies the app,** the consent screen says "Google hasn't verified this app". The client clicks **Advanced → Go to Re-Charge**. Tell them before they open the link.
- **Unverified apps are limited to 100 users.** That's plenty for founding clients.
- **Verification** for the Gmail permission includes a paid security assessment. Plan it once you have about 10 paying inboxes.
- **Clients on Google Workspace:** their admin may need to allow the app under *Admin console → Security → API controls → App access control*, by trusting the OAuth client ID.
- **AI cost:** about R0.50 per drafted email (Claude Opus 5.5, low effort; skipped mail costs nothing unless the AI has to judge it). At 1,500 emails a month that's about R750, inside the R2,950 plan.

### 8ce. Inbox Assistant: Microsoft 365, and results in the reports (2026-10-14)

**Microsoft 365 / Outlook works like Gmail.**
- On the lead's Inbox Assistant card, make a **Connect link: Microsoft 365** instead of Gmail.
- The client signs in with their work or Outlook account and presses Accept.
- Drafts go into the thread via Outlook's own "reply". The email gets the category **AI draft ready**, and sent replies are measured from Sent Items.
- **One engine serves both:** `inbox-run` doesn't care which provider a client uses (`_shared/inbox_providers.ts`).

**One-time Microsoft setup (about 15 minutes)**
1. **Register the app:** portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
   - Name: Re-Charge
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI (Web): `https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/inbox-oauth-callback` (the same address as Google)
2. **Client secret:** Certificates & secrets → New client secret (24 months) → copy the **Value** straight away. **Put a calendar reminder 23 months out to renew it.**
3. **Permissions:** API permissions → Add → Microsoft Graph → **Delegated**: `Mail.ReadWrite`, `offline_access`, `User.Read`.
4. **Branding:** logo, home page and privacy link (https://re-charge.co.za/privacy).
5. **Secrets:**
   `supabase secrets set MS_CLIENT_ID=<Application (client) ID> MS_CLIENT_SECRET=<the secret value>`
6. **Deploy:**
   `supabase functions deploy inbox-connect inbox-oauth-callback inbox-run weekly-wins monthly-report`

**What business clients may see:** many company Microsoft accounts don't let staff approve outside apps themselves, so the client sees "Need admin approval". Their IT person approves it once through `https://login.microsoftonline.com/common/adminconsent?client_id=<your client ID>`. Later, **publisher verification** (free, through a Microsoft Partner Network ID) removes the "unverified" label.

**Results in the reports.** Clients with a live Inbox Assistant (on the client, or on any of their leads) now get:
- **Weekly email:** "N customer emails drafted for your team, M of them sent" and "about H hours of typing saved on email". Hours are claimed only when it's at least one hour, and counted only from drafts that were sent.
- **Monthly report:** a "Your Inbox Assistant" block (drafted, sent, hours saved) at the top.
- The rule is the same as the panel card: nearly as written counts the full time, after edits counts half, and anything else counts nothing.

### 8cf. The Inbox Assistant page: no Google Cloud needed (2026-10-14)

**The product is now a private page, not a Gmail connection.** Each client gets `https://re-charge.co.za/trial?t=<their-code>`, set up with their prices, policies and sign-off.
- **Using it:** they paste a customer email and get the reply in seconds, with real prices, [gaps] for anything unknown, and a short "before you send" list. They copy it into their email and send.
- **Measuring it:** under each reply they tap **Sent it as is / Sent it after edits / Didn't use it**. Those taps are the measurement: as is counts the full time saved, after edits counts half, and not used counts nothing. They feed the panel card, the weekly email and the monthly report like before.
- **What they see:** the page shows their own numbers for the week.
- **Privacy:** no email text is stored, only a one-line note of what each email was about.
- **Caps:** 250 replies a page a day, and 40 an hour per person.
- **Search engines:** the page is hidden from them.

**How you use it**
1. **Set it up:** on the lead → **Inbox Assistant** card → **Set up their Inbox Assistant page**.
2. **Fill it in:** under **What it may know**, add prices, hours, policies and tone, plus the sign-off. Save.
3. **Send it:** use **Send on WhatsApp**, or copy the link.
4. **Watch it:** the card shows the week's replies, how they were used, and hours saved against the 5-hour target. At day 14 it tells you whether to quote.
5. **Pause or resume:** at any time. A paused page shows a "paused" note.

**Promise:** the page is ready within 3 business days (aim for the next day). The site, Terms, templates and chat assistant all say this now.

**Gmail connection: dropped** (no Google Cloud). **Microsoft 365 stays optional:** for clients who want the drafts waiting in their inbox, the card has "Optional: drafts straight into their Microsoft 365 inbox", which needs the Microsoft setup in 8ce. Their page keeps working either way.

**Setup**
1. **Database:** paste and run **`0027_inbox_assistant.sql`**, then **`0028_inbox_trial_page.sql`**, in the Supabase SQL Editor.
   - 0027 also schedules the inbox checker. It only does anything for Microsoft inboxes, so leaving it is harmless.
2. **Deploy:**
   `supabase functions deploy inbox-trial assistant weekly-wins monthly-report --project-ref aqwdncyihcbktbbuvvzd`
   - No new secrets: it uses the `ANTHROPIC_API_KEY` you already have.
3. **Test it on yourself:**
   - make a lead for yourself and set up its page
   - fill in some real prices
   - open the link on your phone and paste a customer email

### 8cg. Live demos: a page per prospect where they watch AI do their work (2026-10-14)

**What it is.** A public page, `https://re-charge.co.za/live-demo?d=<code>`, with ten realistic examples of the prospect's own work and a **Run AI** button. They watch it work through each one, then see the numbers: what was done, what still needs a person, which are urgent, and the time saved on these ten, a day and a month at their volume. A switch lets the AI send the safe replies itself.

**Five kinds:**
- **Email automation:** drafts replies, forwards to the right person, files into folders, and **summarises long threads** (what it's about, what's agreed, what's still open, why it matters to you, what you need to do).
- **Invoice capture:** reads the amounts and fields, flags duplicates and odd amounts, files them.
- **Website enquiries:** answers, offers bookings, qualifies big jobs for a call.
- **Google reviews:** replies, thanks, alerts the manager about complaints, spots recurring themes.
- **Staff questions:** answers from their documents (and says which one), or says honestly who to ask.

**Samples** (no setup needed): `live-demo?sample=email` (or invoices, enquiries, reviews, questions). They're linked from the top of the Examples page.

**How you use it**
1. Lead page → **Live demo** card → pick what it shows.
2. Enter roughly how many come in a day, minutes each by hand, what comes in, who handles what, and what it may know. Don't paste real customer details: the page is public to anyone with the link, and the AI writes made-up examples.
3. Press **Build the demo** (up to a minute). Open it, check it, then **Send on WhatsApp**. Edit and rebuild any time; the link stays the same.
4. The card shows when it was opened.

**Thread summaries on the client's own page too.** Their Inbox Assistant page now has **Summarise a long thread** next to **Write the reply**: paste a whole thread and get the same five-part summary. Only a one-line note is stored. "Yes, useful" counts like a reply used.

**Setup**
1. **Database:** paste and run **`0029_live_demos.sql`** in the Supabase SQL Editor.
2. **Deploy:**
   `supabase functions deploy live-demo inbox-trial --project-ref aqwdncyihcbktbbuvvzd`
   - No new secrets.

**Update (same day):**
- **One screen:** the live demo page fits on one screen with no scrolling, on desktop and phone. Tapping an item opens it over the list.
- **Problem-first titles:** the samples are headed by the problem they solve; a prospect's own page still leads with their business name.
- **Examples page:** "Watch it work" (the five live demos) now replaces the old "Retyping emails" and "Finding answers" examples. Old links to those still land on the matching card.
- **Each example has its own look:**
  - **Email:** a mail app whose folders fill up as it files.
  - **Invoices:** paper documents with rubber stamps.
  - **Enquiries:** a chat app.
  - **Reviews:** star-rated review cards with the owner's response.
  - **Staff questions:** a team chat that shows the source document.

  Missed calls, the Q&A assistant and meeting notes on the Examples page got the same treatment: a phone screen with a handwritten job card, a messenger window, and a call with a notes document. So did "More examples": chasing customers is a Trello-style sales board, customer feedback is a pink report with quotes as comment cards, and writing posts shows the draft as the real post (LinkedIn, Instagram, Facebook or an email, depending on the channel picked). A demo you build for a prospect uses the look for its kind automatically.

**Update: two more kinds, calls and meetings (redeploy `live-demo`).**
- **Phone calls:** the calls nobody could pick up, answered by the AI. Each call shows its transcript on a phone screen, a handwritten job card, and the SMS that went out: booked with a confirmation, emergency sent to the on-call person, question answered, message taken, or a call back needed.
- **Meeting notes:** ten moments from one meeting. The AI picks out decisions, to-dos with an owner and due date, risks, and the follow-up email, filling in a notes document. "How many a day" means meetings a day here.
- Both are in the panel's **What it shows** list and on the Examples page (`live-demo?sample=calls`, `?sample=meetings`).
- **Changing the kind:** you can change **What it shows** on a demo you've already built. Save and rebuild, and the link stays the same.
- **Switching samples:** the sample page lists every example in one row of tabs at the top (it scrolls sideways on phones). Tapping one switches in place, without reloading. A prospect's own page has the same row: their demo comes first, marked "Yours" with a star, then the other kinds as samples. Their link never changes.
- **Deploy:** `supabase functions deploy live-demo --project-ref aqwdncyihcbktbbuvvzd`. Until you do, the sample pages work but building a calls or meetings demo for a prospect will fail.
- **UX pass on the live demo:**
  - Before the first run, the Run AI button pulses gently and the empty numbers are dimmed.
  - While it runs, a progress line fills along the top of the list, and the button becomes **Skip to results**.
  - After the run, the call to action lights up and says how many minutes it just saved ("That's 21 minutes back on 8 enquiries…").
  - When reading an item, ‹ › buttons (and the arrow keys) step through the items without going back to the list. On phones the item takes the whole space while you read it.
  - On tall phones, every kind shows its preview line.
  - The cookie notice no longer covers "Book a free call".

### 8ch. The live AI switch, and one place per example (2026-10-15)

**Every example works without paying for AI.** `AI_LIVE` in `config.js` decides whether the public site calls the real AI. It's `false` for now, so nothing on the public site costs you anything:
- **"Try it on your own email"** (Examples and Inbox Assistant pages): the three sample emails get ready-written replies, with gaps and a "you check before sending" list, exactly as the real thing shows them. If a visitor pastes their own email, they get a button to send it to you on WhatsApp. You reply with the draft by 17:00 the next business day: give first, at no AI cost to you.
- **"Ask us anything"** (Examples, Solutions and website-demos pages): the suggested questions answer instantly from prepared answers. These are written from the same facts the assistant uses, so update them in `script.js` (`QUICK`) when prices change. Anything typed in freely goes to a person on WhatsApp.
- **Wording:** the "Live AI" and "real AI" labels only show when it's on; while it's off they read "Sample replies" and "Quick answers".
- **Panel:** templates with `{{try_link}}` show a note while it's off, suggesting you reword "in 30 seconds".

**Switch it on:**
1. Supabase dashboard → Project Settings → Edge Functions → Secrets → add `ANTHROPIC_API_KEY` (from console.anthropic.com). Never paste the key into a chat or a commit.
2. Run the `assistant_hits` table SQL from 8ak if you haven't (migration 0023), then deploy:
   `supabase functions deploy assistant live-demo inbox-trial --project-ref aqwdncyihcbktbbuvvzd`
3. Test it yourself: on re-charge.co.za/ai-demos, open the browser console and run `document.documentElement.classList.add('ai-on')`, then try both widgets.
4. When both answer, set `AI_LIVE: true` in `config.js` and push.

**The same key powers your AI tools in the panel:** building live demos for prospects, and clients' Inbox Assistant pages. Those don't work until step 1 and 2 are done either, whatever `AI_LIVE` says.

**One place per example:** the Examples page no longer has its own phone-call and meeting demos; the live demos cover both, better. Old links to the removed examples (and to "Retyping emails" and "Finding answers") now go straight to the matching live demo. What stays on the Examples page is what live demos can't do: your own email, ask us anything (both hidden until AI is on), and the three folded "More examples".

**Update: three more kinds (redeploy `live-demo`).**
- **Follow-ups:** open quotes on a sales board, with how long each has been quiet. The AI drafts follow-ups from what the customer last said, spots the ones ready to buy, waits on the fresh ones and closes the cold ones kindly.
- **Customer feedback:** comments from surveys, Google and WhatsApp, sorted into what to fix (and who owns it), recurring themes, quotes worth sharing, ideas and replies.
- **Posts:** a month's content calendar. Each post is written for its channel (LinkedIn, Instagram, Facebook or newsletter) and shown as it will look there.
- **Examples page:** now opens with **Watch it work**, all ten live demos, then "Your own email" and "Ask us anything". The old folded "More examples" were replaced by these live versions; links to them go to the matching live demo.
- **Panel templates:** the "try it on your own email" templates were reworded so they're true whether the AI is on or off. Saved copies with the old wording update themselves.

### 8ci. The paper redesign: the site no longer looks AI-built (2026-10-15)

After feedback that the site "looks like it was built by AI", the public site moved off the dark AI-startup look:
- **Look:** a warm paper background, one brand colour (charge green `#c6ec3a`), Fraunces serif headings with Work Sans text, and plain ink buttons.
- **Removed:** glow, frosted glass, grain and monospace capital labels.
- **Homepage:** rebuilt with one idea per section and a real screenshot of the inbox demo. Three marked spaces wait for your photos: hero, working with a client, and a detail shot.
- **How it's built:** the paper theme is a layer at the end of `styles.css`, so every page picks it up. The live-demo app screens stay dark on purpose: they're shown like screenshots of real software.
- **Admin panel and client dashboard:** these keep the old dark look via a frozen copy, `admin/site-base.css`. Change the panel's look there, not in `styles.css`.
- **Images for now:** real screenshots of the demos on a phone frame (hero and end) and a hand-drawn-style process map (`assets/art/process-map.svg`). No AI-generated photos: fake people would undercut the "real" feel. When you have real photos (hero.jpg, at-work.jpg, detail.jpg in `assets/photos/`), ask to have them swapped in; the spots are marked in `src/index.body`. The preview page `home-preview.html` can be deleted once you're happy.

**Update: mono theme to match the "Let's Build" videos.**
- **Look:** near-white `#f7f7f7` and near-black `#1a1717`, with no accent colour. Headlines are heavy, wide and uppercase (Archivo, expanded) with bracketed subtitles like "(Let AI do the typing)". Buttons are black pills, small labels carry the ↘ arrow, and the logo is the dark app-icon tile.
- **Homepage, borrowed from the deck:** numbered sections (01, 02, 03), the four-step plan with grey circles (incoming email → classification → routing → response), and the before/after pair as a light card next to a black one.
- **Where it lives:** the "MONO THEME" block at the end of `styles.css` and `home.css`.

**Update: images from the Let's Build deck, footer bubbles, general wording.**
- **Images:** the homepage uses three cut-outs from the presentation in `assets/art/`: the reaching hands (hero band), the fist bump (before and after) and the robot reaching up (one developer). They're probably Canva elements: Canva's licence covers use in your own designs, including your website.
- **Footer:** social links are round bubbles with the platform logo. LinkedIn is live; **Facebook appears once you set `FACEBOOK_URL` in `config.js`**. The footer email is enquiry.re.charge@gmail.com.
- **Homepage wording:** "How it works" and "Before and after" are written for any kind of work (emails, invoices, calls, messages, documents), not just email.
- **Header:** the gap above it is gone. It came from the skip link taking up space; that link is now out of the flow and only shows on Tab.
- **The problem section:** the homepage now opens with "01 The problem", using the overflowing-inbox laptop from the deck (its background made transparent so it sits on the page).
- **Image motion (`home.js` + the end of `home.css`):** each image animates as it scrolls into view.
  - **Reaching hands:** they're split down the middle; the halves glide together, then drift gently.
  - **Fist bump:** the arms slide in and meet with a small bump.
  - **Laptop:** it rises into place, then floats.
  - **Reduced motion:** visitors who ask their device for less motion see still images.
- **Homepage as slides:** each section fills exactly one screen and delivers one idea. There are eight:
  1. Everything in one: what, how, the offer and the call.
  2. The problem.
  3. How it works.
  4. See it.
  5. Before and after.
  6. Why us.
  7. Start here, with prices.
  8. The ask.

  Checked at five screen sizes from 360×740 to 1920×1080. The hands sit behind the text, see-through (more so on phones). The fist bump was removed at your request; the before/after uses the paper stack and the flickering ticked envelope.
