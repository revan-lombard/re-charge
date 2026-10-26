# Re-Charge: AI for the work that drains your team

Website, admin panel and backend for **Re-Charge**, a small AI and automation studio in
Johannesburg working with businesses anywhere. The main offer is the **Inbox Assistant**:
routine customer emails drafted from the client's own prices and policies, checked and sent by
their team. R9,500 setup + R2,950 a month, ready in 3 business days, with a R1,500 deposit that's
refunded in full if it doesn't save the team 5 hours a week. Bigger work (WhatsApp and enquiry
assistants, invoice capture, automations, dashboards, websites) is quoted at a fixed price.

The owner's manual (how to run the business from the panel, every setting and every step) is
**ADMIN.md**. The backend is described in **BACKEND.md**, the brand in **BRAND.md**, the method in
**METHOD.md**, and going live on the domain in **DEPLOY-DOMAIN.md**.

## What's where

| Path | What it is |
|---|---|
| `src/*.body`, `src/*.body.head`, `src/header.html`, `src/footer.html` | The source of every public page. Edit these, never the built `.html` in the root |
| `*.html` (root) | The built pages that are published |
| `styles.css`, `home.css` | One stylesheet for every page, plus the homepage slides |
| `script.js`, `config.js` | Site behaviour (forms, chat, calculator, currency, tracking) and its settings |
| `live-demo.js`, `live-demo-samples.js` | The interactive demos (`live-demo?sample=…`) and their sample businesses (all made up) |
| `try-email.js`, `trial.js` | "Try it on your own email", and the client's private Inbox Assistant page |
| `admin/` | The admin panel (command centre). Demo mode: `/admin/?mock=1` |
| `supabase/functions/`, `supabase/migrations/` | Edge functions (forms, AI, billing, quotes, Facebook, the AI hub) and the database |
| `hub/` | The office-PC AI hub kit (the worker that collects website and panel AI jobs and call recordings) |
| `scripts/` | Generators and capture scripts (industry pages, FAQ data, 404, sitemap, images) |
| `marketing/` | Print files, social images and the Google Business Profile kit |

## Build the pages (after editing anything in `src/`)

```
python3 scripts/gen_industry.py && python3 scripts/sync_faq_ld.py
for f in src/*.body; do n=$(basename $f .body); bash src/build.sh $n $f > $n.html; done
python3 scripts/build_404.py && python3 scripts/sitemap.py
```

- `gen_industry.py` writes the five industry pages (`for-accountants`, `for-salons`, `for-plumbers`,
  `for-restaurants`, `for-cleaners`).
- `sync_faq_ld.py` copies each page's visible FAQ into its search-engine data.
- `build_404.py` builds the 404 page from the shared header and footer.
- `sitemap.py` writes `sitemap.xml` with dates from git.
- After changing a CSS or JS file, bump its `?v=` in `src/*.body.head` (and `scripts/gen_industry.py`)
  so returning visitors get the new file.

Run it locally: `python3 -m http.server 8199 --directory .` and open http://127.0.0.1:8199/.

## Publishing

`main` is published by GitHub Pages at re-charge.co.za (`CNAME`). `_config.yml` keeps the notes,
sources and backend off the website. With GitHub Pro the repo can be private and the site stays
public (DEPLOY-DOMAIN.md). Cloudflare Pages is the free alternative (Path B; `scripts/cf-build.sh`
and `_headers` are ready for it).

## To do (owner)

Updated 16 October 2026, after the final pre-launch review. Ticked items are done.

### Before you push for clients
- [x] **Run the database updates** in the Supabase SQL Editor, in order: `0027` to `0035` (done 19 October 2026) in `supabase/migrations/` (each is safe to run twice). 0034 comes from the final review: billing that can't double-charge and form limits. 0035 lets the office PC collect its AI jobs.
- [x] **Deploy all functions:** `supabase functions deploy` (done 20 October 2026, with the Inbox Assistant fixes, ADMIN.md 8dc). Redeploy after any later change to `supabase/functions/`.
- [ ] **The Sales desk** (27 October 2026, ADMIN.md 8dh): run `0038_sales_desk.sql` in the Supabase SQL Editor, then `git pull` and `supabase functions deploy`. Researched prospects appear on Today.
- [x] **Learning and re-drafting** (done 26 October 2026, ADMIN.md 8dg): run `0037_inbox_examples.sql` in the Supabase SQL Editor, then `git pull` and `supabase functions deploy`.
- [x] **The switch to the home PC** (done 20 October 2026, ADMIN.md 8dd):
  - In the Supabase SQL Editor, run `0036_hub_priority.sql` (clients and the chat go before background work).
  - `git pull`, then `supabase functions deploy`. The Inbox Assistant and the demo builder then run on the home PC, with no Anthropic key.
  - Leave `ANTHROPIC_API_KEY` and the `…_CLAUDE_FALLBACK` switches unset (`supabase secrets list` to check).
