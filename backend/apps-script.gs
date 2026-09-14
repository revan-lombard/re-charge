/**
 * Re-Charge form backend — Google Apps Script
 * Receives project enquiries from start.html and emails them to you.
 * No third-party service: runs in YOUR Google account, free
 * (consumer Gmail quota: ~100 emails/day).
 *
 * ── SETUP (once, ~5 minutes) ─────────────────────────────────
 * 1. Go to https://script.google.com → "New project"
 * 2. Delete the placeholder code, paste this whole file, save (name it "Re-Charge Forms")
 * 3. (Optional) create a Google Sheet, copy its ID from the URL into SHEET_ID
 *    below — every submission then also lands in the sheet as a row.
 * 4. Deploy → New deployment → type: "Web app"
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    → Authorize when prompted → copy the Web app URL (ends in /exec)
 * 5. Paste that URL into config.js as ENQUIRY_ENDPOINT. Done.
 *
 * To update the script later: edit here, then Deploy → Manage deployments →
 * pencil icon → Version: New version → Deploy (the URL stays the same).
 */

// Where submission emails go. Leave as-is to use the Google account that
// deploys the script, or hardcode: var NOTIFY_EMAIL = 'you@example.com';
var NOTIFY_EMAIL = Session.getEffectiveUser().getEmail();

// Optional: Google Sheet ID for a permanent log (the long ID in the sheet URL).
var SHEET_ID = '';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // honeypot: silently accept and discard bot submissions
    if (data.website) return jsonOut({ ok: true });

    var type = String(data.type || 'submission');
    var lines = Object.keys(data)
      .filter(function (k) { return k !== '_subject' && k !== 'website'; })
      .map(function (k) { return k + ': ' + data[k]; })
      .join('\n');

    var mail = {
      to: NOTIFY_EMAIL,
      subject: 'Re-Charge: ' + type,
      body: lines + '\n\n— sent by the Re-Charge site',
    };
    if (data.email) mail.replyTo = String(data.email);
    MailApp.sendEmail(mail);

    if (SHEET_ID) {
      SpreadsheetApp.openById(SHEET_ID)
        .getSheets()[0]
        .appendRow([new Date(), type, data.email || '', JSON.stringify(data)]);
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
