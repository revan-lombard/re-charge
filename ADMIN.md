# Re-Charge Admin Panel — Design

A private, login-protected control room at **`/admin/`** on re-charge.co.za, from
which the whole business is run: every lead and project, every client, every
payment, and every email/WhatsApp you send — in one place, on desktop or phone.

> **Status: Phases A, B, C, Marketing, Sites and the automatic mockup builder built and deployed.** A (sign-in,
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

### 8g. Automatic mockup builder

A scheduled Claude session (Opus) builds queued mockups by itself: it reads the
brief from `build-queue`, builds a one-page site from `previews/_template/`
following `previews/GUIDE.md`, checks it in Chromium at phone and desktop
widths, commits it to `previews/<slug>/` on `main`, and reports back. The lead
then shows "Mockup built — review before sending" on the Overview; you open
it, and press **Email the link** (the "Mockup ready" template). Nothing goes
to the prospect automatically.

Setup:
1. Make a secret: any long random string (e.g. `openssl rand -hex 32`, or a
   password generator). Put it in `supabase\.env` as `BUILD_SECRET=…` and run
   `supabase secrets set --env-file supabase\.env`.
2. From the repo folder: `git pull`, `supabase db push` (`0009_autobuild.sql`),
   `supabase functions deploy build-queue`.
3. In the Claude Code **cloud environment** the builder runs in ("Default"):
   open the environment menu in the session title bar → Edit →
   **Environment variables**: add `BUILD_SECRET` (same value as above) and
   `GITHUB_TOKEN` (the same fine-grained token used for Sites — the builder
   pushes mockups with it); and **Network access**: allow
   `aqwdncyihcbktbbuvvzd.supabase.co` (or choose the broader access level).
   Without these the builder can't reach the queue or push, and says so in its
   summary instead of building.
4. Enable the Routine **"Re-Charge: build queued mockups"** (created paused,
   model Opus, hourly on weekdays 06:00–20:00 SAST; it exits in seconds when
   the queue is empty). Routines live in the claude.ai sidebar; you can also
   run it once by hand from there to test.

Queueing: on a lead → **Queue mockup build** (needs a business name); or
Settings → "Queue every new free-mockup request automatically". Spam-flagged
leads are never queued. States: queued → building → built / failed → reviewed.
"Rebuild" re-queues; builds stuck over 3 hours are re-queued automatically.

Costs: each hourly run is a short cloud session (a few seconds when idle,
roughly 10–20 minutes for a build). Pause the Routine any time.

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