- [ ] **Secrets** (`supabase secrets set …` in your own terminal; never paste a key into a chat or a commit):
  - `LOCAL_AI_TOKEN` (the AI hub's password; don't set `LOCAL_AI_URL`, the PC now collects its jobs). Everything that uses AI runs on the home PC, so there's **no `ANTHROPIC_API_KEY`** (ADMIN.md 8dd).
  - `TOKEN_ENCRYPTION_KEY`, `FB_APP_ID`, `FB_APP_SECRET` (Facebook posting); optional `FB_PAGE_ID`
  - optional, only for drafts straight into a client's Microsoft 365 inbox: `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (plus `TOKEN_ENCRYPTION_KEY` above), after the Microsoft app setup (ADMIN.md 8ce)
  - `SYNC_SECRET` is now required for the analytics pull
  - optional: `INBOX_TRIAL_PER_IP_HOUR`, `INBOX_TRIAL_PER_PAGE_DAY`, `ALLOW_ORIGIN`
  - leave `CLAUDE_FALLBACK`, `ASSISTANT_CLAUDE_FALLBACK` and `INBOX_CLAUDE_FALLBACK` off, so nothing ever costs API money
- [x] **Not VAT-registered** (confirmed 19 October 2026). The site says "No VAT is added: we're not VAT-registered". If you register later, tell me and I'll change it everywhere.
- [x] **Partner plan reply time:** "within 4 business hours" stays (confirmed 19 October 2026).
- [ ] **Paystack go-live key**, for the monthly plans' saved-card billing.
- **Before every Inbox Assistant setup, take the R1,500 deposit** on the lead's Inbox Assistant card. **Send a card payment link** makes a Yoco link (Yoco is already set up, BACKEND.md), which is marked paid by itself. **They paid by EFT** records a bank transfer. Either way it's recorded as a **Deposit**, so the post-trial quote doesn't ask for a second one.
- [x] **Panel settings** (done 19 October 2026): Settings → Contracts → **Bank details** (the deposit and balance messages now use them), and Settings → Your details: your name and signature.
- [ ] **WhatsApp Business greeting and away message** on 072 237 5833, e.g. "Thanks! A person will reply by 17:00 the next business day. Meanwhile, see it work: re-charge.co.za/ai-demos".
- [ ] **Google appointment schedule:** turn on the phone-number field, so people can ask to be phoned.
- [ ] **Google Business Profile:** follow `marketing/google-profile/README.md` (new category, description, services, the 12 photos, the offer).

