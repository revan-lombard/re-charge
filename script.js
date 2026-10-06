// Re-Charge — site behaviour. No dependencies.
// Every form is handled in JS; block native submission globally (capture
// phase) so personal data can never end up in a URL.
document.addEventListener('submit', (e) => e.preventDefault(), true);
document.documentElement.classList.add('js');

// Campaign attribution: a tracked link (?src=campaign-code) is remembered for
// 30 days so the enquiry it eventually produces is credited to that campaign,
// even when the visitor lands on the homepage and enquires later.
window.rcSource = (function () {
  const KEY = 'rc_src';
  try {
    const s = new URLSearchParams(location.search).get('src');
    if (s) localStorage.setItem(KEY, JSON.stringify({ s: String(s).slice(0, 60), t: Date.now() }));
  } catch (e) { /* storage blocked */ }
  return function () {
    try {
      const q = new URLSearchParams(location.search).get('src');
      if (q) return String(q).slice(0, 60);
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && Date.now() - v.t < 30 * 864e5 ? v.s : '';
    } catch (e) { return ''; }
  };
})();

// Referrals: a client's link (?ref=their-code) is remembered for 60 days and
// sent with any enquiry, so the client who sent them gets their free year of Care.
window.rcRef = (function () {
  const KEY = 'rc_ref';
  try {
    const r = new URLSearchParams(location.search).get('ref');
    if (r && /^[a-z0-9-]{2,60}$/i.test(r)) localStorage.setItem(KEY, JSON.stringify({ r: r.toLowerCase(), t: Date.now() }));
  } catch (e) { /* storage blocked */ }
  return function () {
    try {
      const q = new URLSearchParams(location.search).get('ref');
      if (q && /^[a-z0-9-]{2,60}$/i.test(q)) return q.toLowerCase();
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && Date.now() - v.t < 60 * 864e5 ? v.r : '';
    } catch (e) { return ''; }
  };
})();

// Normalise old `.html` URLs to the clean form in the address bar (no reload).
// GitHub Pages serves both /services and /services.html but doesn't redirect;
// this tidies the bar for anyone who lands on a .html link. Canonical tags
// already point at the clean URLs, so there's no SEO effect.
(function () {
  try {
    if (!('replaceState' in history)) return;
    const p = location.pathname;
    if (!/\.html$/i.test(p)) return;
    const clean = /\/index\.html$/i.test(p) ? p.replace(/index\.html$/i, '') : p.replace(/\.html$/i, '');
    history.replaceState(null, '', clean + location.search + location.hash);
  } catch (e) { /* leave the URL as-is */ }
})();

const CONFIG = window.RECHARGE_CONFIG || {};

