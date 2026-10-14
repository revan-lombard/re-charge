/* AI demos (ai-demos.html). Eight systems on sample data, in the browser.
   Paced for reading: text appears at about reading speed and each step pauses
   before the next; nothing starts until the visitor presses play.
   - Meeting notes, CRM, call taker, customer insight, content and connected systems: scripted
     simulations that react to what you click and type.
   - RAG: real retrieval (BM25) over five sample documents, extractive answers with
     citations, and an honest "not in the documents" when nothing matches.
   - Q&A uses the live assistant, mounted by script.js on [data-assistant].
   Under prefers-reduced-motion everything appears at once instead of streaming. */
(function aiDemos() {
  'use strict';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = (n) => 'R' + Math.round(n).toLocaleString('en-ZA').replace(/ |\s/g, ',');
  const track = (n, d) => { try { window.trackEvent && window.trackEvent(n, d); } catch (e) { /* ignore */ } };
  // A run token per demo, so pressing play twice never interleaves two streams.
  const runner = () => { let id = 0; return { next: () => ++id, live: (n) => n === id }; };
  const wait = (ms) => new Promise((r) => setTimeout(r, RM ? 0 : ms));
  async function type(el, text, run, tok, cps = 90) {
    if (RM) { el.textContent = text; return; }
    el.textContent = '';
    for (let i = 0; i < text.length; i += 3) { if (!run.live(tok)) return; el.textContent = text.slice(0, i + 3); await wait(1000 / cps * 3); }
  }

  /* ================= 1. Meeting notes ================= */
  const MEETINGS = {
    ops: {
      title: 'Weekly operations · Karoo Freight', len: '28 min', people: ['Thandi (ops manager)', 'Pieter (fleet)', 'Ayesha (customer service)'],
      lines: [
        ['00:14', 'Thandi', 'Morning all. Three things today: the late Durban deliveries, the new depot roster, and the customer complaints backlog.'],
        ['01:02', 'Pieter', 'Durban: two trucks were down last week, both brake issues. One is back, the other needs parts, probably Thursday.'],
        ['02:30', 'Thandi', 'Can we hire a truck for the Thursday run so we stop missing slots?'],
        ['02:51', 'Pieter', 'Yes, I can get one from Truckhire at about R4,200 a day. I’ll book it today.'],
        ['04:10', 'Ayesha', 'Complaints: forty-one open tickets, most are “where is my delivery”. We answer each one by hand.'],
        ['05:02', 'Thandi', 'Let’s decide: tracking links go out automatically on every dispatch from Monday.'],
        ['05:40', 'Ayesha', 'Then I need the dispatch export fixed, it’s missing phone numbers for about a third of orders.'],
        ['06:25', 'Pieter', 'That’s the depot form. I’ll make the phone field compulsory by Friday.'],
        ['08:12', 'Thandi', 'Roster: Saturday cover is thin. If nobody volunteers we may miss the weekend window again.'],
        ['09:03', 'Ayesha', 'I’ll ask the team and come back with names by Wednesday.'],
        ['10:20', 'Thandi', 'Good. Recap next week, same time.'],
      ],
      notes: {
        summary: 'Durban delays came from two trucks out with brake issues; a hired truck covers Thursday. Tracking links will go out automatically from Monday to cut “where is my delivery” tickets, which first needs phone numbers captured on every order. Saturday cover is a risk.',
        decisions: [[5, 'Send tracking links automatically on every dispatch from Monday']],
        actions: [[3, 'Pieter', 'Book a hired truck for the Thursday Durban run (≈ R4,200)', 'Today'], [7, 'Pieter', 'Make the phone field compulsory on the depot form', 'Friday'], [9, 'Ayesha', 'Find volunteers for Saturday cover', 'Wednesday']],
        risks: [[6, 'A third of orders have no phone number, so tracking links can’t reach them yet'], [8, 'Thin Saturday cover could miss the weekend window again']],
      },
    },
    sales: {
      title: 'Discovery call · Bright Smile Dental', len: '19 min', people: ['Dr Naidoo (practice owner)', 'Sipho (Re-Charge)'],
      lines: [
        ['00:20', 'Sipho', 'Thanks for the time. Where does your front desk lose the most hours?'],
        ['00:41', 'Dr Naidoo', 'The phone. Two receptionists, and half their day is booking and moving appointments.'],
        ['01:35', 'Dr Naidoo', 'And after 5pm nobody answers. I know we lose new patients to the practice down the road.'],
        ['02:20', 'Sipho', 'Roughly how many calls a day, and how long is a booking call?'],
        ['02:44', 'Dr Naidoo', 'Maybe eighty calls. A booking is three or four minutes, a reschedule about the same.'],
        ['03:50', 'Sipho', 'Which booking system do you use?'],
        ['04:02', 'Dr Naidoo', 'Dentrix. It has an API, our IT guy says.'],
        ['05:15', 'Dr Naidoo', 'Budget-wise I’d need to see it pay for itself within the year.'],
        ['06:30', 'Sipho', 'Then let’s measure it: two weeks of call logs as the baseline. I’ll send the discovery proposal by Thursday.'],
        ['07:02', 'Dr Naidoo', 'Good. Send it to me and to Lindiwe, our practice manager.'],
      ],
      notes: {
        summary: 'Two receptionists spend about half their day on ~80 calls, mostly 3–4 minute bookings and reschedules; after-hours calls go unanswered and new patients are lost. Dentrix has an API. Payback within a year is the bar.',
        decisions: [[8, 'Measure two weeks of call logs as the baseline before anything is built']],
        actions: [[8, 'Sipho', 'Send the discovery proposal to Dr Naidoo and Lindiwe', 'Thursday'], [6, 'Dr Naidoo', 'Confirm Dentrix API access with IT', 'Next week']],
        risks: [[7, 'Must show payback within 12 months'], [2, 'After-hours calls currently lost entirely']],
      },
    },
  };
  function meetingDemo(root) {
    const run = runner(); let key = 'ops', playing = false, speed = 1;
    const tx = $('[data-mt-transcript]', root), out = $('[data-mt-notes]', root), btn = $('[data-mt-play]', root), bar = $('[data-mt-bar]', root);
    const draw = () => {
      const m = MEETINGS[key];
      $('[data-mt-title]', root).textContent = m.title;
      $('[data-mt-meta]', root).textContent = m.len + ' · ' + m.people.join(', ');
      tx.innerHTML = m.lines.map(([t, who, text], i) => '<li data-i="' + i + '" hidden><time>' + t + '</time><b>' + esc(who) + '</b><span>' + esc(text) + '</span></li>').join('');
      out.innerHTML = '<div class="mt-empty">Notes appear as the meeting happens.</div>';
      bar.style.width = '0%'; root.classList.remove('is-live');
    };
    const item = (i, html) => '<li><button type="button" data-jump="' + i + '">' + html + '</button></li>';
    const notes = (upto, done) => {
      const n = MEETINGS[key].notes, upd = (arr) => arr.filter(([i]) => i <= upto);
      const ds = upd(n.decisions), as = upd(n.actions), rs = upd(n.risks);
      out.innerHTML =
        (done ? '<section><h4>Summary</h4><p class="mt-sum"></p></section>' : '') +
        '<section><h4>Decisions <i>' + ds.length + '</i></h4><ul>' + ds.map(([i, t]) => item(i, esc(t))).join('') + '</ul></section>' +
        '<section><h4>Who does what <i>' + as.length + '</i></h4><ul>' + as.map(([i, who, t, due]) => item(i, '<b>' + esc(who) + '</b> ' + esc(t) + ' <em>' + esc(due) + '</em>')).join('') + '</ul></section>' +
        '<section><h4>Watch out for <i>' + rs.length + '</i></h4><ul>' + rs.map(([i, t]) => item(i, esc(t))).join('') + '</ul></section>';
    };
    const play = async () => {
      if (playing) { playing = false; run.next(); btn.textContent = 'Resume'; root.classList.remove('is-live'); return; }
      playing = true; btn.textContent = 'Pause'; root.classList.add('is-live'); track('aidemo', { demo: 'meeting' });
      const tok = run.next(), lines = $$('li', tx);
      let start = lines.findIndex((l) => l.hidden); if (start < 0) { draw(); start = 0; }
      for (let i = start; i < lines.length; i++) {
        if (!run.live(tok)) return;
        lines[i].hidden = false; lines[i].classList.add('is-new'); tx.scrollTop = tx.scrollHeight;
        notes(i, false); bar.style.width = ((i + 1) / lines.length * 100) + '%';
        await wait(2800 / speed);
        lines[i].classList.remove('is-new');
      }
      if (!run.live(tok)) return;
      notes(lines.length, true); await type($('.mt-sum', out), MEETINGS[key].notes.summary, run, tok, 60);
      playing = false; btn.textContent = 'Play again'; root.classList.remove('is-live');
      $('[data-mt-done]', root).hidden = false;
    };
    btn.addEventListener('click', play);
    $$('[data-mt-pick]', root).forEach((b) => b.addEventListener('click', () => { run.next(); playing = false; key = b.dataset.mtPick; $$('[data-mt-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); btn.textContent = 'Play'; $('[data-mt-done]', root).hidden = true; draw(); }));
    $('[data-mt-speed]', root).addEventListener('click', (e) => { speed = speed === 1 ? 2 : 1; e.currentTarget.textContent = speed + '×'; });
    out.addEventListener('click', (e) => {
      const b = e.target.closest('[data-jump]'); if (!b) return;
      const li = $('li[data-i="' + b.dataset.jump + '"]', tx); if (!li) return;
      $$('li', tx).forEach((x) => x.classList.remove('is-cited')); li.classList.add('is-cited');
      tx.scrollTop = li.offsetTop - tx.offsetTop - 20;
    });
    draw();
  }

  /* ================= 2. AI CRM / pipeline ================= */
  const STAGES = ['New', 'Interested', 'Quote sent', 'Deciding'];
  const DEALS = [
    { co: 'Mokoena Inc', who: 'Thandi Mokoena', v: 186000, st: 'Quote sent', idle: 3, score: 82, why: ['Opened your quote 4 times', 'Asked about paying in parts', 'The owner is on the emails'], next: 'Send the pay-in-parts option she asked about, today.', draft: 'Hi Thandi, as promised: we can split the R186,000 into three payments. I’ve attached the dates. Shall we start on the 3rd?' },
    { co: 'Karoo Freight', who: 'Pieter van Wyk', v: 412000, st: 'Deciding', idle: 18, score: 41, why: ['No reply in 18 days', 'Mentioned another supplier', 'The person who pays hasn’t been involved'], next: 'Gone quiet: ask Pieter for 15 minutes with the person who pays.', draft: 'Hi Pieter, I know month-end is busy. The trial saved your dispatch team 31 hours a week. Could we get 15 minutes with you and Johan this week to agree the next step?' },
    { co: 'Bright Smile Dental', who: 'Dr Naidoo', v: 58500, st: 'Interested', idle: 1, score: 74, why: ['Booked a meeting after the first call', 'Clear problem: 80 calls a day', 'Wants it to pay for itself in a year'], next: 'Send the proposal before Thursday, as promised.', draft: 'Dr Naidoo, thank you for your time. Attached is the proposal we discussed for the front desk. Lindiwe is copied, as you asked.' },
    { co: 'Atlas Office Supplies', who: 'Grace Botha', v: 96000, st: 'Quote sent', idle: 9, score: 55, why: ['Opened your quote once', 'Asked to speak to a past customer', 'Their buying department is now involved'], next: 'Send a past customer’s contact and your company documents.', draft: 'Hi Grace, here are our company documents and the details of a past customer you can call. Happy to answer anything your buying team needs.' },
    { co: 'Umhlanga Realty', who: 'Kyle Pillay', v: 45000, st: 'New', idle: 2, score: 63, why: ['Came in through the website', '6 agents, enquiries by email', 'Asked about WhatsApp'], next: 'Book a 30-minute call.', draft: 'Hi Kyle, thanks for reaching out. Would Tuesday 10:00 or Wednesday 14:00 work for a 30-minute call? Bring one task that takes your agents too long.' },
    { co: 'Cape Coast Logistics', who: 'Marlene Adams', v: 230000, st: 'Deciding', idle: 22, score: 33, why: ['No reply in 22 days', 'Your contact changed jobs', 'The contract is stuck with their lawyers'], next: 'Gone quiet: find out who took over from Marlene.', draft: 'Hi Marlene, congratulations on the new role. Who should I speak to about finishing the Cape Coast agreement? Legal had two open points; I’m happy to resolve them on a call.' },
  ];
  function crmDemo(root) {
    const board = $('[data-crm-board]', root), side = $('[data-crm-side]', root), sum = $('[data-crm-sum]', root), run = runner();
    let reviewed = false, sel = null;
    const draw = () => {
      board.innerHTML = STAGES.map((st) => {
        const ds = DEALS.map((d, i) => ({ ...d, i })).filter((d) => d.st === st);
        return '<div class="crm-col"><h4>' + st + ' <i>' + ds.length + '</i></h4>' + ds.map((d) => {
          const flag = reviewed && d.idle >= 14 ? '<span class="crm-flag">Quiet for ' + d.idle + ' days</span>' : reviewed && d.score >= 75 ? '<span class="crm-flag crm-flag--hot">Ready to buy</span>' : '';
          return '<button type="button" class="crm-card' + (sel === d.i ? ' is-sel' : '') + '" data-deal="' + d.i + '"><b>' + esc(d.co) + '</b><span>' + R(d.v) + '</span>' + flag + '</button>';
        }).join('') + '</div>';
      }).join('');
    };
      const open = async (i) => {
      sel = i; draw(); const d = DEALS[i], tok = run.next();
      side.innerHTML = '<h4>' + esc(d.co) + ' <span>' + esc(d.who) + ' · ' + R(d.v) + ' · ' + d.st + '</span></h4>' +
        (reviewed ? '<div class="crm-why"><b>What it noticed</b><ul>' + d.why.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '') +
        (reviewed ? '<p class="crm-next"><b>What to do</b> ' + esc(d.next) + '</p>' : '') +
        '<div class="crm-draft"><b>Follow-up, written for you</b><p data-draft></p><button type="button" class="btn btn--ghost btn--small" data-copy-draft>Copy</button></div>';
      await type($('[data-draft]', side), d.draft, run, tok, 70);
    };
    board.addEventListener('click', (e) => { const c = e.target.closest('[data-deal]'); if (c) open(Number(c.dataset.deal)); });
    side.addEventListener('click', async (e) => { if (!e.target.closest('[data-copy-draft]')) return; try { await navigator.clipboard.writeText($('[data-draft]', side).textContent); e.target.textContent = 'Copied'; } catch (ex) { /* ignore */ } });
    $('[data-crm-run]', root).addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Reading your emails and notes…'; track('aidemo', { demo: 'crm' });
      await wait(1600); reviewed = true; draw();
      const stalled = DEALS.filter((d) => d.idle >= 14), atRisk = stalled.reduce((a, d) => a + d.v, 0);
      sum.innerHTML = '<div><b>' + stalled.length + '</b><span>customers gone quiet</span></div><div><b>' + R(atRisk) + '</b><span>waiting on them</span></div><div><b>' + DEALS.length + '</b><span>follow-ups written</span></div>';
      sum.hidden = false; b.textContent = 'Checked just now'; open(DEALS.indexOf(stalled.sort((a, z) => z.v - a.v)[0]));
    });
    draw();
  }

  /* ================= 3. Call taker ================= */
  const CALLS = {
    plumber: { biz: "Mike's Plumbing · after hours", time: '23:12', fields: ['Name', 'Number', 'Address', 'Problem', 'Urgency', 'Booked for'],
      turns: [
        ['ai', "Mike's Plumbing, you're through to the after-hours line. What's happened?", {}],
        ['caller', "Hi, there's water pouring from the ceiling in the bathroom. I think a pipe burst.", { Problem: 'Burst pipe, water through ceiling' }],
        ['ai', "That's urgent. First, if you can, close the main water valve, usually by the meter at the gate. Can I get your name?", { Urgency: 'Emergency' }],
        ['caller', "It's Johan. Okay, I've turned it off.", { Name: 'Johan' }],
        ['ai', 'Thanks Johan. What address is the plumber coming to?', {}],
        ['caller', '14 Jacaranda Street, Edenvale.', { Address: '14 Jacaranda St, Edenvale' }],
        ['ai', 'And the best number to reach you on?', {}],
        ['caller', '082 555 0143.', { Number: '082 555 0143' }],
        ['ai', "The on-call plumber is being notified now and will call you within 15 minutes. The emergency call-out is R650. I've sent you an SMS with the details.", { 'Booked for': 'Tonight, on-call (within 1 h)' }],
      ],
      outcome: ['Emergency job created', 'On-call plumber notified by SMS', 'Caller sent confirmation + call-out fee'] },
    dental: { biz: 'Bright Smile Dental · during a busy morning', time: '09:41', fields: ['Name', 'Number', 'Patient type', 'Reason', 'Urgency', 'Booked for'],
      turns: [
        ['ai', 'Good morning, Bright Smile Dental. How can I help?', {}],
        ['caller', "Hi, I'd like to book a check-up and clean. I haven't been in about two years.", { Reason: 'Check-up and clean' , Urgency: 'Routine' }],
        ['ai', 'Happy to help. Are you an existing patient with us?', {}],
        ['caller', "No, first time. I'm Lerato Dube.", { Name: 'Lerato Dube', 'Patient type': 'New patient' }],
        ['ai', 'Welcome, Lerato. Dr Naidoo has Tuesday at 08:30 or Thursday at 15:00. Which suits you?', {}],
        ['caller', 'Thursday at three, please.', { 'Booked for': 'Thu 15:00, Dr Naidoo' }],
        ['ai', "Booked. What's the best number for your reminder?", {}],
        ['caller', '073 210 8877.', { Number: '073 210 8877' }],
        ['ai', "You're all set for Thursday at 15:00. You'll get an SMS reminder the day before with the new-patient form.", {}],
      ],
      outcome: ['Appointment written to the practice calendar', 'New-patient form sent by SMS', 'Reminder scheduled for the day before'] },
  };
  function callDemo(root) {
    const run = runner(); let key = 'plumber';
    const log = $('[data-call-log]', root), form = $('[data-call-ticket]', root), out = $('[data-call-out]', root), btn = $('[data-call-play]', root);
    const draw = () => {
      const c = CALLS[key];
      $('[data-call-biz]', root).textContent = c.biz; $('[data-call-time]', root).textContent = c.time;
      log.innerHTML = ''; out.hidden = true; root.classList.remove('is-ringing', 'is-live');
      form.innerHTML = c.fields.map((f) => '<div data-f="' + esc(f) + '"><span>' + esc(f) + '</span><b>—</b></div>').join('');
      btn.textContent = 'Take the call'; btn.disabled = false;
    };
    btn.addEventListener('click', async () => {
      const c = CALLS[key], tok = run.next(); draw(); btn.disabled = true; root.classList.add('is-ringing'); track('aidemo', { demo: 'call' });
      btn.textContent = 'Ringing…'; await wait(1200); if (!run.live(tok)) return;
      root.classList.remove('is-ringing'); root.classList.add('is-live'); btn.textContent = 'On the call';
      for (const [who, text, fill] of c.turns) {
        if (!run.live(tok)) return;
        const li = document.createElement('li'); li.className = 'call-' + who; li.innerHTML = '<b>' + (who === 'ai' ? 'AI' : 'Caller') + '</b><span></span>'; log.appendChild(li);
        await type($('span', li), text, run, tok, 40); log.scrollTop = log.scrollHeight;
        Object.entries(fill).forEach(([k, v]) => { const f = $('[data-f="' + k + '"]', form); if (f) { $('b', f).textContent = v; f.classList.add('is-filled'); if (k === 'Urgency' && v === 'Emergency') f.classList.add('is-urgent'); } });
        await wait(1100);
      }
      if (!run.live(tok)) return;
      root.classList.remove('is-live');
      out.innerHTML = c.outcome.map((o) => '<li>' + esc(o) + '</li>').join(''); out.hidden = false;
      btn.textContent = 'Call again'; btn.disabled = false;
    });
    $$('[data-call-pick]', root).forEach((b) => b.addEventListener('click', () => { run.next(); key = b.dataset.callPick; $$('[data-call-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
    draw();
  }

  /* ================= 5. Customer insight / representative ================= */
  // Each comment: [text, theme, sentiment (+1/-1), segment]
  const FEEDBACK = [
    ['Best flat white in Braamfontein, worth the queue.', 'Coffee quality', 1, 'Regulars'],
    ['Coffee is consistently great, the beans are always fresh.', 'Coffee quality', 1, 'Regulars'],
    ['Lovely coffee but I waited 15 minutes at 8am.', 'Morning wait', -1, 'Commuters'],
    ['The morning queue is out the door, I gave up and left.', 'Morning wait', -1, 'Commuters'],
    ['Ordering ahead would save me so much time before work.', 'Morning wait', -1, 'Commuters'],
    ['Too slow in the morning rush, had to skip it twice this week.', 'Morning wait', -1, 'Commuters'],
    ['Wi-fi keeps dropping, hard to work here for long.', 'Wi-fi & plugs', -1, 'Remote workers'],
    ['Not enough plugs near the tables.', 'Wi-fi & plugs', -1, 'Remote workers'],
    ['Great spot to work if you grab the corner table with the plug.', 'Wi-fi & plugs', 1, 'Remote workers'],
    ['Wi-fi was fine today, actually.', 'Wi-fi & plugs', 1, 'Remote workers'],
    ['Prices went up again, a cappuccino is R48 now.', 'Price', -1, 'Students'],
    ['A student discount would make me come every day.', 'Price', -1, 'Students'],
    ['Pricey but you get what you pay for.', 'Price', 1, 'Regulars'],
    ['The baristas know my order, that’s why I keep coming back.', 'Staff', 1, 'Regulars'],
    ['Super friendly staff, always a smile.', 'Staff', 1, 'Students'],
    ['One barista was rude when I asked for oat milk.', 'Staff', -1, 'Students'],
    ['Pastries are often sold out by 10.', 'Food', -1, 'Remote workers'],
    ['The banana bread is incredible.', 'Food', 1, 'Regulars'],
    ['Wish there were more vegan options.', 'Food', -1, 'Students'],
    ['Loyalty card is great, my tenth coffee is free.', 'Loyalty', 1, 'Regulars'],
    ['Lost my paper loyalty card again, an app would be better.', 'Loyalty', -1, 'Students'],
    ['Long wait for takeaway even when it’s quiet inside.', 'Morning wait', -1, 'Commuters'],
    ['Music too loud to take calls.', 'Wi-fi & plugs', -1, 'Remote workers'],
    ['The coffee is the reason I come, honestly.', 'Coffee quality', 1, 'Students'],
  ];
  const SEGMENTS = ['All customers', 'Regulars', 'Commuters', 'Remote workers', 'Students'];
  const QUESTIONS = {
    more: { q: 'What would make you come more often?', pick: (rows) => rows.filter((r) => r[2] < 0) },
    annoy: { q: 'What annoys you most?', pick: (rows) => rows.filter((r) => r[2] < 0) },
    love: { q: 'What do you love about us?', pick: (rows) => rows.filter((r) => r[2] > 0) },
    leave: { q: 'Why would you go somewhere else?', pick: (rows) => rows.filter((r) => r[2] < 0) },
  };
  function insightDemo(root) {
    const themesEl = $('[data-in-themes]', root), quotes = $('[data-in-quotes]', root), ans = $('[data-in-answer]', root), segSel = $('[data-in-seg]', root), run = runner();
    const rowsFor = (seg) => FEEDBACK.filter((r) => seg === 'All customers' || r[3] === seg);
    const themes = (rows) => {
      const t = {}; rows.forEach(([, th, s]) => { t[th] = t[th] || { pos: 0, neg: 0 }; s > 0 ? t[th].pos++ : t[th].neg++; });
      return Object.entries(t).map(([k, v]) => ({ k, ...v, n: v.pos + v.neg })).sort((a, b) => b.n - a.n || b.neg - a.neg);
    };
    const drawThemes = () => {
      const rows = rowsFor(segSel.value), ts = themes(rows), max = Math.max(...ts.map((t) => t.n), 1);
      $('[data-in-count]', root).textContent = rows.length + ' comments';
      themesEl.innerHTML = ts.map((t) => '<li><button type="button" data-theme="' + esc(t.k) + '"><span>' + esc(t.k) + '</span><i class="in-bar" style="--w:' + (t.n / max * 100) + '%"><i class="in-neg" style="--w:' + (t.neg / t.n * 100) + '%"></i></i><b>' + t.n + '</b></button></li>').join('');
    };
    const showTheme = (k) => {
      const rows = rowsFor(segSel.value).filter((r) => r[1] === k);
      quotes.innerHTML = '<h4>' + esc(k) + '</h4><ul>' + rows.map((r) => '<li class="' + (r[2] > 0 ? 'is-pos' : 'is-neg') + '">“' + esc(r[0]) + '” <em>' + esc(r[3]) + '</em></li>').join('') + '</ul>';
    };
    const answer = async (key) => {
      const seg = segSel.value, rows = QUESTIONS[key].pick(rowsFor(seg)), tok = run.next();
      if (!rows.length) { ans.innerHTML = '<p>Not enough comments from ' + esc(seg.toLowerCase()) + ' to answer that honestly.</p>'; return; }
      const ts = themes(rows), top = ts[0], cites = rows.filter((r) => r[1] === top.k).slice(0, 2);
      const who = seg === 'All customers' ? 'your customers' : seg.toLowerCase();
      const lead = key === 'love'
        ? 'From ' + who + ': it’s the ' + top.k.toLowerCase() + '. ' + top.n + ' of ' + rows.length + ' positive comments mention it.'
        : 'From ' + who + ': ' + top.k.toLowerCase() + '. It comes up in ' + top.n + ' of ' + rows.length + ' critical comments' + (ts[1] ? ', ahead of ' + ts[1].k.toLowerCase() + ' (' + ts[1].n + ')' : '') + '.';
      ans.innerHTML = '<p class="in-q">' + esc(QUESTIONS[key].q) + '</p><p data-a></p><ul class="in-cite">' + cites.map((c) => '<li>“' + esc(c[0]) + '”</li>').join('') + '</ul>';
      await type($('[data-a]', ans), lead, run, tok, 60);
      track('aidemo', { demo: 'insight' });
    };
    themesEl.addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (b) showTheme(b.dataset.theme); });
    segSel.addEventListener('change', () => { drawThemes(); quotes.innerHTML = ''; ans.innerHTML = ''; });
    $$('[data-in-ask]', root).forEach((b) => b.addEventListener('click', () => answer(b.dataset.inAsk)));
    const free = $('[data-in-free]', root);
    free.addEventListener('submit', (e) => {
      e.preventDefault(); const q = free.q.value.toLowerCase();
      const key = /love|like|best|good|why.*come/.test(q) ? 'love' : /leave|else|switch|competitor|stop/.test(q) ? 'leave' : /annoy|hate|worst|problem|bad|complain/.test(q) ? 'annoy' : 'more';
      answer(key);
    });
    segSel.innerHTML = SEGMENTS.map((s) => '<option>' + esc(s) + '</option>').join('');
    drawThemes();
  }

  /* ================= 6. Content creator ================= */
  const KINDS = {
    product: { label: 'A new product or service', ask: 'What is it?', def: 'same-day delivery for orders before 11am' },
    tip: { label: 'A useful tip', ask: 'The tip', def: 'order printer toner before it runs out, not after' },
    story: { label: 'A customer story', ask: 'What happened?', def: 'a school in Soweto cut its stationery costs by 18%' },
    event: { label: 'An event', ask: 'What and when?', def: 'our open day on Saturday 18 October' },
  };
  const OPEN = { Professional: ['We’re pleased to share', 'Announcing', 'An update from'], Friendly: ['Good news!', 'Guess what?', 'Quick one for you:'], Bold: ['Stop waiting.', 'This changes things.', 'Big news.'] };
  const LIMIT = { LinkedIn: 1300, Instagram: 2200, Email: 900, Facebook: 900 };
  function contentDemo(root) {
    const f = $('[data-cc-form]', root), outEl = $('[data-cc-out]', root), checks = $('[data-cc-checks]', root), run = runner(); let variant = 0;
    const sel = f.kind;
    sel.innerHTML = Object.entries(KINDS).map(([k, v]) => '<option value="' + k + '">' + esc(v.label) + '</option>').join('');
    const syncAsk = () => { $('[data-cc-ask]', root).textContent = KINDS[sel.value].ask; f.detail.placeholder = 'e.g. ' + KINDS[sel.value].def; };
    sel.addEventListener('change', syncAsk); syncAsk();
    const compose = () => {
      const biz = f.biz.value.trim() || 'Atlas Office Supplies', k = sel.value, d = (f.detail.value.trim() || KINDS[k].def).replace(/\.$/, ''), ch = f.channel.value, tone = f.tone.value;
      const o = OPEN[tone][variant % 3], tag = '#' + biz.replace(/[^A-Za-z0-9]/g, '');
      const body = {
        product: [o + ' ' + d + ' at ' + biz + '.', 'We built it because our customers kept telling us the same thing: waiting costs them time they don’t have.', 'Here’s how it works, and what it means for you.'],
        tip: [o + ' ' + d + '.', 'It sounds small. Across a year it’s the difference between a smooth week and three emergency orders.', 'One habit, less stress. From the team at ' + biz + '.'],
        story: [o + ' ' + d + '.', 'They started by looking at where the money actually went, then changed two things. The rest followed.', 'Proud to have played a part. ' + biz + '.'],
        event: [o + ' ' + d + '.', 'Come and meet the team, see what’s new and ask us anything.', 'We’d love to see you there. ' + biz + '.'],
      }[k];
      const cta = { LinkedIn: 'What would you add? Tell us in the comments.', Instagram: 'Save this for later ↓', Email: 'Reply to this email and we’ll set it up for you.', Facebook: 'Tag someone who needs to see this.' }[ch];
      const tags = ch === 'Instagram' ? '\n\n' + tag + ' #SmallBusiness #SouthAfrica #Tips' : ch === 'LinkedIn' ? '\n\n' + tag + ' #SmallBusiness' : '';
      const subject = ch === 'Email' ? 'Subject: ' + (k === 'event' ? 'You’re invited' : k === 'tip' ? 'One small habit that saves a week' : 'Something new from ' + biz) + '\n\n' : '';
      return { text: subject + body.join(ch === 'Instagram' ? '\n.\n' : '\n\n') + '\n\n' + cta + tags, ch, cta };
    };
    const gen = async () => {
      const tok = run.next(), r = compose(); track('aidemo', { demo: 'content' });
      outEl.classList.add('is-writing'); await type(outEl, r.text, run, tok, 220); outEl.classList.remove('is-writing');
      if (!run.live(tok)) return;
      const len = r.text.length, ok = len <= LIMIT[r.ch];
      checks.innerHTML = [
        [ok, 'Length ' + len + ' / ' + LIMIT[r.ch] + ' for ' + r.ch],
        [true, 'Ends with a call to action'],
        [!/!!|\b(very|really)\b/i.test(r.text), 'No filler words or double exclamation marks'],
        [true, 'Tone: ' + f.tone.value],
      ].map(([pass, t]) => '<li class="' + (pass ? 'is-ok' : 'is-warn') + '">' + esc(t) + '</li>').join('');
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); variant = 0; gen(); });
    $('[data-cc-again]', root).addEventListener('click', () => { variant++; gen(); });
    $('[data-cc-copy]', root).addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(outEl.textContent); e.currentTarget.textContent = 'Copied'; } catch (ex) { /* ignore */ } });
  }

  /* ================= 7. RAG over sample documents ================= */
  const DOCS = [
    { id: 'leave', title: 'Leave policy', sections: [
      ['Annual leave', 'Permanent staff get 18 working days of annual leave a year, accrued monthly. Leave must be requested in the HR portal at least 5 working days in advance and approved by your line manager.'],
      ['Sick leave', 'You get 30 days of paid sick leave over a three-year cycle. For more than two consecutive days, or on a Monday or Friday, a medical certificate is required.'],
      ['Family responsibility', 'Three days of family responsibility leave are available each year for the birth of a child, illness of a child, or the death of a close family member.'],
      ['Carry-over', 'Up to 5 days of unused annual leave can be carried over into the first quarter of the next year. Anything above that is forfeited unless the MD approves in writing.'] ] },
    { id: 'expenses', title: 'Expense policy', sections: [
      ['Claims', 'Submit expense claims with receipts in the finance app within 30 days. Claims older than 60 days are not paid.'],
      ['Travel', 'Business mileage is reimbursed at R4.84 per kilometre. Flights must be booked through the travel desk; economy class only for flights under four hours.'],
      ['Meals', 'Client meals are reimbursed up to R450 per person, with the client’s name and company on the claim. Alcohol is not reimbursed.'],
      ['Approvals', 'Expenses up to R2,500 are approved by your line manager; above R2,500 the department head must also approve.'] ] },
    { id: 'returns', title: 'Returns & warranty', sections: [
      ['Returns', 'Customers may return unused stock in its original packaging within 30 days with proof of purchase for a full refund. Opened consumables (ink, toner) cannot be returned.'],
      ['Faulty goods', 'Faulty goods are replaced or refunded within 6 months of purchase, in line with the Consumer Protection Act. Log the fault on the returns form with the serial number.'],
      ['Warranty', 'Office furniture carries a 5-year manufacturer warranty; electronics carry 12 months. Warranty claims go to the supplier via the returns desk.'] ] },
    { id: 'delivery', title: 'Delivery SOP', sections: [
      ['Cut-off', 'Orders confirmed before 11:00 on a weekday are delivered the same day within Johannesburg and Pretoria. Later orders go out the next working day.'],
      ['Fees', 'Delivery is free on orders over R1,500. Below that, a R95 delivery fee applies. Outlying areas are quoted separately.'],
      ['Failed delivery', 'If nobody is available to sign, the driver photographs the premises, calls the customer, and the order is re-delivered the next day at no charge.'] ] },
    { id: 'it', title: 'IT & security', sections: [
      ['Passwords', 'Passwords must be at least 12 characters and are changed every 90 days. Multi-factor authentication is mandatory on email and the finance app.'],
      ['Lost devices', 'Report a lost or stolen laptop or phone to IT within 2 hours so it can be wiped remotely. Also open a case with SAPS and send the case number to IT.'],
      ['Personal data', 'Customer personal information may only be stored in the CRM, never in personal drives or WhatsApp groups, in line with POPIA.'] ] },
  ];
  const STOP = new Set('a an the of to in on for and or is are was be can i we you my our it its with at by from how what when who do does much many if any there this that as get have has into per not no up'.split(' '));
  const stem = (w) => w.replace(/(ings|ing|ied|ies|es|s|ed)$/,'') || w;
  const toks = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);
  function ragDemo(root) {
    const run = runner();
    const chunks = []; DOCS.forEach((d) => d.sections.forEach(([h, t]) => chunks.push({ doc: d.id, title: d.title, h, t, toks: toks(h + ' ' + h + ' ' + t) })));
    const N = chunks.length, avg = chunks.reduce((a, c) => a + c.toks.length, 0) / N, df = {};
    chunks.forEach((c) => new Set(c.toks).forEach((w) => { df[w] = (df[w] || 0) + 1; }));
    const idf = (w) => Math.log(1 + (N - (df[w] || 0) + 0.5) / ((df[w] || 0) + 0.5));
    const bm25 = (q, c) => { const k1 = 1.4, b = 0.75; let s = 0; q.forEach((w) => { const tf = c.toks.filter((x) => x === w).length; if (tf) s += idf(w) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * c.toks.length / avg)); }); return s; };
    const lib = $('[data-rag-docs]', root), steps = $('[data-rag-steps]', root), f = $('[data-rag-form]', root);
    lib.innerHTML = DOCS.map((d) => '<label><input type="checkbox" value="' + d.id + '" checked /> <span>' + esc(d.title) + '<small>' + d.sections.length + ' sections</small></span></label>').join('');
    const hl = (text, q) => esc(text).replace(/[A-Za-z0-9]+/g, (w) => (q.includes(stem(w.toLowerCase())) ? '<mark>' + w + '</mark>' : w));
    const ask = async (question) => {
      const tok = run.next(), q = toks(question), allowed = $$('input:checked', lib).map((i) => i.value);
      track('aidemo', { demo: 'rag' });
      steps.innerHTML = '<li class="rag-step is-on"><b>1 · Searching</b><span>Looking through ' + allowed.length + ' document' + (allowed.length === 1 ? '' : 's') + '…</span></li>';
      await wait(1200); if (!run.live(tok)) return;
      const ranked = chunks.filter((c) => allowed.includes(c.doc)).map((c) => ({ c, s: bm25(q, c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
      const top = ranked[0], found = top && top.s >= 1.6;
      steps.insertAdjacentHTML('beforeend', '<li class="rag-step is-on"><b>2 · Found</b>' + (found ? '<ol class="rag-hits"><li><em>' + esc(top.c.title) + ' › ' + esc(top.c.h) + '</em><p>' + hl(top.c.t, q) + '</p></li></ol>' : '<span>Nothing in the documents covers this.</span>') + '</li>');
      await wait(1600); if (!run.live(tok)) return;
      const li = document.createElement('li'); li.className = 'rag-step is-on rag-answer'; steps.appendChild(li);
      if (!found) {
        li.innerHTML = '<b>3 · Answer</b><p>That isn’t in the documents I can see, so I won’t guess. Ask HR or the policy owner.' + (allowed.length < DOCS.length ? ' (Some documents are switched off on the left.)' : '') + '</p>';
        return;
      }
      // Split on a full stop followed by a capital, so "R4.84" stays whole.
      const sents = top.c.t.split(/(?<=\.)\s+(?=[A-Z])/);
      const best = sents.map((s) => ({ s, n: toks(s).filter((w) => q.includes(w)).length })).sort((a, b) => b.n - a.n);
      const pick = best[0].n ? [best[0].s.trim()] : [sents[0].trim()];
      if (best[1] && best[1].n >= Math.max(1, best[0].n - 1)) pick.push(best[1].s.trim());
      li.innerHTML = '<b>3 · Answer</b><p data-a></p><span class="rag-src">Source: ' + esc(top.c.title) + ' › ' + esc(top.c.h) + '</span>';
      await type($('[data-a]', li), pick.join(' '), run, tok, 60);
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); const v = f.q.value.trim(); if (v) ask(v); });
    $$('[data-rag-ask]', root).forEach((b) => b.addEventListener('click', () => { f.q.value = b.textContent; ask(b.textContent); }));
  }


  /* ================= 8. Connected systems ================= */
  // One item comes in; the AI reads it and updates each system in turn. Each system
  // fills at step `at`; `flag` marks a mismatch held back for a person; `done` is
  // what the tile shows once a person approves.
  const SYS = {
    invoice: {
      kind: 'Email', from: 'Delta Packaging (supplier)', subject: 'Invoice for October',
      body: 'Please find our invoice for R48,276.50 attached, for the boxes and tape you ordered.', attach: 'Invoice.pdf',
      steps: ['Reads the email and the invoice', 'Checks it against what you ordered: 12 boxes billed, but only 10 arrived', 'Types the invoice into your accounts', 'Adds it to your spending sheet', 'Asks your finance manager to approve'],
      systems: [
        { name: 'Orders', at: 1, state: 'Problem found', flag: true, rows: [['Ordered', 'Boxes and tape'], ['Problem', 'Billed 12 boxes, 10 arrived']], done: ['Supplier asked', [['Problem', 'Supplier asked to correct it']]] },
        { name: 'Accounts', at: 2, state: 'Ready to pay', rows: [['Supplier', 'Delta Packaging'], ['Amount', 'R48,276.50'], ['Status', 'Waiting for approval']], done: ['Approved', [['Status', 'Approved, boxes line on hold']]] },
        { name: 'Spending sheet', at: 3, state: 'Row added', rows: [['Added', 'Packaging, October'], ['Amount', 'R48,276.50']] },
        { name: 'Team chat', at: 4, state: 'Message sent', rows: [['To', 'Finance manager'], ['Message', 'Please approve. One line queried.']], done: ['Approved', [['Message', 'Approved, 09:42']]] },
      ],
      approve: 'Approve', before: '12 min', after: '1 min', metric: 'per invoice, instead of typing it into 3 places',
    },
    enquiry: {
      kind: 'Website form', from: 'Lerato Mokoena', subject: 'Office move',
      body: 'We are moving our office (14 people) to Rosebank on 28 November. Can you quote for packing and the move? 011 555 0123.', attach: '',
      steps: ['Reads the enquiry: a new customer, an office move, 28 November', 'Saves her as a new customer', 'Opens a job for the move', 'Finds a free time to see the office first', 'Writes the reply for you to send'],
      systems: [
        { name: 'Customer list', at: 1, state: 'Added', rows: [['Name', 'Lerato Mokoena'], ['Phone', '011 555 0123']] },
        { name: 'Jobs', at: 2, state: 'Job opened', rows: [['Job', 'Office move, 14 people'], ['Date', '28 Nov, Rosebank']] },
        { name: 'Calendar', at: 3, state: 'Time held', rows: [['Visit', 'Tue 18 Nov, 10:00'], ['Who', 'Sipho']], done: ['Booked', [['Visit', 'Tue 18 Nov, 10:00, confirmed']]] },
        { name: 'Email', at: 4, state: 'Reply written', rows: [['To', 'Lerato'], ['Reply', 'Thanks Lerato, we can do the 28th. Can Sipho see the office on Tue 18 Nov at 10:00?']], done: ['Sent', [['Reply', 'Sent, 09:44']]] },
      ],
      approve: 'Approve and send', before: '15 min', after: '2 min', metric: 'per enquiry, instead of typing it into 3 places',
    },
  };
  function systemsDemo(root) {
    const run = runner(); let key = 'invoice';
    const inEl = $('[data-sys-in]', root), steps = $('[data-sys-steps]', root), grid = $('[data-sys-grid]', root);
    const btn = $('[data-sys-run]', root), ok = $('[data-sys-approve]', root), metric = $('[data-sys-metric]', root);
    const rowsHtml = (rows, blank) => rows.map(([k, v]) => '<div data-k="' + esc(k) + '"><span>' + esc(k) + '</span><b>' + (blank ? '—' : esc(v)) + '</b></div>').join('');
    const draw = () => {
      const d = SYS[key];
      inEl.innerHTML = '<span class="sys__kind">' + esc(d.kind) + '</span><b>' + esc(d.from) + '</b><i>' + esc(d.subject) + '</i><p>' + esc(d.body) + '</p>' + (d.attach ? '<span class="sys__att">' + esc(d.attach) + '</span>' : '');
      steps.innerHTML = '';
      grid.innerHTML = d.systems.map((x, i) => '<div class="sys__tile" data-i="' + i + '"><div class="sys__th"><b>' + esc(x.name) + '</b><span class="sys__st">Waiting</span></div><div class="sys__rows">' + rowsHtml(x.rows, true) + '</div></div>').join('');
      metric.hidden = true; ok.hidden = true; ok.disabled = false; ok.textContent = d.approve;
      btn.textContent = 'Run it'; btn.disabled = false;
    };
    const fill = (i) => {
      const x = SYS[key].systems[i], t = $('.sys__tile[data-i="' + i + '"]', grid);
      $('.sys__rows', t).innerHTML = rowsHtml(x.rows, false);
      $('.sys__st', t).textContent = x.state; t.classList.add(x.flag ? 'is-flag' : 'is-done');
      $$('.sys__tile', grid).forEach((y) => y.classList.toggle('is-now', y === t));
    };
    btn.addEventListener('click', async () => {
      const d = SYS[key], tok = run.next(); draw(); btn.disabled = true; btn.textContent = 'Working…'; track('aidemo', { demo: 'systems', pick: key });
      for (let s = 0; s < d.steps.length; s++) {
        if (!run.live(tok)) return;
        $$('li', steps).forEach((x) => x.classList.remove('is-now'));
        const li = document.createElement('li'); li.className = 'is-now'; li.innerHTML = '<span></span>'; steps.appendChild(li);
        await type($('span', li), d.steps[s], run, tok, 45);
        d.systems.forEach((x, i) => { if (x.at === s) fill(i); });
        await wait(1300);
      }
      if (!run.live(tok)) return;
      $$('.is-now', root).forEach((x) => x.classList.remove('is-now'));
      metric.innerHTML = '<s>' + esc(d.before) + '</s> <b>' + esc(d.after) + '</b> <span>' + esc(d.metric) + '</span>'; metric.hidden = false;
      ok.hidden = false; btn.textContent = 'Run again'; btn.disabled = false;
    });
    ok.addEventListener('click', () => {
      const d = SYS[key]; run.next(); ok.disabled = true; ok.textContent = 'Done';
      d.systems.forEach((x, i) => {
        if (!x.done) return; const t = $('.sys__tile[data-i="' + i + '"]', grid);
        $('.sys__st', t).textContent = x.done[0]; t.classList.remove('is-flag'); t.classList.add('is-done', 'is-final');
        x.done[1].forEach(([k, v]) => { const r = $('[data-k="' + k + '"] b', t); if (r) r.textContent = v; });
      });
      track('aidemo', { demo: 'systems', step: 'approve' });
    });
    $$('[data-sys-pick]', root).forEach((b) => b.addEventListener('click', () => { run.next(); key = b.dataset.sysPick; $$('[data-sys-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
    draw();
  }

  const MOUNT = { meeting: meetingDemo, crm: crmDemo, call: callDemo, insight: insightDemo, content: contentDemo, rag: ragDemo, systems: systemsDemo };
  $$('[data-aidemo]').forEach((el) => { const fn = MOUNT[el.dataset.aidemo]; if (fn) { try { fn(el); } catch (e) { console.error('ai demo', el.dataset.aidemo, e); } } });

  // "More examples" is folded; open it when a link points inside it.
  const more = $('[data-aid-more]');
  const openFor = () => { const id = location.hash.slice(1); const t = id && document.getElementById(id); if (more && t && more.contains(t) && !more.open) { more.open = true; t.scrollIntoView(); } };
  if (more) { openFor(); window.addEventListener('hashchange', openFor); }

  // Jump nav highlights the demo in view.
  const links = $$('.aid-nav a');
  if (links.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
    $$('.aid-sec').forEach((s) => io.observe(s));
  }
})();

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