### Keeping Re-Charge separate from your employer (DEPLOY-DOMAIN.md, last section)
- [ ] If you're moving the repo to a new GitHub account, **transfer it first** (repo Settings → General → Danger Zone → Transfer ownership), then tell me the new name: the panel's publishing secrets (`GITHUB_REPO`, a new `GITHUB_TOKEN`), the two Re-Charge routines and the docs need it.
- [ ] **Get GitHub Pro** on the account that owns the repo, then **make the repo private** (DEPLOY-DOMAIN.md, "Make the repo private"). The site stays on GitHub Pages.
- [ ] Use personal or Re-Charge accounts (not work ones) for GitHub, Claude, Supabase, Yoco, Paystack, Meta, Google, GoatCounter and the domain; turn on two-factor login. (Tailscale and Cloudflare aren't needed any more.)
- [ ] **Rename the GoatCounter code** (it's your name) and tell me the new one, so I can update the site.
- [ ] Work on your own computer and home internet, not a work laptop or network.

### The office PC (AI hub), per `hub/README.md`
- [x] Ollama with Llama 3.1 8B, running (your "Local Llama 3.1 API" handover). The worker finds it by itself and asks for the 8,192-token context the website chat needs.
- [ ] Python, `hub-token.txt`, `start-hub.bat` in Startup (no tunnel needed: the PC collects its jobs, `hub/README.md`)
- [ ] Before each hub update: `git pull` on the PC, then close and restart start-hub.bat
- [ ] **Keep the PC on during business hours** (a small UPS, and "power on after power loss" in the BIOS): clients' Inbox Assistant pages and Microsoft 365 drafts now run on it, and say "offline" while it's off (`hub/README.md`)
- [ ] Tonight: `git pull` and restart start-hub.bat, so the worker is version 5 (it gives Ollama the shape of each JSON answer)
- [ ] Whisper (ggml-small) and `winget install ffmpeg`, for call notes
- [ ] Set Ollama's defaults to match the worker: Windows user variables `OLLAMA_CONTEXT_LENGTH=8192` and `OLLAMA_KEEP_ALIVE=-1`, then restart Ollama; `ollama ps` should show 100% GPU and context 8192 (`hub/README.md` step 2)
- [ ] Keep Ollama's debug logging off (don't set `OLLAMA_DEBUG`), so no visitor text stays on the PC
- [ ] Close the Cloudflare quick tunnel when you're not using your /chat API for something else: the website doesn't need it (`hub/README.md`, "Your Llama /chat API")

### Facebook
- [ ] Create the Meta app, set its secrets, then connect the Page in the panel (Settings → Facebook); set `FACEBOOK_URL` so the footer shows the Page.

### When you have them
- [ ] A **business email** (then point every account at it and update `CONTACT_EMAIL` in `config.js`).
- [ ] The **company registration number** (for the Terms, quotes and invoices).
- [ ] **Photos:** a phone, an envelope, an invoice, a hand typing, trade tools, and high-resolution versions of the hands and the paper stack. Optional: one photo of you working, for the Google profile only.
- [ ] Your **first client result**, measured before and after, for the site (with their OK).
- [ ] Fix the "@re-chare-ai" typo in the deck.
- [ ] Allow image sites in the environment's network settings if you want me to source stock photos.

### Next: ready-made tools and an AI checker (ideas to plan, not yet planned or built)
Start once the Inbox Assistant has a few paying clients with measured results.
- [ ] **A catalogue of ready-made tools.** Each one solves one named problem at a fixed price, the way the Inbox Assistant does.
  - Candidates: the ten kinds of work on `ai-demos` (emails, WhatsApp enquiries, calls, invoices, quote follow-ups, meetings, reviews, questions, posts, feedback).
  - Each tool comes in sizes: **person** (one inbox), **team** (a shared inbox, routed) and **company** (several departments, connected to their systems).
  - A tool makes the list only if it:
    - solves a problem many businesses share;
    - shows its value in hours or rand;
    - runs on the shared engine (sort, draft from their own facts, a person checks);
    - can be set up in under a week;
    - is low-risk when the AI is wrong;
    - works with what clients already use.
  - Let demand pick the order: when two or three clients ask for the same custom build, it becomes a tool.
- [ ] **Custom builds alongside the tools**, quoted at a fixed price as now, but built on the same engine and patterns, so there's one way of working to look after.
- [ ] **A standard for everything we build** (tool or custom). Each one comes with four things, which the AI checker reads:
  - a daily check-in ("ran, handled 34, 0 errors");
  - a few test cases;
  - a list of what it depends on (Gmail, Microsoft 365, WhatsApp, Paystack, Yoco, Supabase, the AI model);
  - the one figure that proves its value.
- [ ] **An AI checker**, run weekly as a routine, writing one report in the panel: green, amber or red per client and tool. It covers:
  - **Working now:** automatic checks (check-ins, a weekly test email through each setup). The AI only reads and summarises them. The site monitor, AI job log and PC check-in are already pieces of this.
  - **About to change:** it reads the changelogs and deprecation notices of everything the tools depend on, matches them to the dependency lists, and says which clients are affected and what the fix is.
  - **Still good:** it samples each tool's work (drafts the client rewrote heavily, jobs it couldn't handle, hours saved) and flags anything slipping. Before any switch to a newer AI model, it compares old and new on the test cases.
  - **Rules:** it drafts fixes for a person to approve and never changes a client's system itself; it gets read-only access to as little as possible. Like the BIMTools Help Center routine: check, draft, a person approves.
  - This is how the monthly plans' "we look after it" promise is kept across many clients, and it's something to show prospects.

### Done in the final review (16 October 2026)
- [x] Fixed every page, the admin panel and the backend from the review. ADMIN.md 8cv–8cz explain each change.
- [x] Inbox Assistant in the menu, on Solutions, Start and the industry pages; one clear deposit story.
- [x] Industry pages back in the menu, footer and sitemap, plus a new page for accounting and professional firms.
- [x] Privacy notice matches where text really goes (the office PC first), with a one-screen security summary.
- [x] Demos are honest: no AI phone voice, "prepared example" labels, and a restaurant and a cleaning demo.
- [x] Forms and billing protected against abuse and double charges.
- [x] A light-theme share image and a Google profile photo set.
- [x] "Watch it work" on the homepage: a before/after slider over the inbox, with the results as figures.
- [x] The office PC collects its own AI jobs: no Tailscale, tunnel or public address (ADMIN.md 8da), and works with your Ollama + Llama 3.1 (8db).
- [x] Inbox Assistant fixes (20 October 2026, ADMIN.md 8dc): Microsoft 365 drafting no longer breaks for page clients, thread summaries don't count as replies, the panel can delete a client's page and data, and the email demo says which parts are the Inbox Assistant.
