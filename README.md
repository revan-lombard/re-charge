# Re-Charge — Digital solutions that solve real problems.

Website for **Re-Charge**, a small South African digital solutions studio
building websites, dashboards, automation, AI integrations and custom
software for businesses and individuals.

The site's job is to answer five questions in about ten seconds — what
Re-Charge is, what it can build, roughly what it costs, how fast, and how to
start — and to move a visitor from *problem → service → example → price →
enquiry* without needing to contact us first.

## Stack

Static site, no build step, no framework. Plain HTML, one stylesheet, one
script. Fonts (Space Grotesk, Inter) come from Google Fonts; everything else
is in the repo. Works as-is on GitHub Pages or Cloudflare Pages.

| File | Purpose |
|---|---|
| `index.html` | Homepage: hero, problem → solution, services grid, how it works, concept projects, pricing, monthly support, trust, audience, FAQ, final CTA |
| `services.html` | The five services in detail — examples, starting price, turnaround, "good fit if" — with anchors `#websites`, `#dashboards`, `#automation`, `#ai`, `#software` |
| `work.html` | Five **concept projects** (clearly labelled demos, not client work) with pure-CSS mock-ups |
| `pricing.html` | Starting prices, turnaround, payment structure, monthly support plans, business rules (scope, revisions, change requests, third-party costs, ownership), pricing FAQ |
| `start.html` | Project enquiry form — the primary conversion action ("Start a Project") |
| `404.html` | Not-found page (absolute paths, served at any depth by GitHub Pages) |
| `store.html`, `scan.html`, `bins.html`, `back-a-bin.html` | Redirect stubs for retired concept URLs → `/` (noindex, disallowed in `robots.txt`) |
| `styles.css` | Design tokens + reusable components (see below) |
| `script.js` | Nav, scroll reveal, contact links, enquiry form (validation, spam checks, submission, error handling) |
| `config.js` | The **only** file to edit to wire up real services (form endpoint, WhatsApp, email) |
| `backend/apps-script.gs` | Optional self-owned form backend (Google Apps Script → email + Sheet) |
| `assets/` | Logo mark (SVG + 512px PNG), lockups for light/dark |
| `og-image.png` | 1200×630 social sharing image |
| `sitemap.xml`, `robots.txt`, `CNAME` | SEO + domain |

## Run locally

Open `index.html` in a browser, or serve it:

```
npx serve .
```

## Configuration (`config.js`)

- **`ENQUIRY_ENDPOINT`** — where `start.html` POSTs enquiries. Currently a
  Formspree form (JSON). Alternatively deploy `backend/apps-script.gs` and
  paste its `/exec` URL; the script detects Apps Script endpoints and sends a
  CORS-safe request. If empty, submissions are kept in the visitor's
  `localStorage` only (development).
- **`ENQUIRY_ACCEPTS_FILES`** — `true` sends attachments as
  `multipart/form-data` (Formspree paid plans). Default `false`: the form
  still shows the file field, lists the file names in the enquiry, and tells
  the visitor we'll send a link to share the files when we reply.
- **`WHATSAPP_NUMBER`** / **`CONTACT_EMAIL`** — optional. When set, "WhatsApp"
  and "Email" links appear in the footer and on the enquiry page. Empty by
  default so no placeholder contact details are ever published.

## Enquiry form

Fields: name, email, phone/WhatsApp, individual/business, company (optional,
hidden for individuals), what you need, service (Website / Dashboard /
Automation / AI / Custom Software / Other), budget range, timeframe,
description, file (optional). Deep-link a service with
`start.html?service=Dashboard`; `?src=label` on any link is recorded as
`channel` on the submission for attribution.

Spam protection: honeypot field (`_gotcha`, also honoured by Formspree), a
3-second minimum time-on-page, client-side validation, and the endpoint's
own filtering. Native form submission is blocked globally so personal data
can never end up in a URL.

Error handling: a failed POST shows a plain error, keeps everything the
visitor typed, offers a retry, and stores a copy in `localStorage`.

## Analytics

GoatCounter (cookieless, no consent banner needed) is loaded on every page and
records conversion events (`enquiry-submitted`, `contact-whatsapp`,
`contact-email`) via `window.trackEvent`. To use Google Analytics instead,
replace the GoatCounter `<script>` at the bottom of each page with the GA
snippet and point `trackEvent` in `script.js` at `gtag('event', …)`.

## Components (styles.css)

Design tokens live in `:root`. Reusable pieces: `.btn` (+ `--primary`,
`--ghost`, `--light`, `--ghost-light`, `--large`, `--small`), `.card`
(+ `--link`, `--tint`, `--dark`), `.grid--2/3/4`, `.section` (+ `--tint`,
`--dark`), `.section__head`, `.eyebrow`, `.tag`, `.badge--concept`, `.price`,
`.steps`, `.plans`/`.plan`, `.price-list`, `table.spec`, `.checklist`,
`.rules`, `.faq__item` (native `<details>`), `.form` + `.choices`, `.mock`
(CSS UI thumbnails), `.callout`, `.cta`. Add `.reveal` to fade an element in
on scroll (content is visible without JS and under reduced motion).

## Adding things later

The structure is deliberately simple to extend:

- **A new service** — add a card to the services grid on `index.html`, a
  `<section class="service" id="…">` on `services.html`, a row in the
  `.price-list` on `index.html` and `pricing.html`, a radio option on
  `start.html`, an `Offer` in the JSON-LD on `index.html`, and a footer link
  (the footer is duplicated in each page).
- **A real case study** — add an `<article class="project">` on `work.html`
  without the `badge--concept` label, and a card on the homepage.
- **New pages** — copy any page's `<head>`, header and footer; add the URL
  to `sitemap.xml`.

Header and footer are plain HTML repeated in each page (no build step);
change them in every page when editing.

## Deploy

GitHub Pages: push to `main`, Settings → Pages → deploy from branch root.
Custom domain steps are in `DEPLOY-DOMAIN.md`. `scripts/set-domain.ps1`
swaps the baked-in URLs if the domain changes.

## TODO

- [ ] Set `WHATSAPP_NUMBER` and/or `CONTACT_EMAIL` in `config.js` once a
      business number / address exists
- [ ] Decide on the form backend: keep Formspree (50 submissions/month free)
      or deploy `backend/apps-script.gs` (self-owned, no cap)
- [ ] Add the first real case study to `work.html` when a client project
      launches (keep the concept projects, they show range)
- [ ] Submit `sitemap.xml` to Google Search Console after deploy
- [ ] Confirm the number of revision rounds to include as standard in quotes
      (the site says "a defined number"; the quote template should say how many)
- [ ] Draft the quotation/contract template covering scope, price, deposit,
      milestones, revisions, change requests, third-party costs and
      ownership (source code, designs, client data, third-party components,
      licences, AI/API accounts, reusable Re-Charge components)
