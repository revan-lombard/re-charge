// Public quote page: /quote?t=<token>. Talks only to the `quote` Edge Function.
(function () {
  const CFG = window.RECHARGE_CONFIG || {};
  const FN = CFG.SUPABASE_URL ? CFG.SUPABASE_URL + '/functions/v1/quote' : '';
  const qs = new URLSearchParams(location.search);
  const t = qs.get('t') || '';
  const $ = (id) => document.getElementById(id);
  const money = (c) => { c = Math.round(Number(c) || 0); const w = Math.trunc(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (c < 0 ? '-R' : 'R') + w + (c % 100 ? '.' + String(Math.abs(c) % 100).padStart(2, '0') : ''); };
  const fmtDate = (d) => { if (!d) return ''; const x = new Date(d + (d.length === 10 ? 'T12:00:00' : '')); return x.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const wa = String(CFG.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  let q = null;

  async function call(action, extra) {
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ t, action }, extra || {})) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { const e = new Error(j.error || 'Something went wrong — please try again.'); e.status = r.status; throw e; }
    return j;
  }
  function show(id) { ['qtLoading', 'qtMissing', 'qtQuote'].forEach((x) => { $(x).hidden = x !== id; }); }
  function text(id, v) { $(id).textContent = v; }

  function render() {
    show('qtQuote');
    text('qtRef', q.ref);
    text('qtEyebrow', 'Quote ' + q.ref);
    text('qtTitle', 'Your quote for ' + (q.business || 'your project'));
    text('qtLead', (q.firstName ? 'Hi ' + q.firstName + '. ' : '') + 'Here is exactly what we’ll build and what it costs. The price is fixed — it only changes if you ask for something new.');
    const tb = $('qtItems'); tb.textContent = '';
    (q.items.length ? q.items : [{ desc: 'Project as discussed', cents: q.totalCents }]).forEach((i) => {
      const tr = document.createElement('tr'); const a = document.createElement('td'); const b = document.createElement('td');
      a.textContent = i.desc; b.textContent = money(i.cents); b.className = 'qt-num'; tr.append(a, b); tb.append(tr);
    });
    text('qtTotal', money(q.totalCents));
    text('qtDepositLabel', q.depositPaid ? 'R500 deposit (paid, credited)' : 'R500 deposit to start');
    text('qtDeposit', (q.depositPaid ? '−' : '') + money(q.depositCents));
    text('qtBalance', money(Math.max(0, q.totalCents - q.depositCents)));
    $('qtTimelineRow').hidden = !q.timeline; text('qtTimeline', q.timeline);
    $('qtNotesRow').hidden = !q.notes; text('qtNotes', q.notes);
    $('qtValidRow').hidden = !q.validUntil || q.status === 'accepted'; text('qtValid', fmtDate(q.validUntil));
    const labels = { sent: 'Awaiting your answer', viewed: 'Awaiting your answer', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
    const st = $('qtStatus'); st.textContent = labels[q.status] || ''; st.dataset.s = q.status;

    const ask = $('qtAsk');
    if (wa) ask.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi Re-Charge, I have a question about quote ' + q.ref + ' (' + q.business + '): ');
    else ask.hidden = true;

    const form = $('qtAcceptForm'), done = $('qtDone');
    form.hidden = true; $('qtDeclineForm').hidden = true; done.hidden = true;
    if (q.status === 'accepted') {
      done.hidden = false;
      text('qtDoneTitle', 'Quote accepted' + (q.acceptedName ? ' by ' + q.acceptedName : ''));
      text('qtDoneText', q.depositPaid ? 'Thank you — your deposit is in and we’re on it. We’ll keep you posted on WhatsApp or email.' : 'Thank you. Your slot is reserved as soon as the R500 deposit is paid.');
      const acts = $('qtDoneActions'); acts.textContent = '';
      if (!q.depositPaid) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--primary'; b.textContent = 'Pay the R500 deposit'; b.addEventListener('click', () => accept(true, b)); acts.append(b); }
      if (wa) { const a = document.createElement('a'); a.className = 'btn btn--ghost'; a.href = ask.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Message us'; acts.append(a); }
    } else if (q.status === 'declined') {
      done.hidden = false; text('qtDoneTitle', 'Quote declined'); text('qtDoneText', 'Thanks for letting us know. If anything changes, message us and we’ll update it.'); $('qtDoneActions').textContent = '';
    } else if (q.status === 'expired') {
      done.hidden = false; text('qtDoneTitle', 'This quote has expired'); text('qtDoneText', 'Prices and availability may have changed. Message us and we’ll send an updated quote.'); $('qtDoneActions').textContent = '';
    } else {
      form.hidden = false;
      text('qtAcceptIntro', q.depositPaid ? 'Your R500 deposit is already paid, so accepting confirms the scope and price and we start straight away.' : 'Accepting confirms the scope and price. Next you’ll pay the R500 deposit (by card, through Yoco) to reserve your slot; it comes off the total.');
      text('qtAcceptBtn', q.depositPaid ? 'Accept quote' : 'Accept & pay R500 deposit');
    }
    const paid = qs.get('paid');
    const pb = $('qtPaid');
    if (paid === '1') { pb.hidden = false; pb.classList.add('is-ok'); pb.textContent = 'Deposit received — thank you. We’ll confirm by email shortly.'; }
    else if (paid === '0') { pb.hidden = false; pb.textContent = 'The payment wasn’t completed and nothing was charged. You can try again below.'; }
  }

  async function accept(payOnly, btn) {
    const err = $('qtError'); err.hidden = true;
    const name = $('qtName').value.trim();
    if (!payOnly) {
      if (name.length < 2) { err.textContent = 'Please type your full name to accept.'; err.hidden = false; $('qtName').setAttribute('aria-invalid', 'true'); $('qtName').focus(); return; }
      if (!$('qtAgree').checked) { err.textContent = 'Please tick the box to confirm.'; err.hidden = false; $('qtAgree').focus(); return; }
    }
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'One moment…';
    try {
      const r = await call('accept', { name: name || q.acceptedName || '' });
      q = r.quote;
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return; }
      render();
      if (!q.depositPaid && !r.checkoutUrl) { const e2 = $('qtDoneText'); e2.textContent = 'Quote accepted. We couldn’t open the card payment just now — we’ll send you a payment link.'; }
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = old; if (payOnly) alert(e.message); }
  }

  if (!t || !FN) { show('qtMissing'); return; }
  call('view').then((r) => { q = r.quote; render(); try { history.replaceState(null, '', location.pathname + '?t=' + encodeURIComponent(t)); } catch (e) {} })
    .catch(() => show('qtMissing'));
  $('qtAcceptForm').addEventListener('submit', (e) => { e.preventDefault(); accept(false, $('qtAcceptBtn')); });
  $('qtName').addEventListener('input', () => $('qtName').removeAttribute('aria-invalid'));
  $('qtDeclineOpen').addEventListener('click', () => { $('qtAcceptForm').hidden = true; $('qtDeclineForm').hidden = false; $('qtReason').focus(); });
  $('qtDeclineCancel').addEventListener('click', () => { $('qtDeclineForm').hidden = true; $('qtAcceptForm').hidden = false; });
  $('qtDeclineForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const b = e.target.querySelector('[type=submit]'); b.disabled = true;
    try { const r = await call('decline', { reason: $('qtReason').value.trim() }); q = r.quote; render(); } catch (ex) { alert(ex.message); b.disabled = false; }
  });
})();
