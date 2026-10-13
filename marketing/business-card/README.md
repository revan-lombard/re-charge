# Business card

- **Front:** logo and tagline.
- **Back:** a QR code only.

Scanning it opens **re-charge.co.za/card**:
- the phone camera opens and the 3D Re-Charge logo rises off the card, floats and spins
- below that, **Book a free 30-minute call**
- below that, **Message me on WhatsApp**, which opens a chat with you pre-filled with "Hi Re-Charge, I scanned your card."

With no camera, or before the phone finds the card, the logo floats and spins on its own, so it always looks right.

## Files to send to the printer

- `re-charge-card-front.pdf` and `re-charge-card-back.pdf`: print-ready. 90 × 55 mm trim with 3 mm bleed on every side (96 × 61 mm), colours as on screen.
- The PNGs are the same at 300 dpi, for printers that ask for images.

Ask for: 90 × 55 mm, 350–400 gsm, **matte** (soft-touch laminate if affordable).
- Matte matters: gloss reflects light over the QR and makes scanning and the AR less reliable.
- Optional: spot UV on the logo on the front.

## Optional: tap to open (NFC)

Stick an NFC sticker (NTAG213/215) on the back or inside the card. Then:
1. Install the free **NFC Tools** app.
2. Write → Add a record → URL → `https://re-charge.co.za/card?src=nfc`
3. Write it to the sticker.

## Counting scans

Scans are counted in GoatCounter, with no cookies:
- `card-scan`: a QR scan
- `card-visit`: any other visit
- `card-ar-found`: the AR found the card
- `card-book`: someone tapped Book a call
- `card-whatsapp`: someone tapped WhatsApp

## Changing the card

The source is `scripts/card/` (see the comments in each file). If you change the **back**, re-run `render.js` **and** `compile-target.js`, otherwise the AR won't recognise new cards. Old printed cards keep working only if the QR code stays the same.
