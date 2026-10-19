# Business card

- **Front:** logo and tagline ("AI for the work that drains your team.").
- **Back:** a QR code only.

Scanning it opens **re-charge.co.za/card**:
- the name (RE-CHARGE) and the 3D logo (one entrance spin, then a calm float)
- "Thanks for the chat. Let's keep in touch." (whoever scans it has just spoken to you, so no tagline)
- **Save my contact**, the main button. It saves **"Révan · Re-Charge"**. On iPhone the contact card opens straight away (tap Create New Contact). On Android, browsers can only download the contact, so the page says exactly what to tap ("Open" on the download message, then "Save"). The contact has the logo as the contact photo, plus your number, email, website and booking link. Afterwards it nudges: "Now say hi on WhatsApp, so I can save yours too."
- **WhatsApp me**, which opens a chat: "Hi! We just met. I scanned your card."
- **Book a free 30-minute call**
- **Visit re-charge.co.za**, a link to the homepage

No prices on the card: they're on the website.

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
- `card-site`: tapped Visit re-charge.co.za

## Changing it

- **Card:** `scripts/card/card.html`, then `node scripts/card/render.js`. Printed cards keep working as long as the QR code (`scripts/card/qr.svg`) stays the same.
- **Contact details** for Save contact: `assets/re-charge.vcf`.
