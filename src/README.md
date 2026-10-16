# `src/` — page source & build helper

The site is static HTML served from the repo root by GitHub Pages. There is
**no build step in CI** — the `.html` files at the root are what ship. This
folder holds the *source* those files are assembled from, so shared chrome
(nav, footer) only has to be edited once.

## Layout

- `header.html`, `footer.html` — shared chrome, concatenated into every page.
- `<page>.body` — the `<main>` content for a page.
- `<page>.body.head` — that page's `<head>` (title, meta, per-page `<head>` bits).
- `build.sh` — assembles one page: `head + header + body + footer`.
- `mkhead.sh` — helper that generates a `<page>.body.head` skeleton.

## Rebuilding a page

From the repo root, write the assembled output over the root `.html` file:

```sh
./src/build.sh index   src/index.body   > index.html
./src/build.sh services src/services.body > services.html
./src/build.sh pricing src/pricing.body > pricing.html
./src/build.sh start   src/start.body   > start.html
./src/build.sh demos   src/demos.body   > demos.html
./src/build.sh privacy src/privacy.body > privacy.html
./src/build.sh terms   src/terms.body   > terms.html
```

`build.sh` sets `aria-current="page"` on the matching nav item for
`services`, `demos` and `pricing`.

After rebuilding, commit both the changed `src/` file(s) **and** the
regenerated root `.html`, so the shipped file always matches its source.

## Not built from here

- `index.html` (home) is built from `src/index.body`, but the nav highlight
  logic in `build.sh` only special-cases services/demos/pricing.
- `work.html` is a **hand-maintained redirect stub** (→ `/ai-demos`) left
  over from an earlier concept. It has no partial on purpose — do not
  regenerate it. The old page's `.body` was intentionally not carried over.
- `dashboard/`, `config.js`, `script.js` and `styles.css` are edited directly, not
  assembled here. `404.html` is built by scripts/build_404.py.

Generated, don't hand-edit: `src/for-*.body(.head)` (scripts/gen_industry.py), the FAQPage data in
every `*.body.head` (scripts/sync_faq_ld.py), `404.html` (scripts/build_404.py, from the header and
footer) and `sitemap.xml` (scripts/sitemap.py). The full build is in the root README.
