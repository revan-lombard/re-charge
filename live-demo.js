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
      auto: 'Post clean invoices automatically', autoShort: 'Auto-post', autoNote: 'Invoices that match their order are posted by themselves. Mismatches, duplicates and approvals still wait for a person.', inbox: 'Accounts inbox: documents',
      actions: { capture: ['Captured as draft bill', 'Posted', 'ok', 'full'], flag: ['Mismatch flagged', null, 'warn', 'full'], human: [(r) => `Needs approval: ${r}`, null, 'warn', 'none'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'] },
      counts: [['capture', 'Captured', 'Posted', 'captured', 'posted'], ['flag', 'Caught (mismatch or duplicate)', null, 'caught'], ['human', 'Need approval', null, 'need approval'], ['file', 'Filed', null, 'filed']] },
    enquiries: { problem: 'Every enquiry answered in minutes, day or night', noun: 'enquiry', nouns: 'enquiries', h1: (b) => `${b}: every enquiry answered`, lead: 'Eight messages from WhatsApp, the website and Facebook. Press Run AI and watch it answer, book, and pass the good leads to the right person.',
      auto: 'Reply to customers automatically', autoShort: 'Auto-reply', autoNote: 'Routine answers and booking replies go out by themselves, day and night. Leads and anything unusual still go to a person.', inbox: 'Chats',
      actions: { answer: ['Answer drafted', 'Answered', 'ok', 'full'], book: ['Booking reply drafted', 'Booking offered', 'ok', 'full'], qualify: [(r) => `Lead passed to ${r}`, null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['answer', 'Answers drafted', 'Answered', 'answers', 'answered'], ['book', 'Bookings drafted', 'Bookings offered', 'bookings', 'booked'], ['qualify', 'Leads passed on', null, 'leads passed on'], ['human', 'Need a person', null, 'need a person']] },
    reviews: { problem: 'Every review answered, complaints caught early', noun: 'review', nouns: 'reviews', h1: (b) => `${b}: every review answered`, lead: 'A week of Google reviews and feedback. Press Run AI and watch it reply, flag the ones the manager must see, and spot what keeps coming up.',
      auto: 'Post thank-you replies automatically', autoShort: 'Auto-post thanks', autoNote: 'Thank-yous to happy reviews are posted by themselves. Complaints and mixed reviews still wait for a person.', inbox: 'Reviews',
      actions: { reply: ['Reply drafted', 'Reply posted', 'ok', 'full'], thank: ['Thank-you drafted', 'Thank-you posted', 'ok', 'full'], alert: [(r) => `Flagged to ${r}`, null, 'warn', 'none'], theme: ['Theme noted', null, 'info', 'light'] },
      counts: [['reply', 'Replies drafted', 'Replies posted', 'replies', 'posted'], ['thank', 'Thank-yous drafted', 'Thank-yous posted', 'thank-yous', 'posted'], ['alert', 'Flagged to the manager', null, 'flagged'], ['theme', 'Themes spotted', null, 'themes']] },
    questions: { problem: 'Staff questions answered from your own documents', noun: 'question', nouns: 'questions', h1: (b) => `${b}: answers from your own documents`, lead: 'Questions your team asks in a normal week. Press Run AI and watch it answer from your own policies, show where it found it, and say honestly when it doesn\'t know.',
      auto: '', autoNote: '', inbox: '# ask-the-office',
      actions: { answer: ['Answered, with source', 'Answered, with source', 'ok', 'full'], human: [(r) => `Not in the documents: ask ${r}`, null, 'warn', 'none'] },
      counts: [['answer', 'Answered', null, 'answered'], ['human', 'Sent to a person', null, 'to a person']] },
    calls: { problem: 'Every call answered, even at 11pm', noun: 'call', nouns: 'calls', per: 'calls a day', h1: (b) => `${b}: every call answered`, lead: 'Calls from a normal day and evening: the ones nobody could pick up. Press Run AI and watch it answer each one, book the job, take the message or wake the on-call person.',
      auto: 'Send booking confirmations automatically', autoShort: 'Auto-SMS', autoNote: 'Booked callers get their confirmation SMS straight away. Emergencies, unhappy callers and big leads still go to a person.', inbox: 'Calls the AI answered',
      actions: { book: ['Booked, SMS ready', 'Booked + SMS sent', 'ok', 'full'], job: [(r) => `Emergency: ${r} called out`, null, 'bad', 'full'], answer: ['Answered on the call', 'Answered on the call', 'ok', 'full'], message: [(r) => `Message for ${r}`, null, 'info', 'full'], human: [(r) => `Call back: ${r}`, null, 'warn', 'none'] },
      counts: [['book', 'Jobs booked', 'Booked + confirmed', 'booked', 'confirmed'], ['job', 'Emergencies handled', null, 'emergencies'], ['answer', 'Questions answered', null, 'answered'], ['message', 'Messages taken', null, 'messages'], ['human', 'Need a call back', null, 'call backs']] },
    meetings: { problem: 'Meeting notes and to-dos, before the meeting ends', noun: 'moment', nouns: 'moments', per: 'meetings a day', batch: true, h1: (b) => `${b}: notes and to-dos, done`, lead: 'Ten moments from one team meeting. Press Run AI and watch it pick out the decisions, who does what by when, the risks, and the email that has to go out afterwards.',
      auto: 'Send follow-up emails automatically', autoShort: 'Auto-send', autoNote: 'Routine follow-ups go out the moment the meeting ends. Anything sensitive waits for a person.', inbox: 'Meeting transcript',
      actions: { decision: ['Decision', null, 'ok', 'full'], action: [(r) => `To-do: ${r}`, null, 'info', 'full'], risk: ['Risk flagged', null, 'warn', 'full'], followup: [(r) => `Email to ${r} drafted`, 'Follow-up sent', 'ok', 'full'], note: ['In the notes', null, 'muted', 'light'] },
      counts: [['decision', 'Decisions', null, 'decisions'], ['action', 'To-dos with an owner', null, 'to-dos'], ['risk', 'Risks flagged', null, 'risks'], ['followup', 'Follow-ups drafted', 'Follow-ups sent', 'follow-ups', 'sent'], ['note', 'Notes written', null, 'notes']] },
  };
  const PRI = { urgent: ['Urgent', 'bad'], today: ['Today', 'amber'], routine: ['Routine', 'muted'] };

  let demo = null, K = null, isSample = false, autoMode = false, ran = 0, running = false, gen = 0;

  // The demo fills exactly the screen below the header (which floats a little lower on desktop).
  const fit = () => { const m = $('.ld-main'); if (m) document.documentElement.style.setProperty('--ld-top', Math.max(0, Math.round(m.getBoundingClientRect().top + scrollY)) + 'px'); };
  fit(); addEventListener('resize', fit);
  const root = $('[data-ld]');
  const fail = (m) => { $('[data-ld-error]').textContent = m; $('[data-ld-error]').hidden = false; $('[data-ld-loading]').hidden = true; };

  async function load() {
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
      root.dataset.sample = '1';
      // Every example in one row: tap to switch in place, nothing reloads.
      const tabs = $('[data-ld-kinds]');
      const NAMES = { email: 'Email', invoices: 'Invoices', enquiries: 'Enquiries', reviews: 'Reviews', questions: 'Staff questions', calls: 'Phone calls', meetings: 'Meetings' };
      const mark = () => tabs.querySelectorAll('button').forEach((x) => { const on = x.dataset.k === demo.kind; x.setAttribute('aria-pressed', String(on)); if (on) try { x.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } });
      tabs.innerHTML = Object.keys(KIND).filter((k) => S[k]).map((k) => `<button type="button" class="ld-tab" data-k="${k}" aria-pressed="false"><span class="ld-tab__ic">${ICON[k] || ''}</span>${esc(NAMES[k] || k)}</button>`).join('');
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]'); const next = b && S[b.dataset.k]; if (!next || next === demo) return;
        gen++; running = false; demo = next; K = KIND[demo.kind] || KIND.email; ran = 0; autoMode = false;
        $('[data-ld-auto-input]').checked = false;
        const sort = $('[data-ld-sort]'); sort.hidden = true; sort.setAttribute('aria-pressed', 'false'); sort.textContent = 'Urgent first';
        const btn = $('[data-ld-run]'); btn.disabled = false; btn.textContent = 'Run AI';
        closeDetail(); render(); mark();
        try { history.replaceState(null, '', '?sample=' + demo.kind); } catch (ex) { /* ignore */ }
        track('live-demo-view', { kind: demo.kind, sample: true });
      });
      setTimeout(mark, 0);
    }
    K = KIND[demo.kind] || KIND.email;
    render();
    track('live-demo-view', { kind: demo.kind, sample: !d });
  }

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
    $('[data-ld-basis]').textContent = `About ${demo.config.per_day} ${K.per || 'a day'} · tap any to see it`;
    const sw = $('[data-ld-auto]');
    sw.hidden = !K.auto;
    if (K.auto) { $('[data-ld-auto-label]').textContent = innerWidth <= 860 ? K.autoShort : K.auto; sw.title = K.autoNote; $('[data-ld-auto-note]').textContent = K.autoNote; }
    root.dataset.kind = demo.kind;
    $('[data-ld-icon]').innerHTML = ICON[demo.kind] || ICON.email;
    $('[data-ld-rail]').hidden = !skin().rail;
    $('[data-ld-inbox]').textContent = `${K.inbox} · ${demo.items.length}`;
    root.hidden = false;
    rows();
  }

  // ---------- Each kind looks like the place that work really happens ----------
  // email: a mail app with folders · invoices: paper documents and a ledger · enquiries: a chat app
  // reviews: review cards with stars · questions: a team chat with sources.
  const initials = (n) => String(n || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
  const hue = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const field = (it, re) => ((it.fields || []).find((f) => re.test(f.label)) || {}).value || '';
  const rating = (it) => { const n = parseInt(field(it, /rating|stars?/i), 10); if (n >= 1 && n <= 5) return n; const m = String(it.title + ' ' + it.body).match(/★+/); return m ? Math.min(5, m[0].length) : 0; };
  const stars = (n) => n ? `<span class="ld-stars" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '<span class="ld-stars ld-stars--none">No rating</span>';
  const clean = (t) => String(t || '').replace(/^[★☆\s]+/, '').replace(/\s+/g, ' ').trim();
  const cut = (t, n) => { t = clean(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const ava = (name, sq) => `<span class="ld-ava${sq ? ' ld-ava--sq' : ''}" style="--h:${hue(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
  const CH = { whatsapp: ['WhatsApp', 'wa'], website: ['Website', 'web'], facebook: ['Facebook', 'fb'], instagram: ['Instagram', 'ig'], email: ['Email', 'web'] };
  const channel = (d) => { const k = Object.keys(CH).find((x) => String(d).toLowerCase().includes(x)); const c = k ? CH[k] : [d || 'Message', 'web']; return `<span class="ld-ch ld-ch--${c[1]}">${esc(c[0])}</span>`; };
  const badges = (it, doneRow) => { if (!doneRow) return ''; const a = actionOf(it), p = PRI[it.priority] || PRI.routine; return `<span class="ld-pri ld-pri--${p[1]}">${p[0]}</span><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span>`; };
  const gapNote = (t) => /\[[^\]]+\]/.test(t || '') ? '<p class="tiny muted">Highlighted parts aren\'t in your information yet, so a person fills them in.</p>' : '';
  const why = (it) => it.reason ? `<p class="ld-why">${esc(it.reason)}</p>` : '';
  const pending = '<p class="muted small ld-wait">Press Run AI to see what it does with this one.</p>';
  const ICON = {
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    invoices: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8"/></svg>',
    enquiries: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 10h8" stroke="currentColor" stroke-width="1.8"/></svg>',
    reviews: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    questions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v12h-6l-4 4v-4H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 8.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9V12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    calls: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h3l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L21 14.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    meetings: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 10 6-3v10l-6-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  };

  const SKIN = {
    email: {
      row: (it, i, d) => `<span class="ld-dot${d ? '' : ' is-unread'}" aria-label="${d ? 'Read' : 'Unread'}"></span>
        <span class="ld-row__from"><b>${esc(it.from_name)}</b></span>
        <span class="ld-row__title"><b>${esc(it.title)}</b><small> – ${esc(cut(it.body, 90))}</small></span>
        <span class="ld-row__time">${esc(it.received)}</span>
        <span class="ld-row__ai">${badges(it, d)}</span>`,
      detail: (it, d, a) => `
        <div class="ld-mail">
          <h3 class="ld-mail__subj">${esc(it.title)}</h3>
          <p class="ld-mail__from">${ava(it.from_name)}<span><b>${esc(it.from_name)}</b> <span class="muted">&lt;${esc(it.from_detail)}&gt;</span><br><span class="muted small">to you · ${esc(it.received)}</span></span></p>
          <pre class="ld-body">${esc(it.body)}</pre>
        </div>
        <div class="ld-col">${!d ? pending : it.action === 'draft' ? `
          <div class="ld-compose"><div class="ld-compose__bar">${a.done ? 'Sent automatically' : 'Draft reply, ready to send'}</div>
            <p class="ld-compose__to"><span class="muted">To</span> ${esc(it.from_detail)}<br><span class="muted">Subject</span> Re: ${esc(it.title)}</p>
            <div class="ld-out">${marked(it.output)}</div></div>${gapNote(it.output)}${why(it)}`
          : it.action === 'summarise' ? `<div class="ld-sumcard"><h4>Thread in short</h4><div class="ld-out">${marked(it.output)}</div></div>${why(it)}`
          : it.action === 'forward' ? `<div class="ld-move"><span class="ld-move__ic">↪</span><div><b>Forwarded to ${esc(it.route)}</b>${why(it)}${it.output ? `<div class="ld-out">${marked(it.output)}</div>` : ''}</div></div>`
          : it.action === 'file' ? `<div class="ld-move"><span class="ld-move__ic">🗀</span><div><b>Moved to ${esc(it.route)}</b>${why(it)}</div></div>`
          : `<div class="ld-flag"><b>Needs a person${it.route ? `: ${esc(it.route)}` : ''}</b>${why(it)}${it.output ? `<p class="small muted">Suggested holding reply:</p><div class="ld-out">${marked(it.output)}</div>` : ''}</div>`}</div>`,
      // Folders down the side fill up as it works.
      rail: () => {
        const done = demo.items.slice(0, ran), cnt = (f) => done.filter(f).length;
        const folders = [...new Set(done.filter((x) => x.action === 'file').map((x) => x.route || 'Filed'))];
        const row = (ic, label, n, cls = '') => `<li class="${cls}${n ? ' has' : ''}"><span aria-hidden="true">${ic}</span>${esc(label)}${n ? `<b>${n}</b>` : ''}</li>`;
        return `<ul>${row('📥', 'Inbox', demo.items.length - ran, 'is-on')}${row('✎', 'Drafts', cnt((x) => x.action === 'draft' && !actionOf(x).done))}${row('➤', 'Sent', cnt((x) => actionOf(x).done))}${row('↪', 'Forwarded', cnt((x) => x.action === 'forward'))}${row('≡', 'Summaries', cnt((x) => x.action === 'summarise'))}${row('⚑', 'Needs you', cnt((x) => x.action === 'human'), 'is-flag')}</ul>
          <p class="ld-rail__h">Folders</p><ul>${(folders.length ? folders : ['Invoices', 'Newsletters']).map((f) => row('🗀', f, cnt((x) => x.action === 'file' && (x.route || 'Filed') === f))).join('')}</ul>`;
      },
    },
    invoices: {
      row: (it, i, d) => `<span class="ld-doc" aria-hidden="true">PDF</span>
        <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.title)}</small></span>
        <span class="ld-row__time">${esc(it.received)}</span>
        <span class="ld-amt">${esc(field(it, /total|amount|balance/i) || '–')}</span>
        <span class="ld-row__ai">${d ? `${(PRI[it.priority] || PRI.routine)[0] === 'Urgent' ? '<span class="ld-pri ld-pri--bad">Urgent</span>' : ''}<span class="ld-act ld-stamp ld-act--${actionOf(it).tone}" title="${esc(actionOf(it).label)}">${esc(stampOf(it))}</span>` : '<span class="ld-new">Not captured</span>'}</span>`,
      detail: (it, d, a) => `
        <div class="ld-paper" aria-label="The document">
          <div class="ld-paper__head"><b>${esc(it.from_name)}</b><span>${/statement/i.test(it.title) ? 'STATEMENT' : 'TAX INVOICE'}</span></div>
          <p class="ld-paper__meta">${esc(it.title)} · received ${esc(it.received)}<br>${esc(it.from_detail)}</p>
          <pre class="ld-paper__body">${esc(it.body)}</pre>
          ${d ? `<span class="ld-bigstamp ld-bigstamp--${a.tone}">${esc(a.label)}</span>` : ''}
        </div>
        <div class="ld-col">${!d ? pending : `<h4>Captured</h4>
          ${(it.fields || []).length ? `<table class="ld-fields ld-fields--ticks">${it.fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${marked(f.value)}</td></tr>`).join('')}</table>` : ''}
          ${why(it)}${it.output ? `<div class="ld-out">${marked(it.output)}</div>` : ''}`}</div>`,
    },
    enquiries: {
      row: (it, i, d) => { const a = d ? actionOf(it) : null; return `${ava(it.from_name)}
        <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${channel(it.from_detail)}</small></span>
        <span class="ld-row__title"><small>${d && it.output ? (it.action === 'qualify' ? `→ Passed to ${esc(it.route)}` : `${a.done ? '<span class="ld-ticks">✓✓</span> You: ' : '✎ Draft: '}${esc(cut(it.output, 80))}`) : esc(cut(it.body, 90))}</small></span>
        <span class="ld-row__time">${esc(it.received)}</span>
        <span class="ld-row__ai">${d ? badges(it, d) : '<span class="ld-unread" aria-label="Unread">1</span>'}</span>`; },
      detail: (it, d, a) => `
        <div class="ld-chat">
          <div class="ld-chat__head">${ava(it.from_name)}<span><b>${esc(it.from_name)}</b><br>${channel(it.from_detail)}</span></div>
          <div class="ld-chat__log">
            <div class="ld-bub ld-bub--in">${esc(it.body)}<time>${esc(it.received)}</time></div>
            ${!d ? pending : it.action === 'qualify' ? `<div class="ld-handover"><b>Lead passed to ${esc(it.route)}</b>${(it.fields || []).length ? `<table class="ld-fields">${it.fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(f.value)}</td></tr>`).join('')}</table>` : ''}${it.output ? `<div class="ld-out">${marked(it.output)}</div>` : ''}</div>`
              : `<div class="ld-bub ld-bub--out${a.done ? '' : ' is-draft'}">${marked(it.output)}<time>${a.done ? 'Sent automatically <span class="ld-ticks">✓✓</span>' : 'Draft · ready to send'}</time></div>${gapNote(it.output)}`}
          </div>
        </div>
        <div class="ld-col">${d ? `<h4>What the AI did</h4><p><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span></p>${why(it)}${it.action === 'human' && it.route ? `<p class="small">${esc(it.route)} has been asked to take it from here.</p>` : ''}` : ''}</div>`,
    },
    reviews: {
      row: (it, i, d) => `${ava(it.from_name)}
        <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail || 'Google')}</small></span>
        <span class="ld-row__stars">${stars(rating(it))}</span>
        <span class="ld-row__title"><small>${esc(cut(it.body, 110))}</small></span>
        <span class="ld-row__ai">${d ? badges(it, d) : '<span class="ld-new">No reply yet</span>'}</span>`,
      detail: (it, d, a) => { const theme = field(it, /theme/i); return `
        <div class="ld-review">
          <div class="ld-review__who">${ava(it.from_name)}<span><b>${esc(it.from_name)}</b><br><span class="muted small">${esc(it.from_detail || 'Google')} · ${esc(it.received)}</span></span></div>
          <p>${stars(rating(it))}</p>
          <p class="ld-review__text">${esc(clean(it.body))}</p>
          ${d && it.action === 'alert' ? `<div class="ld-flag"><b>Flagged to ${esc(it.route)} before anyone replies</b></div>` : ''}
          ${d && it.output && it.action !== 'theme' ? `<div class="ld-owner"><b>Response from the owner</b> <span class="muted small">${a.done ? '· posted automatically' : it.action === 'alert' ? '· suggested, for approval' : '· draft, ready to post'}</span><div class="ld-out">${marked(it.output)}</div></div>` : ''}
        </div>
        <div class="ld-col">${!d ? pending : `<h4>What the AI did</h4><p><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span></p>${theme ? `<p class="small">Theme: <b>${esc(theme)}</b>${themeCount(theme) > 1 ? ` · mentioned ${themeCount(theme)} times this week` : ''}</p>` : ''}${why(it)}${it.action === 'theme' && it.output ? `<div class="ld-out">${marked(it.output)}</div>` : ''}`}</div>`; },
    },
    questions: {
      row: (it, i, d) => { const a = d ? actionOf(it) : null; return `${ava(it.from_name, true)}
        <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
        <span class="ld-row__title"><b>${esc(it.title)}</b>${d ? `<small>${it.action === 'answer' ? `📄 ${esc(it.route || 'Your documents')}` : `Not in the documents → ${esc(it.route || 'a person')}`}</small>` : ''}</span>
        <span class="ld-row__time">${esc(it.received)}</span>
        <span class="ld-row__ai">${d ? badges(it, d) : '<span class="ld-new">Waiting</span>'}</span>`; },
      detail: (it, d, a) => `
        <div class="ld-thread">
          <div class="ld-msg">${ava(it.from_name, true)}<div><p><b>${esc(it.from_name)}</b> <span class="muted small">${esc(it.from_detail)} · ${esc(it.received)}</span></p><p>${esc(clean(it.body))}</p></div></div>
          ${!d ? pending : `<div class="ld-msg ld-msg--bot"><span class="ld-ava ld-ava--sq ld-ava--bot" aria-hidden="true">AI</span><div><p><b>Office assistant</b> <span class="ld-apptag">APP</span></p>
            <div class="ld-out">${marked(it.output)}</div>
            ${it.action === 'answer' ? `<p class="ld-srccard">📄 <b>${esc(it.route || 'Your documents')}</b><span>The answer above comes from here, word for word where it matters.</span></p>` : `<p class="ld-srccard ld-srccard--no">⚑ <b>Not in the documents</b><span>Passed to ${esc(it.route || 'a person')} instead of guessing.</span></p>`}</div></div>`}
        </div>
        <div class="ld-col">${d ? `<h4>What the AI did</h4>${why(it)}` : ''}</div>`,
    },
  };
  // A rubber stamp says it in a word or two; the full wording is in the detail view.
  const stampOf = (it) => { const a = actionOf(it); return ({ capture: a.done ? 'Posted' : 'Captured', flag: /duplicate/i.test(it.reason + it.title) ? 'Duplicate' : 'Mismatch', human: 'Needs approval', file: 'Filed' })[it.action] || a.label; };
  // Calls: a phone's call log, and each call as its transcript beside the job card.
  SKIN.calls = {
    row: (it, i, d) => `<span class="ld-callic${it.priority === 'urgent' ? ' is-hot' : ''}" aria-hidden="true">${d ? '✆' : '↙'}</span>
      <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
      <span class="ld-row__title"><small>${esc(it.title)}</small></span>
      <span class="ld-row__time">${esc(it.received)}</span>
      <span class="ld-row__ai">${d ? badges(it, d) : '<span class="ld-new">Missed</span>'}</span>`,
    detail: (it, d, a) => `
      <div class="ld-phone">
        <div class="ld-phone__top"><span class="ld-phone__ring" aria-hidden="true">✆</span><b>${esc(it.from_name)}</b><span>${esc(it.from_detail)} · ${esc(it.received)}</span></div>
        <ol class="ld-phone__log">${String(it.body).split(/\n+/).filter(Boolean).map((l) => { const m = l.match(/^(Caller|AI)\s*:\s*(.*)$/i); return m ? `<li class="${/ai/i.test(m[1]) ? 'is-ai' : 'is-caller'}"><b>${/ai/i.test(m[1]) ? 'AI' : 'Caller'}</b>${esc(m[2])}</li>` : `<li class="is-caller">${esc(l)}</li>`; }).join('')}</ol>
      </div>
      <div class="ld-col">${!d ? pending : `<div class="ld-jobcard"><h4>Job card</h4>
        ${(it.fields || []).length ? `<table class="ld-fields">${it.fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${marked(f.value)}</td></tr>`).join('')}</table>` : ''}</div>
        <p><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span></p>${why(it)}
        ${it.output ? `<div class="ld-sms"><span>${it.action === 'book' ? (a.done ? 'SMS sent to the caller' : 'SMS ready for the caller') : it.action === 'answer' ? 'Note of the call' : it.action === 'job' ? 'SMS to the on-call person' : 'Message passed on'}</span>${marked(it.output)}</div>${gapNote(it.output)}` : ''}`}</div>`,
  };
  // Meetings: the transcript on the left, the notes document filling in on the right.
  SKIN.meetings = {
    row: (it, i, d) => `<span class="ld-row__time">${esc(it.received)}</span>
      <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
      <span class="ld-row__title"><small>“${esc(cut(it.body, 110))}”</small></span>
      <span class="ld-row__ai">${d ? badges(it, d) : ''}</span>`,
    detail: (it, d, a) => `
      <div class="ld-said"><p class="ld-said__who"><span class="ld-rec" aria-hidden="true"></span><b>${esc(it.from_name)}</b> <span class="muted small">${esc(it.from_detail)} · ${esc(it.received)}</span></p>
        <blockquote>${esc(it.body)}</blockquote></div>
      <div class="ld-col">${!d ? pending : `<div class="ld-notes"><h4>${esc({ decision: 'Decision', action: 'Who does what', risk: 'Watch out for', followup: 'Follow-up email', note: 'Summary' }[it.action] || 'Notes')}</h4>
        ${it.action === 'followup' ? `<p class="small">To: ${esc(it.route)} · ${a.done ? 'sent when the meeting ended' : 'drafted, ready to send'}</p><div class="ld-out">${marked(it.output)}</div>` : `<p class="ld-notes__line">${it.action === 'action' ? `<b>${esc(it.route)}</b> ` : ''}${marked(it.output)}${field(it, /due/i) ? ` <em>${esc(field(it, /due/i))}</em>` : ''}</p>`}</div>${why(it)}`}</div>`,
    // The notes so far, under the transcript header.
  };
  const themeCount = (t) => demo.items.slice(0, ran).filter((x) => field(x, /theme/i) === t).length;
  const skin = () => SKIN[demo.kind] || SKIN.email;

  function rows(order) {
    const list = order || demo.items.map((_, i) => i);
    $('[data-ld-rows]').innerHTML = list.map((i) => {
      const it = demo.items[i], doneRow = i < ran;
      return `<li class="ld-row${doneRow ? ' is-done' : ''}" data-i="${i}"><button type="button" class="ld-row__head" aria-haspopup="dialog">${skin().row(it, i, doneRow)}</button></li>`;
    }).join('');
    document.querySelectorAll('.ld-row__head').forEach((b) => b.addEventListener('click', () => detail(Number(b.parentElement.dataset.i), b)));
    const rail = $('[data-ld-rail]'); if (rail && skin().rail) rail.innerHTML = skin().rail();
    if (demo.kind === 'reviews') {
      const t = {}; demo.items.slice(0, ran).forEach((x) => { const th = field(x, /theme/i); if (th) t[th] = (t[th] || 0) + 1; });
      const top = Object.entries(t).filter(([, n]) => n > 1).sort((x, y) => y[1] - x[1])[0];
      $('[data-ld-basis]').textContent = top ? `Coming up again: ${top[0]} (×${top[1]})` : `About ${demo.config.per_day} ${K.per || 'a day'} · tap any to see it`;
    }
    kpis();
  }

  // One item in full, over the list (so the page itself never has to scroll).
  let opener = null;
  function detail(i, from) {
    const it = demo.items[i], doneRow = i < ran, a = doneRow ? actionOf(it) : null;
    opener = from || null;
    $('[data-ld-pos]').textContent = `${i + 1} of ${demo.items.length}`;
    $('[data-ld-detail-body]').innerHTML = skin().detail(it, doneRow, a);
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
    // A meeting is one batch: the per-day number counts meetings, not moments.
    const perDay = ((K.batch ? perItem * n : perItem) * (Number(c.per_day) || 40)) / 60, perMonth = perDay * 21;
    const r1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
    $('[data-ld-time]').innerHTML = ran < n
      ? `<p>${ran ? `${ran} of ${n} done…` : `${K.batch ? 'Writing up this meeting by hand takes' : `By hand, these ${n} ${esc(K.nouns)} take`} about <b>${Math.round(byHand)} minutes</b>. Press Run AI.`}</p>`
      : `<div class="ld-save"><div><b>${Math.round(save)} min</b><span>saved on these ${n} (of ${Math.round(byHand)})</span></div>
         <div><b>~${r1(perDay)} h</b><span>a day at ${esc(c.per_day)} ${esc(K.per || 'a day')}</span></div>
         <div><b>~${r1(perMonth)} h</b><span>a month</span></div></div>
         <p class="ld-note">Counted honestly: a drafted reply still takes a minute to check, quick sorting counts ${esc(c.light_minutes)} min, and anything a person handles counts nothing.${K.auto ? ` Switch auto ${autoMode ? 'off' : 'on'} to compare.` : ''}</p>`;
  }

  $('[data-ld-run]').addEventListener('click', async () => {
    if (running) return;
    running = true; ran = 0; closeDetail(); rows();
    const my = ++gen;
    const btn = $('[data-ld-run]'); btn.disabled = true; btn.textContent = 'Running…';
    track('live-demo-run', { kind: demo.kind, auto: autoMode });
    for (let i = 0; i < demo.items.length; i++) {
      const li = document.querySelector(`.ld-row[data-i="${i}"]`);
      if (li) { li.classList.add('is-reading'); li.querySelector('.ld-row__ai').innerHTML = '<span class="ld-reading">Reading…</span>'; }
      await wait(420);
      if (my !== gen) return;   // switched to another example mid-run
      ran = i + 1; rows();
      const now = document.querySelector(`.ld-row[data-i="${i}"]`); if (now) { now.classList.add('is-flash'); }
      await wait(180);
    }
    if (my !== gen) return;
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
  load();
})();
