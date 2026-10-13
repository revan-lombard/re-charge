# Business card

- **Front:** logo and tagline ("AI for the work that drains your team.").
- **Back:** a QR code only.

Scanning it opens **re-charge.co.za/card**:
- the 3D Re-Charge logo (one entrance spin, then a calm float)
- "Good to meet you." and the tagline
- **Save my contact**, the main button. It adds Re-Charge with the logo as the contact photo, plus your number, email, website and booking link. Afterwards it nudges: "Now say hi on WhatsApp, so I can save yours too."
- **WhatsApp me**, which opens a chat: "Hi! We just met. I scanned your card."
- **Book a free 30-minute call**
- a one-line trust note and a link to the Examples page

The buttons are ordered from the easiest step to the biggest ask, on purpose.

The same QR code is in `marketing/phone-qr/` for the Z Flip 6 cover screen.

## Files to send to the printer

- `re-charge-card-front.pdf` and `re-charge-card-back.pdf`: print-ready. 90 × 55 mm trim with 3 mm bleed (96 × 61 mm).
- The PNGs are the same at 300 dpi, for printers that ask for images.

Ask for: 90 × 55 mm, 350–400 gsm, **matte** (gloss reflects light over the QR). Spot UV on the logo is optional.

## Optional: tap to open (NFC)

Stick an NFC sticker (NTAG213/215) on the card. Then, in the free **NFC Tools** app: Write → URL → `https://re-charge.co.za/card?src=nfc`.

## Counting

GoatCounter, with no cookies, counts:
- `card-scan`: a QR scan
- `card-visit`: any other visit
- `card-book`: tapped Book a call
- `card-whatsapp`: tapped WhatsApp
- `card-save-contact`: tapped Save contact

## Changing it

- **Card:** `scripts/card/card.html`, then `node scripts/card/render.js`. Printed cards keep working as long as the QR code (`scripts/card/qr.svg`) stays the same.
- **Contact details** for Save contact: `assets/re-charge.vcf`.
