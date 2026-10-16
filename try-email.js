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
  // Keep SAMPLES[i] and READY[i] in the same order: the offline reply is found by position.
  const SAMPLES = [
    ['Good day\n\nI got a letter saying my tax return is due. What\'s the deadline this year, which documents do you need from me, and can I pay your invoice by EFT?\n\nThanks\nSipho', 'Accounting practice for individuals and small businesses'],
    ['Hi\n\nWe need to move 14 pallets from Midrand to Durban, collection this Thursday. The delivery address needs a tail-lift. Can you quote, and is goods-in-transit insurance included?\n\nRegards\nMarius', 'Road freight, Gauteng to KZN'],
    ['Hi there,\n\nWe have 3 aircons at our office in Centurion that haven\'t been serviced in about two years. One of them is dripping water. How much would it be to service all three, and can you come next week? Mornings are better for us.\n\nThanks', 'Aircon installs and servicing in Gauteng'],
    ['Good day\n\nI ordered 20 boxes of A4 paper on the 3rd and only 15 arrived yesterday. The invoice still says 20. Please can you sort this out, we need the rest by Friday.\n\nRegards', 'Office supplies, delivered to businesses'],
    ['Hello, I\'d like to book a cut and colour for my daughter\'s matric dance on the 22nd. Do you have anything on the Saturday morning? And how long does a full colour take?', 'Hair salon'],
  ];
  // While the live AI is off (config.js AI_LIVE), the samples show prepared replies, and a visitor's
  // own email goes to a person on WhatsApp, who sends back the draft. Nothing here costs anything.
  let LIVE = CFG.AI_LIVE === true || Boolean(window.rcAiLive);   // AI_LIVE "auto": switches on when script.js hears the AI is available
  const READY = [
    { gist: 'The tax return deadline, which documents to send, and whether the invoice can be paid by EFT.',
      reply: 'Good day Sipho,\n\nThanks for your email. This year\u2019s deadline for your return is [this year\u2019s filing deadline], so there\u2019s still time.\n\nPlease send us your IRP5 (or IT3(a)) from your employer, your medical aid tax certificate, any retirement annuity certificates, and IT3(b) certificates for interest earned. A photo or PDF of each is fine.\n\nYes, you can pay our invoice by EFT: [your bank details], with invoice [invoice number] as the reference.\n\nKind regards\n[Your name]',
      check: ['Fill in this year\u2019s deadline', 'Confirm the document list for this client', 'Add your bank details'] },
    { gist: 'A quote for 14 pallets Midrand to Durban on Thursday, with a tail-lift, and whether insurance is included.',
      reply: 'Hi Marius,\n\nThanks for the enquiry. For 14 pallets from Midrand to Durban, collected this Thursday, the rate is [rate for 14 pallets], plus [tail-lift fee] for the tail-lift at delivery.\n\nGoods-in-transit cover is [goods-in-transit cover and excess]. Our collection window on Thursday is [collection window]; please send the collection and delivery addresses and we\u2019ll confirm the booking.\n\nRegards\n[Your name]',
      check: ['Fill in the rate', 'Confirm a tail-lift truck is free on Thursday', 'Confirm the insurance terms'] },
    { gist: 'A price to service three office aircons (one dripping), and a morning next week.',
      reply: 'Hi there,\n\nThanks for getting in touch. Servicing all three units would be [price for 3 units], and we\u2019ll check the dripping one at the same visit: it\u2019s usually a blocked drain line, which we clear on the spot.\n\nWe have morning slots next week on [days available]. Which suits you best? Please send the office address in Centurion and we\u2019ll confirm.\n\nKind regards\n[Your name]',
      check: ['Fill in the price for 3 units', 'Fill in the days you have open next week'] },
    { gist: 'Short delivery: 15 of 20 boxes of A4 arrived, but the invoice says 20; they need the rest by Friday.',
      reply: 'Good day,\n\nThank you for letting us know, and sorry about the short delivery. We\u2019ll send the remaining 5 boxes of A4 so they reach you [delivery day], before Friday.\n\nWe\u2019ll also correct the invoice to the 15 delivered and send the balance separately when the rest arrives, so you\u2019re only billed for what you have.\n\nKind regards\n[Your name]',
      check: ['Confirm the 5 boxes are in stock', 'Fill in the delivery day', 'Check the invoice correction with accounts'] },
    { gist: 'A cut and colour for a matric dance on the 22nd, Saturday morning, and how long a full colour takes.',
      reply: 'Hi,\n\nHow exciting, congratulations to your daughter! A cut and full colour takes about [time for cut and colour], so a Saturday morning start works well.\n\nOn Saturday the 22nd we have [available times]. Let me know which suits you and we\u2019ll book it in.\n\nKind regards\n[Your name]',
      check: ['Fill in how long a cut and colour takes', 'Check the diary for Saturday the 22nd'] },
  ];
  const phLive = form.email.placeholder, btnEl = form.querySelector('button[type=submit]'), btnLive = btnEl ? btnEl.textContent : '';
  const hint = form.querySelector('.form__hint'), hintLive = hint ? hint.innerHTML : '';
  const isSampleText = () => SAMPLES.some(([t]) => t.trim() === form.email.value.trim());
  // Offline the button says what will happen: a sample shows its prepared reply, anything else goes to us.
  const label = () => { if (!btnEl) return; btnEl.textContent = LIVE ? btnLive : (isSampleText() || !form.email.value.trim() ? 'Show the reply' : 'Send it to us for a draft'); };
  if (!LIVE) {
    form.email.placeholder = 'Press \u201cUse a sample email\u201d to see a reply now, or paste your own and we\u2019ll send you its draft';
    if (hint) hint.innerHTML = 'Live drafting is offline right now. Take out names, phone numbers and account details first. If you send us your own email, it comes to us on WhatsApp or email and we use it only to send your draft, then delete it.';
    label();
  }
  form.email.addEventListener('input', label);
  document.addEventListener('rc-ai-live', () => { LIVE = true; form.email.placeholder = phLive; if (hint) hint.innerHTML = hintLive; label(); });
  let sample = 0;
  $('[data-try-sample]').addEventListener('click', () => {
    const [e, b] = SAMPLES[sample++ % SAMPLES.length];
    form.email.value = e; form.business.value = b; msg.textContent = ''; form.email.removeAttribute('aria-invalid'); label();
    track('try-email-sample');
  });
  // [placeholders] become highlights; everything else is escaped text
  const marked = (t) => esc(t).replace(/\[([^\]\n]{1,80})\]/g, '<mark>[$1]</mark>');
  const show = (d) => {
    msg.textContent = '';
    $('[data-try-gist]').textContent = d.gist || '';
    $('[data-try-reply]').innerHTML = marked(d.reply || '');
    const checks = (d.check || []).filter(Boolean);
    $('[data-try-check]').innerHTML = checks.map((c) => '<li>' + marked(c) + '</li>').join('');
    $('[data-try-checkbox]').hidden = !checks.length;
    form.hidden = true; out.hidden = false;
    out.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!LIVE) {
      if (email.length < 15) { msg.textContent = 'Press \u201cUse a sample email\u201d to see a reply, or paste your own.'; form.email.focus(); return; }
      const i = SAMPLES.findIndex(([t]) => t.trim() === email);
      if (i >= 0) {
        btn.disabled = true; const l0 = btn.textContent; btn.textContent = 'Reading it\u2026';
        await new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900));
        btn.disabled = false; btn.textContent = l0; show(READY[i]); track('try-email-sample-reply'); return;
      }
      // Their own email: a person sends back the AI's draft (give first; the cost stays with us).
      const wa = String(CFG.WHATSAPP_NUMBER || '').replace(/\D/g, ''), mail = String(CFG.CONTACT_EMAIL || '');
      const by = typeof window.rcReplyBy === 'function' ? window.rcReplyBy() : 'by the next business day';
      const text = 'Hi Re-Charge, please send me the AI draft for this customer email' + (form.business.value.trim() ? ' (my business: ' + form.business.value.trim() + ')' : '') + ':\n\n' + email.slice(0, 1500);
      const btns = [
        wa ? '<a class="btn btn--primary btn--small" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(text) + '" data-track="try-email-wa">Send it on WhatsApp</a>' : '',
        mail ? '<a class="btn btn--ghost btn--small" href="mailto:' + esc(mail) + '?subject=' + encodeURIComponent('Please draft a reply to this email') + '&amp;body=' + encodeURIComponent(text) + '" data-track="try-email-mail">Send it by email</a>' : '',
      ].filter(Boolean).join('');
      msg.innerHTML = 'Live drafting is offline right now, so a person will send you the AI\u2019s draft, free, ' + esc(by) + '. Or press \u201cUse a sample email\u201d to see a reply now.' + (btns ? '<span class="try__send">' + btns + '</span>' : '');
      track('try-email-own-offline'); return;
    }
    if (email.length < 15) { msg.textContent = 'Paste a customer email first, or use a sample.'; form.email.setAttribute('aria-invalid', 'true'); form.email.focus(); return; }
    form.email.removeAttribute('aria-invalid');
    btn.disabled = true; const label0 = btn.textContent; btn.textContent = 'Reading it…'; msg.textContent = 'This takes about 10 to 20 seconds.';
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

/* After a client connects Microsoft 365, the sign-in sends them back here with ?connected=1 (or 0). */
(function connectedNotice() {
  const box = document.querySelector('[data-connected]');
  const v = new URLSearchParams(location.search).get('connected');
  if (!box || v === null) return;
  box.innerHTML = v === '1'
    ? '<b>You&rsquo;re connected.</b> Drafts start appearing in your inbox within 30 minutes, marked &ldquo;AI draft ready&rdquo;. Open one, check it, and press send. Nothing goes out without you.'
    : '<b>That didn&rsquo;t connect.</b> The link may have expired, or access wasn&rsquo;t allowed. Ask us for a new link and try again; it takes a minute.';
  box.classList.toggle('is-bad', v !== '1');
  box.hidden = false;
  try { window.trackEvent && window.trackEvent(v === '1' ? 'inbox-connected' : 'inbox-connect-failed'); } catch (e) { /* ignore */ }
})();