// Limited offer: a slim banner above the nav with the real number of spots
// left (from the panel via the public `offer` function), plus any
// [data-offer-note] boxes on the page. Nothing shows if no offer is running.
(function offerBanner() {
  if (!CONFIG.OFFER_ENDPOINT || /\/(admin|dashboard)\//.test(location.pathname)) return;
  const KEY = 'rc_offer_closed';
  fetch(CONFIG.OFFER_ENDPOINT).then((r) => r.ok ? r.json() : null).then((o) => {
    if (!o || !o.active) return;
    const spots = o.left + ' spot' + (o.left === 1 ? '' : 's') + ' left';
    const off = Number(o.discount) || 50, carePrice = Math.round(1000 * (100 - off) / 100);
    const deal = off >= 100 ? 'your first year of Care free' : off + '% off your first year of Care (R' + carePrice + ' instead of R1,000)';
    const ends = o.ends ? new Date(o.ends + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : '';
    const href = 'free-mockup?src=offer-banner';
    // Older offer functions default the name to "Founding N"; show the neutral label instead.
    const name = !o.name || /^Founding \d+$/.test(o.name) ? 'Limited offer' : o.name;
    const next = o.left === 1 ? 'My next website client gets' : 'My next ' + o.left + ' website clients get';
    document.querySelectorAll('[data-offer-note]').forEach((el) => {
      el.innerHTML = '<span class="offer-note__tag">' + name + '</span><p><strong>' + next + ' ' + deal.replace('your first', 'their first') + '.</strong> Your website is still from R1,000, with a free mockup first. ' + (ends ? 'Until ' + ends + ', or while spots last' : 'While spots last') + '. A spot is yours when you accept your quote and pay the deposit.</p>';
      el.hidden = false;
    });
    let closed = 0; try { closed = Number(localStorage.getItem(KEY)) || 0; } catch (e) { /* storage blocked */ }
    if (Date.now() - closed < 3 * 864e5) return;
    const bar = document.createElement('div');
    bar.className = 'offer-bar';
    bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Limited offer');
    bar.innerHTML = '<div class="container offer-bar__inner"><a class="offer-bar__link" href="' + href + '"><span class="offer-bar__tag">' + name + '</span><span class="offer-bar__text"><span class="offer-bar__long">' + next + ' ' + (off >= 100 ? 'their first year of Care free' : off + '% off their first year of Care') + (ends ? ', until ' + ends : '') + '.</span><span class="offer-bar__short">' + (off >= 100 ? 'Care free' : off + '% off Care') + ' · <b>' + spots + '</b></span></span><span class="offer-bar__cta">Get a free mockup →</span></a><button type="button" class="offer-bar__x" aria-label="Hide the offer">×</button></div>';
    bar.querySelector('.offer-bar__x').addEventListener('click', () => { bar.remove(); try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ } });
    const nav = document.querySelector('header.nav');
    (nav ? nav.parentNode : document.body).insertBefore(bar, nav || document.body.firstChild);
  }).catch(() => { /* no banner */ });
})();
// Referred by a client (?ref=their-code, remembered 60 days): they get R250 off their website,
// and the client who sent them a free year of Care. ?ref=credit (a client-site footer link) isn't a referral.
(function referralBar() {
  if (/\/(admin|dashboard)\//.test(location.pathname) || /\/quote/.test(location.pathname)) return;
  const ref = window.rcRef ? window.rcRef() : '';
  if (!ref || ref === 'credit') return;
  const KEY = 'rc_ref_bar';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) { /* storage blocked */ }
  const bar = document.createElement('div');
  bar.className = 'offer-bar';
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Referral discount');
  bar.innerHTML = '<div class="container offer-bar__inner"><a class="offer-bar__link" href="free-mockup?src=referral"><span class="offer-bar__tag">Referred</span><span class="offer-bar__text"><span class="offer-bar__long">One of our clients sent you, so you get <b>R250 off your website</b>, plus a free mockup first.</span><span class="offer-bar__short"><b>R250 off</b> your website</span></span><span class="offer-bar__cta">Get a free mockup →</span></a><button type="button" class="offer-bar__x" aria-label="Hide">×</button></div>';
  bar.querySelector('.offer-bar__x').addEventListener('click', () => { bar.remove(); try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } });
  const nav = document.querySelector('header.nav');
  (nav ? nav.parentNode : document.body).insertBefore(bar, nav || document.body.firstChild);
  setTimeout(() => { if (window.trackEvent) window.trackEvent('referral-visit'); }, 0);
})();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Muted loop films: load and play only while on screen; with reduced motion,
// show the poster and let the visitor press play.
(function initFilms() {
  const vids = document.querySelectorAll('video[data-autoplay]');
  if (!vids.length) return;
  // phones get the portrait cut (swapped before anything has loaded: preload="none")
  const phone = window.matchMedia('(max-width: 640px)').matches, wide = window.matchMedia('(min-width: 901px)').matches;
  // desktop hero gets the 4:5 cut (data-desktop), sized to the text beside it
  vids.forEach((v) => {
    if (wide && v.dataset.desktop) {
      const base = v.dataset.desktop;
      v.poster = base.replace(/-hero$/, '-poster-hero') + '.jpg';
      v.querySelectorAll('source').forEach((s) => { s.src = base + (s.type === 'video/webm' ? '.webm' : '.mp4'); });
      v.width = 720; v.height = 900; v.classList.add('is-hero'); v.load();
      return;
    }
    const base = v.dataset.portrait; if (!base || !(phone || (wide && v.hasAttribute('data-portrait-desktop')))) return;
    v.poster = base.replace(/-portrait$/, '-poster-portrait') + '.jpg';
    v.querySelectorAll('source').forEach((s) => { s.src = base + (s.type === 'video/webm' ? '.webm' : '.mp4'); });
    v.width = 720; v.height = 960; v.classList.add('is-portrait'); v.load();
  });
  // keep the hero film no taller than the headline block next to it (plus a little)
  const heroFilm = document.querySelector('.hero__visual .flow-film--hero'), heroCopy = document.querySelector('.hero__copy');
  if (heroFilm && heroCopy && wide) {
    const fit = () => {
      if (!window.matchMedia('(min-width: 901px)').matches) { heroFilm.style.width = ''; return; }
      const col = heroFilm.parentElement.clientWidth, h = heroCopy.getBoundingClientRect().height + 40;
      // Never below 396px: the hero film is drawn at that width, so anything
      // narrower shrinks its chat text below a comfortable reading size.
      heroFilm.style.width = Math.round(Math.max(396, Math.min(col, h * 0.8))) + 'px';
    };
    fit(); window.addEventListener('resize', fit); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  }
  if (reduceMotion || !('IntersectionObserver' in window)) { vids.forEach((v) => { v.controls = true; v.loop = false; }); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => { v.controls = true; }); }
    else v.pause();
  }), { threshold: 0.35 });
  vids.forEach((v) => io.observe(v));
})();

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
/* Siblings that come into view together are staggered rather than all firing at
   once, which is most of the difference between "things fade in" and choreography.
   The delay is a CSS custom property so the stylesheet owns the timing. */
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length && 'IntersectionObserver' in window && !reduceMotion) {
  const STAGGER = 70, MAX_STEPS = 5;
  const io = new IntersectionObserver((entries) => {
    const arriving = entries.filter((e) => e.isIntersecting);
    // Group by parent so a row of cards counts off, but separate sections don't.
    const seen = new Map();
    arriving.forEach((entry) => {
      const key = entry.target.parentElement || document.body;
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      entry.target.style.setProperty('--reveal-delay', Math.min(n, MAX_STEPS) * STAGGER + 'ms');
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
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
// Every event carries the homepage headline variant (A/B test) once a visitor
// has one; the events that decide the test are also counted per variant in
// GoatCounter (e.g. "mockup-request/hv-b"), so the split shows without GA.
const HV_SPLIT = { 'hero-view': 1, 'cap-request': 1, 'preview-typed': 1, 'preview-cta': 1, 'mockup-open': 1, 'mockup-request': 1, 'project-submitted': 1, 'scroll-50': 1 };
const heroVariant = () => { try { return window.rcHeadline || localStorage.getItem('rc_hv') || ''; } catch (e) { return ''; } };
// Anyone who has already reached out isn't shown the "before you go" check again.
const CONVERSIONS = { 'mockup-request': 1, 'gbp-request': 1, 'project-submitted': 1, 'call-request': 1, 'cap-request': 1, 'contact-whatsapp': 1, 'mockup-whatsapp': 1 };
window.trackEvent = function (name, params) {
  if (CONVERSIONS[name]) { try { localStorage.setItem('rc_converted', String(Date.now())); } catch (e) { /* storage blocked */ } }
  const hv = heroVariant();
  try { if (window.gtag) window.gtag('event', name, Object.assign({ hero_variant: hv || 'none' }, params || {})); } catch (e) { /* never break the site */ }
  const gc = function () {
    if (!(window.goatcounter && window.goatcounter.count)) return false;
    window.goatcounter.count({ path: name, title: name, event: true });
    if (hv && HV_SPLIT[name]) window.goatcounter.count({ path: name + '/hv-' + hv, title: name + ' (headline ' + hv.toUpperCase() + ')', event: true });
    return true;
  };
  // GoatCounter loads async: queue early events (e.g. hero-view) until it's ready.
  try { if (!gc()) { let n = 0; const t = setInterval(function () { if (gc() || ++n > 20) clearInterval(t); }, 500); } } catch (e) { /* analytics must never break the site */ }
};

/* ---------- Attention: scroll depth, form starts, headline views ---------- */
(function attention() {
  const page = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (document.getElementById('ipForm')) {
    try { if (!sessionStorage.getItem('rc_hview')) { sessionStorage.setItem('rc_hview', '1'); window.trackEvent('hero-view'); } } catch (e) { window.trackEvent('hero-view'); }
  }
  // how far people get: 25 / 50 / 75 / 100% of the page, once each per page view
  const marks = [25, 50, 75, 100], hit = {};
  let ticking = false;
  const check = function () {
    ticking = false;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h <= 0 ? 100 : Math.round((window.scrollY / h) * 100);
    marks.forEach(function (m) { if (!hit[m] && pct >= m - 1) { hit[m] = true; window.trackEvent('scroll-' + m, { page_path: page }); } });
    if (hit[100]) window.removeEventListener('scroll', onScroll);
  };
  const onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  // form started: the first field someone touches in each form
  document.addEventListener('focusin', function (e) {
    const f = e.target && e.target.form;
    if (!f || !f.id || f.dataset.started || f.id === 'ipForm') return;
    f.dataset.started = '1';
    window.trackEvent('form-start', { form_id: f.id });
    if (window.goatcounter && window.goatcounter.count) { try { window.goatcounter.count({ path: 'form-start/' + f.id, title: 'Form started: ' + f.id, event: true }); } catch (err) { /* ignore */ } }
  });
})();

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

  function openDialog(btn) {
    errorBox.hidden = true; errorBox.textContent = '';
    doneBox.hidden = true; form.hidden = false;
    // Industry pages pass an example line for the "what do you do" field.
    const hint = btn && btn.getAttribute && btn.getAttribute('data-mockup-hint');
    if (hint && form.mkAbout) { form.mkAbout.placeholder = hint; if (form.mkInclude && !form.mkInclude.value && /salon/i.test(hint)) form.mkInclude.placeholder = 'e.g. Services, prices, gallery, WhatsApp booking'; }
    if (hint) { const src = window.rcSource && window.rcSource(); if (!src) { try { localStorage.setItem('rc_src', JSON.stringify({ s: 'page-' + location.pathname.replace(/^\//, '').replace(/\.html$/, ''), t: Date.now() })); } catch (e) {} } }
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
    if (window.rcSource && window.rcSource()) data.channel = window.rcSource();
    if (window.rcRef && window.rcRef()) data.ref = window.rcRef();
    data.submittedAt = new Date().toISOString();
    if (data.callEmail) data._replyto = data.callEmail;
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

/* ---------- Free mockup request ----------
   Two entry points share one submit path:
   - the pop-up (#mockupDialog, in the footer of every page), opened by any
     [data-mockup-open] button, or by a link ending in #mockup / ?mockup=1;
   - the inline form on /free-mockup (#mockupPageForm).
   Both post the same fields (mk*), so intake, email and the admin panel treat
   them identically. */
(function () {
  const ENDPOINT = String(CONFIG.ENQUIRY_ENDPOINT || '').trim();
  const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const email = String(CONFIG.CONTACT_EMAIL || '').trim();
  if (!ENDPOINT && !wa && !email) return;

  function waFallback(data) {
    if (!wa) return '';
    const msg = "Hi Re-Charge, I'd like a free mockup." + (data.name ? '\nName: ' + data.name : '') + '\nBusiness: ' + data.mkBusiness +
      (data.mkAbout ? '\nAbout: ' + data.mkAbout : '') + (data.mkIndustry ? '\nType: ' + data.mkIndustry : '') +
      (data.mkInclude ? '\nInclude: ' + data.mkInclude : '') + (data.mkStyle ? '\nStyle: ' + data.mkStyle : '') +
      (data.mkEmail ? '\nEmail: ' + data.mkEmail : '') + (data.mkPhone ? '\nPhone: ' + data.mkPhone : '');
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg);
  }

  // Wire a mockup form. ui = { errorBox, submitBtn, onDone(data), onGotcha() }
  function wire(form, ui) {
    function showError(msg, field) {
      ui.errorBox.innerHTML = msg; ui.errorBox.hidden = false;
      if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    }
    form.addEventListener('input', function (e) { if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid'); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      ui.errorBox.hidden = true;
      const fd = new FormData(form);
      const data = {};
      for (const [k, v] of fd.entries()) { if (typeof v === 'string') data[k] = v.trim(); }
      if (fd.get('_gotcha')) { ui.onGotcha(); return; }
      delete data._gotcha;
      Object.keys(data).forEach(function (k) { if (!data[k]) delete data[k]; });
      const openMore = function (field) { const d = field && field.closest && field.closest('details'); if (d) d.open = true; return field; };
      if (form.mkName && !data.mkName) return showError('Please add your name, so we know who to ask for.', form.mkName);
      if (!data.mkBusiness) return showError('Please add your business name.', form.mkBusiness);
      const digits = (data.mkPhone || '').replace(/\D/g, '');
      const emailOk = data.mkEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.mkEmail);
      if (data.mkEmail && !emailOk) return showError('That email doesn\u2019t look right. Check it, or leave it blank.', openMore(form.mkEmail));
      if (data.mkPhone && (digits.length < 9 || digits.length > 13)) return showError('Please check your WhatsApp number (e.g. 082 000 0000).', form.mkPhone);
      if (!digits && !emailOk) return showError('Please add your WhatsApp number so we can send your mockup.', form.mkPhone);
      // the person's name goes in the standard "name" field (the business name stays in mkBusiness)
      if (data.mkName) { data.name = data.mkName; delete data.mkName; }

      // Pull the builder's project type through if one was chosen.
      const cats = [...document.querySelectorAll('#builderForm input[name="cat"]:checked')].map((c) => c.value);
      if (cats.length) data.projectType = cats.join(', ');
      data.formType = 'Free mockup request';
      if (window.rcSource && window.rcSource()) data.channel = window.rcSource();
      if (window.rcRef && window.rcRef()) data.ref = window.rcRef();
      data.page = location.pathname;
      data.submittedAt = new Date().toISOString();
      if (data.mkEmail) data._replyto = data.mkEmail;
      data._subject = '🎨 Free mockup request: ' + data.mkBusiness;

      const btn = ui.submitBtn;
      btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      const label0 = btn.textContent; btn.textContent = 'Sending…';
      let ok = false;
      try {
        if (ENDPOINT) {
          const res = ENDPOINT.includes('script.google.com')
            ? await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(data) })
            : await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          ok = !!(res && res.ok);
        }
      } catch (err) { ok = false; }
      btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label0;

      if (ok) { window.trackEvent('mockup-request'); ui.onDone(data); return; }
      try { const s = JSON.parse(localStorage.getItem('recharge-mockups') || '[]'); s.push(data); localStorage.setItem('recharge-mockups', JSON.stringify(s)); } catch (e2) { /* storage blocked */ }
      const href = waFallback(data);
      showError('Couldn’t send just now. ' + (href
        ? 'You can <a class="inline-link" href="' + href + '" target="_blank" rel="noopener">send it on WhatsApp</a> instead.'
        : (email ? 'Please email us at ' + email + '.' : 'Please check your connection and try again.')));
    });
  }
  // The payoff: a dated promise ("by Thursday 2 October"), 2 business days out (weekends skipped).
  const readyBy = function () {
    const d = new Date(); let n = 2;
    while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] + ' ' + d.getDate() + ' ' +
      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
  };
  const doneText = (d) => 'Thanks' + (d.name ? ', ' + d.name.split(/\s+/)[0] : '') + '! We’re building a free mockup of ' + d.mkBusiness + '. You’ll have the link by ' + readyBy() +
    (d.mkPhone ? ', on WhatsApp (' + d.mkPhone + ')' + (d.mkEmail ? ' and by email' : '') : ', sent to ' + d.mkEmail) + '. No deposit, no obligation: you decide once you’ve seen it.';

  // "Rather just chat? WhatsApp me instead": one tap, with whatever they've typed so far.
  if (wa) document.querySelectorAll('[data-mockup-wa]').forEach(function (a) {
    const row = a.closest('[data-mockup-wa-row]'); if (row) row.hidden = false;
    a.target = '_blank'; a.rel = 'noopener';
    const build = function () {
      const dlg = a.closest('dialog'); const f = dlg ? dlg.querySelector('form') : (document.getElementById('mockupPageForm') || document.getElementById('mockupForm'));
      const biz = f && f.mkBusiness && f.mkBusiness.value.trim(), nm = f && f.mkName && f.mkName.value.trim();
      a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent("Hi Re-Charge, I'd like a free mockup of my website." + (nm ? ' My name is ' + nm + '.' : '') + (biz ? ' My business is ' + biz + '.' : ''));
    };
    build();
    a.addEventListener('pointerdown', build); a.addEventListener('focus', build);
    a.addEventListener('click', function () { build(); window.trackEvent('mockup-whatsapp'); });
  });

  // ---- the pop-up ----
  const dialog = document.getElementById('mockupDialog');
  if (dialog) {
    const form = dialog.querySelector('#mockupForm');
    const errorBox = dialog.querySelector('#mockupError');
    const doneBox = dialog.querySelector('#mockupDone');
    const doneMsg = dialog.querySelector('#mockupDoneMsg');
    function openDialog(btn) {
      errorBox.hidden = true; errorBox.textContent = '';
      doneBox.hidden = true; form.hidden = false;
      // Industry pages pass an example line for the "what do you do" field.
      const hint = btn && btn.getAttribute && btn.getAttribute('data-mockup-hint');
      if (hint && form.mkAbout) { form.mkAbout.placeholder = hint; if (form.mkInclude && !form.mkInclude.value && /salon/i.test(hint)) form.mkInclude.placeholder = 'e.g. Services, prices, gallery, WhatsApp booking'; }
      if (hint) { const src = window.rcSource && window.rcSource(); if (!src) { try { localStorage.setItem('rc_src', JSON.stringify({ s: 'page-' + location.pathname.replace(/^\//, '').replace(/\.html$/, ''), t: Date.now() })); } catch (e) {} } }
      // Prefill from the builder if the visitor has already entered anything.
      const map = { mkName: 'name', mkBusiness: 'business', mkAbout: 'goal', mkEmail: 'email', mkPhone: 'phone' };
      Object.keys(map).forEach(function (f) {
        const from = document.getElementById(map[f]);
        if (from && from.value && form[f] && !form[f].value) form[f].value = from.value.trim();
      });
      if (form.mkInclude && !form.mkInclude.value) {
        const feats = [...document.querySelectorAll('#builderForm input[type="checkbox"]:checked:not([name="cat"])')]
          .map((c) => c.value).filter((v) => v && v !== 'on');
        if (feats.length) form.mkInclude.value = feats.join(', ');
      }
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
      else dialog.setAttribute('open', '');
      window.trackEvent('mockup-open');
    }
    function closeDialog() {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
    }
    document.querySelectorAll('[data-mockup-open]').forEach(function (b) { b.addEventListener('click', function () { openDialog(b); }); });
    dialog.querySelectorAll('[data-mockup-close]').forEach(function (b) { b.addEventListener('click', closeDialog); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });
    wire(form, {
      errorBox, submitBtn: dialog.querySelector('#mockupSubmit'), onGotcha: closeDialog,
      onDone: function (d) { form.hidden = true; doneMsg.textContent = doneText(d); doneBox.hidden = false; },
    });
    // Old links (…/#mockup) and ?mockup=1 open the pop-up — except on the
    // dedicated page, which has the form inline.
    const wantsPopup = location.hash === '#mockup' || new URLSearchParams(location.search).get('mockup') === '1';
    if (wantsPopup && !document.getElementById('mockupPageForm')) setTimeout(function () { openDialog(null); }, 300);
  }

  // ---- the inline form on /free-mockup ----
  const pageForm = document.getElementById('mockupPageForm');
  if (pageForm) {
    const qs = new URLSearchParams(location.search);
    const b = qs.get('b') || qs.get('business');
    if (b && !pageForm.mkBusiness.value) pageForm.mkBusiness.value = b.slice(0, 80);
    const t = (qs.get('type') || '').toLowerCase();
    if (t && pageForm.mkIndustry) { const opt = [...pageForm.mkIndustry.options].find((o) => o.value.toLowerCase().startsWith(t)); if (opt) pageForm.mkIndustry.value = opt.value; }
    // Arriving from a demo (?demo=booking&include=…): say so, and carry it through.
    const DEMO_NAMES = {
      'quote-calculator': "Mike's Plumbing — Quote Calculator", 'sales-dashboard': 'Example Sales Co. — Sales Dashboard',
      'ai-assistant': 'BuildRight — AI Assistant', booking: 'Bella Hair Studio — Online Booking', invoice: "Nomsa's Cleaning — Instant Quote",
      burger: 'Local Burger Co. — Restaurant Website', buildright: 'BuildRight — Project Dashboard', crm: 'Small Business CRM',
      reporting: 'Automated Reporting', threads: "Thabo's Threads — Online Store",
    };
    const demoName = DEMO_NAMES[qs.get('demo') || ''];
    if (demoName) {
      pageForm.mkDemo.value = demoName;
      const based = document.getElementById('mkBased');
      based.textContent = ''; const b1 = document.createElement('b'); b1.textContent = demoName;
      based.append('Based on the demo you liked: ', b1, '. We\u2019ll use it as the starting point for yours.');
      based.hidden = false;
    }
    const inc = qs.get('include');
    if (inc && pageForm.mkInclude && !pageForm.mkInclude.value) { pageForm.mkInclude.value = inc.slice(0, 200); const more = pageForm.querySelector('.mk-form__more'); if (more) more.open = true; }
    const done = document.getElementById('mockupPageDone');
    wire(pageForm, {
      errorBox: document.getElementById('mockupPageError'), submitBtn: document.getElementById('mockupPageSubmit'),
      onGotcha: function () { pageForm.hidden = true; },
      onDone: function (d) {
        pageForm.hidden = true;
        document.getElementById('mockupPageDoneMsg').textContent = doneText(d);
        done.hidden = false; done.focus();
        done.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });
    if (location.hash === '#mockup' || location.hash === '#form') setTimeout(function () { pageForm.mkBusiness.focus(); }, 300);
  }
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
    'Custom Software': { label: 'Custom Software', min: 4500 },
    'Something Else':{ label: 'Custom project', min: null },
    'Not Sure':      { label: 'Custom project', min: null },
  };
  const EXAMPLES = {
    'Website': 'e.g. "I run a plumbing business and want customers to see my services, contact me on WhatsApp and request a quote."',
    'Dashboard': 'e.g. "I have three sales spreadsheets and want one screen showing revenue, top products and monthly targets."',
    'Automation': 'e.g. "Every day I copy orders from WhatsApp into Excel. I want that to happen automatically and email a confirmation."',
    'AI': 'e.g. "New staff keep asking the same questions. I want an assistant that answers from my policy documents."',
    'Custom Software': 'e.g. "I want a calculator where a customer picks options and gets an instant price they can send to me."',
    'Something Else': 'Tell us what you\u2019re trying to accomplish, in your own words.',
    'Not Sure': 'Tell us what you\u2019re currently doing, what\u2019s frustrating you, or what you\u2019d like to improve.',
  };
  const BUDGET_MAX = {
    'Under R1,000': 1000, 'R1,000\u2013R2,500': 2500, 'R2,500\u2013R5,000': 5000,
    'R5,000\u2013R10,000': 10000, 'R10,000+': Infinity,
  };
  // A live demo that best illustrates each project type \u2014 surfaced as an example as they choose.
  const DEMOS = {
    'Website':     { id: 'booking',          name: 'Bella Hair Studio \u2014 Online Booking',    line: 'A website customers can book themselves into \u2014 no phone tag.' },
    'Dashboard':   { id: 'sales-dashboard',  name: 'Example Sales Co. \u2014 Sales Dashboard',    line: 'Scattered spreadsheets turned into one screen you can read at a glance.' },
    'Automation':  { id: 'invoice',          name: "Nomsa's Cleaning \u2014 Instant Quote",       line: 'Tick a few options and an itemised quote builds itself.' },
    'AI':          { id: 'ai-assistant',     name: 'Ask BuildRight \u2014 AI Assistant',          line: 'Answers questions from your own documents, with sources.' },
    'Custom Software': { id: 'quote-calculator', name: "Mike's Plumbing \u2014 Quote Calculator",     line: 'Customers pick options and get an instant price.' },
  };
  Object.keys(DEMOS).forEach((k) => { DEMOS[k].img = 'assets/demo-' + DEMOS[k].id + '.png'; });

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
  const srcChannel = (window.rcSource && window.rcSource()) || params.get('src') || '';
  // Back from a Yoco checkout (deposit or a payment link I sent): say so.
  (function paidBanner() {
    const paid = params.get('paid');
    if (paid !== '1' && paid !== '0') return;
    const box = document.createElement('div');
    box.className = 'paid-banner' + (paid === '1' ? ' is-ok' : '');
    box.setAttribute('role', 'status');
    box.innerHTML = paid === '1'
      ? '<strong>Payment received — thank you.</strong> We\u2019ll confirm by email shortly.'
      : '<strong>Payment not completed.</strong> Nothing was charged. You can try again from the link we sent, or contact us.';
    const anchor = document.querySelector('.page-head .container') || document.querySelector('main') || document.body;
    anchor.insertBefore(box, anchor.firstChild);
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  })();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function projectName(cats) {
    const named = cats.filter((c) => c !== 'Something Else' && c !== 'Not Sure');
    if (named.length === 1) return PRICES[named[0]].label;
    if (named.length > 1) return 'Custom project (' + named.map((c) => PRICES[c].label).join(' + ') + ')';
    return 'Custom project';
  }
  // Website floor rises with the features ticked in Step 2 (matches the price
  // list: one-page from R1,000, business site from R2,000, booking/payments/
  // e-commerce from R4,500), so the estimate doesn't undercut the real quote.
  function websiteFloor() {
    const feats = [...form.querySelectorAll('[name="w_features"]:checked')].map((i) => i.value);
    if (feats.some((f) => /booking|payments|ecommerce/i.test(f))) return 4500;
    if (feats.some((f) => /gallery|blog|multi/i.test(f))) return 2000;
    return PRICES.Website ? PRICES.Website.min : 1000;
  }
  function estimateFor(cats) {
    const mins = cats.map((c) => c === 'Website' ? websiteFloor() : (PRICES[c] && PRICES[c].min)).filter((m) => m != null);
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
  const exampleWrap = form.querySelector('#builderExample');
  const exampleCards = form.querySelector('#builderExampleCards');
  if (exampleCards) exampleCards.addEventListener('click', (e) => { if (e.target.closest('a')) window.trackEvent('builder-example'); });
  function updateDemoExamples() {
    if (!exampleWrap || !exampleCards) return;
    const cats = selectedCats();
    const seen = {};
    const picks = [];
    cats.forEach((c) => { const d = DEMOS[c]; if (d && !seen[d.id]) { seen[d.id] = 1; picks.push(d); } });
    if (picks.length) {
      exampleCards.innerHTML = picks.slice(0, 3).map((d) =>
        '<a class="builder__example-card" href="demos#' + d.id + '" target="_blank" rel="noopener">' +
        '<span class="builder__example-thumb"><img src="' + d.img + '" alt="Preview of the ' + escapeHtml(d.name) + ' demo" loading="lazy" decoding="async" /></span>' +
        '<span class="builder__example-text"><b>' + escapeHtml(d.name) + '</b><span>' + escapeHtml(d.line) + '</span>' +
        '<span class="builder__example-go">See it live →</span></span></a>'
      ).join('');
      exampleWrap.hidden = false;
    } else if (cats.length) {
      // Only "Something Else"/unmapped chosen — point them at the full set.
      exampleCards.innerHTML = '<a class="builder__example-card" href="demos.html" target="_blank" rel="noopener">' +
        '<span class="builder__example-text"><b>See what we build</b><span>Browse live, interactive demos of the kind of work we do.</span>' +
        '<span class="builder__example-go">Open demos →</span></span></a>';
      exampleWrap.hidden = false;
    } else {
      exampleWrap.hidden = true;
    }
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
    if (n === 1) { updateExample(); updateLive(); updateDemoExamples(); }
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
    updateExample(); updateLive(); updateDemoExamples();
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


  // Returns the parsed response body (so I can read a project id from the
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
    if (window.rcRef && window.rcRef()) data.ref = window.rcRef();
    if (files.length) data.attachments = files.map((f) => f.name + ' (' + humanSize(f.size) + ')').join(', ');
    if (data.email) data._replyto = data.email;
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

    // ref returned by the Supabase intake function (if in use). No payment
    // here: the R500 deposit is paid only once the client accepts the quote
    // (quote page), so submitting the brief is the end of the job on /start.
    const ref = resp && (resp.ref || (resp.data && resp.data.ref));

    form.hidden = true;
    thanks.hidden = false;
    if (ref) {
      const tb = document.getElementById('thanksBody');
      if (tb) tb.innerHTML = tb.innerHTML + ' <br><span class="small muted">Your reference: <strong>' + escapeHtml(ref) + '</strong></span>';
    }
    thanks.focus({ preventScroll: true });
    thanks.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  showStep(1, { scroll: false });
}

/* ---------- Homepage: instant preview ----------
   Type a business name, pick a trade, and a mini website with that name appears
   in the phone. Until the visitor touches it, it demos itself (typing example
   names). "Build the real one" opens the free mockup pop-up, prefilled. */
(function instantPreview() {
  const form = document.getElementById('ipForm');
  const phone = document.querySelector('.ip-phone');
  if (!form || !phone) return;
  const nameIn = document.getElementById('ipName'), tradeIn = document.getElementById('ipTrade');
  const T = {
    salon: { label: 'Salon & beauty', about: 'A hair and beauty salon.', eyebrow: 'Hair · Nails · Beauty', title: 'Look good. Feel amazing.', sub: 'Book your next appointment in seconds.', cta: 'Book on WhatsApp', cta2: 'See prices', hours: 'Tue–Sat · 8:00–17:00', foot: 'Loved by locals', list: [['Cut & blow-dry', 'R280'], ['Colour & highlights', 'R650'], ['Gel nails', 'R220']] },
    trades: { label: 'Plumbing, electrical & trades', about: 'A plumbing and trades business.', eyebrow: 'Plumbing · Geysers · Leaks', title: 'Fast, reliable, on time.', sub: 'Call-outs across the area, with upfront prices.', cta: 'Call now', cta2: 'Get a quote', hours: 'Mon–Sat · 24/7 emergencies', foot: 'Trusted by homeowners', list: [['Blocked drains', 'from R650'], ['Geyser replacement', 'from R4,500'], ['Leak detection', 'from R450']] },
    food: { label: 'Restaurant, café & takeaway', about: 'A restaurant / café.', eyebrow: 'Breakfast · Lunch · Dinner', title: 'Good food, made fresh daily.', sub: 'Book a table or order for collection.', cta: 'Book a table', cta2: 'View menu', hours: 'Open daily · 7:00–21:00', foot: 'A local favourite', list: [['Full breakfast', 'R95'], ['Chicken burger', 'R125'], ['Ribs & chips', 'R185']] },
    cleaning: { label: 'Cleaning services', about: 'A cleaning business for homes and offices.', eyebrow: 'Homes · Offices · Move-outs', title: 'Spotless, every single time.', sub: 'Vetted cleaners, booked in two minutes.', cta: 'Get a quote', cta2: 'Our services', hours: 'Mon–Sat · 7:00–17:00', foot: 'Rated 5 stars by clients', list: [['Standard home clean', 'from R450'], ['Deep clean', 'from R950'], ['Office cleaning', 'on quote']] },
    retail: { label: 'Shop & retail', about: 'A shop / retail business.', eyebrow: 'New in · Best sellers · Gifts', title: 'Find something you love.', sub: 'Shop online or visit us in store.', cta: 'Shop now', cta2: 'Visit us', hours: 'Mon–Sat · 9:00–17:00', foot: 'Happy customers', list: [['New arrivals', 'from R199'], ['Best sellers', 'from R249'], ['Gift cards', 'from R100']] },
    pro: { label: 'Professional services', about: 'A professional services firm.', eyebrow: 'Advice · Accounts · Compliance', title: 'Expert help, in plain language.', sub: 'Book a free 15-minute consultation.', cta: 'Book a consult', cta2: 'Our services', hours: 'Mon–Fri · 8:00–17:00', foot: 'Recommended by clients', list: [['Bookkeeping', 'from R1,500/mo'], ['Tax returns', 'from R850'], ['Company setup', 'from R2,500']] },
    fitness: { label: 'Health & fitness', about: 'A health and fitness business.', eyebrow: 'Training · Classes · Coaching', title: 'Stronger starts today.', sub: 'Your first class is on us.', cta: 'Book a class', cta2: 'Timetable', hours: 'Mon–Sun · 5:30–20:00', foot: 'Members love it here', list: [['Personal training', 'R350'], ['Group classes', 'R120'], ['Monthly membership', 'R650']] },
    other: { label: 'Other', about: '', eyebrow: 'Local · Trusted · Easy to reach', title: 'Here when you need us.', sub: 'Find out what we do and get in touch.', cta: 'WhatsApp us', cta2: 'Our services', hours: 'Mon–Fri · 8:00–17:00', foot: 'Loved by locals', list: [['Our services', '→'], ['About us', '→'], ['Get in touch', '→']] },
  };
  const DEMOS = [['Bella Hair Studio', 'salon'], ["Mike's Plumbing", 'trades'], ['Local Burger Co.', 'food'], ["Nomsa's Cleaning", 'cleaning']];
  const el = (k) => phone.querySelector('[data-ip="' + k + '"]');
  const site = phone.querySelector('.ip-site');
  const initials = (n) => (n.match(/[A-Za-z0-9]+/g) || ['Y', 'B']).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'YB';
  let trade = '';
  function render(name, tr) {
    const t = T[tr] || T.other;
    const nm = (name || '').trim().slice(0, 40) || 'Your Business';
    el('name').textContent = nm; el('initials').textContent = initials(nm);
    if (tr !== trade) {
      trade = tr; phone.setAttribute('data-trade', tr);
      ['eyebrow', 'title', 'sub', 'cta', 'cta2', 'hours', 'foot'].forEach((k) => { el(k).textContent = t[k]; });
      const list = el('list'); list.textContent = '';
      t.list.forEach(([a, b]) => { const r = document.createElement('div'); r.className = 'ip-row'; const x = document.createElement('b'); x.textContent = a; const y = document.createElement('span'); y.textContent = b; r.append(x, y); list.appendChild(r); });
    }
  }
  function swap(fn) { if (reduceMotion) { fn(); return; } site.classList.add('is-swap'); setTimeout(() => { fn(); site.classList.remove('is-swap'); }, 170); }

  // --- self-demo until the visitor takes over ---
  let demo = !reduceMotion, timer = 0, di = 0;
  function stopDemo() {
    if (!demo) return; demo = false; clearTimeout(timer);
    if (nameIn.classList.contains('is-demo')) { nameIn.value = ''; nameIn.classList.remove('is-demo'); }
    render(nameIn.value, tradeIn.value);
  }
  function typeDemo() {
    if (!demo) return;
    const [nm, tr] = DEMOS[di % DEMOS.length];
    nameIn.classList.add('is-demo'); nameIn.value = '';
    tradeIn.value = tr; swap(() => render('', tr));
    let i = 0;
    const step = () => {
      if (!demo) return;
      i++; nameIn.value = nm.slice(0, i); render(nameIn.value, tr);
      timer = i < nm.length ? setTimeout(step, 70 + Math.random() * 60) : setTimeout(() => { di++; typeDemo(); }, 2600);
    };
    timer = setTimeout(step, 450);
  }
  ['focus', 'pointerdown', 'keydown'].forEach((ev) => nameIn.addEventListener(ev, stopDemo));
  tradeIn.addEventListener('pointerdown', stopDemo); tradeIn.addEventListener('focus', stopDemo);

  let typed = false;
  nameIn.addEventListener('input', () => {
    if (nameIn.classList.contains('is-demo')) return;
    render(nameIn.value, tradeIn.value);
    if (!typed && nameIn.value.trim().length > 1) { typed = true; window.trackEvent('preview-typed'); }
  });
  tradeIn.addEventListener('change', () => { stopDemo(); swap(() => render(nameIn.value, tradeIn.value)); window.trackEvent('preview-trade'); });
  form.addEventListener('submit', (e) => { e.preventDefault(); nameIn.blur(); });

  // start: static first example; the demo runs only while the hero is on screen and the tab is visible
  render(DEMOS[0][0], DEMOS[0][1]); tradeIn.value = DEMOS[0][1];
  if (demo && 'IntersectionObserver' in window) {
    let running = false;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!demo) { io.disconnect(); return; }
      if (e.isIntersecting && !running && !document.hidden) { running = true; timer = setTimeout(typeDemo, 1200); }
      else if (!e.isIntersecting && running) { running = false; clearTimeout(timer); }
    }), { threshold: 0.3 });
    io.observe(phone);
    document.addEventListener('visibilitychange', () => { if (document.hidden && running) { running = false; clearTimeout(timer); } });
  }

  // --- hand-off: "Build the real one" opens the mockup pop-up, prefilled ---
  document.querySelectorAll('[data-ip-cta]').forEach((b) => b.addEventListener('click', () => {
    window.trackEvent('preview-cta');
    const f = document.getElementById('mockupForm'); if (!f) return;
    const real = !nameIn.classList.contains('is-demo') && nameIn.value.trim();
    const t = T[tradeIn.value] || T.other;
    if (real && f.mkBusiness && !f.mkBusiness.value) f.mkBusiness.value = real;
    if ((real || !demo) && t.about && f.mkAbout && !f.mkAbout.value) f.mkAbout.value = t.about;
    let ind = f.querySelector('input[name="mkIndustry"]');
    if (!ind) { ind = document.createElement('input'); ind.type = 'hidden'; ind.name = 'mkIndustry'; f.appendChild(ind); }
    ind.value = t.label;
    setTimeout(() => { const first = [f.mkName, f.mkBusiness, f.mkPhone].find((x) => x && !x.value); if (first) first.focus(); }, 60);
  }));
})();

/* ---------- Google profile setup (R450) ----------
   Any [data-gbp-open] button opens #gbpDialog (in the footer of every page).
   Posts to the same intake endpoint as the other forms, as formType
   "Google profile setup", so it lands in the panel as a lead. */
(function googleProfileSetup() {
  const dialog = document.getElementById('gbpDialog');
  if (!dialog) return;
  const ENDPOINT = String(CONFIG.ENQUIRY_ENDPOINT || '').trim();
  const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const form = document.getElementById('gbpForm'), err = document.getElementById('gbpError');
  const done = document.getElementById('gbpDone'), btn = document.getElementById('gbpSubmit');
  const open = () => {
    err.hidden = true; done.hidden = true; form.hidden = false;
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
    window.trackEvent('gbp-open');
  };
  const close = () => { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); };
  document.querySelectorAll('[data-gbp-open]').forEach((b) => b.addEventListener('click', open));
  dialog.querySelectorAll('[data-gbp-close]').forEach((b) => b.addEventListener('click', close));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  if (/[?&]google=1\b/.test(location.search) || location.hash === '#google-setup') setTimeout(open, 300);
  const fld = (n) => form.elements.namedItem(n);
  const fail = (msg, field) => { err.innerHTML = msg; err.hidden = false; if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); } };
  form.addEventListener('input', (e) => e.target.removeAttribute && e.target.removeAttribute('aria-invalid'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const fd = new FormData(form); const data = {};
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && v.trim()) data[k] = v.trim();
    if (data._gotcha) { close(); return; }
    delete data._gotcha;
    const digits = (data.phone || '').replace(/\D/g, '');
    const emailOk = data.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email);
    if (!data.name) return fail('Please add your name.', fld('name'));
    if (!data.business) return fail('Please add your business name.', fld('business'));
    if (data.phone && (digits.length < 9 || digits.length > 13)) return fail('Please check your WhatsApp number (e.g. 082 000 0000).', fld('phone'));
    if (!digits && !emailOk) return fail('Please add your WhatsApp number so we can get started.', fld('phone'));
    if (data.email && !emailOk) { form.querySelector('details').open = true; return fail('That email doesn’t look right. Check it, or leave it blank.', fld('email')); }
    data.formType = 'Google profile setup';
    data.indicativePrice = 'R450';
    if (window.rcSource && window.rcSource()) data.channel = window.rcSource();
    if (window.rcRef && window.rcRef()) data.ref = window.rcRef();
    data.page = location.pathname; data.submittedAt = new Date().toISOString();
    if (emailOk) data._replyto = data.email;
    data._subject = '📍 Google profile setup: ' + data.business;
    btn.disabled = true; const label0 = btn.textContent; btn.textContent = 'Sending…';
    let ok = false;
    try {
      if (ENDPOINT) { const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) }); ok = !!(res && res.ok); }
    } catch (ex) { ok = false; }
    btn.disabled = false; btn.textContent = label0;
    if (ok) {
      window.trackEvent('gbp-request');
      form.hidden = true; done.hidden = false;
      document.getElementById('gbpDoneMsg').textContent = 'Thanks, ' + data.name.split(/\s+/)[0] + '! We’ll WhatsApp you within 1 business day to get ' + data.business +
        ' looking great on Google. R450, paid once it’s done and you’ve checked it.';
      return;
    }
    const msg = "Hi Re-Charge, I'd like the Google profile setup (R450).\nName: " + data.name + '\nBusiness: ' + data.business + (data.gbpHas ? '\nOn Google Maps already: ' + data.gbpHas : '') + (data.gbpLink ? '\nListing: ' + data.gbpLink : '');
    fail('Couldn’t send just now. ' + (wa ? 'You can <a class="inline-link" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '">send it on WhatsApp</a> instead.' : 'Please check your connection and try again.'));
  });
})();

/* ---------- "Before you go": a free online check (business name + WhatsApp) ----------
   Offered once to visitors who are reading but haven't reached out: on desktop when
   the mouse heads for the tab bar, on any device after ~40 s and half a page of
   reading, or on a phone's second page. At most once every 14 days, never after
   they've sent a form or tapped WhatsApp, and never on the panel, quote, project
   builder or free-mockup pages. Lands in the panel as a lead (Talking). */
(function beforeYouGo() {
  const dialog = document.getElementById('capDialog');
  if (!dialog || /^\/(admin|dashboard|quote|start|free-mockup|previews)/.test(location.pathname)) return;
  const ENDPOINT = String(CONFIG.ENQUIRY_ENDPOINT || '').trim();
  const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const get = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch (e) { return Date.now(); } };
  const DAY = 864e5;
  if (Date.now() - get('rc_converted') < 60 * DAY || Date.now() - get('rc_cap_seen') < 14 * DAY) return;
  let pages = 0; try { pages = Number(sessionStorage.getItem('rc_pages') || 0) + 1; sessionStorage.setItem('rc_pages', String(pages)); } catch (e) { /* ignore */ }
  const t0 = Date.now(); let shown = false, scrolled = 0;
  const busy = () => document.body.classList.contains('consent-open') || [...document.querySelectorAll('dialog')].some((d) => d.open) || document.querySelector('.nav__links.is-open');
  function show(why) {
    if (shown || busy() || Date.now() - get('rc_converted') < 60 * DAY) return;
    shown = true; try { localStorage.setItem('rc_cap_seen', String(Date.now())); } catch (e) { /* ignore */ }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    window.trackEvent('cap-open', { trigger: why });
  }
  const close = () => { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); };
  dialog.querySelectorAll('[data-cap-close]').forEach((b) => b.addEventListener('click', close));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  // desktop: heading for the tab bar / address bar
  if (matchMedia('(pointer: fine)').matches) document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && e.clientY <= 4 && Date.now() - t0 > 12000) show('exit'); });
  // any device: has spent a while reading
  window.addEventListener('scroll', () => { const h = document.documentElement.scrollHeight - innerHeight; if (h > 0) scrolled = Math.max(scrolled, scrollY / h); }, { passive: true });
  const tick = setInterval(() => {
    if (shown) return clearInterval(tick);
    const secs = (Date.now() - t0) / 1000;
    if ((secs > 40 && scrolled > 0.45) || (pages >= 2 && secs > 15 && !matchMedia('(pointer: fine)').matches)) show(secs > 40 ? 'engaged' : 'second-page');
  }, 2000);

  const form = document.getElementById('capForm'), err = document.getElementById('capError'), btn = document.getElementById('capSubmit');
  const fld = (n) => form.elements.namedItem(n);
  const fail = (msg, field) => { err.innerHTML = msg; err.hidden = false; if (field) field.focus(); };
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const data = {}; for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string' && v.trim()) data[k] = v.trim();
    if (data._gotcha) { close(); return; }
    delete data._gotcha;
    const digits = (data.phone || '').replace(/\D/g, '');
    if (!data.business) return fail('Please add your business name.', fld('business'));
    if (digits.length < 9 || digits.length > 13) return fail('Please add your WhatsApp number (e.g. 082 000 0000).', fld('phone'));
    data.formType = 'Free online check';
    if (window.rcSource && window.rcSource()) data.channel = window.rcSource();
    if (window.rcRef && window.rcRef()) data.ref = window.rcRef();
    data.page = location.pathname; data.submittedAt = new Date().toISOString();
    data._subject = '🔎 Free online check: ' + data.business;
    btn.disabled = true; const label0 = btn.textContent; btn.textContent = 'Sending…';
    let ok = false;
    try { if (ENDPOINT) { const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) }); ok = !!(res && res.ok); } } catch (ex) { ok = false; }
    btn.disabled = false; btn.textContent = label0;
    if (ok) {
      window.trackEvent('cap-request');
      form.hidden = true; document.getElementById('capDone').hidden = false;
      document.getElementById('capDoneMsg').textContent = 'Thanks! We’ll look at how ' + data.business + ' shows up online and WhatsApp you 3 quick fixes within 1 business day.';
      return;
    }
    const msg = "Hi Re-Charge, I'd like the free online check for my business: " + data.business + '.';
    fail('Couldn’t send just now. ' + (wa ? 'You can <a class="inline-link" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '">ask on WhatsApp</a> instead.' : 'Please check your connection and try again.'));
  });
})();

