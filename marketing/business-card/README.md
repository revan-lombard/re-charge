# Business card

- **Front:** logo and tagline ("AI for the work that drains your team.").
- **Back:** a QR code only.

Scanning it opens **re-charge.co.za/card**:
- the 3D Re-Charge logo, floating and spinning
- **Book a free 30-minute call**
- **Message me on WhatsApp** (opens a chat with you: "Hi Re-Charge, I scanned your card.")
- **Save contact** (adds Re-Charge, with your number, email and website, to their phone)

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
