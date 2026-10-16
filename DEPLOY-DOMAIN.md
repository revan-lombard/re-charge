# Going live on a custom domain (bought at domains.co.za)

> **Decided (16 October 2026): stay on GitHub Pages, on GitHub Pro, with the repo private.** The
> site is already live on re-charge.co.za (Path A); see "Make the repo private" below. Path B
> (Cloudflare Pages, free) stays here as the alternative. See "Keeping Re-Charge separate" at the end.

Two paths. Path A keeps everything as-is (repo stays public). Path B lets you
make the repo private, hosted free on Cloudflare Pages.

In both cases, first run the URL swap and push (already done for re-charge.co.za):

```powershell
.\scripts\set-domain.ps1 -Domain "your-domain.co.za"
git add -A; git commit -m "Point site at custom domain"; git push
```

---

## Path A — keep GitHub Pages (repo stays public)

1. **GitHub side** (I/Claude can do via API, or you): repo → Settings → Pages →
   Custom domain → enter the domain → Save. Tick **Enforce HTTPS** once the
   certificate is issued (can take up to an hour after DNS resolves).

2. **domains.co.za side** — in the DNS management panel for the domain, add:

   | Type  | Host | Value               |
   |-------|------|---------------------|
   | A     | @    | 185.199.108.153     |
   | A     | @    | 185.199.109.153     |
   | A     | @    | 185.199.110.153     |
   | A     | @    | 185.199.111.153     |
   | CNAME | www  | revan-lombard.github.io |

3. Wait for DNS (minutes to a few hours). Old github.io links keep working:
   GitHub 301-redirects them to the new domain once the custom domain is set.

## Make the repo private (GitHub Pro, the chosen way)

GitHub Pro costs $4 a month and lets GitHub Pages publish from a private repository. The code, the
notes and the history become private; the website itself stays public, as it must. Nothing about
the domain or DNS changes.

1. **If you're moving the repo to a new GitHub account, do that first** (repo → Settings → General →
   Danger Zone → Transfer ownership; accept the email in the new account within a day). Buy Pro on
   the account that ends up owning the repo. After a transfer, GitHub doesn't move the Pages site by
   itself: in the new repo, Settings → Pages → Custom domain → `re-charge.co.za` again, and change the
   `www` record at domains.co.za from `revan-lombard.github.io` to `<new-account>.github.io`.
2. **Get Pro:** signed in as the account that owns the repo, open github.com/pricing and choose **Pro**
   (or Settings → Billing, then upgrade your plan).
3. **Make it private:** repo → Settings → General → Danger Zone → Change visibility → Make private.
4. **Check Pages:** repo → Settings → Pages should still say the site is live at re-charge.co.za, with
   **Enforce HTTPS** ticked. Open https://re-charge.co.za on your phone.
5. `_config.yml` keeps working as before: the notes, sources, backend and the office-PC kit are never
   published, even though the repo builds the site.

If Pro ever lapses, GitHub stops publishing a private repo's site: renew it, or switch to Path B.

## Path B — Cloudflare Pages (repo can go PRIVATE, hosting still free)

Cost: R0. Cloudflare Pages Free covers this site (about 200 files, none over 25 MB; 500 builds a
month, and each push to `main` is one build), the custom domain, HTTPS and DNS. A private GitHub
repo is free too. Only the yearly domain renewal at domains.co.za stays, as now.

Time: about an hour of clicking, plus up to a day waiting for the nameservers. The site stays up the
whole time, except for a minute or two in step 11.

### Part 1: the Cloudflare account and DNS (nothing changes yet)
1. Sign up at **dash.cloudflare.com** with a personal email (not a work one). Turn on two-factor
   login: profile icon → My Profile → Authentication.
2. **Add a domain** (or "Add a site") → `re-charge.co.za` → the **Free** plan. Cloudflare copies the
   current DNS records. If it asks about AI crawlers or offers to manage robots.txt, choose
   **Do not block** and leave robots.txt alone (being found by AI search is good for this business).
3. Check the list against the DNS panel at domains.co.za (take a screenshot of that first):
   - the four GitHub `A` records for `@` (185.199.108.153, .109, .110, .111) and the `www` `CNAME`
     to `revan-lombard.github.io`: **keep them for now**, but click each one and set Proxy status to
     **DNS only** (grey cloud), so GitHub Pages keeps serving the site during the move;
   - Resend's records (Resend → Domains → re-charge.co.za): the `send` `MX` and `TXT` (SPF), the
     `resend._domainkey` `TXT` (DKIM) and `_dmarc` `TXT` if you have one. Add any that are missing
     by hand, copied exactly. Without them, emails from `no-reply@re-charge.co.za` stop arriving
     or go to spam;
   - anything else (for example a `google-site-verification` `TXT`): keep it.
4. Cloudflare then shows two nameservers (like `xxx.ns.cloudflare.com`). Keep that page open.

### Part 2: switch the nameservers
5. At **domains.co.za** → your domain: if **DNSSEC** is on, switch it off first (with it on, the
   domain stops working after the switch). Then replace the nameservers with Cloudflare's two
   (Manage Domain → Nameservers). The domain stays registered and renewed at domains.co.za.
