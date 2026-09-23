# Re-Charge Admin Panel — Design

A private, login-protected control room at **`/admin/`** on re-charge.co.za, from
which the whole business is run: every lead and project, every client, every
payment, and every email/WhatsApp you send — in one place, on desktop or phone.

This document is the full plan for review. Nothing here is built yet. It is
grounded in what already exists: the Supabase database (`supabase/migrations/`),
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

**Not in scope for now** (all possible later, listed in §9): client-facing portal,
automated WhatsApp sending, quote PDFs, calendar sync, more than one staff user.

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
3. **Apply the migration + deploy the function** (from your repo folder, same
   as before):
   ```
   supabase db push
   supabase functions deploy send-message
   ```
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
6. *(Recommended)* **Auth emails via Resend**: Supabase → Authentication → SMTP
   Settings → enable custom SMTP: host `smtp.resend.com`, port `465`, user
   `resend`, password = your Resend API key, sender `no-reply@re-charge.co.za`.
7. *(When ready, unrelated to the admin but unlocks "Deposits" automation)*
   Yoco webhook → `YOCO_WEBHOOK_SECRET`, and set `CHECKOUT_ENDPOINT` in
   `config.js` (both already documented in `BACKEND.md`).

---

## 9. Build plan

Each phase ships on its own and is useful on its own.

| Phase | Contents | New backend | Effort |
|---|---|---|---|
| **A — Core** | Migration `0003`; `/admin/` shell + sign-in + staff gate; Overview (KPIs, needs-attention, activity); Pipeline list + board + filters; Add lead; Project detail with stage changes, notes, quote, next action, submission view; mobile layout | migration only | 1 working session |
| **B — Comms** | Templates screen + seeded set; `send-message` function; Email send flow with preview; WhatsApp pre-fill flow; send log on timeline; Settings | `send-message` | 1 session |
| **C — Money & clients** | Payments screen, record EFT, match Yoco payments; Clients CRUD, care renewals, convert-to-client; revenue KPIs; switch on Yoco webhook + per-project checkout | none new (activation only) | 1 session |
| **D — Later** (optional) | Embed the analytics dashboard per client; quote PDF from a project; "Schedule a call" → calendar (.ics) + reminder; client portal (`client_users` already exists); second staff user; WhatsApp Business API | varies | as needed |

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
