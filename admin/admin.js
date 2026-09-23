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
const S = { projects: [], payments: [], clients: [], loaded: 0 };
async function loadAll(force = false) {
  if (!force && Date.now() - S.loaded < 15000) return;
  const [projects, payments, clients] = await Promise.all([api.projects.list(), api.payments.list().catch(() => []), api.clients.list().catch(() => [])]);
  S.projects = projects || []; S.payments = payments || []; S.clients = clients || []; S.loaded = Date.now();
}
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
      <p class="muted small">Enter your email and we'll send you a one-time sign-in link.</p>
      <form id="signInForm" class="form" novalidate>
        <input type="email" id="signInEmail" placeholder="you@example.com" autocomplete="email" required />
        <button class="btn btn--primary btn--full" type="submit">Send sign-in link</button>
        <p class="small muted" id="signInMsg" hidden></p>
      </form>
    </div>
  </section>`;
  $("signInForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("signInEmail").value.trim(), msg = $("signInMsg"), btn = e.target.querySelector("button");
    if (!email) return;
    btn.disabled = true; msg.hidden = false; msg.textContent = "Sending…";
    try { await api.auth.signIn(email); msg.textContent = "Check your email for the sign-in link. You can close this tab."; }
    catch (err) { msg.textContent = "Could not send link: " + err.message; btn.disabled = false; }
  });
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
  document.querySelectorAll("#adminNav a").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === (seg[0] || "overview")));
  view.innerHTML = '<p class="muted adm-boot">Loading…</p>';
  try {
    await loadAll(seg[0] === "p" ? false : true);
    if (!seg.length) await renderOverview();
    else if (seg[0] === "pipeline") renderPipeline(q);
    else if (seg[0] === "p" && seg[1]) await renderProject(seg[1]);
    else if (seg[0] === "add") renderAdd(q);
    else if (seg[0] === "calls") renderCalls();
    else if (seg[0] === "clients") renderClients();
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
  const [events] = await Promise.all([api.events.list(id)]);
  const pays = S.payments.filter((x) => x.project_id === id);
  const rel_ = related(p);
  const d = p.details || {};
  const detailRows = Object.entries(d).filter(([k, v]) => !k.startsWith("_") && !HIDE_DETAIL.has(k) && v != null && String(v).trim() !== "")
    .map(([k, v]) => `<dt>${esc(DETAIL_LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()))}</dt><dd>${esc(typeof v === "string" ? v : JSON.stringify(v))}</dd>`).join("");
  const waText = `Hi ${firstName(p.name) || "there"}, it's Re-Charge here about ${p.business ? p.business : "your project"} (${p.ref}).`;
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
          ${p.email ? `<a class="btn btn--primary" href="mailto:${esc(p.email)}?subject=${encodeURIComponent(p.ref + " — Re-Charge")}">${svg.mail} Email</a>` : ""}
          ${p.phone ? `<a class="btn btn--ghost" href="${esc(waLink(p.phone, waText))}" target="_blank" rel="noopener">${svg.wa} WhatsApp</a><a class="btn btn--ghost" href="${esc(telLink(p.phone))}">${svg.tel} Call</a>` : ""}
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
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--ghost btn--small" type="button" id="clearNext">Clear reminder</button><button class="btn btn--primary btn--small" type="submit">Save</button></div>
        </form>
      </div>

      <div class="adm-card" style="margin-top:1rem">
        <h2>Timeline <span class="muted">${events.length}</span></h2>
        <form class="adm-note" id="noteForm"><textarea name="note" placeholder="Add a note… (call summary, decision, next step)" aria-label="Add a note"></textarea><div class="btn-row"><button class="btn btn--primary btn--small" type="submit">Add note</button></div></form>
        <ul class="adm-timeline" id="timeline">${events.map(eventLi).join("") || '<li class="adm-empty">No events yet.</li>'}</ul>
      </div>
    </div>
  </div>`;

  // --- actions ---
  const patch = async (fields, msg) => {
    try { p = await api.projects.update(p.id, fields); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p; toast(msg || "Saved"); await renderProject(p.id); }
    catch (e) { toast(e.message, true); }
  };
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
const eventLi = (e) => `<li data-kind="${esc(e.kind)}"><span class="tl-dot"></span><div><time>${esc(fmtDT(e.created_at))} · ${esc(e.kind)}</time><p>${esc(e.note || "")}${e.data?.reason ? ` <span class="muted">(${esc(e.data.reason)})</span>` : ""}</p></div></li>`;

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