6. Wait for Cloudflare's email "re-charge.co.za is now active" (minutes to 24 hours). The site is
   still served by GitHub Pages. Then send yourself a test email from the panel and check it
   arrives in the inbox (not spam), which proves the Resend records came across.

### Part 3: the Pages project (you can do this while you wait)
7. Workers & Pages → **Create application** → **Pages** → **Connect to Git** → GitHub → install the
   Cloudflare app with **Only select repositories** → `revan-lombard/re-charge` → **Begin setup**:
   - Project name: `re-charge` (the test address becomes `re-charge.pages.dev`)
   - Production branch: `main`
   - Framework preset: **None**
   - **Build command:** `bash scripts/cf-build.sh`
   - **Build output directory:** `public`

   **Save and Deploy.** The build log ends with `public/: 195 files` (about). The build copies only
   the public website: ADMIN.md, the other notes, `src/`, `scripts/`, `supabase/` and `hub/` are
   never published (with no build command, Cloudflare would publish them as plain files).
8. Project → Settings → Builds → **Branch control** → Preview branch: **None**. Otherwise every
   push to a working branch uses a build and makes an extra test copy of the site.
9. Open `https://re-charge.pages.dev`: the pages, demos and pictures should all show. The forms,
   the chat and the admin login **won't work there**, because the backend only answers
   re-charge.co.za. That's expected; they're tested in step 15. (`_headers` keeps this address out
   of Google.)

### Part 4: move the domain onto Cloudflare Pages (after the "active" email)
10. In the zone (`re-charge.co.za`): search the dashboard for **Email Address Obfuscation** and
    switch it **off**. If left on, Cloudflare rewrites the email addresses in the pages and the
    search-engine data.
11. DNS → Records: **delete** the four GitHub `A` records and the `www` `CNAME`. (The site is off for
    a minute or two from here.)
12. Pages project → **Custom domains** → Set up a custom domain → `re-charge.co.za` → Activate.
    Then the same for `www.re-charge.co.za`. Cloudflare adds the DNS records and the certificate
    itself; each one shows **Active** within a few minutes.
13. **www to the main address:** Rules → Overview → Templates → **Redirect from WWW to root** →
    Deploy. (GitHub did this for you before.)
14. SSL/TLS → Edge Certificates → **Always Use HTTPS**: on.

### Part 5: check, then lock it down
15. On re-charge.co.za, on your phone (on mobile data) and a laptop: the homepage, Pricing, Inbox
    Assistant, a demo; `www.re-charge.co.za/pricing` lands on `re-charge.co.za/pricing`; a made-up
    address like `/nope` shows the 404 page; send a test form; ask the chat something; log in to the
    admin panel; check the form's email arrives.
16. GitHub → the repo → Settings → **Pages** → Build and deployment → Branch: **None** → Save.
    This switches off the GitHub copy.
17. GitHub → Settings → General → **Danger Zone** → Change visibility → **Make private**. Then make
    any small change (or ask Claude to) and check it appears under the Cloudflare project's
    Deployments within a few minutes.

**If something breaks in steps 11 to 15:** remove the two custom domains in Pages, put the four
`A` records and the `www` `CNAME` back (DNS only), and GitHub Pages serves the site again within
minutes. That only works until step 16, so don't do step 16 until step 15 passes.

Old `revan-lombard.github.io/re-charge` links stop working on this path; share the domain.

---

## After either path

- [ ] Re-run a share-preview check (WhatsApp/LinkedIn paste) — OG URLs now
      point at the new domain
- [ ] Add the new domain in GoatCounter (Settings → Sites) if it filters
      by domain
- [ ] Submit `https://your-domain/sitemap.xml` to Google Search Console
- [ ] If using the Apps Script backend: nothing to change (it accepts any origin)

---

## Keeping Re-Charge separate from your employer

- **The repo:** private (GitHub Pro, "Make the repo private" above). Only you, and the tools you connect, can see it.
- **GitHub account:** use a personal account with a personal email, not a work one, and turn on
  two-factor login. Settings → Emails → "Keep my email address private" hides it in commits.
- **Every service account** (GitHub, Supabase, Resend, Yoco, Paystack, Meta, Google
  Analytics, GoatCounter, the domain at domains.co.za; Cloudflare only if you use Path B): sign in with a personal or
  Re-Charge email, never a work address, so no company system ever receives the password resets
  or invoices. When the Re-Charge business email exists, move them to it.
- **Claude:** use a personal Claude account for Re-Charge. Sessions in a company Claude account
  can be visible to that company's admins.
- **Devices and networks:** run the office PC hub, the admin panel and any Re-Charge work on your
  own computer and home internet, not a work laptop, work VPN or office Wi-Fi.
- **GoatCounter:** rename the site code in GoatCounter's settings to something neutral (it is
  currently your name), then change it in `src/footer.html` and `card.html` and rebuild
  (the 404 page is rebuilt from the footer by `scripts/build_404.py`).

