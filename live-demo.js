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
    email: { noun: 'email', nouns: 'emails', h1: (b) => `${b}: your inbox, handled`, lead: 'Ten emails from a normal morning. Press Run AI and watch it read each one, decide what it needs, and get it done or ready for a person.',
      auto: 'Auto-reply routine emails', autoNote: 'Routine replies go out by themselves. Anything with a gap, money or a complaint still waits for a person.', inbox: 'Inbox',
      actions: { draft: ['Reply drafted', 'Reply sent', 'ok', 'full'], forward: [(r) => `Forwarded to ${r}`, null, 'info', 'light'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'], summarise: ['Thread summarised', null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['draft', 'Replies drafted', 'Replies sent'], ['forward', 'Forwarded'], ['file', 'Filed'], ['summarise', 'Long threads summarised'], ['human', 'Need a person']] },
    invoices: { noun: 'document', nouns: 'documents', h1: (b) => `${b}: supplier invoices, captured`, lead: 'Eight documents from this morning\'s email. Press Run AI and watch it read each one, capture it, and catch what doesn\'t match.',
      auto: 'Post clean invoices automatically', autoNote: 'Invoices that match their order are posted by themselves. Mismatches, duplicates and approvals still wait for a person.', inbox: 'Documents in',
      actions: { capture: ['Captured as draft bill', 'Posted', 'ok', 'full'], flag: ['Mismatch flagged', null, 'warn', 'full'], human: [(r) => `Needs approval: ${r}`, null, 'warn', 'none'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'] },
      counts: [['capture', 'Captured', 'Posted'], ['flag', 'Caught (mismatch or duplicate)'], ['human', 'Need approval'], ['file', 'Filed']] },
    enquiries: { noun: 'enquiry', nouns: 'enquiries', h1: (b) => `${b}: every enquiry answered`, lead: 'Eight messages from WhatsApp, the website and Facebook. Press Run AI and watch it answer, book, and pass the good leads to the right person.',
      auto: 'Reply to customers automatically', autoNote: 'Routine answers and booking replies go out by themselves, day and night. Leads and anything unusual still go to a person.', inbox: 'New messages',
      actions: { answer: ['Answer drafted', 'Answered', 'ok', 'full'], book: ['Booking reply drafted', 'Booking offered', 'ok', 'full'], qualify: [(r) => `Lead passed to ${r}`, null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['answer', 'Answers drafted', 'Answered'], ['book', 'Bookings drafted', 'Bookings offered'], ['qualify', 'Leads passed on'], ['human', 'Need a person']] },
    reviews: { noun: 'review', nouns: 'reviews', h1: (b) => `${b}: every review answered`, lead: 'A week of Google reviews and feedback. Press Run AI and watch it reply, flag the ones the manager must see, and spot what keeps coming up.',
      auto: 'Post thank-you replies automatically', autoNote: 'Thank-yous to happy reviews are posted by themselves. Complaints and mixed reviews still wait for a person.', inbox: 'New reviews',
      actions: { reply: ['Reply drafted', 'Reply posted', 'ok', 'full'], thank: ['Thank-you drafted', 'Thank-you posted', 'ok', 'full'], alert: [(r) => `Flagged to ${r}`, null, 'warn', 'none'], theme: ['Theme noted', null, 'info', 'light'] },
      counts: [['reply', 'Replies drafted', 'Replies posted'], ['thank', 'Thank-yous drafted', 'Thank-yous posted'], ['alert', 'Flagged to the manager'], ['theme', 'Themes spotted']] },
    questions: { noun: 'question', nouns: 'questions', h1: (b) => `${b}: answers from your own documents`, lead: 'Questions your team asks in a normal week. Press Run AI and watch it answer from your own policies, show where it found it, and say honestly when it doesn\'t know.',
      auto: '', autoNote: '', inbox: 'Questions',
      actions: { answer: ['Answered, with source', 'Answered, with source', 'ok', 'full'], human: [(r) => `Not in the documents: ask ${r}`, null, 'warn', 'none'] },
      counts: [['answer', 'Answered'], ['human', 'Sent to a person']] },
  };
  const PRI = { urgent: ['Urgent', 'bad'], today: ['Today', 'amber'], routine: ['Routine', 'muted'] };

  let demo = null, K = null, autoMode = false, ran = 0, running = false;

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
      const S = window.RC_DEMO_SAMPLES || {}; demo = S[sample] || S.email;
      $('[data-ld-sample]').hidden = false;
      $('[data-ld-kinds]').innerHTML = Object.keys(KIND).map((k) => `<a href="?sample=${k}"${k === demo.kind ? ' aria-current="page"' : ''}>${esc({ email: 'Email inbox', invoices: 'Invoices', enquiries: 'Enquiries & leads', reviews: 'Reviews', questions: 'Staff questions' }[k])}</a>`).join('');
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
    document.title = `${demo.business}: live example | Re-Charge`;
    $('[data-ld-eyebrow]').textContent = `Live example · ${demo.business}`;
    $('[data-ld-title]').textContent = K.h1(demo.business);
    $('[data-ld-lead]').textContent = K.lead;
    $('[data-ld-basis]').innerHTML = `Based on about <b>${esc(demo.config.per_day)} ${esc(K.nouns)} a day</b>. These ${demo.items.length} were written for ${esc(demo.business)}; what the AI does with each one is what it would really do.`;
    const sw = $('[data-ld-auto]');
    if (K.auto) { sw.hidden = false; $('[data-ld-auto-label]').textContent = K.auto; $('[data-ld-auto-note]').textContent = K.autoNote; }
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
        <button type="button" class="ld-row__head" aria-expanded="false">
          <span class="ld-row__time">${esc(it.received)}</span>
          <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
          <span class="ld-row__title"><b>${esc(it.title)}</b><small>${esc(String(it.body).replace(/\s+/g, ' ').slice(0, 90))}…</small></span>
          <span class="ld-row__ai">${doneRow ? `<span class="ld-pri ld-pri--${p[1]}">${p[0]}</span><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span>` : '<span class="ld-new">New</span>'}</span>
        </button>
        <div class="ld-row__more" hidden>
          <div class="ld-col"><h4>What came in</h4><pre class="ld-body">${esc(it.body)}</pre></div>
          ${doneRow ? `<div class="ld-col"><h4>What the AI did</h4><p class="ld-why">${esc(it.reason)}</p>
            ${(it.fields || []).length ? `<table class="ld-fields">${it.fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(f.value)}</td></tr>`).join('')}</table>` : ''}
            ${it.route && demo.kind === 'questions' && it.action === 'answer' ? `<p class="ld-src">Source: ${esc(it.route)}</p>` : ''}
            ${it.output ? `<div class="ld-out">${marked(it.output)}</div>${/\[[^\]]+\]/.test(it.output) ? '<p class="tiny muted">Highlighted parts aren\'t in your information yet, so a person fills them in.</p>' : ''}` : ''}</div>` : '<div class="ld-col"><p class="muted small">Press Run AI to see what it does with this one.</p></div>'}
        </div></li>`;
    }).join('');
    document.querySelectorAll('.ld-row__head').forEach((b) => b.addEventListener('click', () => {
      const more = b.nextElementSibling, open = more.hidden; more.hidden = !open; b.setAttribute('aria-expanded', String(open));
    }));
    kpis();
  }

  function kpis() {
    const done = demo.items.slice(0, ran), c = demo.config, n = demo.items.length;
    const tiles = K.counts.map(([act, plain, auto]) => {
      const its = done.filter((x) => x.action === act);
      const autoCount = its.filter((x) => actionOf(x).done).length;
      const label = auto && autoMode && autoCount === its.length && its.length ? auto : plain;
      return `<div class="ld-kpi"><b>${its.length}</b><span>${esc(label)}${auto && autoMode && autoCount && autoCount < its.length ? ` <small>(${autoCount} ${esc(auto.toLowerCase())})</small>` : ''}</span></div>`;
    });
    const urgent = done.filter((x) => x.priority === 'urgent').length;
    tiles.push(`<div class="ld-kpi ld-kpi--bad"><b>${urgent}</b><span>Urgent, flagged to the top</span></div>`);
    $('[data-ld-kpis]').innerHTML = tiles.join('');
    const byHand = n * (Number(c.manual_minutes) || 6);
    const save = demo.items.reduce((a, it, i) => a + (i < ran ? saved(it) : 0), 0);
    const perItem = demo.items.reduce((a, it) => a + saved(it), 0) / n;
    const perDay = (perItem * (Number(c.per_day) || 40)) / 60, perMonth = perDay * 21;
    const r1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
    $('[data-ld-time]').innerHTML = ran < n
      ? `<p>${ran ? `${ran} of ${n} done…` : `By hand, these ${n} ${esc(K.nouns)} take about <b>${Math.round(byHand)} minutes</b>.`}</p>`
      : `<div class="ld-save"><div><b>${Math.round(save)} min</b><span>saved on these ${n}, of about ${Math.round(byHand)} by hand</span></div>
         <div><b>~${r1(perDay)} h</b><span>back every day at ${esc(c.per_day)} ${esc(K.nouns)} a day</span></div>
         <div><b>~${r1(perMonth)} h</b><span>a month (21 working days)</span></div></div>
         <p class="tiny muted">Counted honestly: a drafted reply still takes a minute to check, quick sorting counts ${esc(c.light_minutes)} min, and anything a person still handles counts nothing.${K.auto ? ` Switch auto mode ${autoMode ? 'off' : 'on'} to compare.` : ''}</p>`;
  }

  $('[data-ld-run]').addEventListener('click', async () => {
    if (running) return;
    running = true; ran = 0; rows();
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
    e.target.textContent = urgentFirst ? 'Show in arrival order' : 'Show urgent first';
    rows(urgentFirst ? demo.items.map((_, i) => i).sort((a, b) => rank[demo.items[a].priority] - rank[demo.items[b].priority] || a - b) : null);
  });
})();
