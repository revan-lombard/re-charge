/* The client's private Inbox Assistant page: trial.html?t=<slug>. Everything comes from the
   inbox-trial function: their business name, this week's numbers, each draft, and the
   "how did it go" click that measures the time saved. Nothing pasted is stored. */
(function trialPage() {
  'use strict';
  const CFG = window.RECHARGE_CONFIG || {};
  const API = CFG.SUPABASE_URL ? CFG.SUPABASE_URL + '/functions/v1/inbox-trial' : '';
  const slug = (new URLSearchParams(location.search).get('t') || '').trim().toLowerCase();
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const marked = (t) => esc(t).replace(/\[([^\]\n]{1,80})\]/g, '<mark>[$1]</mark>');
  const call = async (body) => {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ t: slug }, body)) });
      return await r.json().catch(() => ({ ok: false }));
    } catch (e) { return { ok: false, error: 'No connection. Check your internet and try again.' }; }
  };
  const fail = (msg) => { const e = $('[data-tr-error]'); e.textContent = msg; e.hidden = false; };
  const week = (w) => {
    if (!w) return;
    $('[data-w="drafted"]').textContent = w.drafted; $('[data-w="used"]').textContent = w.used; $('[data-w="edited"]').textContent = w.edited;
    $('[data-w="hours"]').textContent = w.hours >= 10 ? Math.round(w.hours) : w.hours;
    $('[data-tr-week]').hidden = !w.drafted;
  };
  let current = null;

  (async function load() {
    if (!slug || !API) return fail('This link isn’t complete. Check it, or ask us for a new one.');
    const info = await call({ info: true });
    if (!info.ok) return fail(info.error || 'This page couldn’t load. Try again in a moment.');
    $('[data-tr-title]').textContent = info.business + '’s Inbox Assistant';
    document.title = info.business + ' · Inbox Assistant | Re-Charge';
    week(info.week);
    if (info.paused) return fail('This page is paused at the moment. Message us and we’ll switch it back on.');
    $('[data-tr-box]').hidden = false;
  })();

  const form = $('[data-tr-form]'), out = $('[data-tr-out]'), msg = $('[data-tr-msg]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (email.length < 10) { msg.textContent = 'Paste the customer’s email first.'; form.email.focus(); return; }
    const btn = form.querySelector('button[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Writing…'; msg.textContent = 'This takes about 10 seconds.';
    const r = await call({ email });
    btn.disabled = false; btn.textContent = label;
    if (!r.ok) { msg.textContent = r.error || 'That didn’t work. Please try again.'; return; }
    if (r.skipped) { msg.textContent = r.skipped === 'not a customer email' ? 'That doesn’t look like an email a customer needs a reply to (a receipt, a newsletter or a notification). Nothing to write.' : 'It couldn’t write a reply to that one. Try a different email.'; return; }
    msg.textContent = '';
    current = r.id;
    $('[data-tr-gist]').textContent = r.draft.gist || '';
    $('[data-tr-reply]').innerHTML = marked(r.draft.reply);
    const checks = (r.draft.check || []).filter(Boolean);
    $('[data-tr-check]').innerHTML = checks.map((c) => '<li>' + marked(c) + '</li>').join('');
    $('[data-tr-checkbox]').hidden = !checks.length;
    document.querySelectorAll('[data-o]').forEach((b) => { b.disabled = false; b.classList.remove('is-picked'); });
    form.hidden = true; out.hidden = false;
    out.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('[data-tr-copy]').addEventListener('click', async (e) => {
    const t = $('[data-tr-reply]').textContent;
    try { await navigator.clipboard.writeText(t); e.target.textContent = 'Copied'; } catch (ex) { e.target.textContent = 'Select the text to copy'; }
    setTimeout(() => { e.target.textContent = 'Copy the reply'; }, 2000);
  });
  document.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', async () => {
    if (!current) return;
    document.querySelectorAll('[data-o]').forEach((x) => { x.disabled = true; });
    b.classList.add('is-picked');
    const r = await call({ id: current, outcome: b.dataset.o });
    if (!r.ok) { document.querySelectorAll('[data-o]').forEach((x) => { x.disabled = false; }); b.classList.remove('is-picked'); return; }
    current = null;
    const info = await call({ info: true }); if (info.ok) week(info.week);
  }));
  document.querySelectorAll('[data-tr-next]').forEach((b) => b.addEventListener('click', () => { out.hidden = true; sumOut.hidden = true; form.hidden = false; form.email.value = ''; msg.textContent = ''; form.email.focus(); }));
  // A long thread: the main points and what it means for them.
  const sumOut = $('[data-tr-sumout]');
  const SUM = [['what', 'What it’s about'], ['agreed', 'Agreed so far'], ['open', 'Still open'], ['why', 'Why it matters to you'], ['todo', 'What you need to do']];
  $('[data-tr-sum]').addEventListener('click', async (e) => {
    const text = form.email.value.trim();
    if (text.length < 40) { msg.textContent = 'Paste the whole thread first.'; form.email.focus(); return; }
    const btn = e.currentTarget, label = btn.textContent; btn.disabled = true; btn.textContent = 'Reading the thread…'; msg.textContent = 'This takes about 10 seconds.';
    const r = await call({ email: text, summarise: true });
    btn.disabled = false; btn.textContent = label;
    if (!r.ok) { msg.textContent = r.error || 'That didn’t work. Please try again.'; return; }
    msg.textContent = ''; current = r.id;
    $('[data-tr-sumlist]').innerHTML = SUM.map(([k, l]) => `<dt>${l}</dt><dd>${esc(r.summary[k] || '')}</dd>`).join('');
    document.querySelectorAll('[data-o]').forEach((b) => { b.disabled = false; b.classList.remove('is-picked'); });
    form.hidden = true; sumOut.hidden = false; sumOut.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('[data-tr-sumcopy]').addEventListener('click', async (e) => {
    const t = SUM.map(([, l], i) => l + ': ' + ($('[data-tr-sumlist]').querySelectorAll('dd')[i]?.textContent || '')).join('\n');
    try { await navigator.clipboard.writeText(t); e.target.textContent = 'Copied'; } catch (ex) { e.target.textContent = 'Select the text to copy'; }
    setTimeout(() => { e.target.textContent = 'Copy the summary'; }, 2000);
  });
})();
