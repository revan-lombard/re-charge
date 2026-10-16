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
| `hub/` | The office-PC AI hub kit (LM Studio gateway, call transcription worker) |
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
sources and backend off the website. To make the repo private, move hosting to Cloudflare Pages
first (DEPLOY-DOMAIN.md, Path B, step by step; build command `bash scripts/cf-build.sh`, output
`public`). On Cloudflare, `_headers` keeps the test address and the panels out of Google and
stops other sites showing the panels inside theirs.

## To do (owner)

Updated 16 October 2026, after the final pre-launch review. Ticked items are done.

### Before you push for clients
- [ ] **Run the database updates** in the Supabase SQL Editor, in order: `0027` to `0034` in `supabase/migrations/` (each is safe to run twice). 0034 comes from the final review: billing that can't double-charge and form limits.
- [ ] **Deploy all functions:** `supabase functions deploy` (the review changed almost all of them; ADMIN.md 8cw lists them).
- [ ] **Secrets** (`supabase secrets set …` in your own terminal; never paste a key into a chat or a commit):
  - `ANTHROPIC_API_KEY`, `LOCAL_AI_URL`, `LOCAL_AI_TOKEN` (the AI hub)
  - `TOKEN_ENCRYPTION_KEY`, `FB_APP_ID`, `FB_APP_SECRET` (Facebook posting); optional `FB_PAGE_ID`
  - `SYNC_SECRET` is now required for the analytics pull
  - optional: `INBOX_DRAFT_MODEL`, `INBOX_TRIAL_PER_IP_HOUR`, `INBOX_TRIAL_PER_PAGE_DAY`, `ALLOW_ORIGIN`
  - leave `ASSISTANT_CLAUDE_FALLBACK` off, so the website never costs API money
- [ ] **Confirm you're not VAT-registered.** The site now says "No VAT is added: we're not VAT-registered". If that's wrong, tell me and I'll change it everywhere.
- [ ] **Partner plan reply time:** "within 4 business hours" is hard for one person to keep. Keep it, or soften it?
- [ ] **Paystack go-live key**, and send the R1,500 deposit link before every Inbox Assistant setup. Record it in the panel as a **Deposit** (the trial card's buttons do this), so the post-trial quote doesn't ask for a second deposit.
- [ ] **Panel settings:** Settings → Contracts → **Bank details** (the deposit and balance messages now use them), and Settings → Your details: your name and signature.
- [ ] **WhatsApp Business greeting and away message** on 072 237 5833, e.g. "Thanks! A person will reply by 17:00 the next business day. Meanwhile, see it work: re-charge.co.za/ai-demos".
- [ ] **Google appointment schedule:** turn on the phone-number field, so people can ask to be phoned.
- [ ] **Google Business Profile:** follow `marketing/google-profile/README.md` (new category, description, services, the 12 photos, the offer).

### Keeping Re-Charge separate from your employer (DEPLOY-DOMAIN.md, last section)
- [ ] Move hosting to Cloudflare Pages (Path B), check the site, then **make the repo private**.
- [ ] Use personal or Re-Charge accounts (not work ones) for GitHub, Claude, Supabase, Cloudflare, Yoco, Paystack, Meta, Google, GoatCounter, Tailscale and the domain; turn on two-factor login.
- [ ] **Rename the GoatCounter code** (it's your name) and tell me the new one, so I can update the site.
- [ ] Work on your own computer and home internet, not a work laptop or network.

### The office PC (AI hub), per `hub/README.md`
- [ ] LM Studio with Vulkan, Qwen2.5 7B Instruct Q4_K_M, context 8192
- [ ] Python, `hub-token.txt`, `start-hub.bat` in Startup, Tailscale Funnel
- [ ] Whisper (ggml-small) and `winget install ffmpeg`, for call notes
- [ ] In LM Studio, check the server log settings and switch off saving prompts and replies, if it is on, so no visitor text stays on the PC

### Facebook
- [ ] Create the Meta app, set its secrets, then connect the Page in the panel (Settings → Facebook); set `FACEBOOK_URL` so the footer shows the Page.

### When you have them
- [ ] A **business email** (then point every account at it and update `CONTACT_EMAIL` in `config.js`).
- [ ] The **company registration number** (for the Terms, quotes and invoices).
- [ ] **Photos:** a phone, an envelope, an invoice, a hand typing, trade tools, and high-resolution versions of the hands and the paper stack. Optional: one photo of you working, for the Google profile only.
- [ ] Your **first client result**, measured before and after, for the site (with their OK).
- [ ] Fix the "@re-chare-ai" typo in the deck.
- [ ] Allow image sites in the environment's network settings if you want me to source stock photos.

### Done in the final review (16 October 2026)
- [x] Fixed every page, the admin panel and the backend from the review. ADMIN.md 8cv–8cz explain each change.
- [x] Inbox Assistant in the menu, on Solutions, Start and the industry pages; one clear deposit story.
- [x] Industry pages back in the menu, footer and sitemap, plus a new page for accounting and professional firms.
- [x] Privacy notice matches where text really goes (the office PC first), with a one-screen security summary.
- [x] Demos are honest: no AI phone voice, "prepared example" labels, and a restaurant and a cleaning demo.
- [x] Forms and billing protected against abuse and double charges.
- [x] A light-theme share image and a Google profile photo set.