/* ---------- Homepage: before / after slider ----------
   Drag (or tap) anywhere on the frame to move the divider; the hidden range input
   gives keyboard and screen-reader control. It nudges itself once when it first
   scrolls into view, so people see it moves. */
(function beforeAfter() {
  const root = document.querySelector('[data-ba]');
  if (!root) return;
  const frame = root.querySelector('.ba__frame'), range = root.querySelector('.ba__range');
  let touched = false, tracked = false;
  const set = (v) => { v = Math.max(0, Math.min(100, v)); frame.style.setProperty('--ba', v + '%'); range.value = String(Math.round(v)); };
  const used = () => { touched = true; if (!tracked) { tracked = true; window.trackEvent('before-after-drag'); } };
  const fromX = (x) => { const r = frame.getBoundingClientRect(); set((x - r.left) / r.width * 100); };
  // Mouse: drag straight away. Touch: only a sideways drag or a tap moves it, so scrolling
  // the page past the frame (touch-action: pan-y) never jumps the divider.
  let dragging = false, start = null;
  frame.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (e.pointerType !== 'mouse') { start = { x: e.clientX, y: e.clientY }; return; }
    dragging = true; used(); fromX(e.clientX); try { frame.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });
  frame.addEventListener('pointermove', (e) => {
    if (dragging) return fromX(e.clientX);
    if (start && Math.abs(e.clientX - start.x) > 8 && Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y)) { start = null; dragging = true; used(); fromX(e.clientX); }
  });
  ['pointerup', 'pointercancel'].forEach((t) => frame.addEventListener(t, () => { start = null; dragging = false; }));
  frame.addEventListener('click', (e) => { used(); fromX(e.clientX); });   // a tap jumps the divider there
  range.addEventListener('input', () => { used(); set(Number(range.value)); });

  // The first time it scrolls into view, the divider sweeps once — left, right,
  // back to centre — so it reads as something to drag rather than a picture.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const hint = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      hint.disconnect();
      const keys = [[0, 50], [700, 28], [1500, 72], [2200, 50]], t0 = performance.now();
      const step = (now) => {
        if (touched) return;
        const t = now - t0;
        let i = keys.findIndex((k) => k[0] > t); if (i === -1) { set(50); return; }
        const [ta, va] = keys[i - 1], [tb, vb] = keys[i], p = (t - ta) / (tb - ta);
        set(va + (vb - va) * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2));
        requestAnimationFrame(step);
      };
      setTimeout(() => requestAnimationFrame(step), 500);
    }, { threshold: 0.6 });
    hint.observe(frame);
  }

  // tabs: a website / getting a quote
  const tabs = root.querySelectorAll('[data-ba-tab]');
  tabs.forEach((t) => t.addEventListener('click', () => {
    const k = t.dataset.baTab;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    root.querySelectorAll('[data-ba-pane]').forEach((p) => { p.hidden = p.dataset.baPane !== k; });
    root.querySelectorAll('[data-ba-cap]').forEach((p) => { p.hidden = p.dataset.baCap !== k; });
    set(50); window.trackEvent('before-after-tab', { tab: k });
  }));

  // one gentle sweep the first time it's on screen
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const keys = [[0, 50], [700, 22], [1500, 78], [2200, 50]], t0 = performance.now() + 400;
    const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    const step = (now) => {
      if (touched) return;
      const t = now - t0; if (t < 0) return requestAnimationFrame(step);
      let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const [ta, va] = keys[i], [tb, vb] = keys[i + 1];
      set(va + (vb - va) * ease(Math.min(1, (t - ta) / (tb - ta))));
      if (t < keys[keys.length - 1][0]) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: 0.6 });
  io.observe(frame);
})();

