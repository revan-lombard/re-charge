// Re-Charge admin panel — Phase A (see ADMIN.md).
// Plain ES module, no framework. All data access goes through api.js (real
// Supabase, under RLS) or mock.js (?mock=1, demo data, no network).
// Every piece of database text is rendered through esc() — form submissions
// are untrusted input and must never become markup.

const CFG = window.RECHARGE_CONFIG || {};
const $ = (id) => document.getElementById(id);
const view = $("view");
const params = new URLSearchParams(location.search);
const MOCK = params.get("mock") === "1";

// ---------- pipeline vocabulary ----------
const STAGES = [
  ["prospect", "Prospect", "outreach"], ["contacted", "Contacted", "outreach"],
  ["new", "New lead", "leads"], ["deposit_paid", "Deposit paid", "leads"],
  ["under_review", "Under review", "scoping"], ["clarification", "Clarification", "scoping"], ["quote_sent", "Quote sent", "scoping"],
  ["approved", "Approved", "build"], ["in_development", "In development", "build"], ["client_review", "Client review", "build"], ["final_payment", "Final payment", "build"],
  ["live", "Live", "done"], ["care", "Care", "done"],
  ["declined", "Declined", "declined"],
];
const STAGE = Object.fromEntries(STAGES.map(([k, label, group]) => [k, { label, group }]));
const GROUPS = [["outreach", "Outreach"], ["leads", "Leads"], ["scoping", "Scoping"], ["build", "Build"], ["done", "Done"]];
const OPEN = new Set(STAGES.filter(([, , g]) => g !== "done" && g !== "declined").map(([k]) => k));
const SOURCES = { website: "Website", call: "Call request", mockup: "Mockup request", outreach: "Outreach", referral: "Referral", whatsapp: "WhatsApp", phone: "Phone", other: "Other" };
const DETAIL_LABELS = {
  formType: "Form", projectType: "Project type", features: "Features", callDay: "Call day", callTime: "Time",
  callNote: "Note", mkAbout: "About", mkInclude: "Should include", mkStyle: "Style reference", attachments: "Attachments",
  pages: "Pages", audience: "Audience", examples: "Examples", extra: "Extra", timeline: "Timeline", hosting: "Hosting",
};
const HIDE_DETAIL = new Set(["formType", "submittedAt", "page", "type", "callName", "callEmail", "callPhone", "mkBusiness", "mkEmail", "mkPhone", "category"]);

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents) => { if (cents == null) return "—"; const c = Math.round(Number(cents)); const whole = Math.trunc(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); return (c < 0 ? "-R" : "R") + whole + (c % 100 ? "." + pad(Math.abs(c) % 100) : ""); };
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtDT(iso) { if (!iso) return ""; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtD(iso) { if (!iso) return ""; const d = new Date(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function rel(iso) {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000, a = Math.abs(s), f = s >= 0 ? "ago" : "from now";
  if (a < 60) return "just now";
  if (a < 3600) return `${Math.round(a / 60)}m ${f}`;
  if (a < 86400) return `${Math.round(a / 3600)}h ${f}`;
  if (a < 86400 * 30) return `${Math.round(a / 86400)}d ${f}`;
  return fmtD(iso);
}
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "27" + d.slice(1);
  if (d.startsWith("270") && d.length === 12) d = "27" + d.slice(3);
  return d;
}
const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}${text ? "?text=" + encodeURIComponent(text) : ""}`;
const telLink = (phone) => "tel:+" + normPhone(phone);
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const sourceOf = (p) => p.source || (p.details?.formType === "Call request" ? "call" : p.details?.formType === "Free mockup request" ? "mockup" : "website");
const isCall = (p) => p.details?.formType === "Call request" && p.details?.callDay;
const isSnoozed = (p) => p.snoozed_until && Date.parse(p.snoozed_until) > Date.now();
const isActive = (p) => !p.archived && !p.spam;
const datetimeLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// "Tue 24 Sep" + the submission date → a real Date (year inferred).
function callDate(p) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})/.exec(p.details?.callDay || "");
  if (!m) return null;
  const mon = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (mon < 0) return null;
  const base = new Date(p.created_at);
  let d = new Date(base.getFullYear(), mon, Number(m[1]));
  if (d < new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1)) d = new Date(base.getFullYear() + 1, mon, Number(m[1]));
  const slot = /^(\d{2}):(\d{2})/.exec((p.details?.callTime || "").replace(/^[^(]*\(/, ""));
  d.setHours(slot ? Number(slot[1]) : 9, slot ? Number(slot[2]) : 0, 0, 0);
  return d;
}
function icsFor(p) {
  const start = callDate(p); if (!start) return "";
  const end = new Date(start.getTime() + 3600e3);
  const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const clean = (s) => String(s || "").replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Re-Charge//Admin//EN", "BEGIN:VEVENT",
    `UID:${p.id}@re-charge.co.za`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
    `SUMMARY:${clean("Call " + (p.name || p.business || p.ref))}`,
    `DESCRIPTION:${clean(`${p.ref}\n${p.business || ""}\nPhone: ${p.phone || ""}\n${p.details?.callTime || ""}\n${p.details?.callNote || ""}\nhttps://re-charge.co.za/admin/#/p/${p.id}`)}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
// CSV cell: quoted, and spreadsheet-formula characters neutralised (=,+,-,@ at the start would execute in Excel).
const csvCell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let toastTimer;
function toast(msg, isError = false) {
  const t = $("toast"); t.textContent = msg; t.classList.toggle("is-error", isError); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2600);
}
const stageChip = (s) => `<span class="chip chip--stage" data-group="${STAGE[s]?.group || "leads"}">${esc(STAGE[s]?.label || s)}</span>`;
const srcChip = (p) => { const camp = p.channel && S.campaigns.find((c) => c.code === p.channel); if (camp) return `<span class="chip chip--src" title="Campaign">📣 ${esc(camp.name)}</span>`; return sourceOf(p) === "website" ? "" : `<span class="chip chip--src">${esc(SOURCES[sourceOf(p)] || sourceOf(p))}</span>`; };
const catChips = (p) => (p.category || []).filter((c) => !/request$/i.test(c)).slice(0, 3).map((c) => `<span class="chip">${esc(c)}</span>`).join("");

// ---------- state ----------
let api, session, me;
const S = { projects: [], payments: [], clients: [], templates: [], requests: [], time: [], campaigns: [], posts: [], sites: [], profile: {}, loaded: 0 };
async function loadAll(force = false) {
  if (!force && Date.now() - S.loaded < 15000) return;
  const [projects, payments, clients, templates, profile, requests, time, campaigns, posts] = await Promise.all([
    api.projects.list(), api.payments.list().catch(() => []), api.clients.list().catch(() => []),
    api.templates.list().catch(() => []), api.settings.get("profile").catch(() => null),
    api.requests.list().catch(() => []), api.events.byKind("time").catch(() => []),
    api.campaigns.list().catch(() => []), api.posts.list().catch(() => []),
  ]);
  S.campaigns = campaigns || []; S.posts = posts || [];
  S.sites = (await api.sites.list().catch(() => [])) || [];
  S.autobuild = (await api.settings.get("autobuild").catch(() => null)) || { auto_queue: false };
  S.projects = projects || []; S.payments = payments || []; S.clients = clients || [];
  S.templates = templates || []; S.profile = { ...DEFAULT_PROFILE, ...(profile || {}) };
  S.requests = requests || []; S.time = time || []; S.loaded = Date.now();
}
const KIND_LABEL = { deposit: "Deposit", balance: "Balance", care: "Care plan", other: "Other" };
const PLAN_LABEL = { hosting: "Hosting", care: "Hosting & Care", business: "Business Care" };
const paidAt = (x) => x.paid_at || x.created_at;
const clientById = (id) => S.clients.find((c) => c.id === id);
const minutesFor = (projectId) => S.time.filter((t) => t.project_id === projectId).reduce((a, t) => a + (Number(t.data?.minutes) || 0), 0);
const hours = (min) => (min / 60).toFixed(min % 60 ? 1 : 0) + "h";
const DEFAULT_PROFILE = { my_name: "", reply_to: "", signature: "", whatsapp: String(CFG.WHATSAPP_NUMBER || ""), bcc_me: true, review_link: "", deposit_link: String(CFG.DEPOSIT_PAYMENT_URL || "") };
const byId = (id) => S.projects.find((p) => p.id === id);
function related(p) {
  const e = (p.email || "").toLowerCase(), ph = normPhone(p.phone);
  return S.projects.filter((o) => o.id !== p.id && !o.spam && ((e && (o.email || "").toLowerCase() === e) || (ph && normPhone(o.phone) === ph)));
}

// ---------- boot ----------
boot().catch((e) => { $("bootMsg").hidden = false; $("bootMsg").textContent = "Could not start: " + e.message; console.error(e); });

async function boot() {
  if (!MOCK && (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY)) {
    $("bootMsg").innerHTML = 'Admin is not configured yet — set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in <code>config.js</code>.';
    return;
  }
  api = MOCK ? await (await import("./mock.js")).createApi() : await (await import("./api.js")).createApi(CFG);
  if (MOCK) document.querySelector(".adm-tag").textContent = "Demo data";

  // magic-link landing: supabase-js reads the tokens from the hash; tidy the URL after.
  const fromLink = /access_token=|error=|type=magiclink/.test(location.hash);
  session = await api.auth.getSession();
  if (fromLink) history.replaceState(null, "", location.pathname + "#/");
  api.auth.onChange((s) => { const was = Boolean(session); session = s; if (Boolean(s) !== was) gate(); });

  $("signOut").addEventListener("click", async () => { await api.auth.signOut(); location.hash = "#/"; location.reload(); });
  $("searchForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("searchInput").value.trim(); if (q) location.hash = "#/search?q=" + encodeURIComponent(q); });
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("searchInput").focus(); $("searchInput").select(); } });
  window.addEventListener("hashchange", route);
  await gate();
}

async function gate() {
  const bm = $("bootMsg"); if (bm) bm.hidden = true;
  const signedIn = Boolean(session);
  $("signOut").hidden = !signedIn; $("whoami").hidden = !signedIn; $("adminNav").hidden = true; $("searchForm").hidden = true;
  if (!signedIn) { me = null; return renderSignIn(); }
  $("whoami").textContent = session.user.email;
  let staff = false;
  try { staff = await api.auth.isStaff(session.user.id); } catch (e) { console.error(e); }
  if (!staff) return renderNotStaff();
  me = session.user;
  $("adminNav").hidden = false; $("searchForm").hidden = false;
  await route();
}

function renderSignIn() {
  view.innerHTML = `
  <section class="adm-center">
    <div class="card">
      <span class="eyebrow">Re-Charge admin</span>
      <h1>Sign in</h1>
      <p class="muted small" id="signInIntro">Enter your email. We'll send a one-time link and a 6-digit code.</p>
      <form id="signInForm" class="form" novalidate>
        <input type="email" id="signInEmail" placeholder="you@example.com" autocomplete="email" required />
        <button class="btn btn--primary btn--full" type="submit">Send sign-in email</button>
      </form>
      <form id="codeForm" class="form" novalidate hidden>
        <p class="small muted" style="margin:0">Sent to <b id="codeEmail"></b>. Type the 6-digit code from the email here, or click the link in it on this device.</p>
        <input type="text" id="signInCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="8" placeholder="123456" aria-label="6-digit code" style="font-family:var(--font-mono);letter-spacing:0.25em;text-align:center;font-size:1.3rem" />
        <button class="btn btn--primary btn--full" type="submit">Verify code</button>
        <button class="btn btn--ghost btn--small" type="button" id="codeBack">Use a different email</button>
      </form>
      <p class="small muted" id="signInMsg" hidden style="margin-top:0.6rem"></p>
    </div>
  </section>`;
  const msg = $("signInMsg"), say = (t, err) => { msg.hidden = false; msg.textContent = t; msg.classList.toggle("adm-error", Boolean(err)); };
  let email = "";
  $("signInForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    email = $("signInEmail").value.trim(); if (!email) return;
    const btn = e.target.querySelector("button"); btn.disabled = true; say("Sending…");
    try {
      await api.auth.signIn(email);
      $("signInForm").hidden = true; $("signInIntro").hidden = true; $("codeForm").hidden = false; $("codeEmail").textContent = email;
      say("Email sent. It can take a minute — check spam too."); setTimeout(() => $("signInCode").focus(), 50);
    } catch (err) { say("Could not send: " + err.message, true); btn.disabled = false; }
  });
  $("codeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("signInCode").value.replace(/\D/g, ""); if (code.length < 6) return say("Enter the 6-digit code from the email.", true);
    const btn = e.target.querySelector("button"); btn.disabled = true; say("Checking…");
    try { await api.auth.verifyCode(email, code); say("Signed in."); }
    catch (err) { say("That code didn't work: " + err.message + ". Codes expire after a while — request a new one if needed.", true); btn.disabled = false; }
  });
  $("codeBack").addEventListener("click", () => { $("codeForm").hidden = true; $("signInForm").hidden = false; $("signInIntro").hidden = false; $("signInForm").querySelector("button").disabled = false; msg.hidden = true; });
}
function renderNotStaff() {
  view.innerHTML = `
  <section class="adm-center">
    <div class="card">
      <span class="eyebrow">Re-Charge admin</span>
      <h1>Not authorised</h1>
      <p class="muted small">This account (${esc(session.user.email)}) isn't on the staff list. If this is you, add your user to the <code>staff</code> table (see ADMIN.md §8), then reload.</p>
      <div class="btn-row" style="margin-top:0.9rem"><button class="btn btn--ghost btn--small" id="nsOut">Sign out</button><a class="btn btn--primary btn--small" href="/admin/">Reload</a></div>
    </div>
  </section>`;
  $("nsOut").addEventListener("click", async () => { await api.auth.signOut(); location.reload(); });
}

