# Going live on a custom domain (bought at domains.co.za)

> **Recommended now: Path B.** It keeps the code, the owner's manual and the history private while
> the website stays public and free. Do the Cloudflare steps first, check the site works on
> re-charge.co.za, and only then make the repo private (step 5). See "Keeping Re-Charge separate"
> at the end.

Two paths. Path A keeps everything as-is (repo stays public). Path B lets you
make the repo private, hosted free on Cloudflare Pages.

In both cases, first run the URL swap and push:

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

## Path B — Cloudflare Pages (repo can go PRIVATE, hosting still free)

Cost: R0. Cloudflare Pages Free covers this site (about 200 files, none over 25 MB; 500 builds a
month, and each push to `main` is one build), the custom domain, HTTPS and DNS. A private GitHub
repo is free too. Only the yearly domain renewal at domains.co.za stays, as now.

1. Create/log in at cloudflare.com (your account). Add the domain as a site;
   Cloudflare gives you two nameservers.
   **Before step 2, check the email records.** Cloudflare copies the existing DNS records when you add
   the site, but compare them by hand: Resend's records for `re-charge.co.za` (Resend → Domains:
   the SPF/MX on `send`, the DKIM `resend._domainkey` TXT and any DMARC) and any MX records must
   all be in Cloudflare's DNS list, set to **DNS only** (grey cloud). If one is missing, emails from
   `no-reply@re-charge.co.za` stop arriving or go to spam.
2. At **domains.co.za**: replace the domain's nameservers with Cloudflare's
   (Manage Domain → Nameservers). Propagation: up to 24h, usually faster. The domain itself stays
   registered at domains.co.za, renewed there as now.
3. In Cloudflare: Workers & Pages → Create → Pages → **Connect to Git** →
   authorise GitHub (only this repository) → pick `revan-lombard/re-charge`, branch `main`.
   - Framework preset: None. **Build command:** `bash scripts/cf-build.sh`. **Build output directory:** `public`
   - The build copies only the public website into `public/`. ADMIN.md, the other notes, `src/`,
     `scripts/`, `supabase/` and `hub/` are never published (with no build command, Cloudflare
     would publish them as plain files).
4. Pages → Custom domains → add the domain (Cloudflare wires DNS itself).
5. Make the GitHub repo private: repo → Settings → General → Danger Zone →
   Change visibility. Cloudflare keeps deploying on every push.
6. Optional cleanup: disable GitHub Pages on the repo (Settings → Pages) —
   but only after the Cloudflare site is confirmed live. Note: old
   github.io links stop working on this path; share the new domain going
   forward.

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

- **The repo:** private (Path B step 5). Only you, and the tools you connect, can see it.
- **GitHub account:** use a personal account with a personal email, not a work one, and turn on
  two-factor login. Settings → Emails → "Keep my email address private" hides it in commits.
- **Every service account** (GitHub, Cloudflare, Supabase, Resend, Yoco, Paystack, Meta, Google
  Analytics, GoatCounter, Tailscale, the domain at domains.co.za): sign in with a personal or
  Re-Charge email, never a work address, so no company system ever receives the password resets
  or invoices. When the Re-Charge business email exists, move them to it.
- **Claude:** use a personal Claude account for Re-Charge. Sessions in a company Claude account
  can be visible to that company's admins.
- **Devices and networks:** run the office PC hub, the admin panel and any Re-Charge work on your
  own computer and home internet, not a work laptop, work VPN or office Wi-Fi.
- **GoatCounter:** rename the site code in GoatCounter's settings to something neutral (it is
  currently your name), then change it in `src/footer.html` and `card.html` and rebuild
  (the 404 page is rebuilt from the footer by `scripts/build_404.py`).

