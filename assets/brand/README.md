# Re-Charge brand

## The mark
`mark.svg` (light, for dark backgrounds) and `mark-dark.svg` (for light backgrounds). A vector
redraw of the original R: a white bowl and a steel-grey leg, with a clean cut where the leg
crosses the bowl. Never stretch it, recolour it, add effects, or put it on a busy photo.

- **App / tab icons:** the mark on a dark rounded tile (`/assets/icon-*.png`, `favicon-32.png`,
  `apple-touch-icon.png`).
- **Transparent PNGs** for places that can't use SVG (emails, schema.org): `/assets/logo-mark.png`
  (505×480), `logo-mark-96.png`, `logo-mark-192.png`.

## The lockup
The **R** mark is an icon, followed by the full name **RE–CHARGE** (since 2026-10: the R is no longer read as the
name's first letter, so the name can't be misread as "E-CHARGE"):
- Space Grotesk 600, uppercase, letter-spacing 0.14em, colour #F4F6FA on dark (#0A0D13 on light).
- The hyphen is a short "charge" bar: 0.42em × 0.11em, rounded 2px, gradient #4D8DFF → #35C9E6,
  at the middle of the letters.
- The mark is 1.62× the text size, sitting on the baseline, with a gap of 0.6em before the name.
- Clear space: at least the height of the bar's width (0.42em) on every side.

Stacked version (social images, cards): mark above **RE–CHARGE**, with **DIGITAL STUDIO** in
Inter 500, letter-spacing 0.42em, at 55% opacity.

## Colour
| Use | Colour |
|---|---|
| Background | #07090E / #0A0D13 (near-black navy) |
| Text | #F4F6FA; muted #A7B2C4 |
| Accent (links, primary buttons) | #4D8DFF, bright #82B1FF, button #2F6FE0 |
| Second accent (free mockup, the charge bar) | #35C9E6 |
| Offers only (limited offer) | gold #F3D992 → #D4A94F |

Gold is reserved for limited offers, so it keeps meaning something.

## Type
Space Grotesk (headings, logo), Inter (text), JetBrains Mono (small labels and tags).

## Rendering
The share image (`/og-image.png`), icons and offer posts (`/marketing/`) were rendered from HTML
with Playwright using the local fonts in `scripts/film/fonts/`. To change one, ask for a re-render
rather than editing the PNG.