/* ---------- AI qualifier (ai-for-business) ----------
   Pick the pain that sounds like you → I name the AI product I’d build and its
   price, then capture the lead (formType "AI enquiry") so it lands in the panel.
   Mirrors the other intake forms. */
(function aiQualifier() {
  const qz = document.querySelector('[data-qz]');
  if (!qz) return;
  const ENDPOINT = String(CONFIG.ENQUIRY_ENDPOINT || '').trim();
  const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const PRODUCTS = {
    wa: { name: '24/7 WhatsApp assistant', line: 'An assistant trained on your hours, prices and FAQs answers customers day and night on WhatsApp, and hands the real leads straight to you.' },
    know: { name: 'Knowledge assistant', line: 'Point it at your manuals, policies and product info and get a straight answer in seconds — instead of digging through files or asking you.' },
    admin: { name: 'Admin automation', line: 'AI drafts your quotes, replies, summaries and reports from the details you already have, so you just check and send.' },
    content: { name: 'Content in your voice', line: 'Social posts, product descriptions and email campaigns written in your tone, from a few words of direction.' },
  };
  const opts = document.getElementById('qzOptions'), result = document.getElementById('qzResult');
  const form = document.getElementById('qzForm'), done = document.getElementById('qzDone'), err = document.getElementById('qzError'), btn = document.getElementById('qzSubmit');
  let product = '', pain = '';
  const fld = (n) => form.elements.namedItem(n);
  const fail = (msg, field) => { err.innerHTML = msg; err.hidden = false; if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); } };
  form.addEventListener('input', (e) => e.target.removeAttribute && e.target.removeAttribute('aria-invalid'));

  opts.querySelectorAll('.qz__opt').forEach((b) => b.addEventListener('click', () => {
    product = b.dataset.product; pain = b.dataset.pain;
    const p = PRODUCTS[product] || PRODUCTS.wa;
    document.getElementById('qzName').textContent = p.name;
    document.getElementById('qzLine').textContent = p.line;
    form.hidden = false; done.hidden = true; err.hidden = true;
    opts.hidden = true; result.hidden = false;
    window.trackEvent('ai-qz-pick', { product: product });
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => fld('name') && fld('name').focus(), 300);
  }));
  qz.querySelector('[data-qz-back]').addEventListener('click', () => { result.hidden = true; opts.hidden = false; opts.scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const data = {}; for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string' && v.trim()) data[k] = v.trim();
    if (data._gotcha) { done.hidden = false; form.hidden = true; return; }
    delete data._gotcha;
    const digits = (data.phone || '').replace(/\D/g, '');
    const emailOk = data.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email);
    if (!data.name) return fail('Please add your name.', fld('name'));
    if (!data.business) return fail('Please add your business name.', fld('business'));
    if (data.phone && (digits.length < 9 || digits.length > 13)) return fail('Please check your WhatsApp number (e.g. 082 000 0000).', fld('phone'));
    if (!digits && !emailOk) return fail('Please add your WhatsApp number so we can reach you.', fld('phone'));
    if (data.email && !emailOk) { const d = form.querySelector('details'); if (d) d.open = true; return fail('That email doesn’t look right. Check it, or leave it blank.', fld('email')); }
    const rec = (PRODUCTS[product] || PRODUCTS.wa).name;
    data.formType = 'AI enquiry';
    data.product = rec;
    data.goal = 'Main goal: ' + pain + '. Suggested: ' + rec + '.';
    data.indicativePrice = 'From R3,500 + R300/mo';
    if (window.rcSource && window.rcSource()) data.channel = window.rcSource();
    if (window.rcRef && window.rcRef()) data.ref = window.rcRef();
    data.page = location.pathname; data.submittedAt = new Date().toISOString();
    if (emailOk) data._replyto = data.email;
    data._subject = '🤖 AI enquiry: ' + data.business + ' — ' + rec;
    btn.disabled = true; const label0 = btn.textContent; btn.textContent = 'Sending…';
    let ok = false;
    try { if (ENDPOINT) { const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) }); ok = !!(res && res.ok); } } catch (ex) { ok = false; }
    btn.disabled = false; btn.textContent = label0;
    if (ok) {
      window.trackEvent('ai-qz-request', { product: product });
      try { localStorage.setItem('rc_converted', String(Date.now())); } catch (e) { /* ignore */ }
      form.hidden = true; done.hidden = false;
      document.getElementById('qzDoneMsg').textContent = 'Thanks, ' + data.name.split(/\s+/)[0] + '! We’ll look at how AI could help ' + data.business + ' and come back to you within the hour (7am–9pm) with a plan for your ' + rec.toLowerCase() + '. No obligation.';
      return;
    }
    const msg = "Hi Re-Charge, I'd like to talk about AI for my business (" + data.business + "). I'm interested in: " + rec + '.';
    fail('Couldn’t send just now. ' + (wa ? 'You can <a class="inline-link" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '">send it on WhatsApp</a> instead.' : 'Please check your connection and try again.'));
  });
})();

