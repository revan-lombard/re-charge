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
  setTimeout(() => revealEls.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible');
  }), 50);
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}

/* ---------- Analytics & cookie consent ---------- */
// GA4 sets cookies, so it loads only after the visitor accepts (POPIA). The
// cookieless GoatCounter (footer) runs regardless. The choice is stored locally.
(function () {
  const GA = String(CONFIG.GA_MEASUREMENT_ID || '').trim();
  const GA_OK = Boolean(GA) && /^G-[A-Z0-9]+$/i.test(GA);
  let gaLoaded = false;
  function loadGA() {
    if (gaLoaded || !GA_OK) return;
    gaLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA);
  }

  let consent = null;
  try { consent = localStorage.getItem('rc-consent'); } catch (e) { /* storage blocked */ }
  if (consent === 'granted') loadGA();

  // Show the banner only when GA is configured and no choice has been made yet.
  const banner = document.getElementById('consent');
  if (banner && GA_OK && consent !== 'granted' && consent !== 'denied') {
    const choose = function (val) {
      try { localStorage.setItem('rc-consent', val); } catch (e) { /* storage blocked */ }
      banner.hidden = true;
      document.body.classList.remove('consent-open');
      if (val === 'granted') loadGA();
    };
    const acc = document.getElementById('consentAccept');
    const dec = document.getElementById('consentDecline');
    if (acc) acc.addEventListener('click', function () { choose('granted'); });
    if (dec) dec.addEventListener('click', function () { choose('denied'); });
    // Don't smother the hero on first load: reveal once the visitor scrolls,
    // or after a short fallback. No analytics runs before consent regardless.
    let shown = false;
    const reveal = function () {
      if (shown) return; shown = true;
      banner.hidden = false;
      document.body.classList.add('consent-open');
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = function () { if (window.scrollY > 140) reveal(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(reveal, 6000);
  }
})();

// One event helper → sends to GA4 and (if present) the cookieless GoatCounter.
window.trackEvent = function (name) {
  try { if (window.gtag) window.gtag('event', name); } catch (e) { /* never break the site */ }
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
  // +27 72 237 5833 from 27722375833 (ZA: country code + 9 digits)
  const prettyWa = wa.length === 11 ? '+' + wa.slice(0, 2) + ' ' + wa.slice(2, 4) + ' ' + wa.slice(4, 7) + ' ' + wa.slice(7) : '+' + wa;
  const waHref = 'https://wa.me/' + wa + '?text=' + encodeURIComponent("Hi Re-Charge, I'd like to talk about a project.");
  document.querySelectorAll('[data-contact="whatsapp"]').forEach((a) => {
    if (!wa) return;
    a.href = waHref;
    a.target = '_blank'; a.rel = 'noopener';
    a.hidden = false; any = true;
    a.addEventListener('click', () => window.trackEvent('contact-whatsapp'));
  });
  // Show the WhatsApp number itself as the link text (kept out of the raw HTML).
  document.querySelectorAll('[data-contact-whatsapp-text]').forEach((a) => {
    if (!wa) return;
    a.href = waHref; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = prettyWa;
    a.hidden = false; any = true;
    a.addEventListener('click', () => window.trackEvent('contact-whatsapp'));
  });
  document.querySelectorAll('[data-contact="email"]').forEach((a) => {
    if (!email) return;
    a.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Project enquiry');
    a.hidden = false; any = true;
    a.addEventListener('click', () => window.trackEvent('contact-email'));
  });
  // Same, but show the address itself as the link text (kept out of the raw HTML).
  document.querySelectorAll('[data-contact-email-text]').forEach((a) => {
    if (!email) return;
    a.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Project enquiry');
    a.textContent = email;
    a.hidden = false; any = true;
    a.addEventListener('click', () => window.trackEvent('contact-email'));
  });
  const card = document.getElementById('contactCard');
  if (card && any) card.hidden = false;
  if (any) document.querySelectorAll('[data-contact-block]').forEach((el) => { el.hidden = false; });
})();

/* ---------- Schedule a call (start.html) ---------- */
(function () {
  const dialog = document.getElementById('callDialog');
  const openBtns = document.querySelectorAll('[data-call-open]');
  if (!dialog || !openBtns.length) return;

  const ENDPOINT = String(CONFIG.ENQUIRY_ENDPOINT || '').trim();
  const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const email = String(CONFIG.CONTACT_EMAIL || '').trim();
  // Need somewhere for the request to go, or a channel to fall back to.
  if (!ENDPOINT && !wa && !email) return;

  const form = dialog.querySelector('#callForm');
  const daysWrap = dialog.querySelector('#callDays');
  const errorBox = dialog.querySelector('#callError');
  const submitBtn = dialog.querySelector('#callSubmit');
  const doneBox = dialog.querySelector('#callDone');
  const doneMsg = dialog.querySelector('#callDoneMsg');
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Next 5 weekdays, starting tomorrow (skip Sat/Sun) — gives at least a day's notice.
  const days = [];
  let d = new Date();
  while (days.length < 5) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push(new Date(d));
  }
  daysWrap.innerHTML = days.map(function (dt, i) {
    const val = DAY[dt.getDay()] + ' ' + dt.getDate() + ' ' + MON[dt.getMonth()];
    return '<label><input type="radio" name="callDay" value="' + val + '"' + (i === 0 ? ' checked' : '') + ' /><span>' + DAY[dt.getDay()] + ' ' + dt.getDate() + '</span></label>';
  }).join('');

  function showError(msg) { errorBox.innerHTML = msg; errorBox.hidden = false; }

  function openDialog() {
    errorBox.hidden = true; errorBox.textContent = '';
    doneBox.hidden = true; form.hidden = false;
    // Prefill from the builder if the visitor already typed their details there.
    const src = { callName: 'name', callPhone: 'phone', callEmail: 'email' };
    Object.keys(src).forEach(function (f) {
      const from = document.getElementById(src[f]);
      if (from && from.value && form[f] && !form[f].value) form[f].value = from.value.trim();
    });
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    window.trackEvent('call-open');
  }
  function closeDialog() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  openBtns.forEach(function (b) { b.hidden = false; b.addEventListener('click', openDialog); });
  dialog.querySelectorAll('[data-call-close]').forEach(function (b) { b.addEventListener('click', closeDialog); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });

  // The card holding the button may still be hidden if no message channel is set.
  const card = document.getElementById('contactCard');
  if (card) card.hidden = false;

  function waFallback(data) {
    if (!wa) return '';
    const msg = "Hi Re-Charge, I'd like to schedule a call.\nDay: " + data.callDay + '\nTime: ' + data.callTime +
      '\nName: ' + data.callName + '\nPhone: ' + data.callPhone + (data.callNote ? '\nNote: ' + data.callNote : '');
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) { if (typeof v === 'string') data[k] = v.trim(); }
    if (fd.get('_gotcha')) { closeDialog(); return; } // honeypot: silently drop bots
    delete data._gotcha;
    if (!data.callDay) return showError('Please pick a day.');
    if (!data.callTime) return showError('Please choose a time of day.');
    if (!data.callName) return showError('Please tell us your name.');
    if (!data.callPhone) return showError('Please add a phone number so we can call you.');

    data.formType = 'Call request';
    data.submittedAt = new Date().toISOString();
    data._subject = '☎️ Call request: ' + data.callName + ' — ' + data.callDay + ', ' + data.callTime;

    submitBtn.disabled = true; submitBtn.setAttribute('aria-busy', 'true');
    const label0 = submitBtn.textContent; submitBtn.textContent = 'Sending…';

    let ok = false;
    try {
      if (ENDPOINT) {
        let res;
        if (ENDPOINT.includes('script.google.com')) {
          res = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(data) });
        } else {
          res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        }
        ok = !!(res && res.ok);
      }
    } catch (err) { ok = false; }

    submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); submitBtn.textContent = label0;

    if (ok) {
      window.trackEvent('call-request');
      form.hidden = true;
      doneMsg.textContent = 'Thanks ' + data.callName + '. We’ll call you on ' + data.callDay + ' (' +
        data.callTime.replace(/\s*\(.*\)/, '').toLowerCase() + ') on ' + data.callPhone + ', and confirm shortly.';
      doneBox.hidden = false;
    } else {
      // Never lose the request: stash it and offer WhatsApp / email.
      try { const s = JSON.parse(localStorage.getItem('recharge-calls') || '[]'); s.push(data); localStorage.setItem('recharge-calls', JSON.stringify(s)); } catch (e2) { /* storage blocked */ }
      const href = waFallback(data);
      showError('Couldn’t send just now. ' + (href
        ? 'You can <a class="inline-link" href="' + href + '" target="_blank" rel="noopener">send it on WhatsApp</a> instead.'
        : (email ? 'Please email us at ' + email + '.' : 'Please check your connection and try again.')));
    }
  });
})();