// ---------- router ----------
let routeSeq = 0;
async function route() {
  if (!me) return;
  const mySeq = ++routeSeq;
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const q = new URLSearchParams(qs || "");
  const seg = path.split("/").filter(Boolean);
  const navKey = seg[0] === "c" ? "clients" : (seg[0] || "overview");
  const underMore = ["calls", "clients", "c", "templates", "settings", "money", "marketing", "sites", "more"].includes(navKey) && !matchMedia("(min-width: 900px)").matches;
  document.querySelectorAll("#adminNav a").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === navKey || (underMore && a.dataset.nav === "more")));
  view.innerHTML = '<p class="muted adm-boot">Loading…</p>';
  try {
    await loadAll(seg[0] === "p" ? false : true);
    if (mySeq !== routeSeq) return;   // a newer navigation superseded this one
    if (!seg.length) await renderOverview();
    else if (seg[0] === "pipeline") renderPipeline(q);
    else if (seg[0] === "p" && seg[1]) await renderProject(seg[1]);
    else if (seg[0] === "add") renderAdd(q);
    else if (seg[0] === "calls") renderCalls();
    else if (seg[0] === "clients") seg[1] === "new" ? renderClientEditor(null, q) : renderClients();
    else if (seg[0] === "c" && seg[1]) { if (!clientById(seg[1])) view.innerHTML = '<p class="adm-error">Client not found.</p>'; else if (seg[2] === "edit") renderClientEditor(clientById(seg[1]), q); else await renderClient(seg[1]); }
    else if (seg[0] === "money") renderMoney(q);
    else if (seg[0] === "sites") seg[1] ? await renderSiteEditor(seg[1] === "new" ? null : S.sites.find((x) => x.id === seg[1]) || "missing", q) : renderSites(q);
    else if (seg[0] === "marketing") seg[1] === "post" ? await renderPostEditor(seg[2], q) : seg[1] === "campaign" ? renderCampaignEditor(seg[2], q) : renderMarketing(q);
    else if (seg[0] === "templates") renderTemplates(seg[1] || "", q);
    else if (seg[0] === "outreach") await renderOutreach(q);
    else if (seg[0] === "settings") renderSettings();
    else if (seg[0] === "more") renderMore();
    else if (seg[0] === "search") await renderSearch(q.get("q") || "");
    else location.hash = "#/";
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="adm-error">Something went wrong: ${esc(e.message)}</p>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
const projectRow = (p, extra = "") => `
  <a class="adm-row" href="#/p/${esc(p.id)}">
    <div class="adm-row__main">
      <div class="adm-row__title">${p.starred ? '<span class="star" aria-label="Starred">★</span>' : ""}<span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}${p.business && p.name ? `<span class="muted" style="font-weight:400">${esc(p.name)}</span>` : ""}</div>
      <div class="adm-row__sub">${esc(p.goal || p.details?.callNote || p.email || "")}</div>
      <div class="adm-row__meta">${stageChip(p.status)}${srcChip(p)}${catChips(p)}${extra}</div>
    </div>
    <div class="adm-row__side"><span title="${esc(fmtDT(p.updated_at))}">${esc(rel(p.updated_at))}</span>${p.quote_cents ? `<span>${money(p.quote_cents)}</span>` : ""}${p.next_action_at ? `<span class="${Date.parse(p.next_action_at) < Date.now() ? "adm-error" : ""}">⏰ ${esc(fmtD(p.next_action_at))}</span>` : ""}</div>
  </a>`;

// ---------- overview ----------
async function renderOverview() {
  const active = S.projects.filter(isActive);
  const som = startOfMonth().getTime(), now = Date.now(), eod = endOfToday().getTime();
  const newLeads = active.filter((p) => Date.parse(p.created_at) >= som && !["prospect", "contacted"].includes(p.status));
  const paysMonth = S.payments.filter((x) => x.status === "succeeded" && Date.parse(paidAt(x)) >= som);
  const revenue = paysMonth.reduce((a, x) => a + (x.amount_cents || 0), 0);
  const quotesOut = active.filter((p) => p.status === "quote_sent");
  const pipelineValue = active.filter((p) => OPEN.has(p.status)).reduce((a, p) => a + (p.quote_cents || 0), 0);
  const careClients = S.clients.filter((c) => c.care_active);

  const attention = [];
  for (const p of active) {
    if (isSnoozed(p)) continue;
    if (p.status === "new" && now - Date.parse(p.updated_at) > 86400e3) attention.push({ level: "warn", text: `New lead, no action for ${rel(p.updated_at).replace(" ago", "")}`, p });
    if (p.next_action_at && Date.parse(p.next_action_at) <= eod) attention.push({ level: Date.parse(p.next_action_at) < startOfToday() ? "bad" : "ok", text: `${Date.parse(p.next_action_at) < startOfToday() ? "Overdue" : "Due today"}: ${p.next_action || "follow up"}`, p });
  }
  for (const p of active) {
    if (p.build_status === "built") attention.push({ level: "ok", text: `Mockup built automatically — review it, then email the link`, p });
    if (p.build_status === "failed") attention.push({ level: "bad", text: `Automatic mockup failed — ${(p.build_log || "see the lead").slice(0, 80)}`, p });
    if (p.build_status === "building" && p.build_started_at && Date.now() - Date.parse(p.build_started_at) > 3 * 3600e3) attention.push({ level: "warn", text: "Mockup build seems stuck (over 3h) — it will be re-queued automatically", p });
  }
  const unmatched = S.payments.filter((x) => !x.project_id && x.status === "succeeded");
  const renewals = S.clients.filter((c) => c.care_active && c.care_renews_at && (Date.parse(c.care_renews_at) - now) < 30 * 86400e3);
  const calls = S.projects.filter((p) => isActive(p) && isCall(p)).map((p) => ({ p, d: callDate(p) })).filter((x) => x.d && x.d >= startOfToday()).sort((a, b) => a.d - b.d).slice(0, 4);
  const recent = await api.events.recent(20).catch(() => []);

  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Overview</span><h1>${greeting()}</h1></div>
    <div class="adm-head__actions"><a class="btn btn--primary btn--small" href="#/add">+ Add lead</a></div></div>
  <div class="adm-tiles">
    <div class="adm-tile"><span>New leads · month</span><b>${newLeads.length}</b></div>
    <div class="adm-tile"><span>Quotes out</span><b>${quotesOut.length}</b><small>${money(quotesOut.reduce((a, p) => a + (p.quote_cents || 0), 0))}</small></div>
    <div class="adm-tile"><span>Payments · month</span><b>${paysMonth.length}</b></div>
    <div class="adm-tile"><span>Revenue · month</span><b>${money(revenue)}</b></div>
    <div class="adm-tile"><span>Pipeline value</span><b>${money(pipelineValue)}</b><small>${active.filter((p) => OPEN.has(p.status)).length} open</small></div>
    <div class="adm-tile"><span>Care clients</span><b>${careClients.length}</b></div>
  </div>

  <section class="adm-section"><h2>Needs attention <span class="count">${attention.length + unmatched.length + renewals.length}</span></h2>
    <ul class="adm-list">
      ${attention.map((a) => `<li><a class="adm-row adm-row--attn" href="#/p/${esc(a.p.id)}"><span class="dot ${a.level}"></span><div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(a.p.ref)}</span>${esc(a.p.business || a.p.name || "—")}</div><div class="adm-row__sub">${esc(a.text)}</div></div><span class="btn btn--ghost btn--small">Open</span></a></li>`).join("")}
      ${unmatched.map((x) => `<li><div class="adm-row adm-row--attn"><span class="dot warn"></span><div class="adm-row__main"><div class="adm-row__title">Payment ${money(x.amount_cents)} · ${esc(x.email || x.reference || "unknown payer")}</div><div class="adm-row__sub">Yoco, ${esc(fmtDT(x.created_at))} — not matched to a project</div></div><button class="btn btn--ghost btn--small" data-match="${esc(x.id)}">Match</button></div></li>`).join("")}
      ${renewals.map((c) => `<li><a class="adm-row adm-row--attn" href="#/c/${esc(c.id)}"><span class="dot ok"></span><div class="adm-row__main"><div class="adm-row__title">${esc(c.name)}</div><div class="adm-row__sub">Care plan renews ${esc(fmtD(c.care_renews_at))} (${Math.max(0, Math.ceil((Date.parse(c.care_renews_at) - now) / 86400e3))} days)</div></div><span class="btn btn--ghost btn--small">Open</span></a></li>`).join("")}
      ${!attention.length && !unmatched.length && !renewals.length ? '<li class="adm-empty">All clear — nothing waiting on you.</li>' : ""}
    </ul></section>

  <section class="adm-section"><h2>Calls <span class="count">${calls.length}</span><a href="#/calls">All calls →</a></h2>
    <ul class="adm-list">${calls.length ? calls.map(callRow).join("") : '<li class="adm-empty">No calls scheduled.</li>'}</ul></section>

  <section class="adm-section"><h2>Recent activity</h2>
    <ul class="adm-timeline">${recent.length ? recent.map((e) => `<li data-kind="${esc(e.kind)}"><span class="tl-dot"></span><div><time>${esc(fmtDT(e.created_at))} · <a href="#/p/${esc(e.project_id)}">${esc(e.projects?.ref || "")}</a> ${esc(e.projects?.business || e.projects?.name || "")}</time><p>${esc(e.note || e.kind)}</p></div></li>`).join("") : '<li class="adm-empty">No activity yet.</li>'}</ul></section>`;
  view.querySelectorAll("[data-match]").forEach((b) => b.addEventListener("click", () => matchPayment(b.dataset.match)));
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
async function matchPayment(id) {
  const ref = prompt("Match this payment to which project? Enter the ref (e.g. RC-00051):");
  if (!ref) return;
  const p = S.projects.find((x) => x.ref.toLowerCase() === ref.trim().toLowerCase());
  if (!p) return toast("No project with ref " + ref, true);
  try {
    const pay = await api.payments.match(id, p.id);
    await api.events.insert(p.id, "payment", `${money(pay.amount_cents)} payment matched manually`, { paymentId: id });
    if (pay.kind === "deposit" && !p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true, ...(["new", "prospect", "contacted"].includes(p.status) ? { status: "deposit_paid" } : {}) });
    toast("Payment matched to " + p.ref); await loadAll(true); route();
  } catch (e) { toast(e.message, true); }
}
const callRow = ({ p, d }) => `<li><div class="adm-row">
  <div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(p.ref)}</span>${esc(p.name || p.business || "—")}${p.business && p.name ? `<span class="muted" style="font-weight:400">· ${esc(p.business)}</span>` : ""}</div>
  <div class="adm-row__sub">${esc(fmtD(d))} · ${esc(p.details?.callTime || "")}${p.details?.callNote ? " — " + esc(p.details.callNote) : ""}</div>
  <div class="adm-inline-actions">${p.phone ? `<a class="btn btn--primary" href="${esc(telLink(p.phone))}">Call ${esc(p.phone)}</a>` : ""}<button class="btn btn--ghost" data-ics="${esc(p.id)}">Add to calendar</button><a class="btn btn--ghost" href="#/p/${esc(p.id)}">Open</a></div></div>
  <div class="adm-row__side">${d < endOfToday() && d >= startOfToday() ? "<span class=\"adm-error\">today</span>" : `<span>${esc(rel(d.toISOString()))}</span>`}</div></div></li>`;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ics]"); if (!b) return;
  const p = byId(b.dataset.ics); if (p) download(`call-${p.ref}.ics`, icsFor(p), "text/calendar");
});

// ---------- pipeline ----------
function renderPipeline(q) {
  const show = ["active", "archived", "spam"].includes(q.get("show")) ? q.get("show") : "active";
  const group = q.get("group") || "", cat = q.get("cat") || "", src = q.get("src") || "", text = (q.get("q") || "").toLowerCase();
  const mode = q.get("view") || localStorage.getItem("adm.pipeline.view") || (matchMedia("(min-width: 900px)").matches ? "board" : "list");
  try { localStorage.setItem("adm.pipeline.view", mode); } catch {}
  const cats = [...new Set(S.projects.flatMap((p) => p.category || []).filter((c) => !/request$/i.test(c)))].sort();
  let rows = S.projects.filter((p) => show === "spam" ? p.spam : show === "archived" ? (p.archived && !p.spam) : isActive(p));
  if (group) rows = rows.filter((p) => STAGE[p.status]?.group === group);
  else if (show === "active") rows = rows.filter((p) => p.status !== "declined");
  if (cat) rows = rows.filter((p) => (p.category || []).includes(cat));
  if (src) rows = rows.filter((p) => sourceOf(p) === src);
  if (text) rows = rows.filter((p) => [p.ref, p.name, p.business, p.email, p.phone, p.goal].join(" ").toLowerCase().includes(text));
  rows.sort((a, b) => (b.starred - a.starred) || b.updated_at.localeCompare(a.updated_at));
  const link = (k, v) => { const n = new URLSearchParams(q); v ? n.set(k, v) : n.delete(k); return "#/pipeline?" + n.toString(); };
  const sel = (name, opts, cur, label) => `<select aria-label="${label}" data-filter="${name}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Pipeline</span><h1>${rows.length} ${esc(show === "active" ? "open" : show)} ${rows.length === 1 ? "project" : "projects"}</h1></div>
    <div class="adm-head__actions"><button class="btn btn--ghost btn--small" id="exportCsv">Export CSV</button><a class="btn btn--primary btn--small" href="#/add">+ Add lead</a></div></div>
  <div class="adm-filters">
    ${sel("group", [...GROUPS, ["declined", "Declined"]], group, "All stages")}
    ${sel("cat", cats.map((c) => [c, c]), cat, "All categories")}
    ${sel("src", Object.entries(SOURCES), src, "All sources")}
    ${sel("show", [["active", "Active"], ["archived", "Archived"], ["spam", "Spam"]], show, "Active")}
    <input type="search" data-filter="q" value="${esc(q.get("q") || "")}" placeholder="Filter…" aria-label="Filter projects" />
    <div class="demo__seg" role="group" aria-label="View"><button type="button" data-view="list" class="${mode === "list" ? "is-active" : ""}">List</button><button type="button" data-view="board" class="${mode === "board" ? "is-active" : ""}">Board</button></div>
  </div>
  ${mode === "board" && show === "active" ? renderBoard(rows, group) : `<ul class="adm-list">${rows.length ? rows.map((p) => `<li>${projectRow(p)}</li>`).join("") : '<li class="adm-empty">Nothing here.</li>'}</ul>`}`;

  view.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener(el.tagName === "INPUT" ? "change" : "change", () => { location.hash = link(el.dataset.filter, el.value); }));
  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { location.hash = link("view", b.dataset.view); }));
  $("exportCsv").addEventListener("click", () => exportCsv(rows));
}
function renderBoard(rows, onlyGroup) {
  const groups = onlyGroup ? (onlyGroup === "declined" ? [["declined", "Declined"]] : GROUPS.filter(([g]) => g === onlyGroup)) : GROUPS;
  return `<div class="adm-board">${groups.map(([g, label]) => {
    const items = rows.filter((p) => STAGE[p.status]?.group === g);
    return `<div class="adm-col"><h3>${esc(label)} <span>${items.length}</span></h3><ul class="adm-list">${items.map((p) => `<li>${projectRow(p)}</li>`).join("") || '<li class="adm-empty tiny">—</li>'}</ul></div>`;
  }).join("")}</div>`;
}
function exportCsv(rows) {
  const cols = ["ref", "business", "name", "email", "phone", "category", "status", "source", "quote", "next_action", "next_action_at", "created_at", "updated_at", "goal"];
  const cell = csvCell;
  const lines = [cols.join(",")].concat(rows.map((p) => cols.map((c) => cell(
    c === "category" ? (p.category || []).join("; ") : c === "quote" ? (p.quote_cents != null ? p.quote_cents / 100 : "") : c === "source" ? sourceOf(p) : p[c])).join(",")));
  download(`re-charge-pipeline-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
}

