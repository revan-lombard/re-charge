// Re-Charge — site behaviour. No dependencies.
// Every form is handled in JS; block native submission globally (capture
// phase) so personal data can never end up in a URL.
document.addEventListener('submit', (e) => e.preventDefault(), true);
document.documentElement.classList.add('js');

const CONFIG = window.RECHARGE_CONFIG || {};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Nav ---------- */
const nav = document.querySelector('.nav');
const navToggle = document.querySelector('.nav__toggle');
const navLinks = document.querySelector('.nav__links');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  navLinks.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.focus();
    }
  });
}

if (nav) {
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- Reveal on scroll ---------- */
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length && 'IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  revealEls.forEach((el) => io.observe(el));
  // anything already in view (above the fold) shows immediately
  setTimeout(() => revealEls.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible');
  }), 50);
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}

/* ---------- Analytics events (GoatCounter, cookieless) ---------- */
window.trackEvent = function (name) {
  try {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: name, title: name, event: true });
    }
  } catch (e) { /* analytics must never break the site */ }
};

/* ---------- Optional contact channels ---------- */
(function () {
  const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const email = String(CONFIG.CONTACT_EMAIL || '').trim();
  let any = false;
  document.querySelectorAll('[data-contact="whatsapp"]').forEach((a) => {
    if (!wa) return;
    a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent("Hi Re-Charge, I'd like to talk about a project.");
    a.target = '_blank'; a.rel = 'noopener';
    a.hidden = false; any = true;
    a.addEventListener('click', () => window.trackEvent('contact-whatsapp'));
  });
  document.querySelectorAll('[data-contact="email"]').forEach((a) => {
    if (!email) return;
    a.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Project enquiry');
    a.hidden = false; any = true;
    a.addEventListener('click', () => window.trackEvent('contact-email'));
  });
  const card = document.getElementById('contactCard');
  if (card && any) card.hidden = false;
})();

/* ---------- Project enquiry form ---------- */
const form = document.getElementById('enquiryForm');
if (form) {
  const ENDPOINT = CONFIG.ENQUIRY_ENDPOINT || '';
  const ACCEPTS_FILES = Boolean(CONFIG.ENQUIRY_ACCEPTS_FILES);
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const loadedAt = Date.now();
  const thanks = document.getElementById('enquiryThanks');
  const errorBox = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const fileInput = document.getElementById('attachment');
  const fileList = document.getElementById('fileList');
  const fileHint = document.getElementById('fileHint');
  const pageField = document.getElementById('pageField');
  if (pageField) pageField.value = location.href.split('#')[0];

  // deep links from service pages: start.html?service=Dashboard
  const params = new URLSearchParams(location.search);
  const preService = params.get('service');
  if (preService) {
    const radio = form.querySelector('input[name="service"][value="' + preService.replace(/"/g, '') + '"]');
    if (radio) radio.checked = true;
  }
  const src = params.get('src');

  // company name only matters for businesses
  const companyRow = document.getElementById('companyRow');
  form.querySelectorAll('input[name="kind"]').forEach((r) => {
    r.addEventListener('change', () => {
      companyRow.hidden = r.checked && r.value === 'Individual';
    });
  });

  // selected files: show names, enforce size, explain what happens to them
  if (fileInput) {
    if (!ACCEPTS_FILES && fileHint) {
      fileHint.textContent = 'Up to 10 MB per file. File names are included with your enquiry; we\'ll send you a link to share the files when we reply.';
    }
    fileInput.addEventListener('change', () => {
      const files = [...fileInput.files];
      const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
      if (tooBig.length) {
        fileInput.value = '';
        fileList.textContent = 'Too large: ' + tooBig.map((f) => f.name).join(', ') + '. Please keep each file under 10 MB.';
        return;
      }
      fileList.textContent = files.length ? files.map((f) => f.name + ' (' + humanSize(f.size) + ')').join(', ') : '';
    });
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setError(field, show) {
    const input = form.elements[field];
    const msg = document.getElementById(field + 'Error');
    if (!input) return;
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    if (msg) msg.classList.toggle('is-visible', show);
  }

  function validate() {
    let firstBad = null;
    [['name', (v) => v.trim().length > 0],
     ['email', (v, el) => v.trim().length > 0 && el.checkValidity()],
     ['need', (v) => v.trim().length > 0],
     ['description', (v) => v.trim().length >= 10]].forEach(([field, ok]) => {
      const el = form.elements[field];
      const good = ok(el.value, el);
      setError(field, !good);
      if (!good && !firstBad) firstBad = el;
    });
    return firstBad;
  }

  ['name', 'email', 'need', 'description'].forEach((f) => {
    form.elements[f].addEventListener('input', () => setError(f, false));
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add('is-visible');
    submitBtn.removeAttribute('aria-busy');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Try again';
  }

  async function send(data, files) {
    if (!ENDPOINT) throw new Error('no endpoint configured');
    const isAppsScript = ENDPOINT.includes('script.google.com');
    if (isAppsScript) {
      // Apps Script can't answer CORS preflight — send as a "simple request"
      const res = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(data) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return;
    }
    let res;
    if (ACCEPTS_FILES && files.length) {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append('attachment', f, f.name));
      res = await fetch(ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: fd });
    } else {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = (j.errors || []).map((e) => e.message).join('; ') || j.error || ''; } catch (e) { /* ignore */ }
      throw new Error('HTTP ' + res.status + (detail ? ': ' + detail : ''));
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('is-visible');

    const firstBad = validate();
    if (firstBad) { firstBad.focus(); firstBad.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }

    const raw = Object.fromEntries(new FormData(form).entries());
    const files = fileInput ? [...fileInput.files] : [];
    const data = {};
    Object.entries(raw).forEach(([k, v]) => { if (typeof v === 'string' && k !== 'attachment') data[k] = v.trim(); });
    data.submittedAt = new Date().toISOString();
    if (src) data.channel = src;
    if (files.length) data.attachments = files.map((f) => f.name + ' (' + humanSize(f.size) + ')').join(', ');
    if (data.need) data._subject = 'Re-Charge enquiry: ' + data.need.slice(0, 80);

    // spam: honeypot filled, or submitted faster than a human could type
    const isSpam = Boolean(raw._gotcha) || Date.now() - loadedAt < 3000;
    delete data._gotcha;

    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      if (!isSpam) await send(data, files);
    } catch (err) {
      console.error('Enquiry submission failed:', err);
      // keep a local copy so nothing is lost, then tell the visitor plainly
      try {
        const stored = JSON.parse(localStorage.getItem('recharge-enquiries') || '[]');
        stored.push(data);
        localStorage.setItem('recharge-enquiries', JSON.stringify(stored));
      } catch (e) { /* storage blocked */ }
      const emailHint = CONFIG.CONTACT_EMAIL ? ' You can also email us directly at ' + CONFIG.CONTACT_EMAIL + '.' : '';
      showError("Sorry — we couldn't send your enquiry just now. Please check your connection and try again; nothing you typed has been lost." + emailHint);
      return;
    }

    form.hidden = true;
    thanks.hidden = false;
    const tf = document.getElementById('thanksFiles');
    if (tf && files.length && !ACCEPTS_FILES) {
      tf.textContent = 'You mentioned ' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' (' + files.map((f) => f.name).join(', ') + '). We\'ll send you a link to share them when we reply.';
      tf.hidden = false;
    }
    window.trackEvent('enquiry-submitted');
    thanks.focus({ preventScroll: true });
    thanks.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });
}
