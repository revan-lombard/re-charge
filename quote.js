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
  let q = null, choice = null;
  const opt = () => (q && q.options && q.options.length ? q.options.find((o) => o.key === choice) || q.options[0] : null);
  // what's due to start, per the chosen option: the R500 deposit, or the first month
  const startCents = () => { const o = opt(); return o ? o.depositCents : q.depositCents; };
  const monthlyNow = () => { const o = opt(); return o ? o.monthly : q.monthly; };
  const startLabel = () => { const m = monthlyNow(); return m ? 'the first month (' + money(m.cents) + ')' : 'the R500 deposit'; };

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
    renderOptions();
    renderTable();
    $('qtTimelineRow').hidden = !q.timeline; text('qtTimeline', q.timeline);
    $('qtNotesRow').hidden = !q.notes; text('qtNotes', q.notes);
    $('qtValidRow').hidden = !q.validUntil || q.status === 'accepted'; text('qtValid', fmtDate(q.validUntil));
    const labels = { sent: 'Awaiting your answer', viewed: 'Awaiting your answer', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
    const st = $('qtStatus'); st.textContent = labels[q.status] || ''; st.dataset.s = q.status;

    const ask = $('qtAsk');
    if (wa) ask.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi Re-Charge, I have a question about quote ' + q.ref + ' (' + q.business + '): ');
    else ask.hidden = true;

    const form = $('qtAcceptForm'), done = $('qtDone');
    form.hidden = true; $('qtDeclineForm').hidden = true; done.hidden = true; $('qtTrack').hidden = true;
    if (q.status === 'accepted') {
      done.hidden = false;
      const pr = q.progress || { stage: 'accepted', paidCents: q.depositPaid ? q.depositCents : 0, site: '' };
      const live = pr.stage === 'live', building = pr.stage === 'building' || (q.depositPaid && pr.stage === 'accepted');
      text('qtDoneTitle', live ? 'Your site is live' : building ? 'We’re building your site' : 'Quote accepted' + (q.acceptedName ? ' by ' + q.acceptedName : ''));
      text('qtDoneText', live ? 'Thank you for trusting us with it. Anything odd, just message us.' : building ? 'Your payment is in and we’re on it. This page shows where things are, so keep the link.' : 'Thank you. Your slot is reserved as soon as ' + startLabel() + ' is paid.');
      renderTrack(q, pr);
      const acts = $('qtDoneActions'); acts.textContent = '';
      renderContent(pr);
      if (!q.depositPaid) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--primary'; b.textContent = 'Pay ' + startLabel(); b.addEventListener('click', () => accept(true, b)); acts.append(b); }
      if (wa) { const a = document.createElement('a'); a.className = 'btn btn--ghost'; a.href = ask.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Message us'; acts.append(a); }
    } else if (q.status === 'declined') {
      done.hidden = false; text('qtDoneTitle', 'Quote declined'); text('qtDoneText', 'Thanks for letting us know. If anything changes, message us and we’ll update it.'); $('qtDoneActions').textContent = '';
    } else if (q.status === 'expired') {
      done.hidden = false; text('qtDoneTitle', 'This quote has expired'); text('qtDoneText', 'Prices and availability may have changed. Message us and we’ll send an updated quote.'); $('qtDoneActions').textContent = '';
    } else {
      form.hidden = false;
      setAcceptText();
    }
    if (q.status !== 'accepted') $('qtContent').hidden = true;
    const paid = qs.get('paid');
    const pb = $('qtPaid');
    if (paid === '1') { pb.hidden = false; pb.classList.add('is-ok'); pb.textContent = 'Payment received — thank you. We’ll confirm by email shortly.'; }
    else if (paid === '0') { pb.hidden = false; pb.textContent = 'The payment wasn’t completed and nothing was charged. You can try again below.'; }
  }

  // Up to three options: cards to pick from; the table below follows the choice
  function renderOptions() {
    const box = $('qtOptions'), list = $('qtOptionList');
    const open = q.options && q.options.length && !['accepted', 'declined', 'expired'].includes(q.status);
    box.hidden = !open; if (!open) return;
    if (!choice || !q.options.some((o) => o.key === choice)) choice = (q.options.find((o) => o.recommended) || q.options[0]).key;
    list.textContent = '';
    q.options.forEach((o) => {
      const lab = document.createElement('label'); lab.className = 'qt-opt';
      const r = document.createElement('input'); r.type = 'radio'; r.name = 'qtChoice'; r.value = o.key; r.checked = o.key === choice;
      r.addEventListener('change', () => { choice = o.key; renderTable(); setAcceptText(); });
      lab.append(r);
      const add = (cls, txt, tag) => { const el = document.createElement(tag || 'span'); el.className = cls; el.textContent = txt; lab.append(el); return el; };
      add('qt-opt__check', '');
      if (o.recommended) add('qt-opt__tag', 'Most popular');
      add('qt-opt__name', o.name);
      const pr = add('qt-opt__price', o.monthly ? money(o.monthly.cents) : money(o.totalCents));
      if (o.monthly) { const sm = document.createElement('small'); sm.textContent = ' a month · ' + o.monthly.months + ' months'; pr.append(sm); }
      add('qt-opt__note', o.note || (o.monthly ? 'Nothing upfront except the first month.' : 'Once-off. R500 deposit to start.'));
      list.append(lab);
    });
  }
  function renderTable() {
    const o = opt(), items = o ? o.items : q.items, m = monthlyNow();
    const total = o ? (o.monthly ? o.monthly.cents : o.totalCents) : q.totalCents;
    const tb = $('qtItems'); tb.textContent = '';
    (items.length ? items : [{ desc: 'Project as discussed', cents: total }]).forEach((i) => {
      const tr = document.createElement('tr'); const a = document.createElement('td'); const b = document.createElement('td');
      a.textContent = i.desc; b.textContent = i.cents ? money(i.cents) : 'Included'; b.className = 'qt-num'; tr.append(a, b); tb.append(tr);
    });
    const start = startCents();
    if (m) {
      $('qtTotal').previousElementSibling.textContent = 'Per month (fixed)';
      text('qtTotal', money(m.cents));
      text('qtDepositLabel', q.depositPaid ? 'First month (paid)' : 'First month, to start');
      text('qtDeposit', money(m.cents));
      $('qtBalance').previousElementSibling.textContent = 'After that';
      text('qtBalance', money(m.cents) + ' × ' + (m.months - 1) + (m.afterCents ? ', then ' + money(m.afterCents) + '/mo' : ''));
    } else {
      $('qtTotal').previousElementSibling.textContent = 'Total (fixed)';
      text('qtTotal', money(total));
      text('qtDepositLabel', q.depositPaid ? 'R500 deposit (paid, credited)' : 'R500 deposit to start');
      text('qtDeposit', (q.depositPaid ? '−' : '') + money(start));
      $('qtBalance').previousElementSibling.textContent = 'Balance on completion';
      text('qtBalance', money(Math.max(0, total - start)));
    }
  }
  function setAcceptText() {
    const m = monthlyNow();
    text('qtAcceptIntro', q.depositPaid ? 'Your deposit is already paid, so accepting confirms the scope and price and we start straight away.'
      : m ? 'Accepting confirms the option above. Next you pay the first month (' + money(m.cents) + ') by card, through Yoco, and we start. After that a card payment link comes by email each month.'
      : 'Accepting confirms the scope and price. Next you’ll pay the R500 deposit (by card, through Yoco) to reserve your slot; it comes off the total.');
    text('qtAcceptBtn', q.depositPaid ? 'Accept quote' : m ? 'Accept & pay the first month' : 'Accept & pay R500 deposit');
  }

  // Takealot-style order tracking: the same link keeps working after acceptance
  function renderTrack(q, pr) {
    const ol = $('qtTrack'); ol.textContent = '';
    const bal = Math.max(0, (q.totalCents || 0) - (pr.paidCents || 0));
    const steps = [
      ['Quote accepted', q.acceptedAt ? new Date(q.acceptedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '', true],
      q.monthly ? ['First month paid', q.depositPaid ? money(q.depositCents) + ', then monthly by card' : 'Waiting for the first month (' + money(q.depositCents) + ')', q.depositPaid]
        : ['Deposit paid', q.depositPaid ? money(q.depositCents) + ', comes off the total' : 'Waiting for the R500 deposit', q.depositPaid],
      ['Your photos and details', q.content && q.content.sent ? 'Received' + (q.content.files ? ', ' + q.content.files + ' file' + (q.content.files === 1 ? '' : 's') : '') : 'Send them below', Boolean(q.content && (q.content.sent || q.content.files)) || pr.stage === 'live'],
      ['Building your site', pr.stage === 'live' ? 'Done' : q.depositPaid ? 'In progress' : '', pr.stage === 'live'],
      ['Live', pr.stage === 'live' ? (pr.site || 'Your site is online') : bal && !q.monthly ? 'Balance of ' + money(bal) + ' on completion' : '', pr.stage === 'live'],
    ];
    const cur = steps.findIndex((x) => !x[2]);
    steps.forEach(([title, sub, done], i) => {
      const li = document.createElement('li'); li.className = done ? 'is-done' : i === cur ? 'is-current' : '';
      if (i === cur) li.setAttribute('aria-current', 'step');
      const b = document.createElement('b'); b.textContent = title; li.append(b);
      if (sub) {
        const s = document.createElement('span');
        if (i === steps.length - 1 && pr.stage === 'live' && pr.site) { const a = document.createElement('a'); a.className = 'inline-link'; a.href = 'https://' + pr.site; a.target = '_blank'; a.rel = 'noopener'; a.textContent = pr.site; s.append(a); }
        else s.textContent = sub;
        li.append(s);
      }
      ol.append(li);
    });
    ol.hidden = false;
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
      const r = await call('accept', { name: name || q.acceptedName || '', choice: choice || undefined });
      q = r.quote;
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return; }
      render();
      if (!q.depositPaid && !r.checkoutUrl) { const e2 = $('qtDoneText'); e2.textContent = 'Quote accepted. We couldn’t open the card payment just now — we’ll send you a payment link.'; }
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = old; if (payOnly) alert(e.message); }
  }

  // ---- after accepting: the content checklist (services, hours, logo, photos) ----
  function renderContent(pr) {
    const f = $('qtContent');
    f.hidden = pr.stage === 'live'; if (f.hidden) return;
    const c = q.content || { sent: false, files: 0, fields: {} };
    ['about', 'services', 'hours', 'area', 'extra'].forEach((k) => { const el = f.elements[k]; if (el && !el.value && c.fields[k]) el.value = c.fields[k]; });
    text('qtContentIntro', c.sent || c.files ? 'Thanks, we have ' + (c.sent ? 'your details' : '') + (c.sent && c.files ? ' and ' : '') + (c.files ? c.files + ' file' + (c.files === 1 ? '' : 's') : '') + '. Change anything or add more photos any time: this page stays open.' : 'The sooner we have these, the sooner you’re live. Fill in what you can now: you can come back to this page and add more any time.');
  }
  // photos are shrunk on the phone before uploading (a 6 MB photo becomes ~400 KB)
  function shrink(file) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|webp|png)$/.test(file.type) || (file.type === 'image/png' && file.size < 1.5e6)) return resolve(file);
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 2000 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob((b) => resolve(b && b.size < file.size ? b : file), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  async function upload(files) {
    const list = $('qcFileList');
    for (const file of files) {
      const li = document.createElement('li'); const n = document.createElement('span'); n.textContent = file.name; const st = document.createElement('span'); st.textContent = 'Uploading…'; li.append(n, st); list.append(li);
      try {
        if (file.type === 'application/pdf' && file.size > 4e6) throw new Error('PDFs must be under 4 MB');
        const blob = await shrink(file);
        if (blob.size > 4.5e6) throw new Error('Too big: under 4 MB please');
        const r = await call('upload', { name: file.name, type: blob.type || file.type, data: await b64(blob) });
        q.content = r.content; st.textContent = 'Received ✓'; st.className = 'ok';
      } catch (e) { st.textContent = e.message; st.className = 'bad'; }
    }
    renderContent({ stage: 'building' }); renderTrack(q, q.progress || { stage: 'accepted', paidCents: 0, site: '' });
  }

  if (!t || !FN) { show('qtMissing'); return; }
  call('view').then((r) => { q = r.quote; render(); try { history.replaceState(null, '', location.pathname + '?t=' + encodeURIComponent(t)); } catch (e) {} })
    .catch(() => show('qtMissing'));
  $('qtAcceptForm').addEventListener('submit', (e) => { e.preventDefault(); accept(false, $('qtAcceptBtn')); });
  $('qtName').addEventListener('input', () => $('qtName').removeAttribute('aria-invalid'));
  $('qtDeclineOpen').addEventListener('click', () => { $('qtAcceptForm').hidden = true; $('qtDeclineForm').hidden = false; $('qtReason').focus(); });
  $('qtDeclineCancel').addEventListener('click', () => { $('qtDeclineForm').hidden = true; $('qtAcceptForm').hidden = false; });
  $('qcFiles').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); });
  $('qtContent').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, err = $('qcError'), ok = $('qcSaved'), b = $('qcSave');
    err.hidden = true; ok.hidden = true; b.disabled = true;
    const fields = {}; ['about', 'services', 'hours', 'area', 'extra'].forEach((k) => { fields[k] = f.elements[k].value; });
    try { const r = await call('content', { fields }); q.content = r.content; ok.textContent = 'Sent, thank you. We’ll be in touch if we need anything else.'; ok.hidden = false; renderContent({ stage: 'building' }); renderTrack(q, q.progress || { stage: 'accepted', paidCents: 0, site: '' }); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
    b.disabled = false;
  });
  $('qtDeclineForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const b = e.target.querySelector('[type=submit]'); b.disabled = true;
    try { const r = await call('decline', { reason: $('qtReason').value.trim() }); q = r.quote; render(); } catch (ex) { alert(ex.message); b.disabled = false; }
  });
})();
