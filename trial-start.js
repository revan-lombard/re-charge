// Inbox Assistant trial page: /trial-start?t=<token>. Talks only to the `trial-pay` Edge Function.
// One link for the whole trial: the deposit, the running trial, then keep it or the refund.
(function () {
  const CFG = window.RECHARGE_CONFIG || {};
  const FN = CFG.SUPABASE_URL ? CFG.SUPABASE_URL + '/functions/v1/trial-pay' : '';
  const qs = new URLSearchParams(location.search);
  // the link's token is its only key: read it, keep it for this tab, and take it out of the address bar
  // (page analytics records the address)
  // (the page's head already took it out of the address bar, before analytics: window.__rcTrialT)
  let t = qs.get('t') || window.__rcTrialT || '';
  try { if (t) sessionStorage.setItem('rc-trial-t', t); else t = sessionStorage.getItem('rc-trial-t') || ''; } catch (e) { /* private mode: the link still works */ }
  if (qs.has('t')) history.replaceState(null, '', location.pathname + (qs.get('paid') ? '?paid=' + qs.get('paid') : ''));
  let polls = 0;
  const $ = (id) => document.getElementById(id);
  const money = (c) => 'R' + Math.round((Number(c) || 0) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const wa = String(CFG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  let s = null;

  async function call(action, extra) {
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ t, action }, extra || {})) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { const e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
    return j;
  }
  const show = (id) => ['tsLoading', 'tsMissing', 'tsPage'].forEach((x) => { $(x).hidden = x !== id; });
  const text = (id, v) => { $(id).textContent = v; };
  const err = (id, m) => { const e = $(id); e.textContent = m || ''; e.hidden = !m; };
  function waLinks() {
    document.querySelectorAll('[data-ts-wa]').forEach((a) => {
      if (!wa) return;
      a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi Re-Charge, a question about my Inbox Assistant trial' + (s && s.ref ? ' (' + s.ref + ')' : '') + '.');
      a.target = '_blank'; a.rel = 'noopener'; a.hidden = false;
    });
  }
  function bankList(b) {
    const dl = $('tsBank'); dl.innerHTML = '';
    if (!b) { dl.innerHTML = '<div><dt>Bank details</dt><dd>We&rsquo;ll WhatsApp them to you.</dd></div>'; return; }
    [['Account name', b.accountName], ['Bank', b.bank], ['Account number', b.accountNo], ['Branch code', b.branch], ['Reference', b.reference], ['Amount', money(s.prices.deposit)]].forEach(([k, v]) => {
      if (!v) return; const d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>'; d.firstChild.textContent = k; d.lastChild.textContent = v; dl.appendChild(d);
    });
  }

  function render() {
    show('tsPage'); waLinks();
    document.querySelectorAll('[data-ts]').forEach((el) => { el.textContent = money(s.prices[el.dataset.ts]); });
    text('tsPayBtn', 'Pay the ' + money(s.prices.deposit) + ' deposit by card');   // one label: a span inside the button splits it into columns
    const hi = s.first ? 'Hi ' + s.first + '. ' : '';
    text('tsEyebrow', 'Inbox Assistant trial · ' + s.ref);
    ['tsDeposit', 'tsTrial', 'tsDecide', 'tsDone'].forEach((x) => { $(x).hidden = true; });
    const paid = qs.get('paid');
    if (paid === '0') { const b = $('tsBanner'); b.hidden = false; b.textContent = 'The payment didn’t go through, so nothing was charged. You can try again below.'; }

    if (s.stage === 'deposit') {
      text('tsTitle', 'Your two-week trial' + (s.business ? ' for ' + s.business : ''));
      text('tsLead', hi + 'It drafts replies to your customer emails from your own prices and policies. You only keep it, and pay the rest, if it saves your team 5 hours a week.');
      $('tsDeposit').hidden = false;
      if (s.bank) { $('tsAccept').hidden = true; $('tsEft').hidden = false; bankList(s.bank); }
      if (paid === '1') confirming();
    } else if (s.stage === 'trial') {
      text('tsTitle', 'Your trial is running');
      text('tsLead', hi + 'Thank you: the deposit is paid.');
      $('tsTrial').hidden = false;
      const tr = s.trial;
      if (tr && tr.started) {
        text('tsTrialTitle', 'Day ' + Math.max(1, tr.day) + ' of 14');
        text('tsTrialText', 'Paste your customer emails into your page and tap how each reply went: that measures the time saved. Your result shows on this page once the measured week is over, after day 14.');
      } else {
        text('tsTrialTitle', 'We’re setting up your page');
        text('tsTrialText', 'Within 3 business days, with your prices and policies. We’ll send you the link to your page, and the two weeks start then.');
      }
      if (tr && tr.page) { $('tsOpen').href = tr.page; $('tsOpen').hidden = false; }
    } else if (s.stage === 'decide') {
      text('tsTitle', 'Your result');
      text('tsLead', hi + 'Here’s what the measured week (days 8 to 14) saved your team, from the taps under each reply.');
      $('tsDecide').hidden = false;
      const r = s.result || { hours: 0, target: 5, complete: true };
      text('tsHours', String(r.hours));
      text('tsResultNote', (r.hours >= r.target ? 'That’s above the ' + r.target + ' hours a week target.' : 'The target was ' + r.target + ' hours a week.'));
      const after = ' After that it’s ' + money(s.prices.monthly) + ' a month, with a 3-month minimum, then a month’s notice.';
      // the deposit comes off the setup; where the setup is less than the deposit (a founding client), off the first month
      text('tsKeepText', s.prices.balance > 0
        ? 'One payment of ' + money(s.prices.keep) + ': the rest of the setup (' + money(s.prices.balance) + ') and your first month (' + money(s.prices.monthly) + ').' + after
        : 'One payment of ' + money(s.prices.keep) + ': your first month (' + money(s.prices.monthly) + ') less what’s left of your deposit.' + after);
      text('tsKeepBtn', s.prices.keep ? 'Keep it: pay ' + money(s.prices.keep) : 'Keep it');
      $('tsRefundBox').hidden = !s.refundOpen;
      if (paid === '1') { $('tsKeep').hidden = true; confirming(); }   // never a second payment while the first is being confirmed
    } else {
      $('tsDone').hidden = false;
      const done = {
        kept: ['You’re all set', 'Thank you. Your Inbox Assistant stays on, and we’ll be in touch about your monthly payments.'],
        refund: ['We’ve got your request', 'We’ll be in touch within one business day to confirm it. Refunds are paid within 7 days, and then your page and its data are deleted. Thank you for trying it.'],
        closed: ['This trial link is no longer active', 'If you’d still like to try the Inbox Assistant, WhatsApp us and we’ll send a new one.'],
        refunded: ['Your deposit has been refunded', 'Your page and its data have been deleted. Thank you for trying it.'],
      }[s.stage] || ['Thank you', ''];
      text('tsTitle', 'Inbox Assistant'); text('tsLead', hi.trim());
      text('tsDoneTitle', done[0]); text('tsDoneText', done[1]);
    }
  }

  // after paying: a few checks while the payment is confirmed (then the page says so and stops)
  function confirming() {
    const b = $('tsBanner'); b.hidden = false;
    if (polls++ < 6) { b.textContent = 'Thank you. Your payment is being confirmed: this page updates in a moment.'; setTimeout(load, 4000); }
    else b.textContent = 'Thank you. Your payment is still being confirmed. We’ll message you as soon as it shows, or WhatsApp us.';
  }
  async function load() {
    if (!FN || !t) { show('tsMissing'); waLinks(); return; }
    try { s = await call('view'); render(); }
    catch (e) { show('tsMissing'); waLinks(); }
  }

  // start: agree, then card (to Yoco) or EFT (our bank details)
  let method = 'card';
  $('tsAccept').querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => { method = b.dataset.method; }));
  $('tsAccept').addEventListener('submit', async (e) => {
    e.preventDefault(); err('tsError');
    const name = $('tsName').value.trim();
    if (name.length < 2) return err('tsError', 'Please type your full name.');
    if (!$('tsAgree').checked) return err('tsError', 'Please tick that you agree to the terms.');
    const btns = $('tsAccept').querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
    try {
      const r = await call('accept', { name, agree: true, method });
      if (r.redirectUrl) { location.href = r.redirectUrl; return; }
      $('tsAccept').hidden = true; $('tsEft').hidden = false; bankList(r.bank);
    } catch (ex) { err('tsError', ex.message); }
    btns.forEach((b) => { b.disabled = false; });
  });
  $('tsKeep').addEventListener('submit', async (e) => {
    e.preventDefault(); err('tsKeepError');
    if (!$('tsKeepAgree').checked) return err('tsKeepError', 'Please tick that you’d like to keep it.');
    const b = $('tsKeepBtn'); b.disabled = true;
    try { const r = await call('keep', { agree: true }); if (r.redirectUrl) location.href = r.redirectUrl; else await load(); }
    catch (ex) { err('tsKeepError', ex.message); b.disabled = false; }
  });
  $('tsCardInstead').addEventListener('click', () => { $('tsEft').hidden = true; $('tsAccept').hidden = false; });
  $('tsRefund').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    try { await call('refund', { reason: $('tsReason').value.trim() }); await load(); }
    catch (ex) { alert(ex.message); b.disabled = false; }
  });

  load();
})();