/* ---------- The Re-Charge AI assistant (my own product, on my own site) ----------
   Mounts on every [data-assistant] block: the visitor asks, the `assistant` Edge
   Function answers from Re-Charge's real facts. Conversation lives in memory only
   — nothing is stored in the browser, and I send the whole thread each turn
   because the API is stateless. */
(function assistant() {
  const boxes = document.querySelectorAll('[data-assistant]');
  if (!boxes.length) return;
  const ENDPOINT = CONFIG.SUPABASE_URL ? CONFIG.SUPABASE_URL + '/functions/v1/assistant' : '';
  const MAX_TURNS = 20;

  boxes.forEach(function (box) {
    const log = box.querySelector('.asst__log'), form = box.querySelector('.asst__form');
    const input = box.querySelector('.asst__input'), send = box.querySelector('.asst__send');
    const chips = box.querySelector('.asst__chips');
    if (!log || !form || !input) return;
    const messages = [];
    let busy = false;
    const demo = box.dataset.demo === 'query'
      ? (new URLSearchParams(location.search).get('d') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80)
      : (box.dataset.demo || '');

    function bubble(role, text) {
      const el = document.createElement('div');
      el.className = 'asst__msg asst__msg--' + (role === 'user' ? 'me' : 'ai');
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }
    function thinking() {
      const el = document.createElement('div');
      el.className = 'asst__msg asst__msg--ai asst__msg--wait';
      el.innerHTML = '<i></i><i></i><i></i>';
      el.setAttribute('aria-label', 'Thinking');
      log.appendChild(el); log.scrollTop = log.scrollHeight;
      return el;
    }

    async function ask(text) {
      if (busy || !text) return;
      busy = true; if (send) send.disabled = true;
      if (chips) chips.hidden = true;
      bubble('user', text);
      messages.push({ role: 'user', content: text });
      input.value = '';
      const wait = thinking();
      let reply = '';
      try {
        if (!ENDPOINT) throw new Error('no endpoint');
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ messages: messages.slice(-MAX_TURNS) }, demo ? { demo: demo } : {})),
        });
        const data = await res.json().catch(function () { return {}; });
        reply = data && data.reply ? String(data.reply) : '';
        if (!reply) throw new Error((data && data.error) || 'no reply');
      } catch (e) {
        reply = '';
      }
      wait.remove();
      if (reply) {
        bubble('ai', reply);
        messages.push({ role: 'assistant', content: reply });
        window.trackEvent('assistant-answer');
      } else {
        const el = bubble('ai', 'Sorry — I couldn’t answer just now. ');
        const wa = String(CONFIG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
        if (wa) {
          const a = document.createElement('a');
          a.className = 'inline-link'; a.target = '_blank'; a.rel = 'noopener';
          a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi Re-Charge, I have a question: ' + text);
          a.textContent = 'Ask on WhatsApp instead';
          el.appendChild(a);
        }
        window.trackEvent('assistant-error');
      }
      busy = false; if (send) send.disabled = false;
      input.focus();
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value.trim()); });
    // the demo page shows whose assistant this is
    if (demo && ENDPOINT) {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo: demo, info: true }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok || !d.business) throw new Error('gone');
          document.querySelectorAll('[data-demo-business]').forEach(function (el) { el.textContent = d.business; });
          document.querySelectorAll('[data-demo-ready]').forEach(function (el) { el.hidden = false; });
          const first = log.querySelector('.asst__msg--ai');
          if (first) first.textContent = 'Hi! I\u2019m ' + d.business + '\u2019s assistant. Ask me anything \u2014 hours, prices, services, bookings.';
        })
        .catch(function () {
          document.querySelectorAll('[data-demo-missing]').forEach(function (el) { el.hidden = false; });
          box.hidden = true;
        });
    }
    if (chips) chips.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { ask(b.textContent.trim()); });
    });
  });
})();


