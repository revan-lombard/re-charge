/* Live demos (live-demo.html): an interactive example of one kind of AI work.
   ?d=<slug>      a prospect's own example, built in the panel (live-demo function)
   ?sample=<kind> a built-in sample business (live-demo-samples.js), for the Examples page
   "Run AI" works through the items one by one; the auto switch decides whether routine work
   is finished by the AI or left ready for a person; the numbers add up as it goes. */
(function liveDemo() {
  'use strict';
  const CFG = window.RECHARGE_CONFIG || {};
  const API = CFG.SUPABASE_URL ? CFG.SUPABASE_URL + '/functions/v1/live-demo' : '';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const qs = new URLSearchParams(location.search);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const marked = (t) => esc(t).replace(/\[([^\]\n]{1,80})\]/g, '<mark>[$1]</mark>');
  const wait = (ms) => new Promise((r) => setTimeout(r, RM ? 0 : ms));
  const track = (n, d) => { try { window.trackEvent && window.trackEvent(n, d); } catch (e) { /* ignore */ } };

  // Per kind: words, the auto switch, and each action: label (plain / when done automatically),
  // its colour, and how its time is counted ("full" = the by-hand time less a minute's check,
  // "light" = the quick sort/forward time, "none" = a person still does it).
  const KIND = {
    email: { problem: 'An inbox that sorts and answers itself', noun: 'email', nouns: 'emails', h1: (b) => `${b}: your inbox, handled`, lead: 'Ten emails from a normal morning. Press Run AI and watch it read each one, decide what it needs, and get it done or ready for a person.',
      auto: 'Auto-reply routine emails', autoShort: 'Auto-reply', autoNote: 'Routine replies go out by themselves. Anything with a gap, money or a complaint still waits for a person.', inbox: 'Inbox',
      actions: { draft: ['Reply drafted', 'Reply sent', 'ok', 'full'], forward: [(r) => `Forwarded to ${r}`, null, 'info', 'light'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'], summarise: ['Thread summarised', null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['draft', 'Replies drafted', 'Replies sent', 'drafted', 'sent'], ['forward', 'Forwarded', null, 'forwarded'], ['file', 'Filed', null, 'filed'], ['summarise', 'Long threads summarised', null, 'summarised'], ['human', 'Need a person', null, 'need a person']] },
    invoices: { problem: 'Supplier invoices captured, no retyping', noun: 'document', nouns: 'documents', h1: (b) => `${b}: supplier invoices, captured`, lead: 'Eight documents from this morning\'s email. Press Run AI and watch it read each one, capture it, and catch what doesn\'t match.',
      auto: 'Post clean invoices automatically', autoShort: 'Auto-post', autoNote: 'Invoices that match their order are posted by themselves. Mismatches, duplicates and approvals still wait for a person.', inbox: 'Documents in',
      actions: { capture: ['Captured as draft bill', 'Posted', 'ok', 'full'], flag: ['Mismatch flagged', null, 'warn', 'full'], human: [(r) => `Needs approval: ${r}`, null, 'warn', 'none'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'] },
      counts: [['capture', 'Captured', 'Posted', 'captured', 'posted'], ['flag', 'Caught (mismatch or duplicate)', null, 'caught'], ['human', 'Need approval', null, 'need approval'], ['file', 'Filed', null, 'filed']] },
    enquiries: { problem: 'Every enquiry answered in minutes, day or night', noun: 'enquiry', nouns: 'enquiries', h1: (b) => `${b}: every enquiry answered`, lead: 'Eight messages from WhatsApp, the website and Facebook. Press Run AI and watch it answer, book, and pass the good leads to the right person.',
      auto: 'Reply to customers automatically', autoShort: 'Auto-reply', autoNote: 'Routine answers and booking replies go out by themselves, day and night. Leads and anything unusual still go to a person.', inbox: 'New messages',
      actions: { answer: ['Answer drafted', 'Answered', 'ok', 'full'], book: ['Booking reply drafted', 'Booking offered', 'ok', 'full'], qualify: [(r) => `Lead passed to ${r}`, null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['answer', 'Answers drafted', 'Answered', 'answers', 'answered'], ['book', 'Bookings drafted', 'Bookings offered', 'bookings', 'booked'], ['qualify', 'Leads passed on', null, 'leads passed on'], ['human', 'Need a person', null, 'need a person']] },
    reviews: { problem: 'Every review answered, complaints caught early', noun: 'review', nouns: 'reviews', h1: (b) => `${b}: every review answered`, lead: 'A week of Google reviews and feedback. Press Run AI and watch it reply, flag the ones the manager must see, and spot what keeps coming up.',
      auto: 'Post thank-you replies automatically', autoShort: 'Auto-post thanks', autoNote: 'Thank-yous to happy reviews are posted by themselves. Complaints and mixed reviews still wait for a person.', inbox: 'New reviews',
      actions: { reply: ['Reply drafted', 'Reply posted', 'ok', 'full'], thank: ['Thank-you drafted', 'Thank-you posted', 'ok', 'full'], alert: [(r) => `Flagged to ${r}`, null, 'warn', 'none'], theme: ['Theme noted', null, 'info', 'light'] },
      counts: [['reply', 'Replies drafted', 'Replies posted', 'replies', 'posted'], ['thank', 'Thank-yous drafted', 'Thank-yous posted', 'thank-yous', 'posted'], ['alert', 'Flagged to the manager', null, 'flagged'], ['theme', 'Themes spotted', null, 'themes']] },
    questions: { problem: 'Staff questions answered from your own documents', noun: 'question', nouns: 'questions', h1: (b) => `${b}: answers from your own documents`, lead: 'Questions your team asks in a normal week. Press Run AI and watch it answer from your own policies, show where it found it, and say honestly when it doesn\'t know.',
      auto: '', autoNote: '', inbox: 'Questions',
      actions: { answer: ['Answered, with source', 'Answered, with source', 'ok', 'full'], human: [(r) => `Not in the documents: ask ${r}`, null, 'warn', 'none'] },
      counts: [['answer', 'Answered', null, 'answered'], ['human', 'Sent to a person', null, 'to a person']] },
  };
  const PRI = { urgent: ['Urgent', 'bad'], today: ['Today', 'amber'], routine: ['Routine', 'muted'] };

  let demo = null, K = null, isSample = false, autoMode = false, ran = 0, running = false;

  // The demo fills exactly the screen below the header (which floats a little lower on desktop).
  const fit = () => { const m = $('.ld-main'); if (m) document.documentElement.style.setProperty('--ld-top', Math.max(0, Math.round(m.getBoundingClientRect().top + scrollY)) + 'px'); };
  fit(); addEventListener('resize', fit);
  const root = $('[data-ld]');
  const fail = (m) => { $('[data-ld-error]').textContent = m; $('[data-ld-error]').hidden = false; $('[data-ld-loading]').hidden = true; };

  (async function load() {
    const d = (qs.get('d') || '').trim().toLowerCase(), sample = (qs.get('sample') || '').trim().toLowerCase();
    if (d) {
      if (!API) return fail('This demo couldn\'t load.');
      try {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ d }) });
        const j = await r.json(); if (!j.ok) return fail(j.error || 'This demo couldn\'t load.');
        demo = j;
      } catch (e) { return fail('No connection. Check your internet and try again.'); }
    } else {
      const S = window.RC_DEMO_SAMPLES || {}; demo = S[sample] || S.email; isSample = true;
      $('[data-ld-sample]').hidden = false;
      const pick = $('[data-ld-kinds]');
      pick.innerHTML = Object.keys(KIND).map((k) => `<option value="${k}"${k === demo.kind ? ' selected' : ''}>${esc({ email: 'Email inbox', invoices: 'Invoices', enquiries: 'Enquiries & leads', reviews: 'Reviews', questions: 'Staff questions' }[k])}</option>`).join('');
      pick.addEventListener('change', () => { location.search = '?sample=' + pick.value; });
    }
    K = KIND[demo.kind] || KIND.email;
    render();
    track('live-demo-view', { kind: demo.kind, sample: !d });
  })();

  function actionOf(it) {
    const a = K.actions[it.action] || ['Handled', null, 'ok', 'full'];
    const done = autoMode && it.auto && a[1];
    const lbl = done ? a[1] : (typeof a[0] === 'function' ? a[0](it.route || '') : a[0]);
    return { label: lbl, tone: a[2], kind: a[3], done: Boolean(done) };
  }
  // Minutes saved on one item, compared with doing it by hand.
  function saved(it) {
    const c = demo.config, a = actionOf(it);
    if (a.kind === 'none') return 0;
    if (a.kind === 'light') return Number(c.light_minutes) || 1.5;
    return Math.max(0, (Number(c.manual_minutes) || 6) - (a.done ? 0 : 1));
  }

  function render() {
    $('[data-ld-loading]').hidden = true;
    // Samples lead with the problem; a prospect's own page leads with their business.
    document.title = `${isSample ? K.problem : demo.business + ': live example'} | Re-Charge`;
    $('[data-ld-eyebrow]').textContent = isSample ? 'Live example' : `Live example · ${demo.business}`;
    $('[data-ld-title]').textContent = isSample ? K.problem : K.h1(demo.business);
    $('[data-ld-lead]').textContent = K.lead;
    $('[data-ld-basis]').textContent = `About ${demo.config.per_day} a day · tap any to see it`;
    const sw = $('[data-ld-auto]');
    if (K.auto) { sw.hidden = false; $('[data-ld-auto-label]').textContent = innerWidth <= 860 ? K.autoShort : K.auto; sw.title = K.autoNote; $('[data-ld-auto-note]').textContent = K.autoNote; }
    $('[data-ld-inbox]').textContent = `${K.inbox} · ${demo.items.length}`;
    root.hidden = false;
    rows();
  }

  function rows(order) {
    const list = order || demo.items.map((_, i) => i);
    $('[data-ld-rows]').innerHTML = list.map((i) => {
      const it = demo.items[i], doneRow = i < ran;
      const a = doneRow ? actionOf(it) : null, p = PRI[it.priority] || PRI.routine;
      return `<li class="ld-row${doneRow ? ' is-done' : ''}" data-i="${i}">
        <button type="button" class="ld-row__head" aria-haspopup="dialog">
          <span class="ld-row__time">${esc(it.received)}</span>
          <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
          <span class="ld-row__title"><b>${esc(it.title)}</b><small>${esc(String(it.body).replace(/\s+/g, ' ').slice(0, 90))}…</small></span>
          <span class="ld-row__ai">${doneRow ? `<span class="ld-pri ld-pri--${p[1]}">${p[0]}</span><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span>` : '<span class="ld-new">New</span>'}</span>
        </button>
        </li>`;
    }).join('');
    document.querySelectorAll('.ld-row__head').forEach((b) => b.addEventListener('click', () => detail(Number(b.parentElement.dataset.i), b)));
    kpis();
  }

  // One item in full, over the list (so the page itself never has to scroll).
  let opener = null;
  function detail(i, from) {
    const it = demo.items[i], doneRow = i < ran, a = doneRow ? actionOf(it) : null, p = PRI[it.priority] || PRI.routine;
    opener = from || null;
    $('[data-ld-pos]').textContent = `${i + 1} of ${demo.items.length}`;
    $('[data-ld-detail-body]').innerHTML = `
      <div class="ld-detail__head"><b>${esc(it.from_name)}</b><span class="muted small">${esc(it.from_detail)} · ${esc(it.received)}</span>${doneRow ? `<span class="ld-pri ld-pri--${p[1]}">${p[0]}</span><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span>` : ''}</div>
      <div class="ld-col"><h4>What came in: ${esc(it.title)}</h4><pre class="ld-body">${esc(it.body)}</pre></div>
      ${doneRow ? `<div class="ld-col"><h4>What the AI did</h4><p class="ld-why">${esc(it.reason)}</p>
        ${(it.fields || []).length ? `<table class="ld-fields">${it.fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(f.value)}</td></tr>`).join('')}</table>` : ''}
        ${it.route && demo.kind === 'questions' && it.action === 'answer' ? `<p class="ld-src">Source: ${esc(it.route)}</p>` : ''}
        ${it.output ? `<div class="ld-out">${marked(it.output)}</div>${/\[[^\]]+\]/.test(it.output) ? '<p class="tiny muted">Highlighted parts aren\'t in your information yet, so a person fills them in.</p>' : ''}` : ''}</div>` : '<div class="ld-col"><p class="muted small">Press Run AI to see what it does with this one.</p></div>'}`;
    const box = $('[data-ld-detail]'); box.hidden = false; $('[data-ld-detail-body]').scrollTop = 0; $('[data-ld-close]').focus();
  }
  function closeDetail() { if ($('[data-ld-detail]').hidden) return; $('[data-ld-detail]').hidden = true; if (opener && opener.isConnected) opener.focus(); }
  $('[data-ld-close]').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  function kpis() {
    const done = demo.items.slice(0, ran), c = demo.config, n = demo.items.length;
    const tiles = K.counts.map(([act, plain, auto, short, shortAuto]) => {
      const its = done.filter((x) => x.action === act);
      const autoCount = its.filter((x) => actionOf(x).done).length;
      const label = auto && autoMode && autoCount === its.length && its.length ? auto : plain;
      const s = label === auto ? shortAuto : short;
      return `<div class="ld-kpi"><b>${its.length}</b><span><span class="ld-l">${esc(label)}${auto && autoMode && autoCount && autoCount < its.length ? ` <small>(${autoCount} ${esc(auto.toLowerCase())})</small>` : ''}</span><span class="ld-s">${esc(s)}${auto && autoMode && autoCount && autoCount < its.length ? ` (${autoCount} ${esc(shortAuto)})` : ''}</span></span></div>`;
    });
    const urgent = done.filter((x) => x.priority === 'urgent').length;
    tiles.push(`<div class="ld-kpi ld-kpi--bad"><b>${urgent}</b><span><span class="ld-l">Urgent, flagged to the top</span><span class="ld-s">urgent</span></span></div>`);
    $('[data-ld-kpis]').innerHTML = tiles.join('');
    const byHand = n * (Number(c.manual_minutes) || 6);
    const save = demo.items.reduce((a, it, i) => a + (i < ran ? saved(it) : 0), 0);
    const perItem = demo.items.reduce((a, it) => a + saved(it), 0) / n;
    const perDay = (perItem * (Number(c.per_day) || 40)) / 60, perMonth = perDay * 21;
    const r1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
    $('[data-ld-time]').innerHTML = ran < n
      ? `<p>${ran ? `${ran} of ${n} done…` : `By hand, these ${n} ${esc(K.nouns)} take about <b>${Math.round(byHand)} minutes</b>. Press Run AI.`}</p>`
      : `<div class="ld-save"><div><b>${Math.round(save)} min</b><span>saved on these ${n} (of ${Math.round(byHand)})</span></div>
         <div><b>~${r1(perDay)} h</b><span>a day at ${esc(c.per_day)} a day</span></div>
         <div><b>~${r1(perMonth)} h</b><span>a month</span></div></div>
         <p class="ld-note">Counted honestly: a drafted reply still takes a minute to check, quick sorting counts ${esc(c.light_minutes)} min, and anything a person handles counts nothing.${K.auto ? ` Switch auto ${autoMode ? 'off' : 'on'} to compare.` : ''}</p>`;
  }

  $('[data-ld-run]').addEventListener('click', async () => {
    if (running) return;
    running = true; ran = 0; closeDetail(); rows();
    const btn = $('[data-ld-run]'); btn.disabled = true; btn.textContent = 'Running…';
    track('live-demo-run', { kind: demo.kind, auto: autoMode });
    for (let i = 0; i < demo.items.length; i++) {
      const li = document.querySelector(`.ld-row[data-i="${i}"]`);
      if (li) { li.classList.add('is-reading'); li.querySelector('.ld-row__ai').innerHTML = '<span class="ld-reading">Reading…</span>'; }
      await wait(420);
      ran = i + 1; rows();
      const now = document.querySelector(`.ld-row[data-i="${i}"]`); if (now) { now.classList.add('is-flash'); }
      await wait(180);
    }
    running = false; btn.disabled = false; btn.textContent = 'Run it again';
    $('[data-ld-sort]').hidden = false;
  });
  $('[data-ld-auto-input]').addEventListener('change', (e) => { autoMode = e.target.checked; rows(); track('live-demo-auto', { on: autoMode }); });
  $('[data-ld-sort]').addEventListener('click', (e) => {
    const rank = { urgent: 0, today: 1, routine: 2 };
    const urgentFirst = e.target.getAttribute('aria-pressed') !== 'true';
    e.target.setAttribute('aria-pressed', String(urgentFirst));
    e.target.textContent = urgentFirst ? 'Arrival order' : 'Urgent first';
    rows(urgentFirst ? demo.items.map((_, i) => i).sort((a, b) => rank[demo.items[a].priority] - rank[demo.items[b].priority] || a - b) : null);
  });
})();
