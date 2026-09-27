# Mockup builder guide

Read this before building any mockup in `previews/<slug>/`. It applies to the
automatic builder (scheduled Claude session) and to anyone building by hand.

## What a mockup is
A **single static page** (`index.html`, optional `styles.css`, inline SVG only)
that shows a prospect what *their* business could look like online. It is a
sales tool: it must feel finished at a glance on a phone, be specific to them,
and take under an hour. It is not the final site.

## Inputs
A decrypted brief from `_build/queue/` (`node scripts/build_queue.js list --key <pem>`):
`business, about, include, style, industry, currentSite, likedDemo, category,
indicativePrice, budget, email, phone, contactName, ref, slug, previewUrl`.
Briefs are encrypted in the repo; never write a decrypted brief to disk inside
the repo, and never commit the key. Use every fact you're given;
invent nothing about the business beyond sensible, clearly generic copy
(opening hours placeholders, "Service 1/2/3" only if `include` gives nothing).

## Rules
1. **Start from `previews/_template/index.html`.** Copy it to
   `previews/<slug>/index.html` and edit; keep its structure (hero, what we
   do, why us / gallery band, contact + WhatsApp CTA, footer). Remove sections
   that don't fit rather than adding filler.
2. **Mobile first.** Must look right at 390 px wide with no horizontal scroll;
   check at 1440 px too. Run the check in §Verify.
3. **Self-contained.** No external scripts. Google Fonts only. No images from
   the web (the builder can't fetch them) — use the template's CSS/SVG
   placeholders and colour blocks; pick a palette that suits the business
   (`style` hint; otherwise: services → deep blue/teal, food → warm
   orange/cream, beauty → rose/charcoal, trades → navy/amber).
4. **Their details, their voice.** Business name in `<title>`, hero and footer;
   never put the contact person's own name on the page (the business's phone
   and email are fine — it's their business contact);
   phone as a `tel:` link and a `https://wa.me/27…` WhatsApp button (convert
   `0xx` → `27xx`); email as `mailto:`. If a fact is missing, leave the
   element out — never "Lorem ipsum", never a fake address or fake reviews.
   If `likedDemo` is set, match that demo's structure and feel (see /demos).
5. **Keep the Re-Charge strip** at the bottom of the template ("Mockup by
   Re-Charge · Like it? …" linking to `https://re-charge.co.za/start?src=mockup`).
   It is how the prospect replies.
6. **`<meta name="robots" content="noindex,nofollow">`** stays in `<head>`.
   The repository is public, so a mockup is unlisted, not secret: put only
   what belongs on the business's own public website on the page.
7. Under 300 KB total. One page. No forms that submit anywhere (buttons may
   link to WhatsApp/email).

## Verify (required before pushing)
```
node scripts/check_preview.js previews/<slug>
```
It opens the page in Chromium at 390 and 1440, fails on horizontal overflow,
console errors or missing `index.html`, and writes screenshots to
`previews/<slug>/_shots/` (delete that folder before committing).

## Ship
```
git add previews/<slug> && git commit -m "Mockup: <business> (<ref>)"
node scripts/build_queue.js done --slug <slug> --status built --url <previewUrl> --commit $(git rev-parse HEAD) --files index.html --notes "<2–3 lines: what you built, what you assumed>"
git add -A _build && git commit -m "Build result: <slug>"
git push origin HEAD:main      # on rejection: git pull --rebase origin main, then push again
```
On any failure you cannot fix, record `--status failed --notes "<why>"` instead
(and commit + push that result) so the panel shows it. `done` removes the
queue file, so a brief is never built twice. Never send anything to the
prospect: the human sends the "Mockup ready" email from the admin panel after
reviewing.
