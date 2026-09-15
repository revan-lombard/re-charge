# Re-Charge — You have the problem. We build the solution.

Website for **Re-Charge**, a small South African digital solutions studio that
builds websites, dashboards, automation, AI integrations and custom software
for individuals, entrepreneurs and small businesses. Projects from R1,000,
started with a R500 deposit.

The site's job: let a non-technical visitor go from *problem → example → price
→ Project Builder → deposit* without needing to understand technology or
contact anyone first.

## Stack

Static site, no build step, no framework. Plain HTML, one stylesheet, one
script. Dark, technical UI (near-black navy, electric-blue accent, monospace
labels). Fonts (Space Grotesk, Inter, JetBrains Mono) load from Google Fonts;
everything else is in the repo. Works as-is on GitHub Pages or Cloudflare Pages.

| File | Purpose |
|---|---|
| `index.html` | Homepage: hero, problem-first cards, services, process, demo previews, pricing, Hosting & Care, trust, audience, FAQ, CTA |
| `services.html` | The five services in detail, with website packages and new pricing; anchors `#websites` … `#software` |
| `demos.html` | **Try What We Build** — three working interactive demos (quote calculator, sales dashboard, AI assistant) + concept previews. Demo JS is inline and self-contained |
| `pricing.html` | Public pricing, R500 deposit model, first-year example, Hosting & Care (annual), how-we-work rules, FAQ |
| `start.html` | **Project Builder** — 5-step: category → goal → dynamic questions + upload → your details → indicative estimate + deposit/submit |
| `terms.html` | Plain-language Terms & Deposit summary (flagged for legal review) |
| `404.html` | Not-found page |
| `work.html` | Redirect stub → `demos.html` (page was renamed) |
| `store/scan/bins/back-a-bin.html` | Redirect stubs for retired concept URLs → `/` |
| `styles.css` | Design tokens + reusable components (see below) |
| `script.js` | Nav, scroll reveal, contact links, and the whole Project Builder (steps, validation, estimate, spam checks, submission) |
| `config.js` | The only file to edit to wire up real services |
| `backend/apps-script.gs` | Optional self-owned form backend (Google Apps Script → email + Sheet) |
| `assets/`, `og-image.png` | Blue logo mark (SVG + 512px PNG), lockups, 1200×630 social image |
| `sitemap.xml`, `robots.txt`, `CNAME` | SEO + domain |

## Run locally

```
npx serve .
```

## Configuration (`config.js`)

- **`ENQUIRY_ENDPOINT`** — where the Project Builder POSTs. Currently a
  Formspree form (JSON). Alternatively deploy `backend/apps-script.gs` and
  paste its `/exec` URL. Empty → submissions stored in the visitor's
  `localStorage` (development).
- **`ENQUIRY_ACCEPTS_FILES`** — `true` sends uploads as `multipart/form-data`
  (Formspree paid plans). Default `false`: file names are listed in the
  submission and the client is asked to share files when we reply.
- **`DEPOSIT_PAYMENT_URL`** — the R500 deposit payment link (Yoco / Paystack /
  PayFast / Stripe payment link, etc.). When set, the confirmation screen
  shows a "Pay R500 deposit" button after the project is submitted. Empty →
  the client is told we'll send a payment link with their confirmation.
- **`WHATSAPP_NUMBER`** / **`CONTACT_EMAIL`** — optional. When set, WhatsApp/
  Email links appear in the footer and Project Builder. Empty by default so no
  placeholder contact details are ever published.

## Project Builder (start.html)

Five steps, all client-side (`initBuilder` in `script.js`):

1. **What** — pick one or more categories (Website, Dashboard, Automation, AI,
   Custom Tool, Something Else, I'm Not Sure). Deep-linkable with
   `start.html?type=Website` (used by the homepage problem cards and demo
   "Build something similar" buttons).
2. **Goal** — free-text "what are you trying to accomplish", with an example
   that changes by category.
3. **Details** — only the question groups for the chosen categories show;
   optional file upload.
4. **You** — name, email, phone (required), business, preferred contact,
   optional budget/deadline/existing site.
5. **Estimate** — an indicative price computed from the chosen categories, a
   summary, the R500 deposit terms, and submit.

Spam protection: honeypot (`_gotcha`) + a 4-second minimum time-on-page +
client validation + the endpoint's own filtering. Native form submission is
blocked globally so personal data can't land in a URL. On a failed POST the
project is kept in `localStorage`, the visitor sees a plain error and can retry.

**The R500 payment is not yet wired to a real provider** — see TODO. Until
`DEPOSIT_PAYMENT_URL` is set, the builder submits the project and tells the
client we'll send a payment link.

## Demos (demos.html)

Three genuinely interactive demos, all inline vanilla JS, clearly labelled as
demo/concept with sample data:

- **Quote calculator** (Mike's Plumbing) — job + add-ons → live total → prefilled WhatsApp link.
- **Sales dashboard** (Example Sales Co.) — period toggle updates stat tiles, a bar chart and a top-products list.
- **AI assistant** (Ask BuildRight) — keyword-matched Q&A over a small set of sample "documents", with source citations. **Not a live AI** — it's a scripted stand-in that shows the experience.

## Analytics

GoatCounter (cookieless) on every page, with conversion events via
`window.trackEvent` (`project-submitted`, `contact-whatsapp`, …). Swap for
Google Analytics by replacing the GoatCounter `<script>` and pointing
`trackEvent` at `gtag`.

## Components (styles.css)

Tokens in `:root`. Reusable: `.btn` (+ variants), `.card` (+ `--link/--tint/
--dark`), `.grid--2/3/4`, `.section` (+ `--tint/--dark`), `.eyebrow`, `.tag`,
`.badge--concept`, `.price`, `.steps`, `.plans`/`.plan`, `.price-list`,
`table.spec`, `.checklist`, `.rules`, `.faq__item`, `.form` + `.choices`,
`.mock` (dark dashboard thumbnails), `.builder` (multi-step), `.demo` (demo
widgets), `.legal`, `.callout`, `.cta`. Add `.reveal` to fade an element in on
scroll (visible without JS and under reduced motion).

## TODO (needs a decision, an account, or a backend)

- [ ] **Wire the R500 deposit to a payment provider.** Create a Yoco/Paystack/
      PayFast/Stripe payment link and set `DEPOSIT_PAYMENT_URL`. (A real
      "pay then submit" flow, or webhook-confirmed payments, needs a backend.)
- [ ] **Form/AI backend.** Decide Formspree (50/month free) vs. the self-owned
      Apps Script backend. The spec's *AI interpretation of submissions* and
      *internal project record + statuses* need a backend/CRM — not built here.
- [ ] Set `WHATSAPP_NUMBER` / `CONTACT_EMAIL` once they exist.
- [ ] **Legal review** of `terms.html` and a Privacy Policy before taking real
      deposits — the deposit wording, refunds, CPA, POPIA and AI data handling
      need a professional pass. The page is a plain-language draft only.
- [ ] Staging previews (`client.re-charge.co.za`), noindexed/password-protected.
- [ ] Confirm the standard number of revision rounds per package for quotes.
- [ ] Replace demo placeholders (sample WhatsApp number `27000000000` in the
      quote demo) if a real demo number is wanted.
- [ ] Add the first real case study to `demos.html` when a client launches.
