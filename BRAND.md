# Re-Charge Brand Guide

## Essence

Re-Charge takes a business problem, an idea or an inefficient process and
turns it into a working digital solution. The brand should feel like a small,
highly capable technology studio: **modern, practical, technical,
approachable, fast, confident, transparent.**

Core message, everywhere: **You have a problem. We build the solution.**

## Logo

**The mark — "Power Ring":** a power-symbol ring with a lightning bolt at
its core. The ring is the switch-on moment; the bolt is the charge. It reads
as energy, speed and "powering up" a business, without the recycling
arrows of the earlier identity.

| File | Use |
|---|---|
| `assets/logo-mark.svg` | Mark only (gradient) — avatars, watermarks |
| `assets/logo-mark.png` | 512px mark on gradient tile — app icon, apple-touch-icon |
| `assets/logo-lockup.svg` | Mark + wordmark + descriptor, light backgrounds |
| `assets/logo-lockup-dark.svg` | Same lockup for dark backgrounds |
| `favicon.svg` | White mark on gradient rounded square |

Rules:
- The hyphen in RE-CHARGE is always the accent green — the "spark" in the
  wordmark (`.logo-hyphen` in CSS).
- Don't rotate, recolour outside the palette, or separate the bolt from the ring.
- Clear space: at least the height of the bolt on all sides.
- SVG wordmarks use Space Grotesk via webfont — **convert text to outlines
  before print use.**

## Colour

| Token | Hex | Role |
|---|---|---|
| Green | `#0e9f7a` | Primary accent, buttons, the brand colour |
| Deep Green | `#0b8465` | Accent text on light backgrounds, hover |
| Mint | `#2df0b2` | Highlights on dark backgrounds |
| Ink Green | `#0e2a25` | Dark sections, CTA band |
| Tint | `#eff7f4` | Tinted section backgrounds |
| Paper | `#fbfdfc` | Page background |
| Ink | `#14201c` | Body text |
| Muted | `#55645e` | Secondary text |

Use gradients sparingly: only on the logo tile. Buttons and UI are solid
colour.

## Typography

- **Space Grotesk** (600–700) — headings, wordmark, buttons, prices, labels
- **Inter** (400–600) — body text, forms

## Taglines

**Primary (with the logo, hero, social image):**
> Digital solutions that solve real problems.

**Descriptor (lockup):** DIGITAL SOLUTIONS STUDIO

**Supporting lines:**
- *Websites · Dashboards · Automation · AI · Custom Software* — the service line
- *You have a problem. We build the solution.* — core message
- *Your business isn't the same as everyone else's. Your software shouldn't be either.* — custom positioning
- *Tell us what you're trying to accomplish. We'll figure out how to build it.* — CTA copy
- *Professional custom development without traditional agency pricing.* — affordability

## Calls to action

Primary: **Start a Project**. Secondary: **Tell Us What You Need** /
**View Services**. Never "Contact Us" — the site asks visitors to describe
their problem.

## Voice

- **Plain and practical.** Explain what the technology does, not what it is.
  "Instead of spending three hours every Friday compiling a report, we'll
  build a system that generates it automatically."
- **No buzzwords.** Avoid: AI-first, digital transformation, disruptive,
  revolutionary, next-generation, cutting-edge, seamless, leverage.
- **Honest about size.** A small studio, on purpose. Never imply a large
  team, fake client logos, fake statistics or fake testimonials.
- **Honest about estimates.** Starting prices are "from"; turnarounds are
  "target timeframes, not guaranteed delivery dates"; demo work is a
  "Concept project".
- **The customer buys the result.** Development tooling (including AI-assisted
  development) is an internal efficiency, never a selling point. Say "modern
  development methods allow us to deliver custom solutions faster" — never
  "we're cheaper because AI writes our code."
- Rand prices with a comma thousands separator: R2,500. En dashes for
  ranges: 2–5 business days.

## Visual rules

- Light UI, generous whitespace, one accent colour.
- Illustrations are UI: CSS/SVG mock-ups of dashboards, forms and flows.
  No stock photography, no robot or "AI" imagery, no futuristic interfaces.
- Icons: simple 2px line icons, one per service.
- Motion: subtle fade-up reveals only; respects `prefers-reduced-motion`.