/* ============================================================
   Craft layer — scroll progress, card spotlight.
   Everything here is decorative: if it throws, the page is
   unchanged, and none of it runs under prefers-reduced-motion.
   ============================================================ */
(function craftLayer() {
  if (reduceMotion) return;

  /* The drifting grid behind everything. Added here rather than to every page's
     markup, and only when motion is allowed — it is pure decoration. */
  const grid = document.createElement('div');
  grid.className = 'bg-grid';
  grid.setAttribute('aria-hidden', 'true');
  document.body.appendChild(grid);

  /* How far down the page you are. One element, one transform per frame. */
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let ticking = false;
  const draw = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(draw); }
  }, { passive: true });
  draw();

  /* A seamless marquee needs the row twice: the track slides exactly half its
     width, so the copy lands where the original started. Cloned here rather than
     written into the HTML so the markup carries each trade only once. */
  document.querySelectorAll('[data-marquee]').forEach((m) => {
    const track = m.querySelector('.marquee__track');
    const row = track && track.firstElementChild;
    if (!row) return;
    const copy = row.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('a').forEach((a) => { a.removeAttribute('href'); a.setAttribute('tabindex', '-1'); });
    track.appendChild(copy);
    m.classList.add('is-ready');
  });

  /* Cards light up under the cursor. Pointer-fine only: on a touch screen there
     is no cursor to follow, and the listener would just cost battery. */
  if (window.matchMedia('(pointer: fine)').matches) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
    }, { passive: true });
  }
})();

