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
    email: { problem: 'An inbox sorted and drafted for you', noun: 'email', nouns: 'emails', h1: (b) => `${b}: your inbox, sorted and drafted`, lead: 'Ten emails from a normal morning. Press Run AI and watch it read each one, decide what it needs, and get it sorted or ready for a person.',
      next: ['Inbox Assistant', 'inbox-assistant'],
      auto: 'Let simple replies send (custom builds only)', autoShort: 'Auto-send (custom)', autoNote: 'Optional in a custom build, and off by default. The Inbox Assistant only ever drafts: a person sends. Anything with a gap, a payment or a complaint always waits for a person.', inbox: 'Inbox',
      actions: { draft: ['Reply drafted', 'Reply sent', 'ok', 'full'], forward: [(r) => `Forwarded to ${r}`, null, 'info', 'light'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'], summarise: ['Thread summarised', null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['draft', 'Replies drafted', 'Replies sent', 'drafted', 'sent'], ['forward', 'Forwarded', null, 'forwarded'], ['file', 'Filed', null, 'filed'], ['summarise', 'Long threads summarised', null, 'summarised'], ['human', 'Need a person', null, 'need a person']] },
    invoices: { problem: 'Supplier invoices captured, no retyping', noun: 'document', nouns: 'documents', h1: (b) => `${b}: supplier invoices, captured`, lead: 'Eight documents from this morning\'s email. Press Run AI and watch it read each one, capture it, and catch what doesn\'t match.',
      auto: 'Post clean invoices automatically', autoShort: 'Auto-post', autoNote: 'Invoices that match their order are posted by themselves. Mismatches, duplicates and approvals still wait for a person.', inbox: 'Accounts inbox: documents',
      actions: { capture: ['Captured as draft bill', 'Posted', 'ok', 'full'], flag: ['Mismatch flagged', null, 'warn', 'full'], human: [(r) => `Needs approval: ${r}`, null, 'warn', 'none'], file: [(r) => `Filed in ${r}`, null, 'muted', 'light'] },
      counts: [['capture', 'Captured', 'Posted', 'captured', 'posted'], ['flag', 'Caught (mismatch or duplicate)', null, 'caught'], ['human', 'Need approval', null, 'need approval'], ['file', 'Filed', null, 'filed']] },
    enquiries: { problem: 'Every enquiry answered quickly, day or night', noun: 'enquiry', nouns: 'enquiries', h1: (b) => `${b}: every enquiry answered`, lead: 'Eight messages from WhatsApp, the website and Facebook. Press Run AI and watch it answer, book, and pass the good leads to the right person.',
      next: ['For salons', 'for-salons'],
      auto: 'Reply to customers automatically', autoShort: 'Auto-reply', autoNote: 'Optional: routine answers and booking replies can go out by themselves, day and night. Leads and anything unusual still go to a person.', inbox: 'Chats',
      actions: { answer: ['Answer drafted', 'Answered', 'ok', 'full'], book: ['Booking reply drafted', 'Booking offered', 'ok', 'full'], qualify: [(r) => `Lead passed to ${r}`, null, 'info', 'full'], human: ['Needs a person', null, 'warn', 'none'] },
      counts: [['answer', 'Answers drafted', 'Answered', 'answers', 'answered'], ['book', 'Bookings drafted', 'Bookings offered', 'bookings', 'booked'], ['qualify', 'Leads passed on', null, 'leads passed on'], ['human', 'Need a person', null, 'need a person']] },
    reviews: { problem: 'Every review answered, complaints caught early', noun: 'review', nouns: 'reviews', h1: (b) => `${b}: every review answered`, lead: 'A week of Google reviews and feedback. Press Run AI and watch it reply, flag the ones the manager must see, and spot what keeps coming up.',
      next: ['For restaurants', 'for-restaurants'],
      auto: 'Post thank-you replies automatically', autoShort: 'Auto-post thanks', autoNote: 'Thank-yous to happy reviews are posted by themselves. Complaints and mixed reviews still wait for a person.', inbox: 'Reviews',
      actions: { reply: ['Reply drafted', 'Reply posted', 'ok', 'full'], thank: ['Thank-you drafted', 'Thank-you posted', 'ok', 'full'], alert: [(r) => `Flagged to ${r}`, null, 'warn', 'none'], theme: ['Theme noted', null, 'info', 'light'] },
      counts: [['reply', 'Replies drafted', 'Replies posted', 'replies', 'posted'], ['thank', 'Thank-yous drafted', 'Thank-yous posted', 'thank-yous', 'posted'], ['alert', 'Flagged to the manager', null, 'flagged'], ['theme', 'Themes spotted', null, 'themes']] },
    questions: { problem: 'Staff questions answered from your own documents', noun: 'question', nouns: 'questions', h1: (b) => `${b}: answers from your own documents`, lead: 'Questions your team asks in a normal week. Press Run AI and watch it answer from your own policies, show where it found it, and say honestly when it doesn\'t know.',
      auto: '', autoNote: '', inbox: '# ask-the-office',
      actions: { answer: ['Answered, with source', 'Answered, with source', 'ok', 'full'], human: [(r) => `Not in the documents: ask ${r}`, null, 'warn', 'none'] },
      counts: [['answer', 'Answered', null, 'answered'], ['human', 'Sent to a person', null, 'to a person']] },
    calls: { problem: 'No missed call left hanging', noun: 'call', nouns: 'missed calls', per: 'calls a day', h1: (b) => `${b}: no missed call left hanging`, lead: 'Calls nobody could pick up on a normal day and evening, each left as a voicemail. Press Run AI and watch it write each one up as a job card, offer a slot by WhatsApp, pass on the message or alert the on-call plumber.',
      next: ['For plumbers', 'for-plumbers'],
      auto: 'Send booking WhatsApps automatically', autoShort: 'Auto-send', autoNote: 'Optional: booked callers get their WhatsApp straight away. Emergencies, unhappy callers and big leads still go to a person.', inbox: 'Missed calls', inboxDone: 'Missed calls, followed up',
      actions: { book: ['Slot offered by WhatsApp', 'Booked + WhatsApp sent', 'ok', 'full'], job: [(r) => `Emergency: ${r} alerted`, null, 'bad', 'full'], answer: ['WhatsApp reply ready', 'Answered by WhatsApp', 'ok', 'full'], message: [(r) => `Message for ${r}`, null, 'info', 'full'], human: [(r) => `Call back: ${r}`, null, 'warn', 'none'] },
      counts: [['book', 'Slots offered', 'Booked + confirmed', 'offered', 'confirmed'], ['job', 'Emergencies passed on', null, 'emergencies'], ['answer', 'Questions answered', null, 'answered'], ['message', 'Messages taken', null, 'messages'], ['human', 'Need a call back', null, 'call backs']] },
    followups: { problem: 'No quote left to go quiet', noun: 'quote', nouns: 'open quotes', per: 'follow-ups a day', h1: (b) => `${b}: every quote followed up`, lead: 'Eight open quotes, some going quiet. Press Run AI and watch it read each one, spot the buying signals and write the follow-up before the deal goes cold.',
      auto: 'Send routine follow-ups automatically', autoShort: 'Auto-send', autoNote: 'Routine follow-ups go out by themselves. Big deals and anything sensitive still go to a person.', inbox: 'Open quotes',
      actions: { followup: ['Follow-up drafted', 'Follow-up sent', 'ok', 'full'], hot: ['Ready to buy: call today', null, 'bad', 'full'], wait: ['Too soon: wait', null, 'muted', 'light'], close: ['Closing note drafted', 'Closing note sent', 'muted', 'full'], human: [(r) => `For ${r}`, null, 'warn', 'none'] },
      counts: [['followup', 'Follow-ups drafted', 'Follow-ups sent', 'drafted', 'sent'], ['hot', 'Ready to buy', null, 'hot'], ['wait', 'Too soon to chase', null, 'waiting'], ['close', 'Closed kindly', null, 'closed'], ['human', 'For the owner', null, 'for the owner']] },
    feedback: { problem: 'What your customers are really saying', noun: 'comment', nouns: 'comments', per: 'comments a week', week: true, h1: (b) => `${b}: what customers are saying`, lead: 'A month of comments from surveys, Google and WhatsApp. Press Run AI and watch it find what keeps coming up, what to fix, what to quote, and who expects an answer.',
      next: ['For restaurants', 'for-restaurants'],
      auto: 'Send thank-you replies automatically', autoShort: 'Auto-thanks', autoNote: 'Short thank-yous go out by themselves. Complaints and questions still wait for a person.', inbox: 'Customer comments',
      actions: { fix: [(r) => `Fix: ${r}`, null, 'bad', 'full'], praise: ['Quote worth sharing', null, 'ok', 'light'], idea: ['Idea for the owner', null, 'info', 'light'], reply: ['Reply drafted', 'Reply sent', 'ok', 'full'], theme: ['Added to a theme', null, 'warn', 'light'] },
      counts: [['fix', 'Things to fix', null, 'to fix'], ['theme', 'Adding to a theme', null, 'themes'], ['reply', 'Replies drafted', 'Replies sent', 'replies', 'sent'], ['praise', 'Quotes to share', null, 'quotes'], ['idea', 'Ideas', null, 'ideas']] },
    posts: { problem: 'A month of posts, written in your voice', noun: 'post', nouns: 'posts', per: 'posts a week', week: true, noUrgent: true, h1: (b) => `${b}: a month of posts, written`, lead: 'Eight posts planned from what\'s happening at the business. Press Run AI and watch it write each one for the right channel, the right length and your voice, ready for your OK.',
      auto: 'Schedule approved posts automatically', autoShort: 'Auto-schedule', autoNote: 'Posts with nothing to check are scheduled by themselves. Anything with a gap waits for you.', inbox: 'Content calendar',
      actions: { linkedin: ['LinkedIn post written', 'Scheduled on LinkedIn', 'info', 'full'], instagram: ['Instagram post written', 'Scheduled on Instagram', 'info', 'full'], facebook: ['Facebook post written', 'Scheduled on Facebook', 'info', 'full'], email: ['Newsletter written', 'Newsletter scheduled', 'info', 'full'] },
      counts: [['linkedin', 'LinkedIn posts', null, 'LinkedIn'], ['instagram', 'Instagram posts', null, 'Instagram'], ['facebook', 'Facebook posts', null, 'Facebook'], ['email', 'Newsletters', null, 'newsletters']] },
    meetings: { problem: 'Meeting notes and to-dos, before the meeting ends', noun: 'moment', nouns: 'moments', per: 'meetings a day', batch: true, h1: (b) => `${b}: notes and to-dos, done`, lead: 'Ten moments from one team meeting. Press Run AI and watch it pick out the decisions, who does what by when, the risks, and the email that has to go out afterwards.',
      auto: 'Send follow-up emails automatically', autoShort: 'Auto-send', autoNote: 'Routine follow-ups go out the moment the meeting ends. Anything sensitive waits for a person.', inbox: 'Meeting transcript',
      actions: { decision: ['Decision', null, 'ok', 'full'], action: [(r) => `To-do: ${r}`, null, 'info', 'full'], risk: ['Risk flagged', null, 'warn', 'full'], followup: [(r) => `Email to ${r} drafted`, 'Follow-up sent', 'ok', 'full'], note: ['In the notes', null, 'muted', 'light'] },
      counts: [['decision', 'Decisions', null, 'decisions'], ['action', 'To-dos with an owner', null, 'to-dos'], ['risk', 'Risks flagged', null, 'risks'], ['followup', 'Follow-ups drafted', 'Follow-ups sent', 'follow-ups', 'sent'], ['note', 'Notes written', null, 'notes']] },
  };
  const PRI = { urgent: ['Urgent', 'bad'], today: ['Today', 'amber'], routine: ['Routine', 'muted'] };
  const NAMES_SHORT = { invoices: 'invoices', questions: 'staff questions', meetings: 'meeting notes', followups: 'follow-ups', posts: 'posts' };
  // Built-in samples replay a prepared example; a prospect's own page runs on their example.
  const runLabel = () => (isSample ? 'Play' : 'Run AI');
  const againLabel = () => (isSample ? 'Play again' : 'Run it again');

  let demo = null, K = null, isSample = false, autoMode = false, ran = 0, running = false, gen = 0, skip = false;

  // The demo fills exactly the screen below the header (which floats a little lower on desktop).
  const fit = () => { const m = $('.ld-main'); if (m) document.documentElement.style.setProperty('--ld-top', Math.max(0, Math.round(m.getBoundingClientRect().top + scrollY)) + 'px'); };
  fit(); addEventListener('resize', fit);
  const root = $('[data-ld]');
  const fail = (m) => { $('[data-ld-error]').textContent = m; $('[data-ld-error]').hidden = false; $('[data-ld-loading]').hidden = true; };

  async function load() {
    const d = (qs.get('d') || '').trim().toLowerCase(), sample = (qs.get('sample') || '').trim().toLowerCase();
    const S = window.RC_DEMO_SAMPLES || {};
    let own = null;
    if (d) {
      if (!API) return fail('This demo couldn\'t load.');
      try {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ d }) });
        const j = await r.json(); if (!j.ok) return fail(j.error || 'This demo couldn\'t load.');
        demo = own = j;
      } catch (e) { return fail('No connection. Check your internet and try again.'); }
    } else {
      demo = S[sample] || S.email; isSample = true;   // a variant (restaurant, cleaning) stands in for its kind
      root.dataset.sample = '1';
    }
    // Every example in one row: tap to switch in place, nothing reloads. On a prospect's own page
    // their demo comes first, and the other kinds of work follow as samples.
    const NAMES = { email: 'Email', invoices: 'Invoices', enquiries: 'Enquiries', reviews: 'Reviews', questions: 'Staff questions', calls: 'Phone calls', meetings: 'Meetings', followups: 'Follow-ups', feedback: 'Feedback', posts: 'Posts' };
    const entries = [];
    if (own) entries.push({ id: 'own', k: own.kind, demo: own, label: `Yours: ${NAMES[own.kind] || own.kind}` });
    Object.keys(KIND).forEach((k) => { const dm = (!own && demo.kind === k) ? demo : S[k]; if (dm && !(own && own.kind === k)) entries.push({ id: k, k, demo: dm, label: NAMES[k] || k }); });
    const tabs = $('[data-ld-kinds]');
    tabs.innerHTML = entries.map((x) => `<button type="button" class="ld-tab${x.id === 'own' ? ' ld-tab--own' : ''}" data-k="${x.k}" data-id="${x.id}" aria-pressed="false"><span class="ld-tab__ic">${ICON[x.k] || ''}</span>${esc(x.label)}</button>`).join('');
    const mark = () => tabs.querySelectorAll('button').forEach((x) => { const on = entries.find((e) => e.id === x.dataset.id).demo === demo; x.setAttribute('aria-pressed', String(on)); if (on) try { x.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } });
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]'); const en = b && entries.find((x) => x.id === b.dataset.id); if (!en || en.demo === demo) return;
      gen++; running = false; demo = en.demo; isSample = en.id !== 'own'; K = KIND[demo.kind] || KIND.email; ran = 0; autoMode = false;
      if (isSample) root.dataset.sample = '1'; else delete root.dataset.sample;
      $('[data-ld-auto-input]').checked = false;
      const sort = $('[data-ld-sort]'); sort.hidden = true; sort.setAttribute('aria-pressed', 'false'); sort.textContent = 'Urgent first';
      const btn = $('[data-ld-run]'); btn.disabled = false; btn.textContent = runLabel();
      closeDetail(); render(); mark();
      // A prospect's link stays their link; the sample pages remember which example is open.
      if (!own) try { history.replaceState(null, '', '?sample=' + (demo.id || demo.kind)); } catch (ex) { /* ignore */ }
      track('live-demo-view', { kind: demo.kind, sample: isSample, from_own: Boolean(own) });
    });
    $('[data-ld-sample]').hidden = false;
    setTimeout(mark, 0);
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
    $('[data-ld-eyebrow]').textContent = isSample ? 'Prepared example · the same every time' : `Live example · ${demo.business}`;
    $('[data-ld-title]').textContent = isSample ? K.problem : K.h1(demo.business);
    $('[data-ld-lead]').textContent = isSample ? K.lead.replace('Press Run AI', 'Press Play') + ' For a live draft of your own email, try the Inbox Assistant page.' : K.lead;
    if (!running) $('[data-ld-run]').textContent = ran ? againLabel() : runLabel();
    // The second button: where this kind of work leads (the matching page, or WhatsApp).
    const nx = demo.next || K.next, b2 = $('[data-ld-next]');
    if (b2) {
      if (nx) { b2.textContent = nx[0]; b2.href = nx[1]; b2.removeAttribute('target'); b2.removeAttribute('rel'); }
      else { b2.textContent = 'WhatsApp us'; b2.href = CFG.WHATSAPP_NUMBER ? `https://wa.me/${CFG.WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi Re-Charge, I saw your ${NAMES_SHORT[demo.kind] || 'AI'} example. Could it work for us?`)}` : 'start'; b2.target = '_blank'; b2.rel = 'noopener'; }
      b2.dataset.track = 'cta-live-demo-next-' + (demo.id || demo.kind);
    }
    $('[data-ld-basis]').textContent = `About ${demo.config.per_day} ${K.per || 'a day'} · tap any to see it`;
    const sw = $('[data-ld-auto]');
    sw.hidden = !K.auto;
    if (K.auto) { $('[data-ld-auto-label]').textContent = innerWidth <= 860 ? K.autoShort : K.auto; sw.title = K.autoNote; $('[data-ld-auto-note]').textContent = K.autoNote + ' This is a demo: nothing is ever sent.'; }
    root.dataset.kind = demo.kind;
    $('[data-ld-cta-head]').textContent = 'Want this on your real work?';
    if (!ran && !running) $('[data-ld-run]').classList.add('is-ready');
    $('[data-ld-icon]').innerHTML = ICON[demo.kind] || ICON.email;
    $('[data-ld-rail]').hidden = !skin().rail;
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
  const badges = (it, doneRow) => { if (!doneRow) return ''; const a = actionOf(it), p = PRI[it.priority] || PRI.routine; return `<span class="ld-pri ld-pri--${p[1]}">${p[0]}</span><span class="ld-act ld-act--${a.tone}" title="${esc(a.label)}">${esc(a.label)}</span>`; };
  const gapNote = (t) => /\[[^\]]+\]/.test(t || '') ? '<p class="tiny muted">Highlighted parts aren\'t in your information yet, so a person fills them in.</p>' : '';
  const why = (it) => it.reason ? `<p class="ld-why">${esc(it.reason)}</p>` : '';
  const pending = '<p class="muted small ld-wait">Press Run AI to see what it does with this one.</p>';
  const ICON = {
    email: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    invoices: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 3h9l3 3v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8"/></svg>',
    enquiries: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 10h8" stroke="currentColor" stroke-width="1.8"/></svg>',
    reviews: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    questions: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 4h14v12h-6l-4 4v-4H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 8.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9V12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    calls: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 3h3l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L21 14.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    followups: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    feedback: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    posts: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    meetings: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 10 6-3v10l-6-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
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
          : it.action === 'file' ? `<div class="ld-move"><span class="ld-move__ic">▱</span><div><b>Moved to ${esc(it.route)}</b>${why(it)}</div></div>`
          : `<div class="ld-flag"><b>Needs a person${it.route ? `: ${esc(it.route)}` : ''}</b>${why(it)}${it.output ? `<p class="small muted">Suggested holding reply:</p><div class="ld-out">${marked(it.output)}</div>` : ''}</div>`}</div>`,
      // Folders down the side fill up as it works.
      rail: () => {
        const done = demo.items.slice(0, ran), cnt = (f) => done.filter(f).length;
        const folders = [...new Set(done.filter((x) => x.action === 'file').map((x) => x.route || 'Filed'))];
        const row = (ic, label, n, cls = '') => `<li class="${cls}${n ? ' has' : ''}"><span aria-hidden="true">${ic}</span>${esc(label)}${n ? `<b>${n}</b>` : ''}</li>`;
        return `<ul>${row('▭', 'Inbox', demo.items.length - ran, 'is-on')}${row('✎', 'Drafts', cnt((x) => x.action === 'draft' && !actionOf(x).done))}${row('➤', 'Sent', cnt((x) => actionOf(x).done))}${row('↪', 'Forwarded', cnt((x) => x.action === 'forward'))}${row('≡', 'Summaries', cnt((x) => x.action === 'summarise'))}${row('⚑', 'Needs you', cnt((x) => x.action === 'human'), 'is-flag')}</ul>
          <p class="ld-rail__h">Folders</p><ul>${(folders.length ? folders : ['Invoices', 'Newsletters']).map((f) => row('▱', f, cnt((x) => x.action === 'file' && (x.route || 'Filed') === f))).join('')}</ul>`;
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
        <span class="ld-row__title"><b>${esc(it.title)}</b>${d ? `<small>${it.action === 'answer' ? `Source: ${esc(it.route || 'Your documents')}` : `Not in the documents → ${esc(it.route || 'a person')}`}</small>` : ''}</span>
        <span class="ld-row__time">${esc(it.received)}</span>
        <span class="ld-row__ai">${d ? badges(it, d) : '<span class="ld-new">Waiting</span>'}</span>`; },
      detail: (it, d, a) => `
        <div class="ld-thread">
          <div class="ld-msg">${ava(it.from_name, true)}<div><p><b>${esc(it.from_name)}</b> <span class="muted small">${esc(it.from_detail)} · ${esc(it.received)}</span></p><p>${esc(clean(it.body))}</p></div></div>
          ${!d ? pending : `<div class="ld-msg ld-msg--bot"><span class="ld-ava ld-ava--sq ld-ava--bot" aria-hidden="true">AI</span><div><p><b>Office assistant</b> <span class="ld-apptag">APP</span></p>
            <div class="ld-out">${marked(it.output)}</div>
            ${it.action === 'answer' ? `<p class="ld-srccard">▤ <b>${esc(it.route || 'Your documents')}</b><span>The answer above comes from here, word for word where it matters.</span></p>` : `<p class="ld-srccard ld-srccard--no">⚑ <b>Not in the documents</b><span>Passed to ${esc(it.route || 'a person')} instead of guessing.</span></p>`}</div></div>`}
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
        <ol class="ld-phone__log">${String(it.body).split(/\n+/).filter(Boolean).map((l) => { const m = l.match(/^(Caller|AI|Voicemail[^:]*|WhatsApp)\s*:\s*(.*)$/i); return m ? `<li class="${/^ai$/i.test(m[1]) ? 'is-ai' : 'is-caller'}"><b>${esc(/^ai$/i.test(m[1]) ? 'AI' : /^caller$/i.test(m[1]) ? 'Caller' : m[1])}</b>${esc(m[2])}</li>` : `<li class="is-caller">${esc(l)}</li>`; }).join('')}</ol>
      </div>
      <div class="ld-col">${!d ? pending : `<div class="ld-jobcard"><h4>Job card</h4>
        ${(it.fields || []).length ? `<table class="ld-fields">${it.fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${marked(f.value)}</td></tr>`).join('')}</table>` : ''}</div>
        <p><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span></p>${why(it)}
        ${it.output ? `<div class="ld-sms"><span>${it.action === 'book' || it.action === 'answer' ? (a.done ? 'WhatsApp sent to the caller' : 'WhatsApp ready for the caller') : it.action === 'job' ? 'Alert to the on-call person' : 'Message passed on'}</span>${marked(it.output)}</div>${gapNote(it.output)}` : ''}`}</div>`,
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
  // Follow-ups: a sales board of open quotes, each with how long it's been quiet.
  const STAGES = ['New', 'Quote sent', 'Deciding', 'Won'];
  const quietDays = (it) => parseInt(field(it, /quiet/i) || it.received, 10) || 0;
  SKIN.followups = {
    row: (it, i, d) => `${ava(it.from_name, true)}
      <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
      <span class="ld-row__title"><small>${esc(it.title)} · <b class="ld-money">${esc(field(it, /value/i))}</b></small></span>
      <span class="ld-row__time"><span class="ld-quiet${quietDays(it) >= 14 ? ' is-long' : ''}">${quietDays(it)}d</span></span>
      <span class="ld-row__ai">${d ? badges(it, d) : '<span class="ld-new">Open</span>'}</span>`,
    detail: (it, d, a) => { const st = field(it, /stage/i), at = STAGES.indexOf(st); return `
      <div class="ld-deal">
        <div class="ld-deal__top">${ava(it.from_name, true)}<span><b>${esc(it.from_name)}</b><br><span class="small">${esc(it.from_detail)}</span></span><b class="ld-deal__val">${esc(field(it, /value/i))}</b></div>
        <ol class="ld-stages">${STAGES.map((x, k) => `<li class="${k < at ? 'is-past' : k === at ? 'is-now' : ''}">${x}</li>`).join('')}</ol>
        <p class="ld-deal__quiet">Quiet for <b>${quietDays(it)} days</b> · ${esc(it.title)}</p>
        <p class="ld-deal__hist">${esc(it.body)}</p>
      </div>
      <div class="ld-col">${!d ? pending : `<h4>What the AI did</h4><p><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span></p>${why(it)}
        ${it.output ? (it.action === 'followup' || it.action === 'close' ? `<div class="ld-compose"><div class="ld-compose__bar">${a.done ? 'Sent automatically' : 'Follow-up, ready to send'}</div><p class="ld-compose__to"><span class="muted">To</span> ${esc(it.from_detail)}</p><div class="ld-out">${marked(it.output)}</div></div>${gapNote(it.output)}` : `<div class="ld-out">${marked(it.output)}</div>${gapNote(it.output)}`) : ''}`}</div>`; },
  };
  // Feedback: customer comments with their sentiment, building into themes.
  const SENT = { positive: 'pos', negative: 'neg', mixed: 'mix' };
  SKIN.feedback = {
    row: (it, i, d) => `<span class="ld-sent ld-sent--${SENT[String(field(it, /sentiment/i)).toLowerCase()] || 'mix'}" aria-label="${esc(field(it, /sentiment/i) || 'Mixed')}"></span>
      <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
      <span class="ld-row__title"><small>“${esc(cut(it.body, 100))}”</small></span>
      <span class="ld-row__time">${d && field(it, /theme/i) ? `<span class="ld-themechip">${esc(field(it, /theme/i))}</span>` : ''}</span>
      <span class="ld-row__ai">${d ? badges(it, d) : ''}</span>`,
    detail: (it, d, a) => { const th = field(it, /theme/i); return `
      <figure class="ld-fbq"><blockquote>${esc(it.body)}</blockquote><figcaption>${esc(it.from_name)} · ${esc(it.from_detail)} · ${esc(it.received)} <span class="ld-sent ld-sent--${SENT[String(field(it, /sentiment/i)).toLowerCase()] || 'mix'}"></span> ${esc(field(it, /sentiment/i))}</figcaption></figure>
      <div class="ld-col">${!d ? pending : `<h4>What the AI did</h4><p><span class="ld-act ld-act--${a.tone}">${esc(a.label)}</span></p>
        ${th ? `<p class="small">Theme: <b>${esc(th)}</b>${themeCount(th) > 1 ? ` · ${themeCount(th)} comments so far` : ''}</p>` : ''}${why(it)}
        ${it.output ? (it.action === 'praise' ? `<blockquote class="ld-pull">${marked(it.output)}<span>Ready for your website, with their OK</span></blockquote>` : it.action === 'reply' ? `<div class="ld-bub ld-bub--out${a.done ? '' : ' is-draft'}">${marked(it.output)}<time>${a.done ? 'Sent automatically' : 'Draft · ready to send'}</time></div>${gapNote(it.output)}` : `<div class="ld-out">${marked(it.output)}</div>`) : ''}`}</div>`; },
  };
  // Posts: a content calendar; each post shown as it will look on its channel.
  const CHN = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', email: 'Email' };
  SKIN.posts = {
    row: (it, i, d) => `<span class="ld-row__time ld-date">${esc(it.received)}</span>
      <span class="ld-row__from"><b>${esc(it.from_name)}</b><small>${esc(it.from_detail)}</small></span>
      <span class="ld-row__title"><small>${d && it.output ? esc(cut(it.output.replace(/^Subject:[^\n]*\n+/, ''), 90)) : '✎ ' + esc(it.body)}</small></span>
      <span class="ld-row__ai">${d ? `<span class="ld-chn ld-chn--${esc(it.action)}">${esc(CHN[it.action] || it.action)}</span>${actionOf(it).done ? '<span class="ld-act ld-act--ok">Scheduled</span>' : '<span class="ld-act ld-act--info">Ready for your OK</span>'}` : '<span class="ld-new">Planned</span>'}</span>`,
    detail: (it, d, a) => `
      <div class="ld-brief"><h4>The direction</h4><p>${esc(it.body)}</p><span class="small">${esc(it.from_detail)} · planned for ${esc(it.received)}</span></div>
      <div class="ld-col">${!d ? pending : `<div class="cc-post" data-ch="${esc(CHN[it.action] || 'LinkedIn')}"><div class="cc-post__head"><span class="cc-post__ava" aria-hidden="true">${esc(initials(demo.business).slice(0, 1))}</span><span><b>${esc(it.action === 'email' ? 'From: ' + demo.business : demo.business)}</b><small>${esc(CHN[it.action] || '')} · ${a.done ? 'Scheduled for ' + esc(it.received) : 'Draft, waiting for your OK'}</small></span></div>
        <pre class="cc__text">${marked(it.output)}</pre></div>${gapNote(it.output)}${why(it)}`}</div>`,
  };
  const themeCount = (t) => demo.items.slice(0, ran).filter((x) => field(x, /theme/i) === t).length;
  const skin = () => SKIN[demo.kind] || SKIN.email;

  function rows(order) {
    const list = order || demo.items.map((_, i) => i);
    $('[data-ld-inbox]').textContent = `${ran && K.inboxDone ? K.inboxDone : K.inbox} · ${demo.items.length}`;
    $('[data-ld-rows]').innerHTML = list.map((i) => {
      const it = demo.items[i], doneRow = i < ran;
      return `<li class="ld-row${doneRow ? ' is-done' : ''}" data-i="${i}"><button type="button" class="ld-row__head" aria-haspopup="dialog">${skin().row(it, i, doneRow)}</button></li>`;
    }).join('');
    document.querySelectorAll('.ld-row__head').forEach((b) => b.addEventListener('click', () => detail(Number(b.parentElement.dataset.i), b)));
    const rail = $('[data-ld-rail]'); if (rail && skin().rail) rail.innerHTML = skin().rail();
    if (demo.kind === 'reviews' || demo.kind === 'feedback') {
      const t = {}; demo.items.slice(0, ran).forEach((x) => { const th = field(x, /theme/i); if (th) t[th] = (t[th] || 0) + 1; });
      const top = Object.entries(t).filter(([, n]) => n > 1).sort((x, y) => y[1] - x[1])[0];
      $('[data-ld-basis]').textContent = top ? `Coming up again: ${top[0]} (×${top[1]})` : `About ${demo.config.per_day} ${K.per || 'a day'} · tap any to see it`;
    }
    kpis();
  }

  // One item in full, over the list (so the page itself never has to scroll).
  let opener = null, cur = -1;
  // The order on screen (urgent-first sorting changes it).
  const order = () => [...document.querySelectorAll('.ld-row')].map((li) => Number(li.dataset.i));
  function detail(i, from) {
    const it = demo.items[i], doneRow = i < ran, a = doneRow ? actionOf(it) : null;
    if (from) opener = from;
    cur = i; root.classList.add('is-reading-one');
    $('[data-ld-pos]').textContent = `${order().indexOf(i) + 1} of ${demo.items.length}`;
    $('[data-ld-detail-body]').innerHTML = skin().detail(it, doneRow, a);
    const box = $('[data-ld-detail]'); box.hidden = false; $('[data-ld-detail-body]').scrollTop = 0; if (from) $('[data-ld-close]').focus();
  }
  function closeDetail() { if ($('[data-ld-detail]').hidden) return; $('[data-ld-detail]').hidden = true; root.classList.remove('is-reading-one'); cur = -1; if (opener && opener.isConnected) opener.focus(); }
  $('[data-ld-close]').addEventListener('click', closeDetail);
  const step = (dir) => { const o = order(), at = o.indexOf(cur); if (at < 0) return; const next = o[(at + dir + o.length) % o.length]; detail(next); };
  document.querySelectorAll('[data-ld-step]').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.ldStep))));
  document.addEventListener('keydown', (e) => {
    if ($('[data-ld-detail]').hidden) return;
    if (e.key === 'Escape') closeDetail();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  });

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
    if (!K.noUrgent) tiles.push(`<div class="ld-kpi ld-kpi--bad"><b>${urgent}</b><span><span class="ld-l">Urgent, flagged to the top</span><span class="ld-s">urgent</span></span></div>`);
    const k = $('[data-ld-kpis]'); k.innerHTML = tiles.join(''); k.classList.toggle('is-empty', !ran && !running);
    $('[data-ld-prog]').style.width = (ran / n * 100) + '%';
    const cta = $('.ld-cta'); cta.classList.toggle('is-hot', ran === n);
    const byHand = n * (Number(c.manual_minutes) || 6);
    const save = demo.items.reduce((a, it, i) => a + (i < ran ? saved(it) : 0), 0);
    const perItem = demo.items.reduce((a, it) => a + saved(it), 0) / n;
    // A meeting is one batch: the per-day number counts meetings, not moments.
    const perDay = ((K.batch ? perItem * n : perItem) * (Number(c.per_day) || 40)) / 60, perMonth = perDay * (K.week ? 4.3 : 21);   // week kinds: per_day counts per week
    const r1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
    $('[data-ld-time]').innerHTML = ran < n
      ? `<p>${ran ? `${ran} of ${n} done…` : `${K.batch ? 'Writing up this meeting by hand takes' : `By hand, these ${n} ${esc(K.nouns)} take`} about <b>${Math.round(byHand)} minutes</b>. See how long the AI takes.`}</p>`
      : `<div class="ld-save"><div><b>${Math.round(save)} min</b><span>of the ${Math.round(byHand)} minutes saved on these ${n}</span></div>
         <div><b>~${r1(perDay)} h</b><span>a ${K.week ? 'week' : 'day'} at ${esc(c.per_day)} ${esc(K.per || 'a day')}</span></div>
         <div><b>~${r1(perMonth)} h</b><span>a month, if your mix looked like this</span></div></div>
         <p class="ld-note">Counted honestly: a drafted reply still takes a minute to check, quick sorting counts ${esc(c.light_minutes)} min, and anything a person handles counts nothing.${K.auto ? ` Switch auto ${autoMode ? 'off' : 'on'} to compare.` : ''}</p>`;
  }

  $('[data-ld-run]').addEventListener('click', async () => {
    const btn = $('[data-ld-run]');
    if (running) { skip = true; return; }   // pressed again while running: show the results now
    running = true; skip = false; ran = 0; closeDetail(); rows(); btn.classList.remove('is-ready');
    const list = $('[data-ld-rows]'); if (list) list.scrollTop = 0;
    const my = ++gen;
    btn.textContent = 'Skip to results';
    track('live-demo-run', { kind: demo.kind, auto: autoMode });
    for (let i = 0; i < demo.items.length; i++) {
      const li = document.querySelector(`.ld-row[data-i="${i}"]`);
      if (li) { li.classList.add('is-reading'); li.querySelector('.ld-row__ai').innerHTML = '<span class="ld-reading">Reading…</span>'; try { li.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } }
      if (!skip) await wait(420);
      if (my !== gen) return;   // switched to another example mid-run
      ran = i + 1; rows();
      const now = document.querySelector(`.ld-row[data-i="${i}"]`); if (now) { now.classList.add('is-flash'); }
      if (!skip) await wait(180);
    }
    if (my !== gen) return;
    { const l2 = $('[data-ld-rows]'); if (l2) l2.scrollTop = 0; }   // back to the top: the results start there
    running = false; btn.textContent = againLabel(); kpis();
    const saveMin = Math.round(demo.items.reduce((a, it) => a + saved(it), 0));
    $('[data-ld-cta-head]').textContent = `That's ${saveMin} minutes back on ${demo.items.length} ${K.batch ? 'moments of one meeting' : K.nouns}. Want this on your real work?`;
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
