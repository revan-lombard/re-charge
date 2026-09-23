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
const money = (cents) => cents == null ? "—" : "R" + Math.round(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
const srcChip = (p) => sourceOf(p) === "website" ? "" : `<span class="chip chip--src">${esc(SOURCES[sourceOf(p)] || sourceOf(p))}</span>`;
const catChips = (p) => (p.category || []).filter((c) => !/request$/i.test(c)).slice(0, 3).map((c) => `<span class="chip">${esc(c)}</span>`).join("");

// ---------- state ----------
let api, session, me;
const S = { projects: [], payments: [], clients: [], templates: [], profile: {}, loaded: 0 };
async function loadAll(force = false) {
  if (!force && Date.now() - S.loaded < 15000) return;
  const [projects, payments, clients, templates, profile] = await Promise.all([
    api.projects.list(), api.payments.list().catch(() => []), api.clients.list().catch(() => []),
    api.templates.list().catch(() => []), api.settings.get("profile").catch(() => null),
  ]);
  S.projects = projects || []; S.payments = payments || []; S.clients = clients || [];
  S.templates = templates || []; S.profile = { ...DEFAULT_PROFILE, ...(profile || {}) }; S.loaded = Date.now();
}
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
async function route() {
  if (!me) return;
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const q = new URLSearchParams(qs || "");
  const seg = path.split("/").filter(Boolean);
  const navKey = seg[0] || "overview";
  const underMore = ["calls", "clients", "templates", "settings", "more"].includes(navKey) && !matchMedia("(min-width: 900px)").matches;
  document.querySelectorAll("#adminNav a").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === navKey || (underMore && a.dataset.nav === "more")));
  view.innerHTML = '<p class="muted adm-boot">Loading…</p>';
  try {
    await loadAll(seg[0] === "p" ? false : true);
    if (!seg.length) await renderOverview();
    else if (seg[0] === "pipeline") renderPipeline(q);
    else if (seg[0] === "p" && seg[1]) await renderProject(seg[1]);
    else if (seg[0] === "add") renderAdd(q);
    else if (seg[0] === "calls") renderCalls();
    else if (seg[0] === "clients") renderClients();
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
  const paysMonth = S.payments.filter((x) => x.status === "succeeded" && Date.parse(x.created_at) >= som);
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
      ${renewals.map((c) => `<li><a class="adm-row adm-row--attn" href="#/clients"><span class="dot ok"></span><div class="adm-row__main"><div class="adm-row__title">${esc(c.name)}</div><div class="adm-row__sub">Care plan renews ${esc(fmtD(c.care_renews_at))} (${Math.max(0, Math.ceil((Date.parse(c.care_renews_at) - now) / 86400e3))} days)</div></div><span class="btn btn--ghost btn--small">Open</span></a></li>`).join("")}
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
    if (!p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true, ...(p.status === "new" ? { status: "deposit_paid" } : {}) });
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
  const show = q.get("show") || "active", group = q.get("group") || "", cat = q.get("cat") || "", src = q.get("src") || "", text = (q.get("q") || "").toLowerCase();
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
  <div class="adm-head"><div><span class="eyebrow">Pipeline</span><h1>${rows.length} ${show === "active" ? "open" : show} ${rows.length === 1 ? "project" : "projects"}</h1></div>
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
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
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
  const rel_ = related(p);
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
        ${pays.length ? `<ul class="adm-timeline">${pays.map((x) => `<li data-kind="payment"><span class="tl-dot"></span><div><time>${esc(fmtDT(x.created_at))} · ${esc(x.provider)}</time><p>${money(x.amount_cents)} ${esc(x.reference ? "— " + x.reference : "")}</p></div></li>`).join("")}</ul>` : '<p class="muted small">Payments appear here automatically once the Yoco webhook is on (BACKEND.md). Recording EFTs by hand arrives in Phase C.</p>'}
      </div>
    </div>

    <div class="adm-detail__side">
      <div class="adm-card">
        <form class="adm-form" id="pForm">
          <label class="adm-stage">Stage
            <select name="status">${STAGES.map(([k, l, g]) => `<option value="${k}"${k === p.status ? " selected" : ""}>${esc(GROUPS.find(([x]) => x === g)?.[1] || "Declined")} · ${esc(l)}</option>`).join("")}</select>
          </label>
          <label id="reasonRow"${p.status === "declined" ? "" : " hidden"}>Declined reason<input name="declined_reason" value="${esc(p.declined_reason || "")}" placeholder="e.g. budget, timing, went elsewhere" /></label>
          <div class="row2">
            <label>Quote / value<span class="money"><input name="quote" inputmode="numeric" value="${p.quote_cents != null ? p.quote_cents / 100 : ""}" placeholder="0" /></span></label>
            <label>Source<select name="source">${Object.entries(SOURCES).map(([v, l]) => `<option value="${v}"${v === sourceOf(p) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          </div>
          <label>Next action<input name="next_action" value="${esc(p.next_action || "")}" placeholder="e.g. Send quote, Follow-up 1" /></label>
          <label>Due<input type="datetime-local" name="next_action_at" value="${esc(datetimeLocal(p.next_action_at))}" /></label>
          <label>Preview / mockup link <span class="muted" style="font-weight:400">→ {{preview_link}}</span><input type="url" name="preview_url" value="${esc(p.preview_url || "")}" placeholder="https://preview.re-charge.co.za/…" /></label>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--ghost btn--small" type="button" id="clearNext">Clear reminder</button><button class="btn btn--primary btn--small" type="submit">Save</button></div>
        </form>
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

  const form = $("pForm");
  form.status.addEventListener("change", () => { $("reasonRow").hidden = form.status.value !== "declined"; });
  $("clearNext").addEventListener("click", () => { form.next_action.value = ""; form.next_action_at.value = ""; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const quote = form.quote.value.replace(/[^\d.]/g, "");
    const fields = {
      status: form.status.value,
      declined_reason: form.status.value === "declined" ? (form.declined_reason.value.trim() || null) : null,
      quote_cents: quote ? Math.round(Number(quote) * 100) : null,
      source: form.source.value,
      next_action: form.next_action.value.trim() || null,
      next_action_at: form.next_action_at.value ? new Date(form.next_action_at.value).toISOString() : null,
      preview_url: form.preview_url.value.trim() || null,
    };
    patch(fields, fields.status !== p.status ? `Moved to ${STAGE[fields.status].label}` : "Saved");
  });
  $("noteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = e.target.note.value.trim(); if (!note) return;
    try { await api.events.insert(p.id, "note", note); e.target.note.value = ""; toast("Note added"); await renderProject(p.id); }
    catch (err) { toast(err.message, true); }
  });
}
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

// ---------- clients ----------
function renderClients() {
  const cs = S.clients.slice().sort((a, b) => (b.care_active - a.care_active) || a.name.localeCompare(b.name));
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Clients</span><h1>${cs.filter((c) => c.care_active).length} on a care plan</h1></div></div>
  <ul class="adm-list">${cs.length ? cs.map((c) => `<li><div class="adm-row">
    <div class="adm-row__main"><div class="adm-row__title">${esc(c.name)}${c.site_label ? `<span class="muted" style="font-weight:400">· ${esc(c.site_label)}</span>` : ""}</div>
      <div class="adm-row__meta">${c.care_active ? `<span class="chip chip--stage" data-group="done">${esc({ hosting: "Hosting", care: "Hosting & Care", business: "Business Care" }[c.care_plan] || "Care active")}</span>` : '<span class="chip">no plan</span>'}${c.care_renews_at ? `<span class="chip">renews ${esc(fmtD(c.care_renews_at))}</span>` : ""}${(c.report_emails || []).length ? `<span class="chip">reports → ${esc(c.report_emails[0])}</span>` : ""}</div></div>
    <div class="adm-row__side"><span>${esc(S.projects.filter((p) => p.client_id === c.id).length)} projects</span></div></div></li>`).join("") : '<li class="adm-empty">No clients yet. Client records, care plans and renewals become editable in Phase C.</li>'}</ul>
  <p class="muted small" style="margin-top:1rem">Read-only in Phase A. Editing, "convert to client" and renewal payment links arrive in Phase C.</p>`;
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
  ["deposit_link", "R500 deposit link"], ["payment_link", "Payment link"], ["start_link", "Start-a-project link"], ["mockup_link", "Free-mockup link"],
  ["preview_link", "Preview / mockup URL"], ["review_link", "Google review link"], ["my_name", "Your name"], ["my_whatsapp", "Your WhatsApp"], ["signature", "Signature"],
];
const fmtWa = (n) => { const d = normPhone(n); return d.startsWith("27") && d.length === 11 ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : n; };
function ctxFor(p) {
  const pr = S.profile;
  return {
    first_name: firstName(p?.name) || "there", name: p?.name || "", business: p?.business || "your business", ref: p?.ref || "",
    category: (p?.category || []).filter((c) => !/request$/i.test(c)).join(", "), goal: p?.goal || "", indicative_price: p?.indicative_price || "",
    quote: p?.quote_cents != null ? money(p.quote_cents) : "", deposit_link: pr.deposit_link || "", payment_link: pr.deposit_link || "",
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
          await api.sendEmail({ projectId: p.id, templateId: tpl?.id || null, to, subject: form.subject.value.trim(), text, copyMe: form.copyMe.checked });
        } else {
          const w = window.open(waLink(to, text), "_blank");
          if (w) w.opener = null;
          else { const er = $("composeErr"); er.hidden = false; er.innerHTML = `Pop-up blocked — <a href="${esc(waLink(to, text))}" target="_blank" rel="noopener">tap here to open WhatsApp</a>.`; }
          await api.messages.insert({ project_id: p.id, kind: "whatsapp", to_address: to, body: text, template_id: tpl?.id || null, status: "opened" });
          await api.events.insert(p.id, "whatsapp", `WhatsApp opened: "${text.slice(0, 70)}${text.length > 70 ? "…" : ""}"`, { to });
        }
        if (form.applyMeta?.checked) await applyMeta(p, tpl?.meta);
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
  if (id) return renderTemplateEditor(id === "new" ? null : S.templates.find((t) => t.id === id), q);
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
    $("importPreview").innerHTML = rows.length ? `<div class="table-wrap" style="margin-top:0.6rem"><table class="adm-table"><thead><tr><th>Business</th><th>Contact</th><th>Email</th><th>Phone</th><th>Notes</th></tr></thead><tbody>${rows.map((r) => `<tr>${["business", "name", "email", "phone", "notes"].map((k) => `<td class="${r.dup ? "dup" : ""}">${esc(r[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
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
}

// ---------- more (mobile) ----------
function renderMore() {
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">More</span><h1>Everything else</h1></div></div>
  <div class="adm-more-list">
    <a href="#/calls">Calls <span>Scheduled call requests</span></a>
    <a href="#/clients">Clients <span>Care plans & renewals</span></a>
    <a href="#/templates">Templates <span>Email & WhatsApp</span></a>
    <a href="#/settings">Settings <span>Your name, reply-to, signature</span></a>
    <a href="/" target="_blank" rel="noopener">Open the website <span>re-charge.co.za</span></a>
  </div>`;
}