/* ---------- Project Builder (start.html) ---------- */
const builder = document.getElementById('builderForm');
if (builder) initBuilder(builder);

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function initBuilder(form) {
  const ENDPOINT = CONFIG.ENQUIRY_ENDPOINT || '';
  const ACCEPTS_FILES = Boolean(CONFIG.ENQUIRY_ACCEPTS_FILES);
  const PAY_URL = String(CONFIG.DEPOSIT_PAYMENT_URL || '').trim();
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const loadedAt = Date.now();

  const steps = [...form.querySelectorAll('.builder__step')];
  const progress = [...form.querySelectorAll('#builderProgress button')];
  const backBtn = form.querySelector('#backBtn');
  const nextBtn = form.querySelector('#nextBtn');
  const submitBtn = form.querySelector('#submitBtn');
  const errorBox = form.querySelector('#formError');
  const fileInput = form.querySelector('#attachment');
  const fileList = form.querySelector('#fileList');
  const fileHint = form.querySelector('#fileHint');
  const thanks = document.getElementById('builderThanks');
  const pageField = form.querySelector('#pageField');
  const liveEst = form.querySelector('#liveEst');
  const liveEstPrice = form.querySelector('#liveEstPrice');
  if (pageField) pageField.value = location.href.split('#')[0];

  const PRICES = {
    'Website':       { label: 'Website',        min: 1000 },
    'Dashboard':     { label: 'Dashboard',      min: 2000 },
    'Automation':    { label: 'Automation',     min: 2000 },
    'AI':            { label: 'AI Integration', min: 3500 },
    'Custom Tool':   { label: 'Custom Tool',    min: 4500 },
    'Something Else':{ label: 'Custom project', min: null },
    'Not Sure':      { label: 'Custom project', min: null },
  };
  const EXAMPLES = {
    'Website': 'e.g. "I run a plumbing business and want customers to see our services, contact us on WhatsApp and request a quote."',
    'Dashboard': 'e.g. "I have three sales spreadsheets and want one screen showing revenue, top products and monthly targets."',
    'Automation': 'e.g. "Every day I copy orders from WhatsApp into Excel. I want that to happen automatically and email a confirmation."',
    'AI': 'e.g. "New staff keep asking the same questions. I want an assistant that answers from our policy documents."',
    'Custom Tool': 'e.g. "I want a calculator where a customer picks options and gets an instant price they can send to me."',
    'Something Else': 'Tell us what you\u2019re trying to accomplish, in your own words.',
    'Not Sure': 'Tell us what you\u2019re currently doing, what\u2019s frustrating you, or what you\u2019d like to improve.',
  };
  const BUDGET_MAX = {
    'Under R1,000': 1000, 'R1,000\u2013R2,500': 2500, 'R2,500\u2013R5,000': 5000,
    'R5,000\u2013R10,000': 10000, 'R10,000+': Infinity,
  };

  let current = 1;
  let maxReached = 1;

  const catInputs = () => [...form.querySelectorAll('input[name="cat"]')];
  const selectedCats = () => catInputs().filter((c) => c.checked).map((c) => c.value);

  const params = new URLSearchParams(location.search);
  const preType = params.get('type');
  if (preType) {
    const match = catInputs().find((c) => c.value.toLowerCase() === preType.toLowerCase());
    if (match) match.checked = true;
  }
  const srcChannel = params.get('src') || '';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function projectName(cats) {
    const named = cats.filter((c) => c !== 'Something Else' && c !== 'Not Sure');
    if (named.length === 1) return PRICES[named[0]].label;
    if (named.length > 1) return 'Custom project (' + named.map((c) => PRICES[c].label).join(' + ') + ')';
    return 'Custom project';
  }
  function estimateFor(cats) {
    const mins = cats.map((c) => PRICES[c] && PRICES[c].min).filter((m) => m != null);
    if (!mins.length) return null;
    const floor = cats.length === 1 ? mins[0] : mins.reduce((a, b) => a + b, 0);
    return { floor, text: 'From R' + floor.toLocaleString('en-ZA') };
  }

  function updateExample() {
    const cats = selectedCats();
    const primary = cats.find((c) => EXAMPLES[c]) || 'Something Else';
    const ex = form.querySelector('#goalExample');
    if (ex) ex.textContent = EXAMPLES[primary] || '';
  }
  function updateLive() {
    if (!liveEst) return;
    const cats = selectedCats();
    if (!cats.length) { liveEst.hidden = true; return; }
    const est = estimateFor(cats);
    liveEstPrice.textContent = est ? est.text : 'Quoted after review';
    liveEst.hidden = false;
  }
  function updateGroups() {
    const cats = selectedCats();
    form.querySelectorAll('.qgroup').forEach((g) => { g.hidden = !cats.includes(g.dataset.qgroup); });
  }
  function buildEstimate() {
    const cats = selectedCats();
    form.querySelector('#estProject').textContent = projectName(cats);
    const est = estimateFor(cats);
    const priceText = est ? est.text : 'Quoted after review';
    form.querySelector('#estPrice').textContent = priceText;
    form.querySelector('#priceField').value = priceText;
    form.querySelector('#categoryField').value = cats.join(', ');
    const bud = form.budget ? form.budget.value : '';
    const estBudget = form.querySelector('#estBudget');
    const estOver = form.querySelector('#estOver');
    if (bud) { estBudget.innerHTML = 'Your budget: <b>' + escapeHtml(bud) + '</b>'; estBudget.hidden = false; }
    else { estBudget.hidden = true; }
    if (bud && est && BUDGET_MAX[bud] != null && est.floor > BUDGET_MAX[bud]) {
      estOver.textContent = 'Heads up: this may come in above that range. We\u2019ll suggest the best-value option and confirm the price before you commit.';
      estOver.hidden = false;
    } else { estOver.hidden = true; }
  }

  function showStep(n, opts) {
    current = n;
    maxReached = Math.max(maxReached, n);
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    progress.forEach((li) => {
      const f = Number(li.dataset.for);
      li.classList.toggle('is-active', f === n);
      li.classList.toggle('is-done', f < n);
      if (f === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.style.cursor = f <= maxReached ? 'pointer' : 'default';
    });
    backBtn.hidden = n === 1;
    nextBtn.hidden = n === steps.length;
    if (n === 1) { updateExample(); updateLive(); }
    if (n === 2) updateGroups();
    if (n === 3) buildEstimate();
    errorBox.classList.remove('is-visible');
    const focusable = steps[n - 1].querySelector('input, textarea, select, button, [tabindex]');
    if (focusable) focusable.focus({ preventScroll: true });
    if (!(opts && opts.scroll === false)) {
      form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  progress.forEach((btn) => {
    btn.addEventListener('click', () => { const f = Number(btn.dataset.for); if (f <= maxReached) showStep(f); });
  });

  function setError(field, show) {
    const input = form.elements[field];
    const msg = document.getElementById(field + 'Error');
    if (input && input.setAttribute) input.setAttribute('aria-invalid', show ? 'true' : 'false');
    if (msg) msg.classList.toggle('is-visible', show);
  }

  function validateStep(n) {
    if (n === 1) {
      const okCat = selectedCats().length > 0;
      form.querySelector('#catError').classList.toggle('is-visible', !okCat);
      const okGoal = (form.goal.value || '').trim().length >= 6;
      setError('goal', !okGoal);
      if (!okCat) { const c = form.querySelector('#categoryGrid input'); if (c) c.focus(); return false; }
      if (!okGoal) { form.goal.focus(); return false; }
      return true;
    }
    if (n === 3) {
      let firstBad = null;
      [['name', (v) => v.trim().length > 0],
       ['email', (v, el) => v.trim().length > 0 && el.checkValidity()]].forEach(([f, ok]) => {
        const el = form.elements[f];
        const good = ok(el.value, el);
        setError(f, !good);
        if (!good && !firstBad) firstBad = el;
      });
      if (firstBad) { firstBad.focus(); return false; }
    }
    return true;
  }

  ['goal', 'name', 'email'].forEach((f) => {
    const el = form.elements[f];
    if (el) el.addEventListener('input', () => setError(f, false));
  });
  catInputs().forEach((c) => c.addEventListener('change', () => {
    if (selectedCats().length) form.querySelector('#catError').classList.remove('is-visible');
    updateExample(); updateLive();
  }));

  if (fileInput) {
    if (!ACCEPTS_FILES && fileHint) {
      fileHint.textContent = 'Up to 10 MB per file. File names are included with your project; we\u2019ll send a link to share the files when we reply.';
    }
    fileInput.addEventListener('change', () => {
      const files = [...fileInput.files];
      const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
      if (tooBig.length) {
        fileInput.value = '';
        fileList.textContent = 'Too large: ' + tooBig.map((f) => f.name).join(', ') + '. Keep each file under 10 MB.';
        return;
      }
      fileList.textContent = files.length ? files.map((f) => f.name + ' (' + humanSize(f.size) + ')').join(', ') : '';
    });
  }

  nextBtn.addEventListener('click', () => {
    if (!validateStep(current)) return;
    showStep(Math.min(current + 1, steps.length));
  });
  backBtn.addEventListener('click', () => showStep(Math.max(1, current - 1)));


  // Returns the parsed response body (so we can read a project id from the
  // Supabase intake function), or null.
  async function send(data, files) {
    if (!ENDPOINT) throw new Error('no endpoint configured');
    if (ENDPOINT.includes('script.google.com')) {
      const res = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(data) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return null;
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
    try { return await res.json(); } catch (e) { return null; }
  }

  // If a per-project checkout endpoint is configured and we have a project id,
  // create a Yoco checkout tagged with it and return its redirect URL.
  async function checkoutUrlFor(projectId) {
    const url = String(CONFIG.CHECKOUT_ENDPOINT || '').trim();
    if (!url || !projectId) return '';
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const j = await r.json();
      return (r.ok && j && j.redirectUrl) ? String(j.redirectUrl) : '';
    } catch (e) { return ''; }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current !== steps.length) { if (validateStep(current)) showStep(current + 1); return; }
    errorBox.classList.remove('is-visible');
    if (!validateStep(steps.length)) return;

    const fd = new FormData(form);
    const files = fileInput ? [...fileInput.files] : [];
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (k === 'attachment' || typeof v !== 'string') continue;
      if (k in data) data[k] = data[k] + ', ' + v.trim();
      else data[k] = v.trim();
    }
    data.submittedAt = new Date().toISOString();
    if (srcChannel) data.channel = srcChannel;
    if (files.length) data.attachments = files.map((f) => f.name + ' (' + humanSize(f.size) + ')').join(', ');
    data._subject = 'Re-Charge project: ' + (data.category || 'enquiry') + ' \u2014 ' + (data.name || '');

    const isSpam = Boolean(fd.get('_gotcha')) || Date.now() - loadedAt < 4000;
    delete data._gotcha;

    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting\u2026';

    let resp = null;
    try {
      if (!isSpam) resp = await send(data, files);
    } catch (err) {
      console.error('Project submission failed:', err);
      try {
        const stored = JSON.parse(localStorage.getItem('recharge-projects') || '[]');
        stored.push(data); localStorage.setItem('recharge-projects', JSON.stringify(stored));
      } catch (e2) { /* storage blocked */ }
      const emailHint = CONFIG.CONTACT_EMAIL ? ' You can also email us at ' + CONFIG.CONTACT_EMAIL + '.' : '';
      errorBox.textContent = "Sorry \u2014 we couldn't submit your project just now. Please check your connection and try again; nothing you entered has been lost." + emailHint;
      errorBox.classList.add('is-visible');
      submitBtn.removeAttribute('aria-busy');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit project';
      return;
    }

    window.trackEvent('project-submitted');

    // project id/ref returned by the Supabase intake function (if in use)
    const projectId = resp && (resp.id || resp.projectId || (resp.data && resp.data.id));
    const ref = resp && (resp.ref || (resp.data && resp.data.ref));
    // prefer a per-project checkout (auto-reconciles); else the static pay link
    const dynamicUrl = await checkoutUrlFor(projectId);
    const payUrl = dynamicUrl || PAY_URL;

    form.hidden = true;
    thanks.hidden = false;
    if (ref) {
      const tb = document.getElementById('thanksBody');
      if (tb) tb.innerHTML = tb.innerHTML + ' <br><span class="small muted">Your reference: <strong>' + escapeHtml(ref) + '</strong></span>';
    }
    const pay = document.getElementById('thanksPay');
    if (pay) {
      if (payUrl) {
        // the static-link path needs a manual reference; the dynamic one doesn't
        const refNote = dynamicUrl ? '' : ' Use your name or business as the payment reference.';
        pay.innerHTML = 'One quick step left: <a class="btn btn--primary btn--small" href="' + escapeHtml(payUrl) + '" target="_blank" rel="noopener" onclick="window.trackEvent && window.trackEvent(\'deposit-clicked\')">Pay R500 deposit</a>'
          + '<br><span class="small muted">Secure card payment via Yoco, credited to your project.' + refNote + '</span>';
        pay.hidden = false;
      } else {
        pay.textContent = 'We\u2019ll send a secure R500 deposit link with your confirmation. It\u2019s credited to your project.';
        pay.hidden = false;
      }
    }
    thanks.focus({ preventScroll: true });
    thanks.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  showStep(1, { scroll: false });
}