// ---------- project detail ----------
async function renderProject(id) {
  let p = byId(id) || await api.projects.get(id);
  if (!p) { view.innerHTML = '<p class="adm-error">Project not found.</p>'; return; }
  const [events, msgs] = await Promise.all([api.events.list(id), api.messages.list(id).catch(() => [])]);
  const msgById = Object.fromEntries(msgs.map((m) => [m.id, m]));
  const pays = S.payments.filter((x) => x.project_id === id);
  const reqs = S.requests.filter((r) => r.project_id === id && r.status !== "cancelled");
  const client = p.client_id ? clientById(p.client_id) : null;
  const rel_ = related(p);
  const items = Array.isArray(p.quote_items) && p.quote_items.length ? p.quote_items : [{ desc: "", cents: p.quote_cents || 0 }];
  const mins = minutesFor(id);
  const d = p.details || {};
  const detailRows = Object.entries(d).filter(([k, v]) => !k.startsWith("_") && !HIDE_DETAIL.has(k) && v != null && String(v).trim() !== "")
    .map(([k, v]) => `<dt>${esc(DETAIL_LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()))}</dt><dd>${esc(typeof v === "string" ? v : JSON.stringify(v))}</dd>`).join("");
  const svg = { mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>', wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.2Z"/><path d="M9 9.5c.3 2.4 2.1 4.2 4.5 4.5l1-1 2 1-.5 1.5c-3.5.5-8-4-7.5-7.5L10 8l1 2Z"/></svg>', tel: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>' };

  view.innerHTML = `
  <div class="adm-head">
    <div><span class="eyebrow">${esc(p.ref)} · ${esc(SOURCES[sourceOf(p)] || "")} · ${esc(rel(p.created_at))}</span>
      <h1>${p.starred ? '<span class="star">★</span> ' : ""}${esc(p.business || p.name || "Untitled")}</h1>
      ${p.business && p.name ? `<p class="muted">${esc(p.name)}</p>` : ""}</div>
    <div class="adm-actions">
      <button class="btn btn--ghost" data-act="star" aria-pressed="${p.starred}">${p.starred ? "★ Starred" : "☆ Star"}</button>
      <select class="btn btn--ghost" data-act="snooze" aria-label="Snooze reminders"><option value="">${isSnoozed(p) ? "Snoozed until " + fmtD(p.snoozed_until) : "Snooze…"}</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option>${isSnoozed(p) ? '<option value="0">Unsnooze</option>' : ""}</select>
      <button class="btn btn--ghost" data-act="archive" aria-pressed="${p.archived}">${p.archived ? "Unarchive" : "Archive"}</button>
      ${p.spam ? '<button class="btn btn--ghost" data-act="unspam">Not spam</button>' : '<button class="btn btn--ghost" data-act="spam">Spam</button>'}
      <button class="btn btn--ghost" data-act="delete" style="color:var(--danger)">Delete</button>
    </div>
  </div>
  ${p.spam ? '<p class="adm-error tiny" style="margin-bottom:0.8rem">Marked as spam — hidden from the pipeline.</p>' : ""}
  <div class="adm-detail">
    <div>
      <div class="adm-card">
        <div class="pill-row">${stageChip(p.status)}${catChips(p)}${p.deposit_paid ? '<span class="chip" style="color:var(--ok);border-color:rgba(61,220,151,.4)">deposit paid</span>' : ""}</div>
        <dl class="adm-kv" style="margin-top:0.8rem">
          ${p.email ? `<dt>Email</dt><dd><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd>` : ""}
          ${p.phone ? `<dt>Phone</dt><dd>${esc(p.phone)}</dd>` : ""}
          ${p.budget ? `<dt>Budget</dt><dd>${esc(p.budget)}</dd>` : ""}
          ${p.deadline ? `<dt>Deadline</dt><dd>${esc(p.deadline)}</dd>` : ""}
          ${p.indicative_price ? `<dt>Indicative</dt><dd>${esc(p.indicative_price)}</dd>` : ""}
          ${p.channel ? `<dt>Channel</dt><dd>${esc(p.channel)}</dd>` : ""}
        </dl>
        <div class="adm-contact">
          ${p.email ? `<button type="button" class="btn btn--primary" data-compose="email">${svg.mail} Email</button>` : ""}
          ${p.phone ? `<button type="button" class="btn btn--ghost" data-compose="whatsapp">${svg.wa} WhatsApp</button><a class="btn btn--ghost" href="${esc(telLink(p.phone))}">${svg.tel} Call</a>` : ""}
        </div>
        ${rel_.length ? `<div class="adm-return"><span class="badge-return">Returning contact</span> Also appears as ${rel_.map((o) => `<a href="#/p/${esc(o.id)}">${esc(o.ref)}</a> <span class="muted">(${esc(STAGE[o.status]?.label || o.status)}, ${esc(rel(o.created_at))})</span>`).join(", ")}</div>` : ""}
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Submission <span class="muted">${esc(d.formType || "Project enquiry")}</span></h2>
        ${p.goal ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:0.8rem">${esc(p.goal)}</p>` : ""}
        ${detailRows ? `<dl class="adm-kv">${detailRows}</dl>` : (!p.goal ? '<p class="muted small">No details captured.</p>' : "")}
        ${isCall(p) ? `<div class="adm-inline-actions"><button class="btn btn--ghost" data-ics="${esc(p.id)}">Add call to calendar</button></div>` : ""}
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Payments <span class="muted">${pays.length ? money(pays.reduce((a, x) => a + (x.amount_cents || 0), 0)) + " received" : "none yet"}</span></h2>
        ${pays.length ? `<ul class="adm-timeline">${pays.map((x) => `<li data-kind="payment"><span class="tl-dot"></span><div><time>${esc(fmtDT(paidAt(x)))} · ${esc(x.provider)} · ${esc(KIND_LABEL[x.kind] || x.kind || "")}</time><p>${money(x.amount_cents)} ${esc(x.note || x.reference ? "— " + (x.note || x.reference) : "")}</p></div></li>`).join("")}</ul>` : ""}
        ${reqs.length ? `<h3 style="font-size:0.85rem;margin-top:0.8rem">Payment links</h3>${reqs.map((r) => `<div class="adm-req"><span>${money(r.amount_cents)} · ${esc(KIND_LABEL[r.kind] || r.kind)}${r.description ? " · " + esc(r.description) : ""} <span class="status-pill" data-s="${esc(r.status)}">${esc(r.status)}</span></span>${r.status === "open" && r.redirect_url ? `<span class="adm-inline-actions" style="margin:0"><button class="btn btn--ghost" data-copy="${esc(r.redirect_url)}">Copy link</button><button class="btn btn--ghost" data-emaillink="${esc(r.id)}">Email it</button><button class="btn btn--ghost" data-cancelreq="${esc(r.id)}">Cancel</button></span>` : ""}</div>`).join("")}` : ""}
        <div class="adm-inline-actions" style="margin-top:0.8rem"><button class="btn btn--primary" data-toggle="reqForm">Request payment</button><button class="btn btn--ghost" data-toggle="eftForm">Record EFT / cash</button></div>
        <form class="adm-form" id="reqForm" hidden style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid var(--border)">
          <div class="row2"><label>Amount<span class="money"><input name="amount" inputmode="decimal" required placeholder="3000" /></span></label><label>For<select name="kind"><option value="balance">Balance / final payment</option><option value="deposit">Deposit</option><option value="care">Care plan</option><option value="other">Other</option></select></label></div>
          <label>Description <span class="muted" style="font-weight:400">(shows on the timeline and in {{payment_link}} emails)</span><input name="description" placeholder="e.g. Final payment — ${esc(p.business || "website")}" /></label>
          <p class="tiny muted">Creates a Yoco checkout tagged to ${esc(p.ref)}. When they pay, it's reconciled automatically (needs the Yoco webhook — BACKEND.md).</p>
          <p class="adm-error tiny" id="reqErr" hidden></p>
          <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn--ghost btn--small" data-toggle="reqForm">Cancel</button><button class="btn btn--primary btn--small" type="submit">Create payment link</button></div>
        </form>
        <form class="adm-form" id="eftForm" hidden style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid var(--border)">
          <div class="row2"><label>Amount received<span class="money"><input name="amount" inputmode="decimal" required placeholder="3000" /></span></label><label>For<select name="kind"><option value="balance">Balance / final payment</option><option value="deposit">Deposit</option><option value="care">Care plan</option><option value="other">Other</option></select></label></div>
          <div class="row2"><label>Date<input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" /></label><label>Method<select name="provider"><option value="eft">EFT</option><option value="cash">Cash</option><option value="yoco">Yoco (manual)</option><option value="other">Other</option></select></label></div>
          <label>Note<input name="note" placeholder="e.g. FNB ref 12345" /></label>
          <p class="adm-error tiny" id="eftErr" hidden></p>
          <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn--ghost btn--small" data-toggle="eftForm">Cancel</button><button class="btn btn--primary btn--small" type="submit">Record payment</button></div>
        </form>
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Client &amp; sites <span class="muted">${client ? "" : "not linked"}</span></h2>
        ${buildControls(p)}
        ${(() => { const ss = S.sites.filter((x) => x.project_id === p.id); return `<div class="adm-inline-actions" style="margin:0 0 0.6rem">${ss.map((x) => `<a class="btn btn--ghost" href="#/sites/${esc(x.id)}"><span class="kind" data-k="${esc(x.kind)}">${esc(KINDS[x.kind] || x.kind)}</span>&nbsp;${esc(x.name)}${x.status === "published" ? " ✓" : ""}</a>`).join("")}<a class="btn btn--ghost" href="#/sites/new?project=${esc(p.id)}">+ Preview / mockup</a></div>`; })()}
        ${client ? `<p class="small"><a href="#/c/${esc(client.id)}">${esc(client.name)}</a>${client.care_active ? ` <span class="chip chip--stage" data-group="done">${esc(PLAN_LABEL[client.care_plan] || "Care active")}</span>` : ""}</p>` : `<div class="adm-inline-actions"><button class="btn btn--primary" id="convertClient">Convert to client</button>${S.clients.length ? `<select class="btn btn--ghost" id="linkClient" aria-label="Link to an existing client"><option value="">Link existing…</option>${S.clients.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>` : ""}</div><p class="tiny muted" style="margin-top:0.5rem">A client record holds the site, hosting/care plan and renewal date once a project goes live.</p>`}
      </div>
    </div>

    <div class="adm-detail__side">
      <div class="adm-card">
        <form class="adm-form" id="pForm">
          <label class="adm-stage">Stage
            <select name="status">${STAGES.map(([k, l, g]) => `<option value="${k}"${k === p.status ? " selected" : ""}>${esc(GROUPS.find(([x]) => x === g)?.[1] || "Declined")} · ${esc(l)}</option>`).join("")}</select>
          </label>
          <label id="reasonRow"${p.status === "declined" ? "" : " hidden"}>Declined reason<input name="declined_reason" value="${esc(p.declined_reason || "")}" placeholder="e.g. budget, timing, went elsewhere" /></label>
          <label>Source<select name="source">${Object.entries(SOURCES).map(([v, l]) => `<option value="${v}"${v === sourceOf(p) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          <label>Next action<input name="next_action" value="${esc(p.next_action || "")}" placeholder="e.g. Send quote, Follow-up 1" /></label>
          <label>Due<input type="datetime-local" name="next_action_at" value="${esc(datetimeLocal(p.next_action_at))}" /></label>
          <label>Preview / mockup link <span class="muted" style="font-weight:400">→ {{preview_link}}</span><input type="url" name="preview_url" value="${esc(p.preview_url || "")}" placeholder="https://preview.re-charge.co.za/…" /></label>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--ghost btn--small" type="button" id="clearNext">Clear reminder</button><button class="btn btn--primary btn--small" type="submit">Save</button></div>
        </form>
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Quote <span class="muted">${p.quote_cents ? money(p.quote_cents) : "not set"} → {{quote}}</span></h2>
        <form class="adm-quote" id="quoteForm">
          <div id="quoteRows">${items.map(quoteRow).join("")}</div>
          <div class="adm-inline-actions" style="margin-top:0"><button type="button" class="btn btn--ghost" id="quoteAdd">+ Line</button><button type="button" class="btn btn--ghost" data-preset="Business website|2000">+ Website</button><button type="button" class="btn btn--ghost" data-preset="Hosting & Care (per year)|600">+ Care</button></div>
          <div class="qtotal"><span class="muted">Total</span><b id="quoteTotal">${money(p.quote_cents || 0)}</b></div>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save quote</button></div>
        </form>
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Time <span class="muted">${mins ? hours(mins) + " logged" : "none logged"}${mins && p.quote_cents ? " · " + money(Math.round(p.quote_cents / (mins / 60))) + "/h" : ""}</span></h2>
        <form class="adm-form" id="timeForm"><div class="row2"><label>Minutes<input name="minutes" inputmode="numeric" placeholder="45" required /></label><label>What<input name="note" placeholder="e.g. Build, call, revisions" /></label></div><div class="btn-row" style="justify-content:flex-end"><button class="btn btn--ghost btn--small" type="submit">Log time</button></div></form>
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Timeline <span class="muted">${events.length}</span></h2>
        <form class="adm-note" id="noteForm"><textarea name="note" placeholder="Add a note… (call summary, decision, next step)" aria-label="Add a note"></textarea><div class="btn-row"><button class="btn btn--primary btn--small" type="submit">Add note</button></div></form>
        <ul class="adm-timeline" id="timeline">${events.map((e) => eventLi(e, msgById[e.data?.message_id])).join("") || '<li class="adm-empty">No events yet.</li>'}</ul>
      </div>
    </div>
  </div>`;

  // --- actions ---
  const patch = async (fields, msg) => {
    try { p = await api.projects.update(p.id, fields); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p; toast(msg || "Saved"); await renderProject(p.id); }
    catch (e) { toast(e.message, true); }
  };
  view.querySelectorAll("[data-compose]").forEach((b) => b.addEventListener("click", () => openCompose(p, b.dataset.compose, { onDone: () => renderProject(p.id) })));
  view.querySelectorAll("[data-build]").forEach((b) => b.addEventListener("click", async () => {
    const act = b.dataset.build;
    if (act === "queue" || act === "retry") { if (!p.business && !p.name) return toast("Add a business name first so the mockup has something to say.", true); patch({ build_status: "queued", build_log: null }, "Queued — the builder picks it up on its next run"); }
    else if (act === "cancel") patch({ build_status: "none" }, "Removed from the build queue");
    else if (act === "reviewed") patch({ build_status: "reviewed" }, "Marked as reviewed");
    else if (act === "email") openCompose(p, "email", { templateId: S.templates.find((t) => t.kind === "email" && !t.archived && /mockup ready/i.test(t.name))?.id, onDone: () => patch({ build_status: "reviewed" }, "Sent") });
  }));
  view.querySelector('[data-act="star"]').addEventListener("click", () => patch({ starred: !p.starred }, p.starred ? "Unstarred" : "Starred"));
  view.querySelector('[data-act="archive"]').addEventListener("click", () => patch({ archived: !p.archived }, p.archived ? "Restored to pipeline" : "Archived"));
  view.querySelector('[data-act="snooze"]').addEventListener("change", (e) => {
    const days = Number(e.target.value); if (e.target.value === "") return;
    patch({ snoozed_until: days ? new Date(Date.now() + days * 86400e3).toISOString() : null }, days ? `Snoozed for ${days} day${days > 1 ? "s" : ""}` : "Unsnoozed");
  });
  view.querySelector('[data-act="spam"]')?.addEventListener("click", async () => {
    if (!confirm(`Mark ${p.ref} as spam? Future submissions from ${p.email || "this sender"} will be flagged automatically.`)) return;
    try { if (p.email) await api.spam.add(p.email); } catch (e) { console.warn(e); }
    patch({ spam: true, archived: true }, "Marked as spam");
  });
  view.querySelector('[data-act="unspam"]')?.addEventListener("click", () => patch({ spam: false, archived: false }, "Restored"));
  view.querySelector('[data-act="delete"]').addEventListener("click", async () => {
    if (!confirm(`Delete ${p.ref} (${p.business || p.name || "this lead"}) for good?\n\nThis removes its timeline, notes and messages. Use Archive if you just want it out of the way.`)) return;
    try { await api.projects.remove(p.id); toast(`${p.ref} deleted`); await loadAll(true); location.hash = "#/pipeline"; } catch (e) { toast(e.message, true); }
  });

  const form = $("pForm");
  form.status.addEventListener("change", () => { $("reasonRow").hidden = form.status.value !== "declined"; });
  $("clearNext").addEventListener("click", () => { form.next_action.value = ""; form.next_action_at.value = ""; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = {
      status: form.status.value,
      declined_reason: form.status.value === "declined" ? (form.declined_reason.value.trim() || null) : null,
      source: form.source.value,
      next_action: form.next_action.value.trim() || null,
      next_action_at: form.next_action_at.value ? new Date(form.next_action_at.value).toISOString() : null,
      preview_url: form.preview_url.value.trim() || null,
    };
    patch(fields, fields.status !== p.status ? `Moved to ${STAGE[fields.status].label}` : "Saved");
  });
  view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => { const f = $(b.dataset.toggle); const other = $(b.dataset.toggle === "reqForm" ? "eftForm" : "reqForm"); f.hidden = !f.hidden; if (!f.hidden) { other.hidden = true; f.querySelector("input")?.focus(); } }));
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  view.querySelectorAll("[data-cancelreq]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Cancel this payment link? Anyone who already has it will no longer be expected to pay.")) return; await api.requests.cancel(b.dataset.cancelreq); toast("Cancelled"); S.loaded = 0; await loadAll(true); renderProject(p.id); }));
  view.querySelectorAll("[data-emaillink]").forEach((b) => b.addEventListener("click", () => { const r = S.requests.find((x) => x.id === b.dataset.emaillink); openCompose({ ...p, _payment_link: r.redirect_url }, "email", { templateId: S.templates.find((t) => t.kind === "email" && !t.archived && /payment|balance|invoice/i.test(t.name))?.id, onDone: () => renderProject(p.id) }); }));
  $("reqForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("reqErr"), btn = f.querySelector("[type=submit]");
    const cents = Math.round(Number(f.amount.value.replace(/[^\d.]/g, "")) * 100);
    if (!cents || cents < 100) { err.hidden = false; err.textContent = "Enter an amount in rand."; return; }
    btn.disabled = true; err.hidden = true;
    try {
      const r = await api.requestPayment({ projectId: p.id, amountCents: cents, kind: f.kind.value, description: f.description.value.trim() || `${KIND_LABEL[f.kind.value]} — ${p.business || p.ref}` });
      toast("Payment link created"); S.loaded = 0; await loadAll(true); await renderProject(p.id);
      try { await navigator.clipboard.writeText(r.redirectUrl); toast("Payment link created & copied"); } catch {}
    } catch (ex) { err.hidden = false; err.textContent = ex.message + (/not configured/.test(ex.message) ? " — set YOCO_SECRET_KEY on Supabase (BACKEND.md)." : ""); btn.disabled = false; }
  });
  $("eftForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("eftErr");
    const cents = Math.round(Number(f.amount.value.replace(/[^\d.]/g, "")) * 100);
    if (!cents) { err.hidden = false; err.textContent = "Enter the amount received."; return; }
    try {
      await api.payments.insert({ project_id: p.id, client_id: p.client_id || null, provider: f.provider.value, amount_cents: cents, currency: "ZAR", kind: f.kind.value, note: f.note.value.trim() || null, status: "succeeded", matched: true, paid_at: new Date(f.date.value || Date.now()).toISOString() });
      await api.events.insert(p.id, "payment", `${money(cents)} ${KIND_LABEL[f.kind.value].toLowerCase()} received (${f.provider.value.toUpperCase()})${f.note.value.trim() ? " — " + f.note.value.trim() : ""}`, { manual: true, kind: f.kind.value });
      const upd = {}; if (f.kind.value === "deposit" && !p.deposit_paid) { upd.deposit_paid = true; if (["new", "prospect", "contacted"].includes(p.status)) upd.status = "deposit_paid"; }
      if (Object.keys(upd).length) await api.projects.update(p.id, upd);
      toast("Payment recorded"); S.loaded = 0; await loadAll(true); renderProject(p.id);
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
  const qf = $("quoteForm");
  const recalc = () => { const t = [...qf.querySelectorAll(".qrow")].reduce((a, r) => a + (Math.round(Number(r.querySelector("[name=cents]").value.replace(/[^\d.]/g, "")) * 100) || 0), 0); $("quoteTotal").textContent = money(t); return t; };
  const addRow = (desc = "", rand = "") => { $("quoteRows").insertAdjacentHTML("beforeend", quoteRow({ desc, cents: rand ? Number(rand) * 100 : 0 })); $("quoteRows").lastElementChild.querySelector("input").focus(); recalc(); };
  qf.addEventListener("input", recalc);
  qf.addEventListener("click", (e) => { const rm = e.target.closest("[data-rm]"); if (rm) { rm.closest(".qrow").remove(); if (!qf.querySelector(".qrow")) addRow(); recalc(); } });
  $("quoteAdd").addEventListener("click", () => addRow());
  qf.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { const [d, r] = b.dataset.preset.split("|"); addRow(d, r); }));
  qf.addEventListener("submit", (e) => {
    e.preventDefault();
    const rows = [...qf.querySelectorAll(".qrow")].map((r) => ({ desc: r.querySelector("[name=desc]").value.trim(), cents: Math.round(Number(r.querySelector("[name=cents]").value.replace(/[^\d.]/g, "")) * 100) || 0 })).filter((r) => r.desc || r.cents);
    const total = rows.reduce((a, r) => a + r.cents, 0);
    patch({ quote_items: rows, quote_cents: total || null }, total ? `Quote saved: ${money(total)}` : "Quote cleared");
  });
  $("timeForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target; const m = Math.round(Number(f.minutes.value)); if (!m) return;
    try { await api.events.insert(p.id, "time", f.note.value.trim() || "Work", { minutes: m }); toast(`${m} min logged`); S.loaded = 0; await loadAll(true); renderProject(p.id); } catch (ex) { toast(ex.message, true); }
  });
  $("convertClient")?.addEventListener("click", async () => {
    const name = prompt("Client name:", p.business || p.name || ""); if (!name) return;
    try {
      const c = await api.clients.insert({ name, slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 6), email: p.email || null, phone: p.phone || null, site_label: p.preview_url ? p.preview_url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null });
      await api.projects.update(p.id, { client_id: c.id }); await api.events.insert(p.id, "note", `Converted to client "${name}"`);
      toast("Client created"); S.loaded = 0; await loadAll(true); location.hash = "#/c/" + c.id + "/edit";
    } catch (ex) { toast(ex.message, true); }
  });
  $("linkClient")?.addEventListener("change", async (e) => { if (!e.target.value) return; await api.projects.update(p.id, { client_id: e.target.value }); toast("Linked"); S.loaded = 0; await loadAll(true); renderProject(p.id); });

  $("noteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = e.target.note.value.trim(); if (!note) return;
    try { await api.events.insert(p.id, "note", note); e.target.note.value = ""; toast("Note added"); await renderProject(p.id); }
    catch (err) { toast(err.message, true); }
  });
}
const buildControls = (p) => {
  const st = p.build_status || "none", site = p.build_site_id ? S.sites.find((x) => x.id === p.build_site_id) : null;
  const url = p.preview_url || site?.url || "";
  const row = (chip, actions, extra = "") => `<div class="adm-build"><div class="adm-row__meta" style="margin:0 0 0.5rem">${chip}</div>${extra}<div class="adm-inline-actions" style="margin:0 0 0.8rem">${actions}</div></div>`;
  if (st === "queued") return row('<span class="chip" style="color:var(--accent-bright);border-color:var(--accent-line)">⚙ Queued for automatic mockup</span>', '<button class="btn btn--ghost" data-build="cancel">Remove from queue</button>');
  if (st === "building") return row(`<span class="chip" style="color:#ffb547;border-color:rgba(255,181,71,.4)">⚙ Building… started ${esc(rel(p.build_started_at))}</span>`, "");
  if (st === "built") return row('<span class="chip" style="color:var(--ok);border-color:rgba(61,220,151,.4)">✓ Mockup built automatically — review before sending</span>', `${url ? `<a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">Open mockup</a>` : ""}${p.email ? '<button class="btn btn--primary" data-build="email">Email the link</button>' : ""}<button class="btn btn--ghost" data-build="reviewed">Mark reviewed</button><button class="btn btn--ghost" data-build="retry">Rebuild</button>`, p.build_log ? `<p class="tiny muted" style="margin:0 0 0.5rem;white-space:pre-wrap">${esc(p.build_log)}</p>` : "");
  if (st === "failed") return row('<span class="chip" style="color:var(--danger);border-color:rgba(255,107,107,.4)">✕ Automatic mockup failed</span>', '<button class="btn btn--primary" data-build="retry">Try again</button><button class="btn btn--ghost" data-build="cancel">Dismiss</button>', p.build_log ? `<p class="adm-error tiny" style="margin:0 0 0.5rem;white-space:pre-wrap">${esc(p.build_log)}</p>` : "");
  if (st === "reviewed") return row('<span class="chip">✓ Mockup reviewed</span>', `${url ? `<a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">Open mockup</a>` : ""}<button class="btn btn--ghost" data-build="retry">Rebuild</button>`);
  return row("", `<button class="btn btn--ghost" data-build="queue" title="A scheduled Claude session builds a one-page mockup from this lead's details">⚙ Queue mockup build</button>`);
};
const quoteRow = (i) => `<div class="qrow"><input name="desc" value="${esc(i.desc || "")}" placeholder="e.g. Business website (5 pages)" aria-label="Line item" /><span class="money"><input name="cents" inputmode="decimal" value="${i.cents ? i.cents / 100 : ""}" placeholder="0" aria-label="Amount" /></span><button type="button" data-rm aria-label="Remove line">&times;</button></div>`;
const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client";
const eventLi = (e, msg) => `<li data-kind="${esc(e.kind)}"><span class="tl-dot"></span><div><time>${esc(fmtDT(e.created_at))} · ${esc(e.kind)}${msg ? ` · <span class="status-pill" data-s="${esc(msg.status)}">${esc(msg.status)}</span>` : ""}</time><p>${esc(e.note || "")}${e.data?.reason ? ` <span class="muted">(${esc(e.data.reason)})</span>` : ""}</p>${msg ? `<details class="adm-msg"><summary>Show message</summary><pre>${msg.subject ? "Subject: " + esc(msg.subject) + "\n\n" : ""}${esc(msg.body || "")}</pre></details>` : ""}</div></li>`;

// ---------- add lead ----------
function renderAdd(q) {
  const cats = ["Websites", "Dashboards", "Automation", "AI Integrations", "Custom Software"];
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Pipeline</span><h1>Add a lead</h1></div></div>
  <div class="adm-card" style="max-width:40rem">
    <form class="adm-form" id="addForm">
      <div class="row2"><label>Business<input name="business" placeholder="e.g. Botha Electrical" autofocus /></label><label>Contact name<input name="name" placeholder="e.g. Pieter Botha" /></label></div>
      <div class="row2"><label>Email<input type="email" name="email" placeholder="name@business.co.za" /></label><label>Phone / WhatsApp<input type="tel" name="phone" placeholder="082 000 0000" /></label></div>
      <div class="row2">
        <label>Source<select name="source">${["outreach", "referral", "whatsapp", "phone", "website", "other"].map((v) => `<option value="${v}"${v === (q.get("source") || "outreach") ? " selected" : ""}>${SOURCES[v]}</option>`).join("")}</select></label>
        <label>Stage<select name="status"><option value="prospect">Prospect (not contacted yet)</option><option value="contacted">Contacted</option><option value="new">New lead (they enquired)</option></select></label>
      </div>
      <label>What could we build for them?<select name="category">${cats.map((c) => `<option>${c}</option>`).join("")}</select></label>
      <label>Notes<textarea name="goal" placeholder="What you noticed: no website, old site, manual bookings on WhatsApp, found via Google Maps…"></textarea></label>
      <p class="adm-error tiny" id="addErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end"><a class="btn btn--ghost btn--small" href="#/pipeline">Cancel</a><button class="btn btn--primary btn--small" type="submit">Add lead</button></div>
    </form>
  </div>`;
  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, err = $("addErr");
    const row = { business: f.business.value.trim() || null, name: f.name.value.trim() || null, email: f.email.value.trim().toLowerCase() || null, phone: f.phone.value.trim() || null, source: f.source.value, status: f.status.value, category: [f.category.value], goal: f.goal.value.trim() || null, details: { formType: "Added manually" } };
    if (!row.business && !row.name) { err.hidden = false; err.textContent = "Add at least a business or a contact name."; return; }
    if (!row.email && !row.phone) { err.hidden = false; err.textContent = "Add an email or a phone number so you can reach them."; return; }
    try {
      const p = await api.projects.insert(row);
      if (!api.mock) await api.events.insert(p.id, "created", `Added manually (${SOURCES[row.source]})`);
      toast(`${p.ref} added`); await loadAll(true); location.hash = "#/p/" + p.id;
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
}

// ---------- calls ----------
function renderCalls() {
  const all = S.projects.filter((p) => !p.spam && isCall(p)).map((p) => ({ p, d: callDate(p) })).filter((x) => x.d);
  const upcoming = all.filter((x) => x.d >= startOfToday()).sort((a, b) => a.d - b.d);
  const past = all.filter((x) => x.d < startOfToday()).sort((a, b) => b.d - a.d).slice(0, 20);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Calls</span><h1>${upcoming.length} upcoming</h1></div></div>
  <p class="muted small" style="margin-bottom:0.9rem">From "Schedule a call" requests on the website. Times are the window the client chose; "Add to calendar" puts a 1-hour block at the start of it.</p>
  <ul class="adm-list">${upcoming.length ? upcoming.map(callRow).join("") : '<li class="adm-empty">No upcoming calls.</li>'}</ul>
  ${past.length ? `<details class="adm-more"><summary>Past calls (${past.length})</summary><ul class="adm-list" style="margin-top:0.6rem">${past.map(callRow).join("")}</ul></details>` : ""}`;
}

// ---------- search ----------
async function renderSearch(q) {
  const s = q.toLowerCase();
  $("searchInput").value = q;
  const noteHits = s.length >= 2 ? await api.events.searchNotes(q).catch(() => []) : [];
  const noteIds = new Set(noteHits.map((n) => n.project_id));
  const hits = S.projects.filter((p) => s && ([p.ref, p.name, p.business, p.email, p.phone, p.goal, ...(p.category || []), ...Object.values(p.details || {})].join(" ").toLowerCase().includes(s) || noteIds.has(p.id)));
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Search</span><h1>${hits.length} ${hits.length === 1 ? "result" : "results"} for “${esc(q)}”</h1></div></div>
  <ul class="adm-list">${hits.length ? hits.map((p) => `<li>${projectRow(p, noteIds.has(p.id) ? `<span class="chip">in notes: ${esc((noteHits.find((n) => n.project_id === p.id)?.note || "").slice(0, 60))}</span>` : "")}</li>`).join("") : '<li class="adm-empty">No matches.</li>'}</ul>`;
}


// ====================================================================
// Phase B — templates, compose (email / WhatsApp), outreach, settings
// ====================================================================
const VARS = [
  ["first_name", "First name"], ["name", "Full name"], ["business", "Business"], ["ref", "Ref (RC-…)"],
  ["category", "Category"], ["goal", "Their goal / message"], ["indicative_price", "Indicative price"], ["quote", "Quote (R)"],
  ["quote_items", "Quote line items"], ["deposit_link", "R500 deposit link"], ["payment_link", "Payment link (latest request)"], ["start_link", "Start-a-project link"], ["mockup_link", "Free-mockup link"],
  ["preview_link", "Preview / mockup URL"], ["review_link", "Google review link"], ["my_name", "Your name"], ["my_whatsapp", "Your WhatsApp"], ["signature", "Signature"],
];
const fmtWa = (n) => { const d = normPhone(n); return d.startsWith("27") && d.length === 11 ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : n; };
function ctxFor(p) {
  const pr = S.profile;
  return {
    first_name: firstName(p?.name) || "there", name: p?.name || "", business: p?.business || "your business", ref: p?.ref || "",
    category: (p?.category || []).filter((c) => !/request$/i.test(c)).join(", "), goal: p?.goal || "", indicative_price: p?.indicative_price || "",
    quote: p?.quote_cents != null ? money(p.quote_cents) : "", deposit_link: pr.deposit_link || "",
    payment_link: p?._payment_link || S.requests.find((r) => r.status === "open" && r.redirect_url && (p?.id ? r.project_id === p.id : p?._client_id && r.client_id === p._client_id))?.redirect_url || pr.deposit_link || "",
    quote_items: (p?.quote_items || []).filter((i) => i.desc || i.cents).map((i) => `• ${i.desc || "Item"} — ${money(i.cents || 0)}`).join("\n"),
    start_link: "https://re-charge.co.za/start", mockup_link: "https://re-charge.co.za/#mockup", preview_link: p?.preview_url || "", review_link: pr.review_link || "",
    my_name: pr.my_name || "", my_whatsapp: pr.whatsapp ? fmtWa(pr.whatsapp) : "", signature: pr.signature || "",
  };
}
function renderTpl(str, ctx) {
  const missing = new Set();
  const out = String(str || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => { const v = ctx[k]; if (v == null || v === "") { missing.add(k); return ""; } return v; });
  return { text: out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), missing: [...missing] };
}
const metaSummary = (m) => { if (!m || (!m.next_action && !m.set_status)) return ""; const parts = []; if (m.next_action) parts.push(`next: <b>${esc(m.next_action)}</b> in ${Number(m.next_days) || 0}d`); if (m.set_status) parts.push(`move to <b>${esc(STAGE[m.set_status]?.label || m.set_status)}</b>`); return parts.join(" · "); };
async function applyMeta(p, meta) {
  if (!meta) return;
  const patch = {};
  if (meta.next_action) { const d = new Date(); d.setDate(d.getDate() + (Number(meta.next_days) || 0)); d.setHours(9, 0, 0, 0); patch.next_action = meta.next_action; patch.next_action_at = d.toISOString(); }
  if (meta.set_status && STAGES.findIndex(([k]) => k === meta.set_status) > STAGES.findIndex(([k]) => k === p.status)) patch.status = meta.set_status;
  if (Object.keys(patch).length) { const np = await api.projects.update(p.id, patch); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np; }
}

// ---------- compose dialog ----------
function openCompose(p, kind, opts = {}) {
  const dlg = $("composeDialog");
  const tpls = S.templates.filter((t) => t.kind === kind && !t.archived);
  const ctx = ctxFor(p);
  let tpl = opts.template || tpls.find((t) => t.id === opts.templateId) || tpls[0] || null;
  const to = kind === "email" ? p.email : p.phone;
  const render = () => {
    const subj = tpl ? renderTpl(tpl.subject, ctx) : { text: "", missing: [] };
    const body = tpl ? renderTpl(tpl.body, ctx) : { text: "", missing: [] };
    const missing = [...new Set([...subj.missing, ...body.missing])];
    dlg.innerHTML = `
    <div class="adm-dialog__inner">
      <div class="adm-dialog__head"><div><h2 id="composeTitle">${kind === "email" ? "Email" : "WhatsApp"} · ${esc(p.business || p.name || p.ref)}</h2><p>To ${esc(p.name || "")} ${esc(to || "")}${opts.queue ? ` · ${opts.queue.pos} of ${opts.queue.total}` : ""}</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
      <form class="adm-form" id="composeForm">
        <label>Template<select name="tpl"><option value="">— blank —</option>${tpls.map((t) => `<option value="${t.id}"${tpl?.id === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        ${kind === "email" ? `<label>Subject<input name="subject" value="${esc(subj.text)}" required /></label>` : ""}
        <label>Message<textarea name="body" required>${esc(body.text)}</textarea></label>
        ${missing.length ? `<p class="adm-missing">Blank variables: ${missing.map((m) => `{{${esc(m)}}}`).join(", ")} — fill them in above or on the project.</p>` : ""}
        ${tpl && metaSummary(tpl.meta) ? `<label class="check"><input type="checkbox" name="applyMeta" checked /> After sending: ${metaSummary(tpl.meta)}</label>` : ""}
        ${kind === "email" ? `<label class="check"><input type="checkbox" name="copyMe" ${S.profile.bcc_me ? "checked" : ""} /> Send me a copy</label>` : ""}
        <p class="adm-error tiny" id="composeErr" hidden></p>
        <div class="btn-row">
          ${opts.queue ? '<button type="button" class="btn btn--ghost btn--small" data-skip>Skip</button>' : ""}
          <button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button>
          <button type="submit" class="btn btn--primary btn--small" id="composeSend">${kind === "email" ? (opts.queue ? "Send & next" : "Send email") : "Open in WhatsApp"}</button>
        </div>
      </form>
    </div>`;
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
    dlg.querySelector("[data-skip]")?.addEventListener("click", () => { dlg.close(); opts.onSkip?.(); });
    const form = $("composeForm");
    form.tpl.addEventListener("change", () => { tpl = tpls.find((t) => t.id === form.tpl.value) || null; render(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("composeErr"), btn = $("composeSend");
      const text = form.body.value.trim(); if (!text) return;
      btn.disabled = true; btn.textContent = kind === "email" ? "Sending…" : "Opening…";
      try {
        if (kind === "email") {
          await api.sendEmail({ projectId: p.id || null, templateId: tpl?.id || null, to, subject: form.subject.value.trim(), text, copyMe: form.copyMe.checked });
        } else if (!p.id) {
          const w = window.open(waLink(to, text), "_blank"); if (w) w.opener = null;
          await api.messages.insert({ project_id: null, kind: "whatsapp", to_address: to, body: text, template_id: tpl?.id || null, status: "opened" });
        } else {
          const w = window.open(waLink(to, text), "_blank");
          if (w) w.opener = null;
          else { const er = $("composeErr"); er.hidden = false; er.innerHTML = `Pop-up blocked — <a href="${esc(waLink(to, text))}" target="_blank" rel="noopener">tap here to open WhatsApp</a>.`; }
          await api.messages.insert({ project_id: p.id, kind: "whatsapp", to_address: to, body: text, template_id: tpl?.id || null, status: "opened" });
          await api.events.insert(p.id, "whatsapp", `WhatsApp opened: "${text.slice(0, 70)}${text.length > 70 ? "…" : ""}"`, { to });
        }
        if (p.id && form.applyMeta?.checked) await applyMeta(p, tpl?.meta);
        toast(kind === "email" ? "Email sent" : "Logged");
        dlg.close(); S.loaded = 0; opts.onDone?.();
      } catch (ex) { err.hidden = false; err.textContent = ex.message; btn.disabled = false; btn.textContent = kind === "email" ? "Send email" : "Open in WhatsApp"; }
    });
  };
  render();
  if (!dlg.open) dlg.showModal();
}

// ---------- templates ----------
function renderTemplates(id, q) {
  if (id) { const t = id === "new" ? null : S.templates.find((x) => x.id === id); if (id !== "new" && !t) { view.innerHTML = '<p class="adm-error">Template not found.</p>'; return; } return renderTemplateEditor(t, q); }
  const showArchived = q.get("archived") === "1";
  const list = S.templates.filter((t) => Boolean(t.archived) === showArchived);
  const section = (kind, label) => {
    const items = list.filter((t) => t.kind === kind);
    return `<section class="adm-section"><h2>${label} <span class="count">${items.length}</span></h2>
      <ul class="adm-list">${items.map((t) => `<li><div class="adm-row adm-tpl-row"><div class="adm-row__main"><div class="adm-row__title">${esc(t.name)}</div><div class="adm-row__sub">${esc(t.subject ? t.subject + " — " : "")}${esc(t.body.slice(0, 140))}</div>${metaSummary(t.meta) ? `<div class="adm-row__meta tiny muted">${metaSummary(t.meta)}</div>` : ""}</div>
        <div class="adm-inline-actions" style="margin:0"><a class="btn btn--ghost" href="#/templates/${esc(t.id)}">Edit</a><button class="btn btn--ghost" data-dup="${esc(t.id)}">Duplicate</button><button class="btn btn--ghost" data-arch="${esc(t.id)}">${t.archived ? "Restore" : "Archive"}</button></div></div></li>`).join("") || `<li class="adm-empty">No ${label.toLowerCase()} templates${showArchived ? " archived" : ""}.</li>`}</ul></section>`;
  };
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Templates</span><h1>${S.templates.filter((t) => !t.archived).length} templates</h1></div>
    <div class="adm-head__actions"><a class="btn btn--ghost btn--small" href="#/templates?archived=${showArchived ? 0 : 1}">${showArchived ? "Back to active" : "Archived"}</a>${S.templates.length ? "" : '<button class="btn btn--ghost btn--small" id="seedTpl">Add starter set</button>'}<a class="btn btn--primary btn--small" href="#/templates/new">+ New template</a></div></div>
  <p class="muted small" style="margin-bottom:0.4rem">Variables like <code>{{first_name}}</code> and <code>{{quote}}</code> are filled from the lead when you send. A template can also set the follow-up reminder and stage after sending.</p>
  ${section("email", "Email")}${section("whatsapp", "WhatsApp")}`;
  $("seedTpl")?.addEventListener("click", async () => { $("seedTpl").disabled = true; try { await seedTemplates(); toast("Starter templates added"); await loadAll(true); route(); } catch (e) { toast(e.message, true); } });
  view.querySelectorAll("[data-dup]").forEach((b) => b.addEventListener("click", async () => { const t = S.templates.find((x) => x.id === b.dataset.dup); const n = await api.templates.insert({ kind: t.kind, name: t.name + " (copy)", subject: t.subject, body: t.body, meta: t.meta || {} }); await loadAll(true); location.hash = "#/templates/" + n.id; }));
  view.querySelectorAll("[data-arch]").forEach((b) => b.addEventListener("click", async () => { const t = S.templates.find((x) => x.id === b.dataset.arch); await api.templates.update(t.id, { archived: !t.archived }); toast(t.archived ? "Restored" : "Archived"); await loadAll(true); route(); }));
}
function renderTemplateEditor(t, q) {
  const isNew = !t;
  t = t || { kind: q.get("kind") || "email", name: "", subject: "", body: "", meta: {} };
  const sample = S.projects.find((p) => isActive(p) && p.email) || { name: "Sipho Dlamini", business: "Bella Hair Studio", ref: "RC-00051", email: "sipho@example.com", category: ["Websites"], goal: "We take bookings on WhatsApp and lose track.", indicative_price: "from R2,000", quote_cents: 250000 };
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/templates">Templates</a> · ${isNew ? "New" : "Edit"}</span><h1>${esc(t.name || "New template")}</h1></div></div>
  <div class="adm-detail">
    <div class="adm-card"><form class="adm-form" id="tplForm">
      <div class="row2"><label>Name<input name="name" value="${esc(t.name)}" required placeholder="e.g. Quote" /></label><label>Kind<select name="kind"><option value="email"${t.kind === "email" ? " selected" : ""}>Email</option><option value="whatsapp"${t.kind === "whatsapp" ? " selected" : ""}>WhatsApp</option></select></label></div>
      <label id="subjRow"${t.kind === "email" ? "" : " hidden"}>Subject<input name="subject" value="${esc(t.subject || "")}" placeholder="e.g. Your quote for {{business}} ({{ref}})" /></label>
      <label>Body<textarea name="body" rows="12" required>${esc(t.body)}</textarea></label>
      <div class="adm-vars" aria-label="Insert a variable">${VARS.map(([k, l]) => `<button type="button" data-var="${k}" title="${esc(l)}">{{${k}}}</button>`).join("")}</div>
      <h3 style="font-size:0.9rem;margin-top:0.4rem">After sending <span class="muted" style="font-weight:400">(optional)</span></h3>
      <div class="row2"><label>Set next action<input name="next_action" value="${esc(t.meta?.next_action || "")}" placeholder="e.g. Follow-up 1" /></label><label>Due in (days)<input name="next_days" inputmode="numeric" value="${esc(t.meta?.next_days ?? "")}" placeholder="3" /></label></div>
      <label>Move lead to stage<select name="set_status"><option value="">— leave as is —</option>${STAGES.filter(([k]) => k !== "declined").map(([k, l, g]) => `<option value="${k}"${t.meta?.set_status === k ? " selected" : ""}>${esc(GROUPS.find(([x]) => x === g)?.[1])} · ${esc(l)}</option>`).join("")}</select></label>
      <p class="adm-error tiny" id="tplErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="tplDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="#/templates">Cancel</a><button class="btn btn--primary btn--small" type="submit">Save template</button></div>
    </form></div>
    <div class="adm-detail__side"><div class="adm-card"><h2>Preview <span class="muted">with ${esc(sample.business || sample.name || "a sample lead")}</span></h2><div class="adm-preview" id="tplPreview"></div><p class="tiny muted" style="margin-top:0.5rem" id="tplMissing"></p></div></div>
  </div>`;
  const form = $("tplForm"), ctx = ctxFor(sample);
  const preview = () => {
    const sj = renderTpl(form.subject.value, ctx), bd = renderTpl(form.body.value, ctx);
    $("tplPreview").innerHTML = (form.kind.value === "email" && sj.text ? `<div class="subj">${esc(sj.text)}</div>` : "") + esc(bd.text);
    const miss = [...new Set([...sj.missing, ...bd.missing])];
    $("tplMissing").textContent = miss.length ? "Blank for this sample: " + miss.map((m) => `{{${m}}}`).join(", ") + (miss.some((m) => ["my_name", "signature", "review_link", "my_whatsapp"].includes(m)) ? " — set yours under Settings." : "") : "";
  };
  form.addEventListener("input", preview); preview();
  form.kind.addEventListener("change", () => { $("subjRow").hidden = form.kind.value !== "email"; });
  view.querySelectorAll("[data-var]").forEach((b) => b.addEventListener("click", () => {
    const ta = form.body, v = `{{${b.dataset.var}}}`, s0 = ta.selectionStart ?? ta.value.length, e0 = ta.selectionEnd ?? s0;
    ta.value = ta.value.slice(0, s0) + v + ta.value.slice(e0); ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + v.length; preview();
  }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const row = { kind: form.kind.value, name: form.name.value.trim(), subject: form.kind.value === "email" ? form.subject.value.trim() || null : null, body: form.body.value.replace(/\r\n/g, "\n"), meta: {} };
    if (form.next_action.value.trim()) { row.meta.next_action = form.next_action.value.trim(); row.meta.next_days = Number(form.next_days.value) || 0; }
    if (form.set_status.value) row.meta.set_status = form.set_status.value;
    try { const saved = isNew ? await api.templates.insert(row) : await api.templates.update(t.id, row); toast("Template saved"); await loadAll(true); location.hash = "#/templates"; void saved; }
    catch (ex) { $("tplErr").hidden = false; $("tplErr").textContent = ex.message; }
  });
  $("tplDelete")?.addEventListener("click", async () => { if (!confirm(`Delete "${t.name}"? Sent messages keep their text.`)) return; await api.templates.remove(t.id); toast("Deleted"); await loadAll(true); location.hash = "#/templates"; });
}

async function seedTemplates() {
  const sig = "\n\n{{signature}}";
  const rows = [
    { kind: "email", name: "Enquiry received", subject: "Got your enquiry — {{business}} ({{ref}})", meta: { next_action: "Review enquiry & reply with next step", next_days: 1 },
      body: "Hi {{first_name}},\n\nThanks for getting in touch about {{business}}. I've got your details and I'm going through them now.\n\nHere's what happens next: I'll come back to you within one working day with a few questions or a proposed plan, and a fixed quote once we've agreed the scope. The R500 deposit only comes in once you're happy with that, and it comes off the project price.\n\nIf it's easier to talk it through, reply here or WhatsApp me on {{my_whatsapp}}.\n\nYour reference is {{ref}}." + sig },
    { kind: "email", name: "Call confirmed", subject: "Our call — {{business}}", body: "Hi {{first_name}},\n\nConfirming our call as requested. I'll phone you on the number you gave. If the time no longer suits, just reply with a better one.\n\nTo make the most of it, have a think about: what's frustrating you most today, who the site/tool is for, and any examples you like.\n\nSpeak soon." + sig },
    { kind: "email", name: "Quote", subject: "Your quote — {{business}} ({{ref}})", meta: { next_action: "Follow up on quote", next_days: 3, set_status: "quote_sent" },
      body: "Hi {{first_name}},\n\nThanks for the conversation. Based on what you described, here's the plan for {{business}}:\n\n• Scope: [what we'll build, in plain words]\n• Timeline: [e.g. 2 weeks from deposit]\n• Fixed price: {{quote}} (the R500 deposit comes off this)\n• Hosting & care: [plan / year] — optional, cancel any time\n\nThird-party costs like domains are excluded and always agreed first. Nothing changes without your say-so.\n\nTo go ahead, pay the R500 deposit here and I'll start straight away: {{deposit_link}}\n\nQuestions? Reply here or WhatsApp me on {{my_whatsapp}}." + sig },
    { kind: "email", name: "Deposit reminder", subject: "Ready when you are — {{business}}", meta: { next_action: "Check in on deposit", next_days: 4 },
      body: "Hi {{first_name}},\n\nJust checking in on the quote for {{business}} ({{ref}}). No pressure at all — if the timing isn't right, tell me and I'll park it.\n\nIf you'd like to go ahead, the R500 deposit reserves your slot: {{deposit_link}}\n\nAnd if something in the quote is holding you back, I'd genuinely like to know so I can fix it." + sig },
    { kind: "email", name: "Mockup ready", subject: "Your free mockup is ready — {{business}}", meta: { next_action: "Ask what they think of the mockup", next_days: 2 },
      body: "Hi {{first_name}},\n\nYour mockup for {{business}} is ready to look at:\n\n{{preview_link}}\n\nIt's a first take, built from what you told me, so treat it as a starting point — tell me what you'd change, add or drop. If you like the direction, I'll send a fixed quote to build the real thing.\n\nNo deposit, no obligation." + sig },
    { kind: "email", name: "Project live", subject: "You're live — {{business}}", meta: { next_action: "Ask for a review", next_days: 7, set_status: "live" },
      body: "Hi {{first_name}},\n\n{{business}} is live. Congratulations!\n\nA few things to keep:\n• Your site: {{preview_link}}\n• Logins and hosting details are in the handover email/document\n• Anything odd in the first weeks, just message me — that's covered\n\nThank you for trusting me with it. If you know anyone else who's stuck with an old site or a manual process, I'd be grateful for an introduction." + sig },
    { kind: "email", name: "Ask for a review", subject: "A quick favour?", body: "Hi {{first_name}},\n\nNow that {{business}} has been live for a bit — would you mind leaving a short review? It takes a minute and helps other small businesses find me:\n\n{{review_link}}\n\nOne or two honest lines is perfect. Thank you!" + sig },
    { kind: "email", name: "Care renewal due", subject: "Hosting & care renewal — {{business}}", meta: { next_action: "Confirm renewal paid", next_days: 7 },
      body: "Hi {{first_name}},\n\nYour hosting & care plan for {{business}} renews soon. Everything continues as is — site stays up, backups and small updates included.\n\nYou can pay the renewal here: {{payment_link}}\n\nIf you'd like to change plan or have questions, just reply." + sig },
    { kind: "email", name: "Cold outreach", subject: "A quick idea for {{business}}", meta: { next_action: "Follow-up 1", next_days: 3, set_status: "contacted" },
      body: "Hi {{first_name}},\n\nI came across {{business}} and noticed [you don't have a website / your site is hard to use on a phone / bookings run over WhatsApp]. Customers in South Africa search on their phones first, and if they can't find you or see prices quickly, they call the next business.\n\nI run Re-Charge, a small digital studio. I build fast, professional websites and simple tools for local businesses, from R1,000, with a fixed quote before anything starts.\n\nIf you're open to it, I'll put together a free mockup of what {{business}} could look like — no cost, no obligation. Just reply \"yes\" and I'll get going.\n\nEither way, good luck with the business." + sig },
    { kind: "email", name: "Follow-up 1", subject: "Re: A quick idea for {{business}}", meta: { next_action: "Follow-up 2", next_days: 7 },
      body: "Hi {{first_name}},\n\nJust floating this back up in case it got buried. The offer stands: a free mockup of a site for {{business}}, and you decide afterwards.\n\nIf it's not a priority right now, a quick \"not now\" is completely fine and I'll leave it there." + sig },
    { kind: "email", name: "Follow-up 2", subject: "Last note from me — {{business}}", meta: { next_action: "Park or close", next_days: 10 },
      body: "Hi {{first_name}},\n\nLast one from me, I promise. If a website or a simple tool for {{business}} becomes useful later, my details are below and the free mockup offer stays open.\n\nAll the best." + sig },
    { kind: "whatsapp", name: "Quick hello", body: "Hi {{first_name}}, it's {{my_name}} from Re-Charge about {{business}} ({{ref}}). Thanks for reaching out — is now a good time for a couple of quick questions, or would you prefer I email?" },
    { kind: "whatsapp", name: "Call reminder", body: "Hi {{first_name}}, {{my_name}} from Re-Charge here. Just confirming our call — I'll phone you at the time you chose. If it no longer suits, let me know a better time." },
    { kind: "whatsapp", name: "Quote sent", meta: { next_action: "Follow up on quote", next_days: 3 }, body: "Hi {{first_name}}, I've just emailed the quote for {{business}} ({{quote}}). Have a look when you get a chance and shout if anything's unclear — happy to adjust." },
    { kind: "whatsapp", name: "Mockup ready", body: "Hi {{first_name}}, your free mockup for {{business}} is ready: {{preview_link}} — tell me what you'd change!" },
    { kind: "whatsapp", name: "Site is live", body: "Hi {{first_name}}, {{business}} is live 🎉 {{preview_link}} — thank you for trusting me with it. Anything odd in the first weeks, just message me." },
  ];
  for (const r of rows) await api.templates.insert({ ...r, subject: r.subject ?? null, meta: r.meta ?? {} });
}

// ---------- outreach ----------
async function renderOutreach(q) {
  const outreach = S.projects.filter((p) => !p.spam && sourceOf(p) === "outreach");
  const prospects = outreach.filter((p) => p.status === "prospect" && !p.archived);
  const contacted = outreach.filter((p) => p.status === "contacted" && !p.archived);
  const replied = outreach.filter((p) => !["prospect", "contacted"].includes(p.status));
  const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
  const sentWeek = await api.messages.recent(weekAgo).catch(() => []);
  const due = outreach.filter((p) => !p.archived && p.next_action_at && Date.parse(p.next_action_at) <= endOfToday().getTime()).sort((a, b) => a.next_action_at.localeCompare(b.next_action_at));
  const queue = prospects.filter((p) => p.email);
  const hasOutreachTpl = S.templates.some((t) => t.kind === "email" && !t.archived);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Outreach</span><h1>Find clients</h1></div>
    <div class="adm-head__actions">${queue.length ? `<button class="btn btn--primary btn--small" id="startQueue">Start sending (${queue.length})</button>` : ""}</div></div>
  <div class="adm-tiles adm-tiles--4">
    <div class="adm-tile"><span>Prospects</span><b>${prospects.length}</b><small>${queue.length} with email</small></div>
    <div class="adm-tile"><span>Contacted</span><b>${contacted.length}</b></div>
    <div class="adm-tile"><span>Replied / enquired</span><b>${replied.length}</b><small>${contacted.length + replied.length ? Math.round(replied.length / (contacted.length + replied.length) * 100) + "% of contacted" : ""}</small></div>
    <div class="adm-tile"><span>Sent · 7 days</span><b>${sentWeek.filter((m) => m.kind === "email").length}</b><small>${sentWeek.filter((m) => m.kind === "whatsapp").length} WhatsApp</small></div>
  </div>
  ${!hasOutreachTpl ? '<p class="adm-empty" style="margin-top:1rem">No email templates yet — <a href="#/templates">add the starter set</a> first (it includes Cold outreach + two follow-ups).</p>' : ""}

  <section class="adm-section"><h2>Follow-ups due <span class="count">${due.length}</span></h2>
    <ul class="adm-list">${due.length ? due.map((p) => `<li><div class="adm-row"><div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}</div><div class="adm-row__sub">${esc(p.next_action || "Follow up")} · ${Date.parse(p.next_action_at) < startOfToday() ? '<span class="adm-error">overdue</span>' : "due today"} · ${esc(p.email || p.phone || "")}</div></div><div class="adm-inline-actions" style="margin:0">${p.email ? `<button class="btn btn--primary" data-followup="${esc(p.id)}">Send</button>` : ""}<a class="btn btn--ghost" href="#/p/${esc(p.id)}">Open</a></div></div></li>`).join("") : '<li class="adm-empty">Nothing due. Follow-ups are set automatically when you send a template that has an "after sending" rule.</li>'}</ul></section>

  <section class="adm-section"><h2>Add prospects</h2>
    <div class="adm-card adm-import"><form class="adm-form" id="importForm">
      <label>One business per line — <code>Business, Contact name, Email, Phone, Notes</code> (or paste a CSV export; columns are detected)<textarea name="raw" placeholder="Botha Electrical, Pieter Botha, pieter@bothaelectrical.co.za, 082 444 5555, No website, found on Google Maps"></textarea></label>
      <div class="btn-row" style="justify-content:space-between"><label class="btn btn--ghost btn--small" style="cursor:pointer">Upload CSV<input type="file" id="csvFile" accept=".csv,text/csv" hidden /></label><button class="btn btn--primary btn--small" type="submit">Preview</button></div>
      <div id="importPreview"></div>
    </form></div></section>

  <section class="adm-section"><h2>Prospects <span class="count">${prospects.length}</span><a href="#/pipeline?group=outreach">Pipeline view →</a></h2>
    <ul class="adm-list">${prospects.length ? prospects.slice(0, 50).map((p) => `<li>${projectRow(p)}</li>`).join("") : '<li class="adm-empty">No prospects yet. Add some above.</li>'}</ul></section>`;

  const startAt = (ids) => {
    let i = 0;
    const next = () => { if (i >= ids.length) { toast("Queue finished"); return route(); } const p = byId(ids[i++]); if (!p) return next(); openCompose(p, "email", { queue: { pos: i, total: ids.length }, templateId: S.templates.find((t) => /outreach/i.test(t.name) && t.kind === "email")?.id, onDone: next, onSkip: next }); };
    next();
  };
  $("startQueue")?.addEventListener("click", () => startAt(queue.map((p) => p.id)));
  view.querySelectorAll("[data-followup]").forEach((b) => b.addEventListener("click", () => {
    const p = byId(b.dataset.followup);
    const tpl = S.templates.find((t) => t.kind === "email" && !t.archived && p.next_action && t.name.toLowerCase() === p.next_action.toLowerCase());
    openCompose(p, "email", { templateId: tpl?.id, onDone: route });
  }));

  // import
  const form = $("importForm");
  $("csvFile").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) { form.raw.value = await f.text(); form.requestSubmit(); } });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rows = parseProspects(form.raw.value);
    const known = new Set(S.projects.map((p) => (p.email || "").toLowerCase()).filter(Boolean));
    const knownPhones = new Set(S.projects.map((p) => normPhone(p.phone)).filter(Boolean));
    rows.forEach((r) => { r.dup = (r.email && known.has(r.email.toLowerCase())) || (r.phone && knownPhones.has(normPhone(r.phone))); });
    const fresh = rows.filter((r) => !r.dup && (r.business || r.name) && (r.email || r.phone));
    $("importPreview").innerHTML = rows.length ? `<div class="table-wrap" style="margin-top:0.6rem"><table class="adm-table adm-table--cards"><thead><tr><th>Business</th><th>Contact</th><th>Email</th><th>Phone</th><th>Notes</th></tr></thead><tbody>${rows.map((r) => `<tr>${[["business", "Business"], ["name", "Contact"], ["email", "Email"], ["phone", "Phone"], ["notes", "Notes"]].map(([k, l]) => `<td class="${r.dup ? "dup" : ""}"${r[k] ? ` data-l="${l}"` : ""}>${esc(r[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="btn-row" style="justify-content:flex-end;margin-top:0.7rem"><span class="tiny muted">${rows.length - fresh.length ? `${rows.length - fresh.length} skipped (already known or no contact detail)` : ""}</span><button class="btn btn--primary btn--small" type="button" id="importGo" ${fresh.length ? "" : "disabled"}>Add ${fresh.length} prospect${fresh.length === 1 ? "" : "s"}</button></div>` : '<p class="adm-error tiny" style="margin-top:0.5rem">Nothing recognised — one business per line, fields separated by commas.</p>';
    $("importGo")?.addEventListener("click", async () => {
      $("importGo").disabled = true; let n = 0;
      for (const r of fresh) {
        try {
          const p = await api.projects.insert({ business: r.business || null, name: r.name || null, email: r.email ? r.email.toLowerCase() : null, phone: r.phone || null, source: "outreach", status: "prospect", category: ["Websites"], goal: r.notes || null, details: { formType: "Added manually" } });
          if (!api.mock) await api.events.insert(p.id, "created", "Added from outreach import"); n++;
        } catch (ex) { console.warn(ex); }
      }
      toast(`${n} prospect${n === 1 ? "" : "s"} added`); await loadAll(true); route();
    });
  });
}
function parseProspects(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = (lines[0].match(/\t/g) || []).length ? "\t" : (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (l) => { const out = []; let cur = "", inq = false; for (const ch of l) { if (ch === '"') inq = !inq; else if (ch === delim && !inq) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; };
  let rows = lines.map(split);
  let cols = ["business", "name", "email", "phone", "notes"];
  const head = rows[0].map((h) => h.toLowerCase());
  if (head.some((h) => /email|phone|business|company|name/.test(h)) && !head.some((h) => /@/.test(h))) {
    cols = head.map((h) => /business|company|firm/.test(h) ? "business" : /e-?mail/.test(h) ? "email" : /phone|tel|cell|mobile|whatsapp/.test(h) ? "phone" : /name|contact|owner/.test(h) ? "name" : /note|comment|town|city|remark|source/.test(h) ? "notes" : null);
    rows = rows.slice(1);
  }
  return rows.map((cells) => {
    const r = { business: "", name: "", email: "", phone: "", notes: "" };
    cells.forEach((c, i) => { let k = cols[i]; if (!k) return; if (k === "notes" && r.notes) r.notes += " · " + c; else r[k] = c; });
    // heuristics for unlabelled lines: move an email/phone-looking value to the right field
    for (const k of ["business", "name", "notes"]) { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[k]) && !r.email) { r.email = r[k]; r[k] = ""; } else if (/^\+?[\d\s()-]{9,}$/.test(r[k]) && !r.phone) { r.phone = r[k]; r[k] = ""; } }
    return r;
  }).filter((r) => r.business || r.name || r.email || r.phone);
}

// ---------- settings ----------
function renderSettings() {
  const pr = S.profile;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Settings</span><h1>Your details</h1></div></div>
  <div class="adm-card" style="max-width:40rem"><form class="adm-form" id="setForm">
    <div class="row2"><label>Your name <span class="muted" style="font-weight:400">→ {{my_name}}</span><input name="my_name" value="${esc(pr.my_name)}" placeholder="Revan" /></label><label>Your WhatsApp <span class="muted" style="font-weight:400">→ {{my_whatsapp}}</span><input name="whatsapp" value="${esc(pr.whatsapp)}" placeholder="27722375833" /></label></div>
    <label>Replies go to <span class="muted" style="font-weight:400">(reply-to on every email you send)</span><input type="email" name="reply_to" value="${esc(pr.reply_to)}" placeholder="enquiry.re.charge@gmail.com" /></label>
    <label>Signature <span class="muted" style="font-weight:400">→ {{signature}}</span><textarea name="signature" rows="4" placeholder="Revan\nRe-Charge · re-charge.co.za\nWhatsApp 072 237 5833">${esc(pr.signature)}</textarea></label>
    <div class="row2"><label>Deposit / payment link <span class="muted" style="font-weight:400">→ {{deposit_link}}</span><input type="url" name="deposit_link" value="${esc(pr.deposit_link)}" /></label><label>Google review link <span class="muted" style="font-weight:400">→ {{review_link}}</span><input type="url" name="review_link" value="${esc(pr.review_link)}" placeholder="https://g.page/r/…/review" /></label></div>
    <label class="check"><input type="checkbox" name="bcc_me" ${pr.bcc_me ? "checked" : ""} /> Send me a copy of every email by default</label>
    <p class="adm-error tiny" id="setErr" hidden></p>
    <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save</button></div>
  </form></div>
  <div class="adm-card" style="max-width:40rem;margin-top:1rem"><h2>Automatic mockups</h2>
    <p class="muted small">A scheduled Claude session builds queued mockups into <span class="mono">re-charge.co.za/previews/…</span> and reports back here. Nothing is sent to the prospect until you review it and press "Email the link".</p>
    <label class="check" style="margin-top:0.7rem"><input type="checkbox" id="autoQueue" ${S.autobuild?.auto_queue ? "checked" : ""} /> Queue every new free-mockup request automatically</label>
    <p class="tiny muted" style="margin-top:0.4rem">Off = you press "Queue mockup build" on each lead. Spam-flagged requests are never queued.</p></div>
  <div class="adm-card" style="max-width:40rem;margin-top:1rem"><h2>Email sending</h2>
    <p class="muted small">Emails go out from <b>no-reply@re-charge.co.za</b> via Resend, with the reply-to above. Delivery status (delivered / bounced) appears on the timeline once the optional Resend webhook is set up — see ADMIN.md §8.</p></div>
  <div class="adm-card" style="max-width:40rem;margin-top:1rem"><h2>Account</h2><p class="muted small">Signed in as ${esc(me.email)}.</p><div class="btn-row" style="margin-top:0.6rem"><button class="btn btn--ghost btn--small" id="setSignOut">Sign out</button></div></div>`;
  $("setForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    const value = { my_name: f.my_name.value.trim(), whatsapp: normPhone(f.whatsapp.value) || "", reply_to: f.reply_to.value.trim(), signature: f.signature.value.replace(/\r\n/g, "\n").trim(), deposit_link: f.deposit_link.value.trim(), review_link: f.review_link.value.trim(), bcc_me: f.bcc_me.checked };
    try { await api.settings.set("profile", value); S.profile = { ...DEFAULT_PROFILE, ...value }; toast("Settings saved"); }
    catch (ex) { $("setErr").hidden = false; $("setErr").textContent = ex.message; }
  });
  $("setSignOut").addEventListener("click", async () => { await api.auth.signOut(); location.hash = "#/"; location.reload(); });
  $("autoQueue").addEventListener("change", async (e) => { try { await api.settings.set("autobuild", { auto_queue: e.target.checked }); S.autobuild = { auto_queue: e.target.checked }; toast(e.target.checked ? "New mockup requests will be queued automatically" : "Auto-queue off"); } catch (ex) { toast(ex.message, true); } });
}

// ---------- more (mobile) ----------
function renderMore() {
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">More</span><h1>Everything else</h1></div></div>
  <div class="adm-more-list">
    <a href="#/calls">Calls <span>Scheduled call requests</span></a>
    <a href="#/sites">Sites <span>Demos, mockups, previews, client sites</span></a>
    <a href="#/marketing">Marketing <span>Posts, campaigns, calendar</span></a>
    <a href="#/money">Money <span>Payments, revenue, requests</span></a>
    <a href="#/clients">Clients <span>Care plans & renewals</span></a>
    <a href="#/templates">Templates <span>Email & WhatsApp</span></a>
    <a href="#/settings">Settings <span>Your name, reply-to, signature</span></a>
    <a href="/" target="_blank" rel="noopener">Open the website <span>re-charge.co.za</span></a>
  </div>`;
}

// ====================================================================
// Phase C — money & clients
// ====================================================================
function renderMoney(q) {
  const now = new Date(), som = startOfMonth().getTime(), d30 = now.getTime() - 30 * 86400e3, soy = new Date(now.getFullYear(), 0, 1).getTime();
  const ok = S.payments.filter((x) => x.status === "succeeded");
  const sum = (arr) => arr.reduce((a, x) => a + (x.amount_cents || 0), 0);
  const inRange = (from) => ok.filter((x) => Date.parse(paidAt(x)) >= from);
  const openReqs = S.requests.filter((r) => r.status === "open");
  // monthly, last 12 months, stacked by kind
  const months = [...Array(12)].map((_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: MONTHS[d.getMonth()], byKind: { deposit: 0, balance: 0, care: 0, other: 0 }, total: 0 }; });
  for (const x of ok) { const d = new Date(paidAt(x)); const m = months.find((mm) => mm.key === `${d.getFullYear()}-${pad(d.getMonth() + 1)}`); if (m) { const k = KIND_LABEL[x.kind] ? x.kind : "other"; m.byKind[k] += x.amount_cents || 0; m.total += x.amount_cents || 0; } }
  const max = Math.max(1, ...months.map((m) => m.total));
  const year = inRange(soy);
  const byKind = Object.keys(KIND_LABEL).map((k) => ({ label: KIND_LABEL[k], value: sum(year.filter((x) => (KIND_LABEL[x.kind] ? x.kind : "other") === k)) })).filter((x) => x.value);
  const catOf = (x) => { const p = byId(x.project_id); return (p?.category || []).filter((c) => !/request$/i.test(c))[0] || (x.kind === "care" ? "Hosting & Care" : "Uncategorised"); };
  const byCat = {}; for (const x of year) byCat[catOf(x)] = (byCat[catOf(x)] || 0) + (x.amount_cents || 0);
  // effective hourly rate by category (all time): revenue / hours, only where time is logged
  const rate = {}; for (const p of S.projects) { const m = minutesFor(p.id); if (!m) continue; const rev = sum(ok.filter((x) => x.project_id === p.id)); const c = (p.category || []).filter((x) => !/request$/i.test(x))[0] || "Other"; rate[c] = rate[c] || { rev: 0, min: 0 }; rate[c].rev += rev; rate[c].min += m; }
  const show = q.get("show") || "all";
  let rows = S.payments.slice();
  if (show === "unmatched") rows = rows.filter((x) => !x.project_id && !x.client_id);
  if (show === "manual") rows = rows.filter((x) => x.provider !== "yoco");
  if (show === "yoco") rows = rows.filter((x) => x.provider === "yoco");
  const bars = (items, f = money) => { const mx = Math.max(1, ...items.map((i) => i.value)); return `<ul class="adm-bars">${items.map((i) => `<li><span class="lbl">${esc(i.label)}</span><span class="track"><span class="fill" style="width:${Math.round(i.value / mx * 100)}%"></span></span><b>${f(i.value)}</b></li>`).join("") || '<li class="muted small">Nothing yet.</li>'}</ul>`; };
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Money</span><h1>${money(sum(inRange(som)))} this month</h1></div>
    <div class="adm-head__actions"><button class="btn btn--ghost btn--small" id="payCsv">Export CSV</button><button class="btn btn--primary btn--small" data-toggle-eft>Record EFT / cash</button></div></div>
  <div class="adm-tiles adm-tiles--4">
    <div class="adm-tile"><span>Last 30 days</span><b>${money(sum(inRange(d30)))}</b><small>${inRange(d30).length} payments</small></div>
    <div class="adm-tile"><span>This year</span><b>${money(sum(year))}</b><small>${year.length} payments</small></div>
    <div class="adm-tile"><span>Awaiting payment</span><b>${money(sum(openReqs))}</b><small>${openReqs.length} open link${openReqs.length === 1 ? "" : "s"}</small></div>
    <div class="adm-tile"><span>Care plans / year</span><b>${money(S.clients.filter((c) => c.care_active).reduce((a, c) => a + (c.care_amount_cents || 0), 0))}</b><small>${S.clients.filter((c) => c.care_active).length} active</small></div>
  </div>

  <form class="adm-card adm-form" id="eftForm" hidden style="margin-top:1rem">
    <h2>Record a payment received outside Yoco</h2>
    <div class="row2"><label>Project<select name="project" required><option value="">Choose…</option>${S.projects.filter(isActive).sort((a, b) => (a.business || a.name || "").localeCompare(b.business || b.name || "")).map((p) => `<option value="${esc(p.id)}">${esc(p.ref)} · ${esc(p.business || p.name || "")}</option>`).join("")}</select></label><label>Amount<span class="money"><input name="amount" inputmode="decimal" required placeholder="3000" /></span></label></div>
    <div class="row2"><label>For<select name="kind"><option value="balance">Balance / final payment</option><option value="deposit">Deposit</option><option value="care">Care plan</option><option value="other">Other</option></select></label><label>Date<input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" /></label></div>
    <div class="row2"><label>Method<select name="provider"><option value="eft">EFT</option><option value="cash">Cash</option><option value="yoco">Yoco (manual)</option><option value="other">Other</option></select></label><label>Note<input name="note" placeholder="e.g. FNB ref 12345" /></label></div>
    <p class="adm-error tiny" id="eftErr" hidden></p>
    <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn--ghost btn--small" data-toggle-eft>Cancel</button><button class="btn btn--primary btn--small" type="submit">Record payment</button></div>
  </form>

  <div class="grid grid--2" style="margin-top:1.2rem;gap:1rem">
    <div class="adm-card"><h2>Revenue by month <span class="muted">last 12 months</span></h2>
      <div class="adm-chart" role="img" aria-label="Monthly revenue bar chart">${months.map((m) => `<div class="col" title="${esc(m.label)}: ${money(m.total)}">${["other", "care", "balance", "deposit"].map((k) => m.byKind[k] ? `<div class="bar" data-k="${k}" style="height:${Math.max(2, Math.round(m.byKind[k] / max * 100))}%;border-radius:0"></div>` : "").join("")}<div class="lbl">${esc(m.label)}</div></div>`).join("")}</div>
      <div class="adm-legend"><span><i style="background:var(--accent-2)"></i>Deposits</span><span><i></i>Balances</span><span><i style="background:var(--ok)"></i>Care</span><span><i style="background:var(--border-strong)"></i>Other</span></div></div>
    <div class="adm-card"><h2>This year by type</h2>${bars(byKind)}<h2 style="margin-top:1rem">This year by category</h2>${bars(Object.entries(byCat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value))}</div>
  </div>

  <div class="grid grid--2" style="margin-top:1rem;gap:1rem">
    <div class="adm-card"><h2>Effective hourly rate <span class="muted">where time is logged</span></h2>${bars(Object.entries(rate).map(([label, r]) => ({ label: `${label} · ${hours(r.min)}`, value: r.min ? Math.round(r.rev / (r.min / 60)) : 0 })).sort((a, b) => b.value - a.value), (v) => money(v) + "/h")}<p class="tiny muted" style="margin-top:0.6rem">Log time on each project (Time card) and this tells you what you actually earn per hour by type of work — the best input for your pricing.</p></div>
    <div class="adm-card"><h2>Open payment links <span class="muted">${openReqs.length}</span></h2>${openReqs.length ? openReqs.map((r) => { const p = byId(r.project_id), c = clientById(r.client_id); return `<div class="adm-req"><span>${money(r.amount_cents)} · ${esc(KIND_LABEL[r.kind] || r.kind)} · ${p ? `<a href="#/p/${esc(p.id)}">${esc(p.ref)} ${esc(p.business || p.name || "")}</a>` : c ? `<a href="#/c/${esc(c.id)}">${esc(c.name)}</a>` : "—"}<br><span class="tiny muted">${esc(r.description || "")} · ${esc(rel(r.created_at))}</span></span><span class="adm-inline-actions" style="margin:0"><button class="btn btn--ghost" data-copy="${esc(r.redirect_url || "")}">Copy</button><button class="btn btn--ghost" data-cancelreq="${esc(r.id)}">Cancel</button></span></div>`; }).join("") : '<p class="muted small">None. Create one from a project\'s Payments card ("Request payment") or a client page.</p>'}</div>
  </div>

  <section class="adm-section"><h2>All payments <span class="count">${rows.length}</span></h2>
    <div class="adm-subtabs">${[["all", "All"], ["yoco", "Yoco"], ["manual", "Manual"], ["unmatched", "Unmatched"]].map(([v, l]) => `<a href="#/money?show=${v}" class="${show === v ? "is-active" : ""}">${l}</a>`).join("")}</div>
    <div class="table-wrap"><table class="adm-table adm-table--cards"><thead><tr><th>Date</th><th>Amount</th><th>For</th><th>Project / client</th><th>Via</th><th>Note</th><th></th></tr></thead><tbody>
      ${rows.map((x) => { const p = byId(x.project_id), c = clientById(x.client_id); return `<tr><td class="nowrap" data-l="Date">${esc(fmtD(paidAt(x)))}</td><td class="mono nowrap" data-l="Amount">${money(x.amount_cents)}</td><td data-l="For">${esc(KIND_LABEL[x.kind] || x.kind || "")}</td><td data-l="Project / client">${p ? `<a href="#/p/${esc(p.id)}">${esc(p.ref)}</a> ${esc(p.business || p.name || "")}` : c ? `<a href="#/c/${esc(c.id)}">${esc(c.name)}</a>` : `<span class="muted">${esc(x.email || "unmatched")}</span>`}</td><td data-l="Via">${esc(x.provider)}${x.status !== "succeeded" ? ` <span class="status-pill" data-s="${esc(x.status)}">${esc(x.status)}</span>` : ""}</td><td${x.note || x.reference ? ' data-l="Note"' : ""}>${esc(x.note || x.reference || "")}</td><td class="nowrap span2">${!x.project_id && !x.client_id ? `<button class="btn btn--ghost btn--small" data-match="${esc(x.id)}">Match</button>` : ""}${x.provider !== "yoco" ? ` <button class="btn btn--ghost btn--small" data-delpay="${esc(x.id)}" aria-label="Delete this manual entry">&times;</button>` : ""}</td></tr>`; }).join("") || '<tr><td colspan="7" class="muted">No payments yet.</td></tr>'}
    </tbody></table></div></section>`;
  view.querySelectorAll("[data-toggle-eft]").forEach((b) => b.addEventListener("click", () => { const f = $("eftForm"); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("select").focus(); }));
  view.querySelectorAll("[data-match]").forEach((b) => b.addEventListener("click", () => matchPayment(b.dataset.match)));
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  view.querySelectorAll("[data-cancelreq]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Cancel this payment link?")) return; await api.requests.cancel(b.dataset.cancelreq); toast("Cancelled"); await loadAll(true); route(); }));
  view.querySelectorAll("[data-delpay]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Delete this manual payment entry?")) return; await api.payments.remove(b.dataset.delpay); toast("Deleted"); await loadAll(true); route(); }));
  $("payCsv").addEventListener("click", () => {
    const cell = csvCell;
    const lines = ["date,amount_zar,kind,project_ref,project,client,provider,status,note,reference,email"].concat(S.payments.map((x) => { const p = byId(x.project_id), c = clientById(x.client_id); return [fmtDiso(paidAt(x)), (x.amount_cents || 0) / 100, x.kind, p?.ref, p?.business || p?.name, c?.name, x.provider, x.status, x.note, x.reference, x.email].map(cell).join(","); }));
    download(`re-charge-payments-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  });
  $("eftForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("eftErr");
    const cents = Math.round(Number(f.amount.value.replace(/[^\d.]/g, "")) * 100); const p = byId(f.project.value);
    if (!p || !cents) { err.hidden = false; err.textContent = "Choose a project and enter the amount."; return; }
    try {
      await api.payments.insert({ project_id: p.id, client_id: p.client_id || null, provider: f.provider.value, amount_cents: cents, currency: "ZAR", kind: f.kind.value, note: f.note.value.trim() || null, status: "succeeded", matched: true, paid_at: new Date(f.date.value || Date.now()).toISOString() });
      await api.events.insert(p.id, "payment", `${money(cents)} ${KIND_LABEL[f.kind.value].toLowerCase()} received (${f.provider.value.toUpperCase()})${f.note.value.trim() ? " — " + f.note.value.trim() : ""}`, { manual: true, kind: f.kind.value });
      if (f.kind.value === "deposit" && !p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true, ...(["new", "prospect", "contacted"].includes(p.status) ? { status: "deposit_paid" } : {}) });
      toast("Payment recorded"); await loadAll(true); route();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
}
const fmtDiso = (iso) => new Date(iso).toISOString().slice(0, 10);

// ---------- clients ----------
function renderClients() {
  const cs = S.clients.slice().sort((a, b) => (b.care_active - a.care_active) || a.name.localeCompare(b.name));
  const soon = (c) => c.care_renews_at && (Date.parse(c.care_renews_at) - Date.now()) < 30 * 86400e3;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Clients</span><h1>${cs.filter((c) => c.care_active).length} on a care plan</h1></div>
    <div class="adm-head__actions"><a class="btn btn--primary btn--small" href="#/clients/new">+ New client</a></div></div>
  <ul class="adm-list">${cs.length ? cs.map((c) => `<li><a class="adm-row" href="#/c/${esc(c.id)}">
    <div class="adm-row__main"><div class="adm-row__title">${esc(c.name)}${c.site_label ? `<span class="muted" style="font-weight:400">${esc(c.site_label)}</span>` : ""}</div>
      <div class="adm-row__meta">${c.care_active ? `<span class="chip chip--stage" data-group="done">${esc(PLAN_LABEL[c.care_plan] || "Care active")}</span>` : '<span class="chip">no plan</span>'}${c.care_renews_at ? `<span class="chip${soon(c) ? " adm-error" : ""}">renews ${esc(fmtD(c.care_renews_at))}</span>` : ""}${c.care_amount_cents ? `<span class="chip">${money(c.care_amount_cents)}/yr</span>` : ""}</div></div>
    <div class="adm-row__side"><span>${S.projects.filter((p) => p.client_id === c.id).length} project${S.projects.filter((p) => p.client_id === c.id).length === 1 ? "" : "s"}</span><span>${money(S.payments.filter((x) => x.status === "succeeded" && (x.client_id === c.id || S.projects.some((p) => p.client_id === c.id && p.id === x.project_id))).reduce((a, x) => a + (x.amount_cents || 0), 0))}</span></div></a></li>`).join("") : '<li class="adm-empty">No clients yet. Open a live project and press "Convert to client", or add one here.</li>'}</ul>`;
}
function clientProject(c) {
  // a pseudo-project so templates can be filled for a client without a project
  const p = S.projects.filter((x) => x.client_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return { id: null, _client_id: c.id, name: p?.name || c.name, business: c.name, email: c.email || p?.email || "", phone: c.phone || p?.phone || "", ref: p?.ref || "", category: p?.category || [], goal: "", quote_cents: c.care_amount_cents || null, preview_url: c.site_label ? "https://" + c.site_label : (p?.preview_url || ""), indicative_price: "" };
}
async function renderClient(id) {
  const c = clientById(id);
  if (!c) { view.innerHTML = '<p class="adm-error">Client not found.</p>'; return; }
  const projects = S.projects.filter((p) => p.client_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pays = S.payments.filter((x) => x.status === "succeeded" && (x.client_id === c.id || projects.some((p) => p.id === x.project_id))).sort((a, b) => paidAt(b).localeCompare(paidAt(a)));
  const reqs = S.requests.filter((r) => (r.client_id === c.id || projects.some((p) => p.id === r.project_id)) && r.status === "open");
  const days = c.care_renews_at ? Math.ceil((Date.parse(c.care_renews_at) - Date.now()) / 86400e3) : null;
  const pp = clientProject(c);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/clients">Clients</a> · since ${esc(fmtD(c.created_at))}</span><h1>${esc(c.name)}</h1>${c.site_label ? `<p class="muted"><a href="https://${esc(c.site_label)}" target="_blank" rel="noopener">${esc(c.site_label)}</a></p>` : ""}</div>
    <div class="adm-actions"><a class="btn btn--ghost" href="#/c/${esc(c.id)}/edit">Edit</a></div></div>
  <div class="adm-detail">
    <div>
      <div class="adm-card">
        <dl class="adm-kv">
          ${c.email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}
          ${c.phone ? `<dt>Phone</dt><dd>${esc(c.phone)}</dd>` : ""}
          <dt>Care plan</dt><dd>${c.care_active ? `${esc(PLAN_LABEL[c.care_plan] || "Active")}${c.care_amount_cents ? " · " + money(c.care_amount_cents) + "/year" : ""}` : "None"}</dd>
          ${c.care_renews_at ? `<dt>Renews</dt><dd>${esc(fmtD(c.care_renews_at))} <span class="${days < 30 ? "adm-error" : "muted"}">(${days < 0 ? Math.abs(days) + " days overdue" : "in " + days + " days"})</span></dd>` : ""}
          ${(c.report_emails || []).length ? `<dt>Reports to</dt><dd>${esc(c.report_emails.join(", "))}</dd>` : ""}
          ${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}
        </dl>
        <div class="adm-contact">
          ${pp.email ? `<button type="button" class="btn btn--primary" data-ccompose="email">Email</button>` : ""}
          ${pp.phone ? `<button type="button" class="btn btn--ghost" data-ccompose="whatsapp">WhatsApp</button><a class="btn btn--ghost" href="${esc(telLink(pp.phone))}">Call</a>` : ""}
        </div>
      </div>
      <div class="adm-card" style="margin-top:1rem"><h2>Projects <span class="muted">${projects.length}</span></h2>
        <ul class="adm-list">${projects.map((p) => `<li>${projectRow(p)}</li>`).join("") || '<li class="adm-empty">No projects linked. Open a project → Client card → "Link existing".</li>'}</ul></div>
    </div>
    <div class="adm-detail__side">
      <div class="adm-card"><h2>Care renewal</h2>
        ${c.care_active ? `<p class="small muted">Request the renewal (${c.care_amount_cents ? money(c.care_amount_cents) : "set the plan price under Edit"}) with a Yoco link, then email it with the "Care renewal due" template.</p>
        <div class="adm-inline-actions" style="margin-top:0.6rem">${c.care_amount_cents ? '<button class="btn btn--primary" id="reqRenewal">Create renewal payment link</button>' : ""}<button class="btn btn--ghost" id="renewEmail">Email renewal notice</button><button class="btn btn--ghost" id="renewPlusYear">Mark renewed (+1 year)</button></div>
        ${reqs.length ? `<div style="margin-top:0.8rem">${reqs.map((r) => `<div class="adm-req"><span>${money(r.amount_cents)} · ${esc(KIND_LABEL[r.kind] || r.kind)} <span class="status-pill" data-s="open">open</span></span><span class="adm-inline-actions" style="margin:0"><button class="btn btn--ghost" data-copy="${esc(r.redirect_url || "")}">Copy link</button></span></div>`).join("")}</div>` : ""}
        <p class="adm-error tiny" id="renewErr" hidden></p>` : '<p class="small muted">No care plan. Set one under Edit to track renewals here.</p>'}
      </div>
      <div class="adm-card" style="margin-top:1rem"><h2>Payments <span class="muted">${money(pays.reduce((a, x) => a + (x.amount_cents || 0), 0))} total</span></h2>
        ${pays.length ? `<ul class="adm-timeline">${pays.slice(0, 20).map((x) => `<li data-kind="payment"><span class="tl-dot"></span><div><time>${esc(fmtDT(paidAt(x)))} · ${esc(x.provider)} · ${esc(KIND_LABEL[x.kind] || x.kind || "")}</time><p>${money(x.amount_cents)}${x.note || x.reference ? " — " + esc(x.note || x.reference) : ""}</p></div></li>`).join("")}</ul>` : '<p class="muted small">No payments yet.</p>'}
      </div>
    </div>
  </div>`;
  view.querySelectorAll("[data-ccompose]").forEach((b) => b.addEventListener("click", () => openCompose(pp, b.dataset.ccompose, { onDone: () => renderClient(c.id) })));
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  $("reqRenewal")?.addEventListener("click", async () => {
    const btn = $("reqRenewal"); btn.disabled = true;
    try { const r = await api.requestPayment({ clientId: c.id, projectId: projects[0]?.id || null, amountCents: c.care_amount_cents, kind: "care", description: `${PLAN_LABEL[c.care_plan] || "Care plan"} renewal — ${c.name}` }); toast("Renewal link created"); try { await navigator.clipboard.writeText(r.redirectUrl); } catch {} await loadAll(true); renderClient(c.id); }
    catch (ex) { $("renewErr").hidden = false; $("renewErr").textContent = ex.message; btn.disabled = false; }
  });
  $("renewEmail")?.addEventListener("click", () => openCompose(pp, "email", { templateId: S.templates.find((t) => t.kind === "email" && !t.archived && /renewal/i.test(t.name))?.id, onDone: () => renderClient(c.id) }));
  $("renewPlusYear")?.addEventListener("click", async () => {
    const base = c.care_renews_at ? new Date(c.care_renews_at) : new Date(); base.setFullYear(base.getFullYear() + 1);
    await api.clients.update(c.id, { care_renews_at: base.toISOString().slice(0, 10) }); toast("Renewal date moved to " + fmtD(base.toISOString())); await loadAll(true); renderClient(c.id);
  });
}
function renderClientEditor(c, q) {
  const isNew = !c;
  c = c || { name: q.get("name") || "", slug: "", site_label: "", email: "", phone: "", care_active: false, care_plan: "care", care_amount_cents: null, care_renews_at: "", report_emails: [], notes: "" };
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/clients">Clients</a> · ${isNew ? "New" : "Edit"}</span><h1>${esc(c.name || "New client")}</h1></div></div>
  <div class="adm-card" style="max-width:40rem"><form class="adm-form" id="clientForm">
    <div class="row2"><label>Business name<input name="name" value="${esc(c.name)}" required /></label><label>Website <span class="muted" style="font-weight:400">(domain)</span><input name="site_label" value="${esc(c.site_label || "")}" placeholder="mikesplumbing.co.za" /></label></div>
    <div class="row2"><label>Email<input type="email" name="email" value="${esc(c.email || "")}" /></label><label>Phone / WhatsApp<input type="tel" name="phone" value="${esc(c.phone || "")}" /></label></div>
    <h3 style="font-size:0.9rem;margin-top:0.3rem">Hosting & care</h3>
    <label class="check"><input type="checkbox" name="care_active" ${c.care_active ? "checked" : ""} /> On an active plan (monthly report + renewal reminders)</label>
    <div class="row2"><label>Plan<select name="care_plan">${Object.entries(PLAN_LABEL).map(([v, l]) => `<option value="${v}"${c.care_plan === v ? " selected" : ""}>${l}</option>`).join("")}</select></label><label>Price per year<span class="money"><input name="care_amount" inputmode="decimal" value="${c.care_amount_cents ? c.care_amount_cents / 100 : ""}" placeholder="600" /></span></label></div>
    <div class="row2"><label>Renews on<input type="date" name="care_renews_at" value="${esc(c.care_renews_at || "")}" /></label><label>Monthly report to <span class="muted" style="font-weight:400">(comma-separated)</span><input name="report_emails" value="${esc((c.report_emails || []).join(", "))}" placeholder="owner@business.co.za" /></label></div>
    <label>Notes<textarea name="notes" rows="3">${esc(c.notes || "")}</textarea></label>
    <p class="adm-error tiny" id="clientErr" hidden></p>
    <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="clientDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="${isNew ? "#/clients" : "#/c/" + esc(c.id)}">Cancel</a><button class="btn btn--primary btn--small" type="submit">Save client</button></div>
  </form></div>`;
  $("clientForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("clientErr");
    const amt = f.care_amount.value.replace(/[^\d.]/g, "");
    const row = { name: f.name.value.trim(), site_label: f.site_label.value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null, email: f.email.value.trim() || null, phone: f.phone.value.trim() || null, care_active: f.care_active.checked, care_plan: f.care_plan.value, care_amount_cents: amt ? Math.round(Number(amt) * 100) : null, care_renews_at: f.care_renews_at.value || null, report_emails: f.report_emails.value.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x)), notes: f.notes.value.trim() || null };
    if (!row.name) return;
    if (isNew) row.slug = slugify(row.name) + "-" + Math.random().toString(36).slice(2, 6);
    try { const saved = isNew ? await api.clients.insert(row) : await api.clients.update(c.id, row); toast("Client saved"); await loadAll(true); location.hash = "#/c/" + saved.id; }
    catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
  $("clientDelete")?.addEventListener("click", async () => { if (!confirm(`Delete client "${c.name}"? Projects and payments stay, just unlinked.`)) return; await api.clients.remove(c.id); toast("Deleted"); await loadAll(true); location.hash = "#/clients"; });
}


// ====================================================================
// Marketing — content library, campaigns, attribution, calendar
// ====================================================================
const CHANNELS = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", whatsapp: "WhatsApp", x: "X", tiktok: "TikTok", google: "Google Business", email: "Email", other: "Other" };
const PSTATUS = { idea: "Idea", drafted: "Drafted", scheduled: "Scheduled", posted: "Posted", archived: "Archived" };
const campById = (id) => S.campaigns.find((c) => c.id === id);
const trackedLink = (link, camp) => { if (!link) return ""; try { const u = new URL(link); if (camp?.code) u.searchParams.set("src", camp.code); return u.toString(); } catch { return link; } };
function campaignStats(c) {
  const leads = S.projects.filter((p) => !p.spam && p.channel === c.code);
  const ids = new Set(leads.map((p) => p.id));
  const revenue = S.payments.filter((x) => x.status === "succeeded" && ids.has(x.project_id)).reduce((a, x) => a + (x.amount_cents || 0), 0);
  const deposits = leads.filter((p) => p.deposit_paid).length;
  const posts = S.posts.filter((p) => p.campaign_id === c.id);
  const reach = (c.reach || 0) + posts.reduce((a, p) => a + (Number(p.results?.reach) || 0), 0);
  const clicks = (c.clicks || 0) + posts.reduce((a, p) => a + (Number(p.results?.clicks) || 0), 0);
  return { leads, deposits, revenue, posts, reach, clicks, cpl: c.spend_cents && leads.length ? Math.round(c.spend_cents / leads.length) : null };
}
function finalPostText(post) {
  const camp = campById(post.campaign_id);
  const link = trackedLink(post.link, camp);
  const body = renderTpl(post.body, { ...ctxFor(null), link, start_link: trackedLink("https://re-charge.co.za/start", camp), mockup_link: trackedLink("https://re-charge.co.za/#mockup", camp) }).text;
  return (body + (post.hashtags ? "\n\n" + post.hashtags.trim() : "")).trim();
}
function composerLink(channel, text, link) {
  const t = encodeURIComponent(text), u = encodeURIComponent(link || "https://re-charge.co.za/");
  switch (channel) {
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`;
    case "linkedin": return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "x": return `https://twitter.com/intent/tweet?text=${t}`;
    case "whatsapp": return `https://wa.me/?text=${t}`;
    case "instagram": return "https://www.instagram.com/";
    case "tiktok": return "https://www.tiktok.com/upload";
    case "google": return "https://business.google.com/posts";
    default: return "";
  }
}
const postRow = (p) => { const camp = campById(p.campaign_id); const when = p.status === "posted" ? p.posted_at : p.scheduled_at; return `
  <a class="adm-row" href="#/marketing/post/${esc(p.id)}"><div class="adm-row__main"><div class="adm-row__title"><span class="chan" data-c="${esc(p.channel)}">${esc(CHANNELS[p.channel] || p.channel)}</span>${esc(p.title)}</div>
    <div class="adm-row__sub">${esc(p.body.slice(0, 120))}</div><div class="adm-row__meta"><span class="pstatus" data-s="${esc(p.status)}">${esc(PSTATUS[p.status] || p.status)}</span>${camp ? `<span class="chip">📣 ${esc(camp.name)}</span>` : ""}${p.results?.reach ? `<span class="chip">${esc(String(p.results.reach))} reach</span>` : ""}</div></div>
    <div class="adm-row__side">${when ? `<span>${esc(fmtD(when))}</span>` : ""}</div></a>`; };

function renderMarketing(q) {
  const tab = q.get("tab") || "calendar";
  const posts = S.posts.filter((p) => p.status !== "archived");
  const week = Date.now() + 7 * 86400e3;
  const scheduled = posts.filter((p) => p.status === "scheduled" && p.scheduled_at && Date.parse(p.scheduled_at) <= week);
  const active = S.campaigns.filter((c) => c.status === "active");
  const som = startOfMonth().getTime();
  const leadsMonth = S.projects.filter((p) => !p.spam && p.channel && S.campaigns.some((c) => c.code === p.channel) && Date.parse(p.created_at) >= som);
  const spendMonth = active.reduce((a, c) => a + (c.spend_cents || 0), 0);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Marketing</span><h1>${tab === "posts" ? posts.length + " posts" : tab === "campaigns" ? S.campaigns.length + " campaigns" : "Calendar"}</h1></div>
    <div class="adm-head__actions"><a class="btn btn--ghost btn--small" href="#/marketing/campaign/new">+ Campaign</a><a class="btn btn--primary btn--small" href="#/marketing/post/new">+ Post</a></div></div>
  <div class="adm-tiles adm-tiles--4">
    <div class="adm-tile"><span>Posting this week</span><b>${scheduled.length}</b><small>${posts.filter((p) => p.status === "idea" || p.status === "drafted").length} in the drawer</small></div>
    <div class="adm-tile"><span>Active campaigns</span><b>${active.length}</b><small>${money(spendMonth)} spent</small></div>
    <div class="adm-tile"><span>Campaign leads · month</span><b>${leadsMonth.length}</b><small>${leadsMonth.filter((p) => p.deposit_paid).length} paid deposit</small></div>
    <div class="adm-tile"><span>Cost per lead</span><b>${leadsMonth.length && spendMonth ? money(Math.round(spendMonth / leadsMonth.length)) : "—"}</b></div>
  </div>
  <div class="adm-subtabs" style="margin-top:1rem">${[["calendar", "Calendar"], ["posts", "Posts"], ["campaigns", "Campaigns"]].map(([v, l]) => `<a href="#/marketing?tab=${v}" class="${tab === v ? "is-active" : ""}">${l}</a>`).join("")}</div>
  ${tab === "posts" ? renderPostsTab(q, posts) : tab === "campaigns" ? renderCampaignsTab() : renderCalendarTab(q)}`;
  view.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("change", () => { const n = new URLSearchParams(q); el.value ? n.set(el.dataset.filter, el.value) : n.delete(el.dataset.filter); location.hash = "#/marketing?" + n; }));
}
function renderPostsTab(q, posts) {
  const st = q.get("status") || "", ch = q.get("channel") || "";
  let rows = posts; if (st) rows = rows.filter((p) => p.status === st); if (ch) rows = rows.filter((p) => p.channel === ch);
  rows = rows.slice().sort((a, b) => (b.scheduled_at || b.updated_at).localeCompare(a.scheduled_at || a.updated_at));
  const sel = (name, opts, cur, label) => `<select aria-label="${label}" data-filter="${name}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  return `<div class="adm-filters">${sel("status", Object.entries(PSTATUS).filter(([v]) => v !== "archived"), st, "All statuses")}${sel("channel", Object.entries(CHANNELS), ch, "All channels")}</div>
  <ul class="adm-list">${rows.length ? rows.map((p) => `<li>${postRow(p)}</li>`).join("") : '<li class="adm-empty">No posts yet. Save ideas as you have them — a title is enough.</li>'}</ul>`;
}
function renderCampaignsTab() {
  const cs = S.campaigns.slice().sort((a, b) => ({ active: 0, planned: 1, paused: 2, done: 3 }[a.status] - { active: 0, planned: 1, paused: 2, done: 3 }[b.status]) || b.created_at.localeCompare(a.created_at));
  return `<ul class="adm-list">${cs.length ? cs.map((c) => { const st = campaignStats(c); return `<li><a class="adm-row" href="#/marketing/campaign/${esc(c.id)}"><div class="adm-row__main"><div class="adm-row__title">${esc(c.name)} <span class="pstatus" data-s="${c.status === "active" ? "scheduled" : c.status === "done" ? "posted" : "idea"}">${esc(c.status)}</span></div>
    <div class="adm-row__sub">${esc(c.audience || c.goal || "")}</div><div class="adm-row__meta">${(c.channels || []).map((x) => `<span class="chan" data-c="${esc(x)}">${esc(CHANNELS[x] || x)}</span>`).join("")}<span class="chip">?src=${esc(c.code)}</span></div></div>
    <div class="adm-row__side"><span>${st.leads.length} lead${st.leads.length === 1 ? "" : "s"}</span><span>${money(st.revenue)} revenue</span>${st.cpl != null ? `<span>${money(st.cpl)}/lead</span>` : c.spend_cents ? `<span>${money(c.spend_cents)} spent</span>` : ""}</div></a></li>`; }).join("") : '<li class="adm-empty">No campaigns yet. A campaign is a name + a tracked link; leads that arrive through it are credited automatically.</li>'}</ul>`;
}
function renderCalendarTab(q) {
  const [y, m] = (q.get("m") || `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`).split("-").map(Number);
  const first = new Date(y, m - 1, 1), last = new Date(y, m, 0);
  const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const items = {};
  const add = (d, it) => { const k = key(d); (items[k] = items[k] || []).push(it); };
  for (const p of S.posts) { if (p.status === "archived") continue; const w = p.status === "posted" ? p.posted_at : p.scheduled_at; if (w) add(new Date(w), { t: p.status === "posted" ? "posted" : "post", label: `${CHANNELS[p.channel] || p.channel}: ${p.title}`, href: `#/marketing/post/${p.id}` }); }
  for (const p of S.projects) {
    if (p.spam) continue;
    if (isCall(p)) { const d = callDate(p); if (d) add(d, { t: "call", label: `Call ${p.name || p.business || p.ref}`, href: `#/p/${p.id}` }); }
    if (p.next_action_at && isActive(p)) add(new Date(p.next_action_at), { t: "followup", label: `${p.next_action || "Follow up"} · ${p.business || p.name || p.ref}`, href: `#/p/${p.id}` });
  }
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));   // Monday-first grid
  const cells = []; const today = key(new Date());
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); if (i >= 35 && d > last) break; cells.push(d); }
  const upcoming = Object.entries(items).filter(([k]) => k >= today).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12);
  return `<div class="adm-head" style="margin-bottom:0.6rem"><h2 style="font-size:1.05rem">${esc(first.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }))}</h2><div class="adm-head__actions"><a class="btn btn--ghost btn--small" href="#/marketing?tab=calendar&m=${prev.getFullYear()}-${pad(prev.getMonth() + 1)}">‹ ${MONTHS[prev.getMonth()]}</a><a class="btn btn--ghost btn--small" href="#/marketing?tab=calendar">Today</a><a class="btn btn--ghost btn--small" href="#/marketing?tab=calendar&m=${next.getFullYear()}-${pad(next.getMonth() + 1)}">${MONTHS[next.getMonth()]} ›</a></div></div>
  <div class="adm-cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="adm-cal__dow">${d}</div>`).join("")}
    ${cells.map((d) => { const k = key(d); const its = items[k] || []; return `<div class="adm-cal__day${d.getMonth() !== m - 1 ? " is-other" : ""}${k === today ? " is-today" : ""}"><span class="adm-cal__num">${d.getDate()}</span><div class="adm-cal__items">${its.slice(0, 4).map((it) => `<a class="adm-cal__it" data-t="${it.t}" href="${esc(it.href)}" title="${esc(it.label)}">${esc(it.label)}</a>`).join("")}${its.length > 4 ? `<span class="tiny muted">+${its.length - 4}</span>` : ""}</div></div>`; }).join("")}
  </div>
  <div class="adm-legend"><span><i></i>Scheduled post</span><span><i style="background:var(--border-strong)"></i>Posted</span><span><i style="background:var(--ok)"></i>Call</span><span><i style="background:#ffb547"></i>Follow-up</span></div>
  <section class="adm-section adm-cal-list"><h2>Coming up</h2><ul class="adm-list">${upcoming.length ? upcoming.map(([k, its]) => `<li><div class="adm-row"><div class="adm-row__main"><div class="adm-row__title">${esc(fmtD(k + "T12:00:00"))}</div><div class="adm-row__meta">${its.map((it) => `<a class="chip" href="${esc(it.href)}" style="text-decoration:none">${esc(it.label)}</a>`).join("")}</div></div></div></li>`).join("") : '<li class="adm-empty">Nothing scheduled. Add a post and give it a date.</li>'}</ul></section>`;
}

async function renderPostEditor(id, q) {
  const isNew = !id || id === "new";
  let post = isNew ? { title: "", channel: q.get("channel") || "facebook", campaign_id: q.get("campaign") || null, body: "", hashtags: "", link: "https://re-charge.co.za/", image_path: null, status: "idea", scheduled_at: null, posted_at: null, post_url: "", results: {} } : S.posts.find((p) => p.id === id);
  if (!post) { view.innerHTML = '<p class="adm-error">Post not found.</p>'; return; }
  const imgUrl = post.image_path ? await api.storage.url(post.image_path).catch(() => "") : "";
  const camp = campById(post.campaign_id);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/marketing?tab=posts">Posts</a> · ${isNew ? "New" : PSTATUS[post.status]}</span><h1>${esc(post.title || "New post")}</h1></div>
    ${isNew ? "" : `<div class="adm-actions"><button class="btn btn--ghost" id="postDup">Duplicate for…</button><button class="btn btn--ghost" id="postArchive">${post.status === "archived" ? "Unarchive" : "Archive"}</button></div>`}</div>
  <div class="adm-detail">
    <div class="adm-card"><form class="adm-form" id="postForm">
      <label>Title <span class="muted" style="font-weight:400">(for you, not published)</span><input name="title" value="${esc(post.title)}" required placeholder="e.g. Before/after: salon mockup" /></label>
      <div class="row2"><label>Channel<select name="channel">${Object.entries(CHANNELS).map(([v, l]) => `<option value="${v}"${post.channel === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Campaign<select name="campaign_id"><option value="">— none —</option>${S.campaigns.map((c) => `<option value="${esc(c.id)}"${post.campaign_id === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label></div>
      <label>Text<textarea name="body" rows="8" placeholder="Write it the way you'd say it. Use {{link}} where the link should go.">${esc(post.body)}</textarea></label>
      <div class="adm-vars"><button type="button" data-ins="{{link}}">{{link}}</button><button type="button" data-ins="{{start_link}}">{{start_link}}</button><button type="button" data-ins="{{mockup_link}}">{{mockup_link}}</button><button type="button" data-ins="{{my_whatsapp}}">{{my_whatsapp}}</button></div>
      <div class="row2"><label>Hashtags<input name="hashtags" value="${esc(post.hashtags || "")}" placeholder="#durban #smallbusiness" /></label><label>Link <span class="muted" style="font-weight:400">(campaign code is added automatically)</span><input type="url" name="link" value="${esc(post.link || "")}" /></label></div>
      <label>Image<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
      ${imgUrl ? `<div><img class="adm-post-img" src="${esc(imgUrl)}" alt="" /><div class="adm-inline-actions"><button type="button" class="btn btn--ghost" id="imgRemove">Remove image</button></div></div>` : ""}
      <div class="row2"><label>Status<select name="status">${Object.entries(PSTATUS).map(([v, l]) => `<option value="${v}"${post.status === v ? " selected" : ""}>${l}</option>`).join("")}</select></label><label>Scheduled for<input type="datetime-local" name="scheduled_at" value="${esc(datetimeLocal(post.scheduled_at))}" /></label></div>
      <div id="postedRows"${post.status === "posted" ? "" : " hidden"}>
        <label>Post URL<input type="url" name="post_url" value="${esc(post.post_url || "")}" placeholder="https://www.facebook.com/…" /></label>
        <div class="row2" style="margin-top:0.7rem"><label>Reach<input name="r_reach" inputmode="numeric" value="${esc(post.results?.reach ?? "")}" /></label><label>Likes / reactions<input name="r_likes" inputmode="numeric" value="${esc(post.results?.likes ?? "")}" /></label></div>
        <div class="row2" style="margin-top:0.7rem"><label>Comments<input name="r_comments" inputmode="numeric" value="${esc(post.results?.comments ?? "")}" /></label><label>Link clicks<input name="r_clicks" inputmode="numeric" value="${esc(post.results?.clicks ?? "")}" /></label></div>
      </div>
      <p class="adm-error tiny" id="postErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="postDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="#/marketing?tab=posts">Cancel</a><button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form></div>
    <div class="adm-detail__side">
      <div class="adm-card"><h2>Publish</h2>
        <div class="adm-final" id="finalText"></div>
        ${camp ? `<p class="tiny muted" style="margin-top:0.5rem">Tracked link for <b>${esc(camp.name)}</b>: <span class="mono">${esc(trackedLink(post.link, camp))}</span></p>` : '<p class="tiny muted" style="margin-top:0.5rem">Tip: attach a campaign and the link gets a ?src= code, so leads from this post are credited to it.</p>'}
        <div class="adm-inline-actions" style="margin-top:0.8rem"><button type="button" class="btn btn--primary" id="copyText">Copy text</button><a class="btn btn--ghost" id="openComposer" href="#" target="_blank" rel="noopener">Open composer</a>${imgUrl ? `<a class="btn btn--ghost" href="${esc(imgUrl)}" download>Download image</a>` : ""}${isNew ? "" : '<button type="button" class="btn btn--ghost" id="markPosted">Mark as posted</button>'}</div>
        <p class="tiny muted" id="composerHint" style="margin-top:0.6rem"></p>
      </div>
    </div>
  </div>`;
  const form = $("postForm");
  const current = () => ({ ...post, title: form.title.value, channel: form.channel.value, campaign_id: form.campaign_id.value || null, body: form.body.value, hashtags: form.hashtags.value, link: form.link.value });
  const refresh = () => {
    const p = current(), text = finalPostText(p), camp2 = campById(p.campaign_id);
    $("finalText").textContent = text || "(nothing to publish yet)";
    const href = composerLink(p.channel, text, trackedLink(p.link, camp2));
    const a = $("openComposer"); a.href = href || "#"; a.hidden = !href;
    $("composerHint").textContent = { facebook: "Facebook opens a share window with the link; paste the text into it (it's copied for you).", instagram: "Instagram has no web composer: text is copied — post from the app with the downloaded image, then paste the post URL here.", linkedin: "LinkedIn pre-fills the link; paste the copied text above it.", x: "X opens with the text filled in.", whatsapp: "Opens WhatsApp with the text ready to forward or post to your Status.", tiktok: "Opens TikTok upload; caption is copied.", google: "Opens Google Business posts; text is copied.", email: "Use Templates → Email for email sends; this just keeps the copy.", other: "Text is copied." }[p.channel] || "";
    $("postedRows").hidden = form.status.value !== "posted";
  };
  form.addEventListener("input", refresh); form.addEventListener("change", refresh); refresh();
  view.querySelectorAll("[data-ins]").forEach((b) => b.addEventListener("click", () => { const ta = form.body, v = b.dataset.ins, s0 = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s0) + v + ta.value.slice(ta.selectionEnd ?? s0); ta.focus(); refresh(); }));
  $("copyText").addEventListener("click", async () => { const t = finalPostText(current()); try { await navigator.clipboard.writeText(t); toast("Text copied"); } catch { prompt("Copy this:", t); } });
  $("openComposer").addEventListener("click", async () => { const t = finalPostText(current()); try { await navigator.clipboard.writeText(t); toast("Text copied — paste it in the composer"); } catch {} });
  $("imgRemove")?.addEventListener("click", async () => { await api.storage.remove(post.image_path).catch(() => {}); post = await api.posts.update(post.id, { image_path: null }); await loadAll(true); renderPostEditor(post.id, q); });
  const collect = async () => {
    const f = form, row = { title: f.title.value.trim(), channel: f.channel.value, campaign_id: f.campaign_id.value || null, body: f.body.value.replace(/\r\n/g, "\n"), hashtags: f.hashtags.value.trim() || null, link: f.link.value.trim() || null, status: f.status.value, scheduled_at: f.scheduled_at.value ? new Date(f.scheduled_at.value).toISOString() : null, post_url: f.post_url.value.trim() || null, results: {} };
    for (const [k, n] of [["reach", "r_reach"], ["likes", "r_likes"], ["comments", "r_comments"], ["clicks", "r_clicks"]]) { const v = f[n].value.replace(/\D/g, ""); if (v) row.results[k] = Number(v); }
    if (row.status === "posted" && !post.posted_at) row.posted_at = new Date().toISOString();
    if (row.status === "scheduled" && !row.scheduled_at) throw new Error("Give a scheduled post a date.");
    if (f.image.files[0]) { const file = f.image.files[0]; if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB."); row.image_path = await api.storage.upload(file); }
    return row;
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("postErr"); err.hidden = true;
    try { const row = await collect(); const saved = isNew ? await api.posts.insert(row) : await api.posts.update(post.id, row); toast("Post saved"); await loadAll(true); location.hash = isNew ? "#/marketing/post/" + saved.id : "#/marketing?tab=posts"; if (!isNew) return; }
    catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
  $("markPosted")?.addEventListener("click", async () => {
    const url = prompt("Paste the URL of the published post (optional):", form.post_url.value || "");
    if (url === null) return;
    try { await api.posts.update(post.id, { status: "posted", posted_at: new Date().toISOString(), post_url: url.trim() || null }); toast("Marked as posted"); await loadAll(true); renderPostEditor(post.id, q); } catch (ex) { toast(ex.message, true); }
  });
  $("postDup")?.addEventListener("click", async () => {
    const ch = prompt("Duplicate for which channel? " + Object.keys(CHANNELS).join(", "), post.channel === "facebook" ? "instagram" : "facebook");
    if (!ch || !CHANNELS[ch]) return;
    let image_path = null;
    if (post.image_path) { try { image_path = await api.storage.copy(post.image_path); } catch (e) { console.warn("image copy failed", e); } }
    const n = await api.posts.insert({ title: post.title, channel: ch, campaign_id: post.campaign_id, body: post.body, hashtags: post.hashtags, link: post.link, image_path, status: "drafted" });
    await loadAll(true); location.hash = "#/marketing/post/" + n.id;
  });
  $("postArchive")?.addEventListener("click", async () => { await api.posts.update(post.id, { status: post.status === "archived" ? "drafted" : "archived" }); await loadAll(true); location.hash = "#/marketing?tab=posts"; });
  $("postDelete")?.addEventListener("click", async () => { if (!confirm(`Delete "${post.title}"?`)) return; if (post.image_path) await api.storage.remove(post.image_path).catch(() => {}); await api.posts.remove(post.id); toast("Deleted"); await loadAll(true); location.hash = "#/marketing?tab=posts"; });
}

function renderCampaignEditor(id, q) {
  const isNew = !id || id === "new";
  const c = isNew ? { name: "", code: "", goal: "", audience: "", channels: [], status: "planned", starts_on: "", ends_on: "", budget_cents: null, spend_cents: 0, reach: null, clicks: null, notes: "" } : campById(id);
  if (!c) { view.innerHTML = '<p class="adm-error">Campaign not found.</p>'; return; }
  const st = isNew ? null : campaignStats(c);
  const link = isNew ? "" : trackedLink("https://re-charge.co.za/", c);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/marketing?tab=campaigns">Campaigns</a> · ${isNew ? "New" : esc(c.status)}</span><h1>${esc(c.name || "New campaign")}</h1></div>
    ${isNew ? "" : `<div class="adm-head__actions"><a class="btn btn--primary btn--small" href="#/marketing/post/new?campaign=${esc(c.id)}">+ Post in this campaign</a></div>`}</div>
  <div class="adm-detail">
    <div class="adm-card"><form class="adm-form" id="campForm">
      <div class="row2"><label>Name<input name="name" value="${esc(c.name)}" required placeholder="e.g. Durban salons — September" /></label><label>Tracking code <span class="muted" style="font-weight:400">(?src=)</span><input name="code" value="${esc(c.code)}" placeholder="fb-durban-salons" pattern="[a-z0-9\\-]{2,40}" /></label></div>
      <div class="row2"><label>Goal<input name="goal" value="${esc(c.goal || "")}" placeholder="e.g. 10 mockup requests" /></label><label>Audience<input name="audience" value="${esc(c.audience || "")}" placeholder="e.g. salons in Durban without a website" /></label></div>
      <label>Channels<div class="pill-row" style="margin-top:0.2rem">${Object.entries(CHANNELS).map(([v, l]) => `<label class="check" style="display:inline-flex;gap:0.35rem;align-items:center;border:1px solid var(--border-strong);border-radius:999px;padding:0.25rem 0.7rem;font-size:0.8rem"><input type="checkbox" name="channels" value="${v}" ${(c.channels || []).includes(v) ? "checked" : ""} style="width:auto;accent-color:var(--accent)" />${l}</label>`).join("")}</div></label>
      <div class="row2"><label>Status<select name="status">${["planned", "active", "paused", "done"].map((v) => `<option value="${v}"${c.status === v ? " selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select></label><label>Budget<span class="money"><input name="budget" inputmode="decimal" value="${c.budget_cents ? c.budget_cents / 100 : ""}" /></span></label></div>
      <div class="row2"><label>Starts<input type="date" name="starts_on" value="${esc(c.starts_on || "")}" /></label><label>Ends<input type="date" name="ends_on" value="${esc(c.ends_on || "")}" /></label></div>
      <h3 style="font-size:0.9rem;margin-top:0.3rem">Results so far <span class="muted" style="font-weight:400">(from the ad platform; leads and revenue are counted automatically)</span></h3>
      <div class="row2"><label>Spent<span class="money"><input name="spend" inputmode="decimal" value="${c.spend_cents ? c.spend_cents / 100 : ""}" /></span></label><label>Reach / impressions<input name="reach" inputmode="numeric" value="${esc(c.reach ?? "")}" /></label></div>
      <label>Link clicks<input name="clicks" inputmode="numeric" value="${esc(c.clicks ?? "")}" /></label>
      <label>Notes<textarea name="notes" rows="3">${esc(c.notes || "")}</textarea></label>
      <p class="adm-error tiny" id="campErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="campDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="#/marketing?tab=campaigns">Cancel</a><button class="btn btn--primary btn--small" type="submit">Save campaign</button></div>
    </form></div>
    <div class="adm-detail__side">
      ${isNew ? '<div class="adm-card"><h2>How attribution works</h2><p class="small muted">Every campaign gets a link like <span class="mono">re-charge.co.za/?src=your-code</span>. Anyone who arrives through it and later enquires — even days later, from another page — is credited to this campaign, so you see real leads, deposits and revenue per campaign, and cost per lead once you enter spend.</p></div>' : `
      <div class="adm-card"><h2>Tracked link</h2><div class="adm-link"><span>${esc(link)}</span><button type="button" class="btn btn--ghost btn--small" data-copy="${esc(link)}">Copy</button></div>
        <p class="tiny muted" style="margin-top:0.5rem">Use it in ads, bios and posts. Add the same <span class="mono">?src=${esc(c.code)}</span> to any page, e.g. <span class="mono">/start?src=${esc(c.code)}</span>.</p></div>
      <div class="adm-card" style="margin-top:1rem"><h2>Return</h2>
        <div class="adm-roi"><div><span>Leads</span><b>${st.leads.length}</b></div><div><span>Deposits</span><b>${st.deposits}</b></div><div><span>Revenue</span><b>${money(st.revenue)}</b></div>
          <div><span>Spent</span><b>${money(c.spend_cents || 0)}</b></div><div><span>Cost / lead</span><b>${st.cpl != null ? money(st.cpl) : "—"}</b></div><div><span>Reach · clicks</span><b>${st.reach || 0} · ${st.clicks || 0}</b></div></div>
        ${st.leads.length ? `<ul class="adm-list" style="margin-top:0.8rem">${st.leads.slice(0, 10).map((p) => `<li>${projectRow(p)}</li>`).join("")}</ul>` : '<p class="tiny muted" style="margin-top:0.6rem">No leads credited yet. They appear here as enquiries arrive through the tracked link.</p>'}</div>
      <div class="adm-card" style="margin-top:1rem"><h2>Posts <span class="muted">${st.posts.length}</span></h2><ul class="adm-list">${st.posts.map((p) => `<li>${postRow(p)}</li>`).join("") || '<li class="adm-empty tiny">No posts yet.</li>'}</ul></div>`}
    </div>
  </div>`;
  const form = $("campForm");
  form.name.addEventListener("input", () => { if (isNew && !form.code.dataset.touched) form.code.value = slugify(form.name.value); });
  form.code.addEventListener("input", () => { form.code.dataset.touched = "1"; });
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("campErr");
    const num = (v) => { const s = String(v).replace(/[^\d.]/g, ""); return s ? Number(s) : null; };
    const row = { name: form.name.value.trim(), code: (form.code.value.trim() || slugify(form.name.value)).toLowerCase(), goal: form.goal.value.trim() || null, audience: form.audience.value.trim() || null, channels: [...form.querySelectorAll("[name=channels]:checked")].map((x) => x.value), status: form.status.value, starts_on: form.starts_on.value || null, ends_on: form.ends_on.value || null, budget_cents: num(form.budget.value) != null ? Math.round(num(form.budget.value) * 100) : null, spend_cents: Math.round((num(form.spend.value) || 0) * 100), reach: num(form.reach.value), clicks: num(form.clicks.value), notes: form.notes.value.trim() || null };
    if (!row.name) return;
    if (!/^[a-z0-9-]{2,40}$/.test(row.code)) { err.hidden = false; err.textContent = "Tracking code: letters, numbers and dashes only."; return; }
    try { const saved = isNew ? await api.campaigns.insert(row) : await api.campaigns.update(c.id, row); toast("Campaign saved"); await loadAll(true); location.hash = "#/marketing/campaign/" + saved.id; if (!isNew) renderCampaignEditor(saved.id, q); }
    catch (ex) { err.hidden = false; err.textContent = /unique|duplicate/i.test(ex.message) ? "That tracking code is already used by another campaign." : ex.message; }
  });
  $("campDelete")?.addEventListener("click", async () => { if (!confirm(`Delete campaign "${c.name}"? Posts stay, just unlinked.`)) return; await api.campaigns.remove(c.id); toast("Deleted"); await loadAll(true); location.hash = "#/marketing?tab=campaigns"; });
}


// ====================================================================
// Sites — demos, mockups, previews and client sites; publish to previews/<slug>/
// ====================================================================
const KINDS = { demo: "Demo", mockup: "Mockup", preview: "Preview", client_site: "Client site", other: "Other" };
const SSTATUS = { draft: "Draft", published: "Published", unpublished: "Unpublished", archived: "Archived" };
const fmtBytes = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : b > 1024 ? Math.round(b / 1024) + " KB" : b + " B";
const randSlug = (name) => slugify(name).slice(0, 28) + "-" + Math.random().toString(36).slice(2, 6);
const siteRow = (x) => { const p = byId(x.project_id), c = clientById(x.client_id); return `
  <a class="adm-row" href="#/sites/${esc(x.id)}"><div class="adm-row__main"><div class="adm-row__title"><span class="kind" data-k="${esc(x.kind)}">${esc(KINDS[x.kind] || x.kind)}</span>${esc(x.name)}</div>
    <div class="adm-row__sub">${esc(x.url || x.description || "")}</div>
    <div class="adm-row__meta"><span class="pstatus" data-s="${x.status === "published" ? "posted" : x.status === "draft" ? "idea" : "scheduled"}">${esc(SSTATUS[x.status] || x.status)}</span>${p ? `<span class="chip">${esc(p.ref)} ${esc(p.business || p.name || "")}</span>` : ""}${c ? `<span class="chip">${esc(c.name)}</span>` : ""}${x.files?.length ? `<span class="chip">${x.files.length} files · ${fmtBytes(x.bytes || 0)}</span>` : ""}</div></div>
    <div class="adm-row__side"><span>${esc(rel(x.published_at || x.updated_at))}</span></div></a>`; };

function renderSites(q) {
  const kind = q.get("kind") || "", st = q.get("status") || "";
  let rows = S.sites.filter((x) => st ? x.status === st : x.status !== "archived");
  if (kind) rows = rows.filter((x) => x.kind === kind);
  const sel = (name, opts, cur, label) => `<select aria-label="${label}" data-filter="${name}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  const live = S.sites.filter((x) => x.status === "published");
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Sites</span><h1>${rows.length} ${rows.length === 1 ? "site" : "sites"}</h1></div>
    <div class="adm-head__actions"><a class="btn btn--primary btn--small" href="#/sites/new">+ New site</a></div></div>
  <div class="adm-tiles adm-tiles--4">
    <div class="adm-tile"><span>Previews live</span><b>${live.filter((x) => x.kind !== "client_site" && x.kind !== "demo").length}</b><small>on re-charge.co.za/previews/</small></div>
    <div class="adm-tile"><span>Demos</span><b>${S.sites.filter((x) => x.kind === "demo" && x.status !== "archived").length}</b></div>
    <div class="adm-tile"><span>Client sites</span><b>${S.sites.filter((x) => x.kind === "client_site" && x.status !== "archived").length}</b></div>
    <div class="adm-tile"><span>Drafts</span><b>${S.sites.filter((x) => x.status === "draft").length}</b></div>
  </div>
  <div class="adm-filters" style="margin-top:1rem">${sel("kind", Object.entries(KINDS), kind, "All kinds")}${sel("status", Object.entries(SSTATUS), st, "Active")}</div>
  <ul class="adm-list">${rows.length ? rows.map((x) => `<li>${siteRow(x)}</li>`).join("") : '<li class="adm-empty">Nothing here yet. Add the demos you already have, a client\'s live site, or publish a mockup.</li>'}</ul>`;
  view.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("change", () => { const n = new URLSearchParams(q); el.value ? n.set(el.dataset.filter, el.value) : n.delete(el.dataset.filter); location.hash = "#/sites?" + n; }));
}

async function renderSiteEditor(site, q) {
  if (site === "missing") { view.innerHTML = '<p class="adm-error">Site not found.</p>'; return; }
  const isNew = !site;
  const proj = isNew && q.get("project") ? byId(q.get("project")) : null;
  site = site || { name: proj ? `${proj.business || proj.name} — mockup` : "", slug: "", kind: proj ? "mockup" : "mockup", status: "draft", listed: false, url: "", project_id: proj?.id || null, client_id: proj?.client_id || null, description: "", notes: "", screenshot_path: null, files: [], bytes: 0 };
  const shot = site.screenshot_path ? await api.storage.url(site.screenshot_path).catch(() => "") : "";
  const p = byId(site.project_id);
  const onDomain = site.kind !== "client_site";
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/sites">Sites</a> · ${isNew ? "New" : esc(SSTATUS[site.status])}</span><h1>${esc(site.name || "New site")}</h1>${site.url ? `<p class="muted"><a href="${esc(site.url)}" target="_blank" rel="noopener">${esc(site.url)}</a></p>` : ""}</div></div>
  <div class="adm-detail">
    <div class="adm-card"><form class="adm-form" id="siteForm">
      <div class="row2"><label>Name<input name="name" value="${esc(site.name)}" required placeholder="e.g. Bella Hair Studio — mockup" /></label>
        <label>Kind<select name="kind">${Object.entries(KINDS).map(([v, l]) => `<option value="${v}"${site.kind === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <label id="slugRow"${onDomain ? "" : " hidden"}>Path <span class="muted" style="font-weight:400">re-charge.co.za/previews/<b id="slugEcho">${esc(site.slug || "…")}</b>/ — unguessable by default; keep it once published</span><input name="slug" value="${esc(site.slug)}" placeholder="bella-hair-7k2q" pattern="[a-z0-9\\-]{2,60}" ${site.status === "published" ? "readonly" : ""} /></label>
      <label id="urlRow"${onDomain ? " hidden" : ""}>Live URL<input type="url" name="url" value="${esc(onDomain ? "" : (site.url || ""))}" placeholder="https://mikesplumbing.co.za" /></label>
      <div class="row2"><label>Project<select name="project_id"><option value="">— none —</option>${S.projects.filter((x) => isActive(x)).sort((a, b) => (a.business || a.name || "").localeCompare(b.business || b.name || "")).map((x) => `<option value="${esc(x.id)}"${site.project_id === x.id ? " selected" : ""}>${esc(x.ref)} · ${esc(x.business || x.name || "")}</option>`).join("")}</select></label>
        <label>Client<select name="client_id"><option value="">— none —</option>${S.clients.map((c) => `<option value="${esc(c.id)}"${site.client_id === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label></div>
      <label>Description <span class="muted" style="font-weight:400">(what it shows)</span><input name="description" value="${esc(site.description || "")}" /></label>
      <label>Notes<textarea name="notes" rows="3">${esc(site.notes || "")}</textarea></label>
      <label>Screenshot<input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" /></label>
      ${shot ? `<img class="adm-shot" src="${esc(shot)}" alt="" />` : ""}
      <label class="check"><input type="checkbox" name="listed" ${site.listed ? "checked" : ""} /> Show on the public demos page (when that's wired up)</label>
      ${isNew ? "" : `<label>Status<select name="status">${Object.entries(SSTATUS).map(([v, l]) => `<option value="${v}"${site.status === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`}
      <p class="adm-error tiny" id="siteErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="siteDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="#/sites">Cancel</a><button class="btn btn--primary btn--small" type="submit">${isNew ? "Create site" : "Save"}</button></div>
    </form></div>
    <div class="adm-detail__side">
      ${isNew ? '<div class="adm-card"><h2>Then publish</h2><p class="small muted">Create the record first. Then upload the mockup\'s folder (or a zip) here and it goes live at <span class="mono">re-charge.co.za/previews/&lt;path&gt;/</span> in about a minute — unlisted, not indexed, and linked to the project so the "Mockup ready" email fills in the link.</p></div>' : onDomain ? `
      <div class="adm-card"><h2>Publish <span class="muted">${site.status === "published" ? `live · ${site.files?.length || 0} files · ${fmtBytes(site.bytes || 0)}` : "not live"}</span></h2>
        ${site.status === "published" && site.url ? `<div class="adm-link"><span>${esc(site.url)}</span><button type="button" class="btn btn--ghost btn--small" data-copy="${esc(site.url)}">Copy</button></div>
          <div class="adm-inline-actions" style="margin-top:0.6rem"><a class="btn btn--ghost" href="${esc(site.url)}" target="_blank" rel="noopener">Open</a>${p?.email ? '<button type="button" class="btn btn--primary" id="sitePreviewEmail">Email the link</button>' : ""}${site.commit_sha ? `<a class="btn btn--ghost" href="https://github.com/revan-lombard/re-charge/commit/${esc(site.commit_sha)}" target="_blank" rel="noopener">Commit</a>` : ""}<button type="button" class="btn btn--ghost" id="siteUnpublish" style="color:var(--danger)">Unpublish</button></div>
          <p class="tiny muted" style="margin-top:0.5rem">Published ${esc(fmtDT(site.published_at))}. Upload again below to replace it.</p>` : ""}
        <div class="adm-drop" id="drop" style="margin-top:0.8rem">Drop the site's folder or a .zip here, or <label>choose a folder<input type="file" id="pickDir" webkitdirectory multiple hidden /></label> · <label>files<input type="file" id="pickFiles" multiple hidden /></label> · <label>zip<input type="file" id="pickZip" accept=".zip,application/zip" hidden /></label><br><span class="tiny">Needs an index.html at the top level. Up to 300 files, 20 MB.</span></div>
        <ul class="adm-files" id="fileList" hidden></ul>
        <p class="adm-error tiny" id="pubErr" hidden></p>
        <div class="btn-row" style="justify-content:flex-end;margin-top:0.7rem"><button type="button" class="btn btn--primary btn--small" id="publishBtn" disabled>${site.status === "published" ? "Publish new version" : "Publish"}</button></div>
      </div>` : `<div class="adm-card"><h2>Hosted elsewhere</h2><p class="small muted">Client sites on their own domain are tracked here for the record (renewals, care plan, notes). Nothing is published from the panel for this kind.</p>${site.url ? `<div class="adm-inline-actions"><a class="btn btn--ghost" href="${esc(site.url)}" target="_blank" rel="noopener">Open site</a></div>` : ""}</div>`}
      ${p ? `<div class="adm-card" style="margin-top:1rem"><h2>Project</h2><ul class="adm-list"><li>${projectRow(p)}</li></ul></div>` : ""}
    </div>
  </div>`;

  const form = $("siteForm");
  form.name.addEventListener("input", () => { if (!form.slug.value && !form.slug.readOnly) { form.slug.value = randSlug(form.name.value); $("slugEcho").textContent = form.slug.value; } });
  form.slug.addEventListener("input", () => { form.slug.value = form.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"); $("slugEcho").textContent = form.slug.value || "…"; });
  form.kind.addEventListener("change", () => { const on = form.kind.value !== "client_site"; $("slugRow").hidden = !on; $("urlRow").hidden = on; if (on && !form.slug.value) { form.slug.value = randSlug(form.name.value || "site"); $("slugEcho").textContent = form.slug.value; } });
  if (isNew && !form.slug.value && form.name.value) { form.slug.value = randSlug(form.name.value); $("slugEcho").textContent = form.slug.value; }
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("siteErr"); err.hidden = true;
    const on = form.kind.value !== "client_site";
    const row = { name: form.name.value.trim(), kind: form.kind.value, slug: on ? (form.slug.value.trim() || randSlug(form.name.value)) : (site.slug || randSlug(form.name.value)), project_id: form.project_id.value || null, client_id: form.client_id.value || null, description: form.description.value.trim() || null, notes: form.notes.value.trim() || null, listed: form.listed.checked };
    if (!on) row.url = form.url.value.trim() || null; else if (site.status !== "published") row.url = null;
    if (!isNew) row.status = form.status.value;
    if (!row.name) return;
    if (on && !/^[a-z0-9-]{2,60}$/.test(row.slug)) { err.hidden = false; err.textContent = "Path: lowercase letters, numbers and dashes only."; return; }
    try {
      if (form.screenshot.files[0]) row.screenshot_path = await api.storage.upload(form.screenshot.files[0], "sites");
      const saved = isNew ? await api.sites.insert(row) : await api.sites.update(site.id, row);
      toast(isNew ? "Site created — now publish it" : "Saved"); await loadAll(true); location.hash = "#/sites/" + saved.id; if (!isNew) renderSiteEditor(S.sites.find((x) => x.id === saved.id), q);
    } catch (ex) { err.hidden = false; err.textContent = /unique|duplicate/i.test(ex.message) ? "That path is already used by another site." : ex.message; }
  });
  $("siteDelete")?.addEventListener("click", async () => {
    if (site.status === "published") return toast("Unpublish it first, then delete.", true);
    if (!confirm(`Delete "${site.name}" from the list?`)) return;
    await api.sites.remove(site.id); toast("Deleted"); await loadAll(true); location.hash = "#/sites";
  });
  if (isNew || !onDomain) return;

  // ---- publishing
  let files = [];
  const listEl = $("fileList"), pubBtn = $("publishBtn"), pubErr = $("pubErr");
  const showFiles = () => {
    const total = files.reduce((a, f) => a + f.size, 0);
    const hasIndex = files.some((f) => f.path === "index.html");
    listEl.hidden = !files.length;
    listEl.innerHTML = files.slice(0, 200).map((f) => `<li><span>${esc(f.path)}</span><span>${fmtBytes(f.size)}</span></li>`).join("") + (files.length > 200 ? `<li>… ${files.length - 200} more</li>` : "") + `<li class="${hasIndex ? "" : "warn"}"><span>${files.length} files · ${fmtBytes(total)}</span><span>${hasIndex ? "index.html ✓" : "no index.html at the top level"}</span></li>`;
    pubBtn.disabled = !files.length || !hasIndex || total > 20 * 1024 * 1024 || files.length > 300;
  };
  const stripCommon = (paths) => { const parts = paths.map((p) => p.split("/")); if (parts.every((p) => p.length > 1) && new Set(parts.map((p) => p[0])).size === 1 && !paths.includes("index.html")) return paths.map((p) => p.split("/").slice(1).join("/")); return paths; };
  const ignore = (p) => /(^|\/)(\.|__MACOSX|node_modules\/|Thumbs\.db|desktop\.ini)/.test(p);
  const takeFiles = async (list, pathOf) => {
    const raw = [...list].map((f) => ({ f, path: (pathOf(f) || f.name).replace(/\\/g, "/").replace(/^\/+/, "") })).filter((x) => !ignore(x.path));
    const paths = stripCommon(raw.map((x) => x.path));
    files = raw.map((x, i) => ({ path: paths[i], size: x.f.size, blob: x.f })); showFiles();
  };
  const takeZip = async (file) => {
    pubErr.hidden = true;
    try {
      const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((e) => !e.dir && !ignore(e.name));
      const paths = stripCommon(entries.map((e) => e.name));
      files = await Promise.all(entries.map(async (e, i) => { const blob = await e.async("blob"); return { path: paths[i], size: blob.size, blob }; }));
      showFiles();
    } catch (ex) { pubErr.hidden = false; pubErr.textContent = "Could not read the zip: " + ex.message + ". Try choosing the folder instead."; }
  };
  $("pickDir").addEventListener("change", (e) => takeFiles(e.target.files, (f) => f.webkitRelativePath));
  $("pickFiles").addEventListener("change", (e) => takeFiles(e.target.files, (f) => f.name));
  $("pickZip").addEventListener("change", (e) => e.target.files[0] && takeZip(e.target.files[0]));
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault(); drop.classList.remove("is-over");
    const items = [...(e.dataTransfer.items || [])];
    if (items.length === 1 && /zip/.test(items[0].type)) return takeZip(items[0].getAsFile());
    const out = [];
    const walk = async (entry, base) => {
      if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); out.push({ f, path: base + entry.name }); }
      else if (entry.isDirectory) { const reader = entry.createReader(); let batch; do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const en of batch) await walk(en, base + entry.name + "/"); } while (batch.length); }
    };
    for (const it of items) { const en = it.webkitGetAsEntry?.(); if (en) await walk(en, ""); }
    if (out.length) takeFiles(out.map((o) => o.f).map((f, i) => Object.assign(f, { _p: out[i].path })), (f) => f._p);
  });
  pubBtn.addEventListener("click", async () => {
    pubBtn.disabled = true; pubBtn.textContent = "Publishing…"; pubErr.hidden = true;
    try {
      const encoded = await Promise.all(files.map(async (f) => ({ path: f.path, content: await toBase64(f.blob) })));
      const r = await api.publishSite({ siteId: site.id, action: "publish", files: encoded });
      toast(`Published ${r.files} files — live in about a minute`); await loadAll(true); renderSiteEditor(S.sites.find((x) => x.id === site.id), q);
    } catch (ex) { pubErr.hidden = false; pubErr.textContent = ex.message; pubBtn.disabled = false; pubBtn.textContent = "Publish"; }
  });
  $("siteUnpublish")?.addEventListener("click", async () => {
    if (!confirm(`Take ${site.url} offline? The files are removed from the site; the record stays.`)) return;
    try { await api.publishSite({ siteId: site.id, action: "unpublish" }); toast("Unpublished — gone in about a minute"); await loadAll(true); renderSiteEditor(S.sites.find((x) => x.id === site.id), q); } catch (ex) { toast(ex.message, true); }
  });
  $("sitePreviewEmail")?.addEventListener("click", () => openCompose({ ...p, preview_url: site.url }, "email", { templateId: S.templates.find((t) => t.kind === "email" && !t.archived && /mockup ready/i.test(t.name))?.id, onDone: () => renderSiteEditor(site, q) }));
}
async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