/* ============================================================
   Motion system — see the MOTION SYSTEM block in styles.css.
   Every effect here only *adds* motion on top of a finished
   page: if any of it fails, the page is simply still.
   ============================================================ */
(function motionSystem() {
  if (reduceMotion) return;
  const root = document.documentElement;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const main = document.querySelector('main');
  if (!main) return;
  const skip = '.ba__frame, .ip-phone, .ip-site, .peek, .asst, .flow-film, dialog, [aria-hidden="true"]';

  /* --- Headings: split into words that rise in from behind a mask --- */
  const splitWords = (el) => {
    let wi = 0;
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((t) => {
          if (!t) return;
          if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
          const o = document.createElement('span'); o.className = 'w';
          const i = document.createElement('span'); i.className = 'w__i'; i.textContent = t;
          i.style.setProperty('--wi', wi++);
          o.appendChild(i); frag.appendChild(o);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR' && n.tagName !== 'SVG') walk(n);
    });
    walk(el);
    el.classList.add('wsplit');
  };
  const heads = [...main.querySelectorAll('h1, h2')].filter((h) => !h.closest(skip) && !h.classList.contains('visually-hidden'));
  heads.forEach(splitWords);

  /* --- The first section plays in on load, block by block --- */
  const first = main.querySelector(':scope > section');
  if (first) {
    let ci = 0;
    const picks = first.querySelectorAll('.eyebrow, p.lead, .btn-row, .hero__trust, .callout, .service-nav, .tick-list, .mk-hero__form, .mk-jump');
    picks.forEach((el) => {
      // Not inside something already animating in, a reveal, or a mockup.
      if (el.closest('.hin') || el.closest('.reveal') || el.closest(skip)) return;
      el.classList.add('hin'); el.style.setProperty('--ci', ci++);
    });
    requestAnimationFrame(() => {
      first.classList.add('is-in');
      first.querySelectorAll('.wsplit').forEach((h) => h.classList.add('is-in'));
    });
  }

  /* --- Give each reveal a variant that suits what it is --- */
  document.querySelectorAll('.reveal').forEach((el) => {
    if (el.dataset.rv) return;
    const kids = [...el.children];
    const isList = /^(UL|OL)$/.test(el.tagName) || el.classList.contains('grid') || el.classList.contains('svc-list');
    if (isList && kids.length >= 3 && !el.querySelector('.reveal')) {
      el.dataset.rv = 'cascade';
      kids.forEach((k, i) => k.style.setProperty('--i', Math.min(i, 8)));
    } else if (el.matches('figure, .flow-film, .ba, [data-ba], .ip-phone, .plan, .work-card')) {
      el.dataset.rv = 'zoom';
    } else if (el.classList.contains('about__media') || el.classList.contains('about__photo')) {
      el.dataset.rv = 'left';
    }
  });

  /* --- Prices count up when they first come into view --- */
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const counters = [];
  main.querySelectorAll('.plan__price, .price-list .price, .svc-list em, .qtotal b').forEach((el) => {
    if (el.closest(skip)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const m = node.textContent.match(/R\s?([\d,]{3,})/);
      if (m) { counters.push({ el, node, text: node.textContent, value: Number(m[1].replace(/,/g, '')), match: m[0], done: false }); break; }
    }
  });
  const runCount = (c) => {
    c.done = true;
    const w = c.el.getBoundingClientRect().width;
    c.el.style.minWidth = Math.ceil(w) + 'px';
    c.el.classList.add('is-counting');
    const t0 = performance.now(), dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      const v = Math.round(c.value * e / 10) * 10;
      c.node.textContent = c.text.replace(c.match, 'R' + fmt(p < 1 ? v : c.value));
      if (p < 1) requestAnimationFrame(tick);
      else { c.node.textContent = c.text; c.el.style.minWidth = ''; c.el.classList.remove('is-counting'); }
    };
    requestAnimationFrame(tick);
  };

  /* A revealed card kept the reveal's slow, delayed transition, so hovering it
     lagged by most of a second. Once the reveal has played, hand the element
     back its own quick transitions. */
  document.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'opacity' && e.target.classList && e.target.classList.contains('reveal')) e.target.classList.add('is-settled');
  });

  /* --- One scroll loop drives everything that depends on position --- */
  const steps = [...main.querySelectorAll('.steps--tight .step')];
  const pendingReveals = () => [...document.querySelectorAll('.reveal:not(.is-visible)')];
  let pending = pendingReveals();
  const marqueeTrack = document.querySelector('.marquee__track');
  let lastY = window.scrollY, rate = 1, ticking = false, idleFrames = 0;
  const frame = () => {
    const y = window.scrollY, vh = window.innerHeight;
    root.style.setProperty('--sy', String(Math.round(y)));

    // Safety net under the observer: anything scrolled past is revealed, so a
    // fast fling or a jump to an anchor never leaves a section blank.
    if (pending.length) pending = pending.filter((el) => {
      if (el.getBoundingClientRect().top < vh * 0.92) { el.classList.add('is-visible'); return false; }
      return true;
    });
    heads.forEach((h) => { if (!h.classList.contains('is-in') && h.getBoundingClientRect().top < vh * 0.88) h.classList.add('is-in'); });
    counters.forEach((c) => { if (!c.done && c.el.getBoundingClientRect().top < vh * 0.9) runCount(c); });
    steps.forEach((s) => { if (!s.classList.contains('is-lit') && s.getBoundingClientRect().top < vh * 0.72) s.classList.add('is-lit'); });

    // The marquee speeds up with the scroll and settles back afterwards.
    if (marqueeTrack) {
      const a = marqueeTrack.getAnimations ? marqueeTrack.getAnimations()[0] : null;
      if (a) {
        const target = 1 + Math.min(Math.abs(y - lastY) / 10, 5);
        rate += (target - rate) * 0.18;
        a.playbackRate = rate;
      }
    }
    const moving = Math.abs(y - lastY) > 0.5 || Math.abs(rate - 1) > 0.02;
    lastY = y;
    if (moving) { idleFrames = 0; requestAnimationFrame(frame); }
    else if (++idleFrames < 8) requestAnimationFrame(frame);
    else ticking = false;
  };
  const kick = () => { if (!ticking) { ticking = true; idleFrames = 0; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick, { passive: true });
  window.addEventListener('hashchange', () => setTimeout(kick, 60));
  kick();
  setTimeout(kick, 400);

  if (!fine) return;

  /* --- Pointer: magnetic buttons, tilting cards, a light that follows --- */
  document.querySelectorAll('.btn--primary, .btn--free, .btn--large').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / r.width, y = (e.clientY - (r.top + r.height / 2)) / r.height;
      btn.style.translate = (x * 10).toFixed(1) + 'px ' + (y * 7).toFixed(1) + 'px';
    });
    btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
  });

  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', ((px - 0.5) * 7).toFixed(2) + 'deg');
    card.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg');
  }, { passive: true });

  const glow = document.createElement('div');
  glow.className = 'cursor-glow'; glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);
  let tx = innerWidth / 2, ty = innerHeight / 3, cx = tx, cy = ty, glowing = false;
  const follow = () => {
    cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
    glow.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
    if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5) requestAnimationFrame(follow); else glowing = false;
  };
  document.addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
    document.body.classList.add('has-cursor');
    if (!glowing) { glowing = true; requestAnimationFrame(follow); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => document.body.classList.remove('has-cursor'));
})();
