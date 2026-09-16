// Single place to wire the site to real services. Loaded on every page.
window.RECHARGE_CONFIG = {
  // Project Builder (start.html) POSTs the enquiry here.
  // Formspree endpoint (JSON) or a Google Apps Script /exec URL
  // (backend/apps-script.gs). Leave empty to store submissions in the
  // visitor's browser only (development).
  ENQUIRY_ENDPOINT: 'https://formspree.io/f/mzepnojr',

  // Attach uploaded files to the submission as multipart/form-data.
  // Formspree only accepts uploads on paid plans; leave false and the
  // builder lists the file names in the message instead, then asks the
  // client to send the files when we reply.
  ENQUIRY_ACCEPTS_FILES: false,

  // R500 deposit payment link (Yoco / Paystack / PayFast / Stripe payment
  // link, etc.). When set, the confirmation screen shows a "Pay R500"
  // button pointing here after the project is submitted. Leave empty and
  // the client is told we'll send a payment link with their confirmation.
  DEPOSIT_PAYMENT_URL: '',

  // Optional direct contact channels. When set, "WhatsApp"/"Email" links
  // appear in the footer and on start.html. Number in international format
  // without "+" (e.g. 27821234567).
  WHATSAPP_NUMBER: '27722375833',
  CONTACT_EMAIL: 'r4v3n.lmb@gmail.com',
};
