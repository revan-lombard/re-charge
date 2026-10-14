/* Re-Charge — 'try it on your own email' widget ([data-try]), on Examples and the Inbox Assistant page. */
/* ---------- Try it on your own email ----------
   The visitor pastes one real customer email; the live assistant (draft mode) writes
   the reply. Anything it can't know comes back as [placeholders], highlighted here and
   listed under "You check before sending". Nothing is stored. Capped server-side. */
(function tryOwnEmail() {
  'use strict';
  const box = document.querySelector('[data-try]');
  if (!box) return;
  const CFG = window.RECHARGE_CONFIG || {};
  const ENDPOINT = CFG.SUPABASE_URL ? CFG.SUPABASE_URL + '/functions/v1/assistant' : '';
  const $ = (s) => box.querySelector(s);
  const form = $('[data-try-form]'), out = $('[data-try-out]'), msg = $('[data-try-msg]'), btn = form.querySelector('button[type=submit]');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const track = (n, d) => { try { window.trackEvent && window.trackEvent(n, d); } catch (e) { /* ignore */ } };
  const SAMPLES = [
    ['Hi there,\n\nWe have 3 aircons at our office in Centurion that haven\'t been serviced in about two years. One of them is dripping water. How much would it be to service all three, and can you come next week? Mornings are better for us.\n\nThanks', 'Aircon installs and servicing in Gauteng'],
    ['Good day\n\nI ordered 20 boxes of A4 paper on the 3rd and only 15 arrived yesterday. The invoice still says 20. Please can you sort this out, we need the rest by Friday.\n\nRegards', 'Office supplies, delivered to businesses'],
    ['Hello, I\'d like to book a cut and colour for my daughter\'s matric dance on the 22nd. Do you have anything on the Saturday morning? And how long does a full colour take?', 'Hair salon'],
  ];
  let sample = 0;
  $('[data-try-sample]').addEventListener('click', () => {
    const [e, b] = SAMPLES[sample++ % SAMPLES.length];
    form.email.value = e; form.business.value = b; msg.textContent = ''; form.email.removeAttribute('aria-invalid');
    track('try-email-sample');
  });
  // [placeholders] become highlights; everything else is escaped text
  const marked = (t) => esc(t).replace(/\[([^\]\n]{1,80})\]/g, '<mark>[$1]</mark>');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (email.length < 15) { msg.textContent = 'Paste a customer email first, or use a sample.'; form.email.setAttribute('aria-invalid', 'true'); form.email.focus(); return; }
    form.email.removeAttribute('aria-invalid');
    btn.disabled = true; const label0 = btn.textContent; btn.textContent = 'Reading it…'; msg.textContent = 'This takes about 10 seconds.';
    let data = {};
    try {
      if (!ENDPOINT) throw new Error('off');
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: { email, business: form.business.value.trim() } }) });
      data = await res.json().catch(() => ({}));
    } catch (ex) { data = {}; }
    btn.disabled = false; btn.textContent = label0;
    const d = data && data.draft;
    if (!data.ok || !d) { msg.textContent = (data && data.error) || 'We couldn’t draft that just now. Please try again in a moment.'; track('try-email-error', { limit: !!(data && data.limit) }); return; }
    if (!d.is_email) { msg.textContent = d.note || 'That doesn’t look like a customer email. Paste one, or use a sample.'; return; }
    msg.textContent = '';
    $('[data-try-gist]').textContent = d.gist || '';
    $('[data-try-reply]').innerHTML = marked(d.reply || '');
    const checks = (d.check || []).filter(Boolean);
    $('[data-try-check]').innerHTML = checks.map((c) => '<li>' + marked(c) + '</li>').join('');
    $('[data-try-checkbox]').hidden = !checks.length;
    form.hidden = true; out.hidden = false;
    out.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    track('try-email-draft', { gaps: checks.length });
  });
  $('[data-try-copy]').addEventListener('click', async (e) => {
    const t = $('[data-try-reply]').textContent;
    try { await navigator.clipboard.writeText(t); e.target.textContent = 'Copied'; } catch (ex) { e.target.textContent = 'Select the text to copy'; }
    setTimeout(() => { e.target.textContent = 'Copy the reply'; }, 2000);
    track('try-email-copy');
  });
  $('[data-try-again]').addEventListener('click', () => { out.hidden = true; form.hidden = false; form.email.value = ''; form.email.focus(); });
})();
