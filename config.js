// Single place to wire the site to real services. Loaded on every page.
window.RECHARGE_CONFIG = {
  // Project enquiry form (start.html) POSTs here.
  // Formspree endpoint (JSON) or a Google Apps Script /exec URL
  // (backend/apps-script.gs). Leave empty to store submissions in the
  // visitor's browser only (development).
  ENQUIRY_ENDPOINT: 'https://formspree.io/f/mzepnojr',

  // Attach uploaded files to the submission as multipart/form-data.
  // Formspree only accepts file uploads on paid plans; leave false and the
  // form lists the file names in the message instead, and asks the visitor
  // to send the files when we reply.
  ENQUIRY_ACCEPTS_FILES: false,

  // Optional direct contact channels. When set, "WhatsApp"/"Email" links
  // appear in the footer and on start.html. Number in international format
  // without "+" (e.g. 27821234567).
  WHATSAPP_NUMBER: '',
  CONTACT_EMAIL: '',
};
