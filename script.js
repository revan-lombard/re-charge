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

/* ---------- Demo widgets (demos.html) ---------- */
window.RC_DEMOS && window.RC_DEMOS();

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
  const progress = [...form.querySelectorAll('#builderProgress li')];
  const backBtn = form.querySelector('#backBtn');
  const nextBtn = form.querySelector('#nextBtn');
  const submitBtn = form.querySelector('#submitBtn');
  const errorBox = form.querySelector('#formError');
  const fileInput = form.querySelector('#attachment');
  const fileList = form.querySelector('#fileList');
  const fileHint = form.querySelector('#fileHint');
  const thanks = document.getElementById('builderThanks');
  const pageField = form.querySelector('#pageField');
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
    'Something Else': 'Tell us what you’re trying to accomplish, in your own words.',
    'Not Sure': 'Tell us what you’re currently doing, what’s frustrating you, or what you’d like to improve.',
  };

  let current = 1;
  let maxReached = 1;

  const catInputs = () => [...form.querySelectorAll('input[name="cat"]')];
  const selectedCats = () => catInputs().filter((c) => c.checked).map((c) => c.value);

  // deep link ?type=Website (from homepage / demos)
  const params = new URLSearchParams(location.search);
  const preType = params.get('type');
  if (preType) {
    const match = catInputs().find((c) => c.value.toLowerCase() === preType.toLowerCase());
    if (match) match.checked = true;
  }
  const srcChannel = params.get('src') || '';

  function showStep(n) {
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
    nextBtn.hidden = n === steps.length; // last step uses the submit button
    if (n === 2) updateExample();
    if (n === 3) updateGroups();
    if (n === 5) buildEstimate();
    errorBox.classList.remove('is-visible');
    const focusable = steps[n - 1].querySelector('input, textarea, select, button, [tabindex]');
    if (focusable) focusable.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  progress.forEach((li) => {
    const go = () => { const f = Number(li.dataset.for); if (f <= maxReached) showStep(f); };
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  function updateExample() {
    const cats = selectedCats();
    const primary = cats.find((c) => EXAMPLES[c]) || 'Something Else';
    const ex = form.querySelector('#goalExample');
    if (ex) ex.textContent = EXAMPLES[primary] || '';
  }

  function updateGroups() {
    const cats = selectedCats();
    form.querySelectorAll('.qgroup').forEach((g) => {
      g.hidden = !cats.includes(g.dataset.qgroup);
    });
  }

  function projectName(cats) {
    const named = cats.filter((c) => c !== 'Something Else' && c !== 'Not Sure');
    if (named.length === 1) return PRICES[named[0]].label;
    if (named.length > 1) return 'Custom project (' + named.map((c) => PRICES[c].label).join(' + ') + ')';
    return 'Custom project';
  }

  function estimateFor(cats) {
    const mins = cats.map((c) => PRICES[c] && PRICES[c].min).filter((m) => m != null);
    if (!mins.length) return null; // only "not sure" / "something else"
    if (cats.length === 1) return { text: 'From R' + mins[0].toLocaleString('en-ZA') };
    const floor = mins.reduce((a, b) => a + b, 0);
    return { text: 'From R' + floor.toLocaleString('en-ZA'), combined: true };
  }

  function buildEstimate() {
    const cats = selectedCats();
    form.querySelector('#estProject').textContent = projectName(cats);
    const est = estimateFor(cats);
    form.querySelector('#estPrice').textContent = est ? est.text : 'Quoted after review';
    form.querySelector('#priceField').value = est ? est.text : 'Quoted after review';
    form.querySelector('#categoryField').value = cats.join(', ');

    // summary
    const goal = (form.goal.value || '').trim();
    const rows = [];
    rows.push(['Looking for', cats.join(', ') || '—']);
    if (goal) rows.push(['Goal', goal.length > 80 ? goal.slice(0, 80) + '…' : goal]);
    if (form.budget.value) rows.push(['Budget', form.budget.value]);
    if (form.deadline.value.trim()) rows.push(['Deadline', form.deadline.value.trim()]);
    const files = fileInput ? [...fileInput.files] : [];
    if (files.length) rows.push(['Files', files.length + ' attached']);
    const ul = form.querySelector('#summaryList');
    ul.innerHTML = rows.map((r) => '<li><span>' + escapeHtml(r[0]) + '</span><span>' + escapeHtml(r[1]) + '</span></li>').join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function setError(field, show) {
    const input = form.elements[field];
    const msg = document.getElementById(field + 'Error');
    if (input && input.setAttribute) input.setAttribute('aria-invalid', show ? 'true' : 'false');
    if (msg) msg.classList.toggle('is-visible', show);
  }

  function validateStep(n) {
    if (n === 1) {
      const ok = selectedCats().length > 0;
      form.querySelector('#catError').classList.toggle('is-visible', !ok);
      return ok;
    }
    if (n === 2) {
      const ok = (form.goal.value || '').trim().length >= 6;
      setError('goal', !ok);
      return ok;
    }
    if (n === 4) {
      let firstBad = null;
      [['name', (v) => v.trim().length > 0],
       ['email', (v, el) => v.trim().length > 0 && el.checkValidity()],
       ['phone', (v) => v.trim().length >= 6]].forEach(([f, ok]) => {
        const el = form.elements[f];
        const good = ok(el.value, el);
        setError(f, !good);
        if (!good && !firstBad) firstBad = el;
      });
      if (firstBad) { firstBad.focus(); return false; }
    }
    return true;
  }

  ['goal', 'name', 'email', 'phone'].forEach((f) => {
    const el = form.elements[f];
    if (el) el.addEventListener('input', () => setError(f, false));
  });
  catInputs().forEach((c) => c.addEventListener('change', () => {
    if (selectedCats().length) form.querySelector('#catError').classList.remove('is-visible');
  }));

  // files
  if (fileInput) {
    if (!ACCEPTS_FILES && fileHint) {
      fileHint.textContent = 'Up to 10 MB per file. File names are included with your project; we’ll send a link to share the files when we reply.';
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
    let n = current + 1;
    // skip nothing; step 3 always shows (upload). Go to next.
    showStep(Math.min(n, steps.length));
  });
  backBtn.addEventListener('click', () => showStep(Math.max(1, current - 1)));

  if (!PAY_URL && submitBtn) submitBtn.textContent = 'Submit my project';

  async function send(data, files) {
    if (!ENDPOINT) throw new Error('no endpoint configured');
    if (ENDPOINT.includes('script.google.com')) {
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
    if (current !== steps.length) { if (validateStep(current)) showStep(current + 1); return; }
    errorBox.classList.remove('is-visible');

    // gather everything
    const fd = new FormData(form);
    const files = fileInput ? [...fileInput.files] : [];
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (k === 'attachment' || typeof v !== 'string') continue;
      if (k in data) data[k] = data[k] + ', ' + v.trim(); // multi-value checkboxes
      else data[k] = v.trim();
    }
    data.submittedAt = new Date().toISOString();
    if (srcChannel) data.channel = srcChannel;
    if (files.length) data.attachments = files.map((f) => f.name + ' (' + humanSize(f.size) + ')').join(', ');
    data._subject = 'Re-Charge project: ' + (data.category || 'enquiry') + ' — ' + (data.name || '');

    const isSpam = Boolean(fd.get('_gotcha')) || Date.now() - loadedAt < 4000;
    delete data._gotcha;

    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      if (!isSpam) await send(data, files);
    } catch (err) {
      console.error('Project submission failed:', err);
      try {
        const stored = JSON.parse(localStorage.getItem('recharge-projects') || '[]');
        stored.push(data); localStorage.setItem('recharge-projects', JSON.stringify(stored));
      } catch (e) { /* storage blocked */ }
      const emailHint = CONFIG.CONTACT_EMAIL ? ' You can also email us at ' + CONFIG.CONTACT_EMAIL + '.' : '';
      errorBox.textContent = "Sorry — we couldn't submit your project just now. Please check your connection and try again; nothing you entered has been lost." + emailHint;
      errorBox.classList.add('is-visible');
      submitBtn.removeAttribute('aria-busy');
      submitBtn.disabled = false;
      submitBtn.textContent = PAY_URL ? 'Submit project & pay R500' : 'Submit my project';
      return;
    }

    window.trackEvent('project-submitted');
    form.hidden = true;
    thanks.hidden = false;
    const pay = document.getElementById('thanksPay');
    if (pay) {
      if (PAY_URL) {
        pay.innerHTML = 'Last step: <a class="btn btn--primary btn--small" href="' + escapeHtml(PAY_URL) + '" target="_blank" rel="noopener">Pay R500 deposit</a> to start the review. Your deposit is credited to your project.';
        pay.hidden = false;
      } else {
        pay.textContent = 'We’ll reply with a secure R500 deposit link and confirmation by email. The deposit is credited toward your project price.';
        pay.hidden = false;
      }
    }
    thanks.focus({ preventScroll: true });
    thanks.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  showStep(1);
}
