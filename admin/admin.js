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
// ?embed=1: the page is showing inside the command centre's side panel (no top bar or menu)
const EMBED = params.get("embed") === "1";
if (EMBED) document.documentElement.classList.add("adm-embed");
// Escape inside the side panel closes it (unless a pop-up inside the panel is open)
if (EMBED) document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) parent.postMessage("cc-close", location.origin); });
// Inside the panel, scrolling to a form must move only the panel: the browser's scrollIntoView also scrolls the
// page behind it, which is how closing the panel used to land you somewhere else on Today
if (EMBED) Element.prototype.scrollIntoView = function (o) {
  const r = this.getBoundingClientRect(), block = typeof o === "object" && o ? o.block || "start" : o === false ? "end" : "start", pad = 16;
  let top = null;
  if (block === "nearest") { if (r.top < pad) top = scrollY + r.top - pad; else if (r.bottom > innerHeight) top = scrollY + Math.min(r.top - pad, r.bottom - innerHeight + pad); }
  else if (block === "center") top = scrollY + r.top - Math.max(pad, (innerHeight - r.height) / 2);
  else if (block === "end") top = scrollY + r.bottom - innerHeight + pad;
  else top = scrollY + r.top - pad;
  if (top != null) window.scrollTo({ top: Math.max(0, top), behavior: (typeof o === "object" && o?.behavior) || "auto" });
};
// (focus() scrolls the same way: keep it to the panel too)
if (EMBED) { const focus0 = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function (o) { focus0.call(this, { ...(o || {}), preventScroll: true }); if (!o?.preventScroll && !this.closest("dialog")) this.scrollIntoView({ block: "nearest" }); }; }

// ---------- pipeline vocabulary ----------
// Six stages. The database moves leads between them when the facts change
// (quote page created → Quoted, deposit paid → Building, declined online →
// Lost — migration 0012), so most of the time nobody has to change a stage.
const STAGES = [
  ["prospect", "To contact", "outreach"],
  ["new", "Talking", "leads"],
  ["quote_sent", "Quoted", "quoted"],
  ["in_development", "Building", "build"],
  ["live", "Live", "done"],
  ["declined", "Lost", "declined"],
];
const STAGE_HELP = {
  prospect: "Found them, not in touch yet",
  new: "They enquired or replied: you're in conversation. Reply, then send a quote",
  quote_sent: "Quote sent: waiting for them to accept and pay the deposit shown on their quote",
  in_development: "Deposit paid: build it, then collect the balance",
  live: "Their site is live",
  declined: "Not going ahead",
};
// older values the database may still hold (see 0012) → the stage they belong to
const LEGACY = { contacted: "prospect", under_review: "new", clarification: "new", deposit_paid: "new", approved: "quote_sent", client_review: "in_development", final_payment: "in_development", care: "live" };
const stageOf = (s) => LEGACY[s] || s;
const STAGE = Object.fromEntries(Object.keys({ ...Object.fromEntries(STAGES), ...LEGACY }).map((k) => { const [, label, group] = STAGES.find(([x]) => x === stageOf(k)); return [k, { label, group }]; }));
const GROUPS = STAGES.filter(([k]) => k !== "declined").map(([, label, group]) => [group, label]);
const OPEN = new Set(Object.keys(STAGE).filter((k) => !["live", "declined"].includes(stageOf(k))));
const stageRank = (s) => s === "contacted" ? 0.5 : STAGES.findIndex(([k]) => k === stageOf(s));
const POTENTIAL = { very_high: "Very high", high: "High", medium: "Medium", low: "Low" };
const POT_RANK = { very_high: 4, high: 3, medium: 2, low: 1 };
// how established a business looks (same formula as supabase/functions/_shared/finder.ts)
function activityScore(reviews, rating, note, recent) {
  if (reviews == null && rating == null && !note && !recent) return null;
  const r = reviews ? Math.min(1, Math.log10(reviews + 1) / Math.log10(501)) * 60 : 0;
  const q = rating != null && reviews ? Math.max(0, Math.min(1, (rating - 3) / 2)) * 20 * Math.min(1, reviews / 20) : 0;
  return Math.round(Math.min(100, r + q + (recent ? 20 : note ? 8 : 0)));
}
// prospects: best fit first, then the most established
const priority = (p) => (POT_RANK[p.potential] || 0) * 100 + (p.activity_score || 0);
// Their web presence: own site, only Facebook/Instagram, Google profile.
const isSocial = (u) => /(^|\.|\/)(facebook\.com|fb\.com|instagram\.com)/i.test(u || "");
const isGoogleUrl = (u) => /^https?:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|business\.google\.com|share\.google)/i.test(u || "");
const ownSite = (p) => (p.website && !isSocial(p.website) ? p.website : "");
const noWebsite = (p) => !ownSite(p) && (isSocial(p.website) || ["very_high", "high"].includes(p.potential));
const googleUrlOf = (p) => p.details?.googleUrl || (isGoogleUrl(p.details?.sourceUrl) ? p.details.sourceUrl : "");
// any page remembers ?ref= (script.js rcRef), so the link goes to the homepage, not the retired free-mockup page
const referralLink = (c) => (c?.slug ? "https://re-charge.co.za/?ref=" + encodeURIComponent(c.slug) : "");
const googleSearchUrl = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([p.business || p.name, p.location].filter(Boolean).join(", "));
const shortUrl = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const offerChip = (p) => (onOffer(p) ? `<span class="chip chip--offer">Offer</span>` : "");
const webChip = (p) => noWebsite(p) ? `<span class="chip chip--noweb">${isSocial(p.website) ? "Facebook only" : "No website"}</span>` : "";
const estChip = (p) => p.review_count != null || p.rating != null ? `<span class="chip chip--est" title="${esc([p.activity_note, p.activity_score != null ? "Established score " + p.activity_score + "/100" : ""].filter(Boolean).join(" · "))}">${p.rating != null ? "★ " + Number(p.rating).toFixed(1) : ""}${p.review_count != null ? `${p.rating != null ? " · " : ""}${p.review_count} review${p.review_count === 1 ? "" : "s"}` : ""}</span>` : "";
const potRank = (p) => POT_RANK[p.potential] || 0;
const SOURCES = { website: "Website", call: "Call request", mockup: "Mockup request", outreach: "Outreach", referral: "Referral", credit: "Client-site credit", whatsapp: "WhatsApp", phone: "Phone", other: "Other" };
const DETAIL_LABELS = {
  formType: "Form", projectType: "Project type", features: "Features", callDay: "Call day", callTime: "Time", product: "AI product they want",
  callNote: "Note", mkAbout: "About", mkInclude: "Should include", mkStyle: "Style reference", mkIndustry: "Type of business", gbpHas: "Already on Google Maps", gbpLink: "Their Google listing", mkCurrent: "Current website", mkDemo: "Liked demo", attachments: "Attachments",
  pages: "Pages", audience: "Audience", examples: "Examples", extra: "Extra", timeline: "Timeline", hosting: "Hosting",
};
const HIDE_DETAIL = new Set(["baseline", "baselineSkipped", "aiSignal", "aiPotential", "sizeHint", "demoSlug", "gbpSteps", "ref", "referredBy", "referralRewarded", "standard", "googleUrl", "sourceUrl", "finderType", "mkLocation", "location", "formType", "submittedAt", "page", "type", "callName", "callEmail", "callPhone", "mkBusiness", "mkEmail", "mkPhone", "category",
  // flags the panel keeps on the lead (trial, calls, contracts), shown in their own cards
  "inbox", "inboxTimings", "trialAgreementAt", "trialResultSentAt", "trialResult", "trialResultAt", "calledAt", "contracts", "caseStudy", "discovery", "content", "payMonthly", "offer", "after", "standard", "liveAt", "designOkAt", "launchSent", "reviewAsked", "mapSentAt", "resultSentAt", "caseAskedAt"]);

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Quote currency (details.currency): overseas clients are quoted in USD/EUR/GBP and pay by bank transfer.
const CUR_SIGN = { ZAR: "R", USD: "$", EUR: "€", GBP: "£" };
const qCur = (p) => (CUR_SIGN[p?.details?.currency] ? p.details.currency : "ZAR");
const moneyIn = (cents, cur) => (!cur || cur === "ZAR" ? money(cents) : money(cents).replace(/^(-?)R/, "$1" + CUR_SIGN[cur]));
const money = (cents) => { if (cents == null) return "—"; const c = Math.round(Number(cents)); const whole = Math.trunc(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); return (c < 0 ? "-R" : "R") + whole + (c % 100 ? "." + pad(Math.abs(c) % 100) : ""); };
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Dates outside this year carry the year, so a renewal next August can't pass for one that's overdue.
const yearIfOther = (d) => (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
function fmtDT(iso) { if (!iso) return ""; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}${yearIfOther(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtD(iso) { if (!iso) return ""; const d = new Date(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${yearIfOther(d)}`; }
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
// Working days: no weekends or SA public holidays (saHolidays below). Reminders land on one, at 09:00.
const _hol = {};
const isHolidayDate = (d) => (_hol[d.getFullYear()] ||= new Set(saHolidays(d.getFullYear()).map((h) => h.key))).has(localDate(d));
const isWorkday = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !isHolidayDate(d);
const rollToWorkday = (d) => { const x = new Date(d); while (!isWorkday(x)) x.setDate(x.getDate() + 1); return x; };
// n working days from today at 09:00 (0: today, or the next working day if today isn't one)
const workdaysFrom = (n) => { const d = new Date(); d.setHours(9, 0, 0, 0); for (let i = 0; i < n;) { d.setDate(d.getDate() + 1); if (isWorkday(d)) i++; } return rollToWorkday(d); };
const nextMonday = () => { const d = new Date(); d.setHours(9, 0, 0, 0); do d.setDate(d.getDate() + 1); while (d.getDay() !== 1); return rollToWorkday(d); };
// "by Friday", "tomorrow", "next week" or a date (call notes, sorted messages) → a reminder time
function dateFromWords(t) {
  const s = String(t || "").toLowerCase(); if (!s) return null;
  const iso = s.match(/(20\d\d)-(\d\d)-(\d\d)/); if (iso) return rollToWorkday(new Date(+iso[1], +iso[2] - 1, +iso[3], 9));
  if (/\btomorrow\b/.test(s)) return workdaysFrom(1);
  if (/\bnext week\b/.test(s)) return nextMonday();
  const dn = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].findIndex((x) => new RegExp(`\\b${x.slice(0, 3)}(${x.slice(3)})?\\b`).test(s));
  if (dn >= 0) { const d = new Date(); d.setHours(9, 0, 0, 0); do d.setDate(d.getDate() + 1); while (d.getDay() !== dn); return d; }
  return null;
}
const dueOf = (a) => { if (!a?.due_at) return null; const d = new Date(a.due_at); if (isNaN(d)) return null; if (!/T\d\d:\d\d/.test(a.due_at)) d.setHours(9, 0, 0, 0); return d; };
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "27" + d.slice(1);
  if (d.startsWith("270") && d.length === 12) d = "27" + d.slice(3);
  return d;
}
const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}${text ? "?text=" + encodeURIComponent(text) : ""}`;
// SA mobiles are 06x/07x/08x (not 086/087, which are fax/VoIP): only those can get WhatsApp
const isMobile = (phone) => { const d = normPhone(phone); return /^27[678]\d{8}$/.test(d) && !/^278[67]/.test(d); };
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
// Disable a submit button while its async work runs (prevents double saves).
async function busy(btn, fn, label) {
  if (!btn || btn.disabled) return;
  const old = btn.textContent; btn.disabled = true; if (label) btn.textContent = label;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
}
let toastTimer;
// action: { label, fn } adds a button to the toast (e.g. Undo) and keeps it up a little longer
function toast(msg, isError = false, action = null) {
  const t = $("toast"); t.textContent = msg; t.classList.toggle("is-error", isError); t.hidden = false;
  if (action) { const b = document.createElement("button"); b.type = "button"; b.className = "adm-toast__act"; b.textContent = action.label; b.addEventListener("click", () => { t.hidden = true; action.fn(); }, { once: true }); t.append(" ", b); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : isError ? 5000 : 2600);
}
const stageChip = (s) => `<span class="chip chip--stage" data-group="${STAGE[s]?.group || "leads"}">${esc(STAGE[s]?.label || s)}</span>`;
const srcChip = (p) => { const camp = p.channel && S.campaigns.find((c) => c.code === p.channel); if (camp) return `<span class="chip chip--src" title="Campaign">📣 ${esc(camp.name)}</span>`; return sourceOf(p) === "website" ? "" : `<span class="chip chip--src">${esc(SOURCES[sourceOf(p)] || sourceOf(p))}</span>`; };
const potChip = (p) => p.potential ? `<span class="chip chip--pot" data-p="${esc(p.potential)}" title="${esc("Re-Charge potential" + (p.potential_note ? ": " + p.potential_note : ""))}">${esc(POTENTIAL[p.potential])}${p.potential_note ? " · " + esc(p.potential_note) : ""}</span>` : "";
const catChips = (p) => (p.category || []).filter((c) => !/request$/i.test(c)).slice(0, 3).map((c) => `<span class="chip">${esc(c)}</span>`).join("");

// ---------- state ----------
let api, session, me;
const S = { expenses: [], projects: [], payments: [], clients: [], templates: [], requests: [], time: [], campaigns: [], posts: [], sites: [], profile: {}, features: { campaigns: false, time: false, star: false }, trials: new Map(), lastOut: new Map(), loaded: 0, loadErrors: [] };
// Re-Charge's own row in clients (seed.sql; the client dashboard falls back to it): not a client to sell to
const isOwn = (c) => c?.slug === "re-charge";
const realClients = () => S.clients.filter((c) => !isOwn(c));
// When we last emailed or WhatsApped a lead (messages are outgoing only)
const lastOutAt = (p) => (p?.id ? S.lastOut.get(p.id) || 0 : 0);
const isUnmatched = (x) => !x.project_id && !x.client_id && x.status === "succeeded";
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Default template for a lead by stage (what you'd most likely send next).
// AI leads (asked about AI, or we pitched them AI) get the process-review wording.
const aiPitch = (p) => Boolean(p) && (isAiLead(p) || Boolean(p.details?.demoSlug) || Boolean(p.details?.aiSignal) || Boolean(p.details?.discovery));
function defaultTemplate(kind, status, p) {
  const moment = status === "contacted" ? (aiPitch(p) && tplFor(kind, "ai_follow") ? "ai_follow" : "follow_up") : STAGE_MOMENT[stageOf(status)];
  return (moment && tplFor(kind, moment)) || S.templates.find((t) => t.kind === kind && !t.archived) || null;
}
const CACHE_MS = 60000;
// Mockup builder runs through GitHub: push queued briefs / collect finished
// builds whenever the panel loads data (at most every 90s), in the background.
let lastBuildSync = 0, buildSyncing = false;
let lastFinderPull = 0;
async function maybeFinderPull(force = false) {
  if (!api?.finder || (!force && Date.now() - lastFinderPull < 10 * 60000)) return;
  lastFinderPull = Date.now();
  try {
    const r = await api.finder("pull");
    if (r.added) { toast(`${r.added} new prospect${r.added === 1 ? "" : "s"} from the prospect finder`); S.loaded = 0; await loadAll(true); route(); }
    return r;
  } catch (e) { console.warn("finder pull:", e.message); return { ok: false, error: e.message }; }
}
async function maybeBuildSync(force = false) {
  if (buildSyncing || !api?.buildSync) return;
  const pending = S.projects.some((p) => p.build_status === "queued" || p.build_status === "building");
  if (!pending || (!force && Date.now() - lastBuildSync < 90000)) return;
  buildSyncing = true; lastBuildSync = Date.now();
  try {
    const r = await api.buildSync({ action: "sync" });
    if (r.errors?.length) console.warn("build sync:", r.errors);
    if (r.pulled) { toast(`${r.pulled} mockup${r.pulled === 1 ? "" : "s"} finished — review before sending`); S.loaded = 0; await loadAll(true); route(); }
    else if (r.pushed) { S.loaded = 0; await loadAll(true); }
    return r;
  } catch (e) { console.warn("build sync failed:", e.message); return { ok: false, error: e.message }; }
  finally { buildSyncing = false; }
}
async function loadAll(force = false) {
  if (!force && Date.now() - S.loaded < CACHE_MS) return;
  const warn = (what) => (e) => { console.error(what, e); S.loadErrors.push(what); return []; };
  S.loadErrors = [];
  const [projects, payments, clients, templates, profile, requests, time, campaigns, posts, sites, autobuild, features, monitors, offer, gbpHolidays, sprint, wrapped, inboxAccs, inboxDrafts, outMsgs] = await Promise.all([
    api.projects.list(), api.payments.list().catch(warn("payments")), api.clients.list().catch(warn("clients")),
    api.templates.list().catch(warn("templates")), api.settings.get("profile").catch(() => null),
    api.requests.list().catch(warn("payment links")), api.events.byKind("time").catch(warn("time logs")),
    api.campaigns.list().catch(warn("campaigns")), api.posts.list().catch(warn("posts")),
    api.sites.list().catch(warn("sites")), api.settings.get("autobuild").catch(() => null),
    api.settings.get("features").catch(() => null),
    api.monitors.list().catch(() => []),   // before 0015 is applied there's simply nothing to show
    api.settings.get("offer").catch(() => null),
    api.settings.get("gbp_holidays").catch(() => null),
    api.settings.get("sprint").catch(() => null),
    api.settings.get("wrapped").catch(() => null),
    // Inbox Assistant trials (0027): before the migration there is simply nothing to show
    api.inbox?.list ? api.inbox.list().catch(() => []) : [],
    api.inbox?.allDrafts ? api.inbox.allDrafts(new Date(Date.now() - 21 * 864e5).toISOString()).catch(() => []) : [],
    api.messages.recent(new Date(Date.now() - 60 * 864e5).toISOString()).catch(() => []),
  ]);
  S.trials = new Map();
  for (const a of inboxAccs || []) if (a.project_id && a.status !== "disconnected" && !S.trials.has(a.project_id)) S.trials.set(a.project_id, { a, st: inboxStats(a, (inboxDrafts || []).filter((d) => d.account_id === a.id)) });
  S.lastOut = new Map();
  for (const m of outMsgs || []) { if (!m.project_id || m.status === "failed") continue; const t = Date.parse(m.created_at); if (t > (S.lastOut.get(m.project_id) || 0)) S.lastOut.set(m.project_id, t); }
  S.wrapped = wrapped || { done: [] };
  S.offer = { ...DEFAULT_OFFER, ...(offer || {}) };
  S.gbpHolidays = gbpHolidays || { done: [] };
  S.sprint = { ...DEFAULT_SPRINT, ...(sprint || {}) };
  S.campaigns = campaigns || []; S.posts = posts || []; S.sites = sites || [];
  S.autobuild = autobuild || { auto_queue: false };
  S.features = { ...DEFAULT_FEATURES, ...(features || {}) }; applyFeatures();
  S.monitors = monitors || [];
  S.expenses = api.expenses ? await api.expenses.list().catch(() => []) : [];   // before 0032 there is simply nothing to show
  if (S.loadErrors.length) toast("Could not load: " + S.loadErrors.join(", ") + " — numbers may be incomplete", true);
  maybeBuildSync(); maybeFinderPull();
  S.projects = projects || []; S.payments = payments || []; S.clients = clients || [];
  S.templates = templates || []; S.profile = withDefaults(profile);
  S.requests = requests || []; S.time = time || []; S.loaded = Date.now();
  if (!_upgraded && S.templates.length) upgradeStarters().then((n) => { if (n) toast(`${n} ready-made message${n === 1 ? "" : "s"} added or updated (see Messages)`); });
}
const KIND_LABEL = { deposit: "Deposit", balance: "Balance", care: "Care plan", other: "Other" };
// The stored keys never change — existing clients' rows use them. "business" is
// labelled AI Care because that is what the plan became when AI became the business.
// AI operations plans (METHOD.md §5) are monthly, with an SLA; AI Care and the R6,500
// retainer stay for the clients already on them.
const PLAN_LABEL = { hosting: "Hosting", care: "Care", inbox: "Inbox Assistant", operate: "Operate", optimise: "Optimise", ai_partner: "Partner (AI ops)", business: "AI Care (earlier plan)", partner: "Partner retainer (earlier plan)" };
// Founding clients (Settings → Founding clients; the site banner and the #founding sections read
// it through the public `offer` function): the first N Inbox Assistant clients get the setup at a
// discount (100 = free) even when it works, in return for letting us share their measured results.
// Everyone pays the refundable R1,500 deposit to start; a place is taken when a founding client pays it.
const DEFAULT_OFFER = { active: false, code: "founding", total: 5, ends: "2027-03-31", discount: 100 };
function offerNow() {
  const o = S.offer || DEFAULT_OFFER;
  const on = S.projects.filter((p) => p.details?.offer === o.code);
  const taken = on.filter((p) => p.deposit_paid).length, left = Math.max(0, (Number(o.total) || 0) - taken);
  const ended = o.ends && o.ends < localDate();
  const discount = Math.max(5, Math.min(100, Math.round(Number(o.discount) || 100)));
  const setupOff = Math.round(INBOX_SETUP * discount / 100);
  const deal = discount >= 100 ? `the Inbox Assistant setup free (instead of ${money(INBOX_SETUP)})` : `the Inbox Assistant setup at ${discount}% off (${money(INBOX_SETUP - setupOff)} instead of ${money(INBOX_SETUP)})`;
  return { ...o, discount, setupOff, deal, name: "Founding clients", taken, left, leads: on.length, ended, live: Boolean(o.active) && left > 0 && !ended };
}
const onOffer = (p) => Boolean(p?.details?.offer) && p.details.offer === (S.offer?.code || "founding");
// Current yearly prices (pricing page). Existing clients keep what they pay
// (care_amount_cents is stored per client, and the site promises this), so moving these
// never reprices anyone already on a plan — it only changes what new quotes start from.
// Keeping the "Website by Re-Charge" footer credit takes R100 off.
const PLAN_PRICE = { hosting: 450000, care: 1450000, inbox: 3540000, operate: 9000000, optimise: 18000000, ai_partner: 42000000, business: 550000, partner: 6500000 };
// Website plans: paying monthly costs a tenth of the year each month (yearly is roughly 2 months free).
// Operations plans are priced monthly; a year of them is simply twelve months.
const PLAN_MONTHLY = { hosting: 45000, care: 145000, inbox: 295000, operate: 750000, optimise: 1500000, ai_partner: 3500000, business: 55000, partner: 650000 };
const OPS_PLANS = ["inbox", "operate", "optimise", "ai_partner"];
// The Inbox Assistant (inbox-assistant.html): the productized way in. R9,500 setup, R2,950 a month (AI usage
// included), ready within 3 business days. A refundable R1,500 deposit before setup (a card payment link from the
// lead), which comes off the setup (or the first month if the setup is waived). It then runs on their real emails for
// two weeks; the rest is invoiced only if it saves their team 5+ hours a week, otherwise the deposit is refunded in
// full within 7 days (no refund if the agreed access or information wasn't provided).
const INBOX_SETUP = 950000, INBOX_DEPOSIT = 150000;
// The deposit a client pays when they accept a quote. The same rule as depositOn in supabase/functions/quote:
// 40% rounded to R100, at least R500, never more than the total; overseas 40% rounded to 10, at least 50.
// A pay-monthly quote starts with its first month instead. Keep the two in step.
const DEPOSIT_SHARE = 0.4, DEPOSIT_MIN = 50000;
const depositOn = (total, cur = "ZAR") => cur === "ZAR"
  ? Math.min(total, Math.max(DEPOSIT_MIN, Math.round((total * DEPOSIT_SHARE) / 10000) * 10000))
  : Math.min(total, Math.max(5000, Math.round((total * DEPOSIT_SHARE) / 1000) * 1000));
const depositOf = (p) => p?.details?.payMonthly?.cents || (p?.quote_cents ? depositOn(p.quote_cents, qCur(p)) : 0);
// Deposits already in. Any payment recorded as a deposit sets deposit_paid (the 0012 trigger), and the quote page then
// asks for no deposit when they accept: so an Inbox Assistant quote after the trial doesn't charge a second one.
const depositsPaid = (p) => S.payments.filter((x) => x.project_id === p?.id && x.kind === "deposit" && x.status === "succeeded").reduce((a, x) => a + (x.amount_cents || 0), 0);
const depositLabel = (p) => (p?.details?.payMonthly?.cents ? `the first month (${moneyIn(p.details.payMonthly.cents, qCur(p))})` : p?.quote_cents ? `the ${moneyIn(depositOf(p), qCur(p))} deposit` : "the deposit");
// Plans that get the monthly report (Hosting alone doesn't). Same list as monthly-report PLANS.
const REPORT_PLANS = ["care", ...OPS_PLANS, "business", "partner"];
// Plans with AI in them: the weekly "what your AI handled" email is only for these
const AI_PLANS = [...OPS_PLANS, "business"];
// Implementation stages and the separately priced work (METHOD.md §5).
const IMPL = { discovery: 1500000, poc: 3500000, production: 8500000 };
const RATES = { change: 125000, consulting: 185000, emergency: 245000 };
// Hours of development included each month on the retainer — the "in-house developer" plan.
const PARTNER_HOURS = 10;
const CREDIT_OFF = 10000, CREDIT_OFF_MONTHLY = 1000;
// care_amount_cents is per billing period; these turn it into a year / a label.
const isMonthly = (c) => c?.billing === "monthly";
const careYear = (c) => (c?.care_amount_cents || 0) * (isMonthly(c) ? 12 : 1);
const careMonth = (c) => careYear(c) / 12;   // what a plan is worth per month, for recurring revenue (MRR)
const carePer = (c) => (c?.care_amount_cents ? money(c.care_amount_cents) + (isMonthly(c) ? "/month" : "/year") : "");
const planPrice = (plan, monthly, credit) => Math.max(0, ((monthly ? PLAN_MONTHLY : PLAN_PRICE)[plan] || 0) - (credit ? (monthly ? CREDIT_OFF_MONTHLY : CREDIT_OFF) : 0));
const paidAt = (x) => x.paid_at || x.created_at;
const clientById = (id) => S.clients.find((c) => c.id === id);
const minutesFor = (projectId) => S.time.filter((t) => t.project_id === projectId).reduce((a, t) => a + (Number(t.data?.minutes) || 0), 0);
const hours = (min) => (min / 60).toFixed(min % 60 ? 1 : 0) + "h";
// Extras that are off by default to keep the panel simple (Settings → Extra features).
const DEFAULT_FEATURES = { campaigns: false, time: false, star: false, social: false, sprint: false, offer: false };
const FEATURE_TEXT = {
  social: ["Social posts", "Write, plan and track LinkedIn, Facebook, Instagram and WhatsApp status posts. Each post opens the platform's own post window with the text copied, ready to paste and post."],
  sprint: ["Sales sprint", "A daily target for contacting new businesses, tracked on Today."],
  // Founding clients is switched on and off in its own section below (one control, not two)
  campaigns: ["Campaign tracking", "Tracking codes for ads and posts, spend and cost per lead, post results (reach, likes, clicks)."],
  time: ["Time tracking", "Log minutes on each lead and see your effective hourly rate on Money."],
  star: ["Star & hide", "Star important leads, and hide a lead from Today for a few days."],
};
function applyFeatures() { document.body.classList.toggle("no-campaigns", !S.features.campaigns); document.body.classList.toggle("no-social", !S.features.social); }
// Your real details, used until you change them in Settings.
const DEFAULT_PROFILE = { my_name: "Révan", reply_to: "enquiry.re.charge@gmail.com", signature: "Révan\nRe-Charge · re-charge.co.za\nWhatsApp 072 237 5833", signature_photo: "", whatsapp: String(CFG.WHATSAPP_NUMBER || "27722375833"), bcc_me: true, review_link: "https://g.page/r/CdYQR49mWeZ3EAI/review", deposit_link: String(CFG.DEPOSIT_PAYMENT_URL || "") };
const withDefaults = (v) => { const out = { ...DEFAULT_PROFILE }; for (const [k, x] of Object.entries(v || {})) if (x !== "" && x != null) out[k] = x; else if (!(k in DEFAULT_PROFILE) || typeof DEFAULT_PROFILE[k] === "boolean") out[k] = x; return out; };
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
  api = MOCK ? await (await import("./mock.js?v=20261019a")).createApi() : await (await import("./api.js?v=20261019a")).createApi(CFG);   // versioned with admin.js so a new release never pairs with an old cached copy
  if (MOCK) document.querySelector(".adm-tag").textContent = "Demo data";

  // magic-link landing: supabase-js reads the tokens from the hash; tidy the URL after.
  const fromLink = /access_token=|error=|type=magiclink/.test(location.hash);
  session = await api.auth.getSession();
  if (fromLink) history.replaceState(null, "", location.pathname + "#/");
  api.auth.onChange((s) => { const was = Boolean(session); session = s; if (Boolean(s) !== was) gate(); });

  $("signOut").addEventListener("click", async () => { await api.auth.signOut(); location.hash = "#/"; location.reload(); });
  if (!matchMedia("(min-width: 900px)").matches) $("searchInput").placeholder = "Search…";
  // the shortcut hint: ⌘K on a Mac, Ctrl K everywhere else (the office PC is Windows)
  const kbd = document.querySelector("#searchForm kbd"); if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) kbd.textContent = "Ctrl K";
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
  // Help gets its own place in the menu on a computer (on a phone it's under More)
  if (!document.querySelector('#adminNav [data-nav="help"]')) document.querySelector('#adminNav [data-nav="settings"]')?.insertAdjacentHTML("afterend", '<a href="#/help" data-nav="help" class="adm-nav__desk"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.3-2.5 3.8"/><path d="M12 17h.01"/></svg><span>Help</span></a>');
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
        <label for="signInEmail">Your email</label>
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
    email = $("signInEmail").value.trim(); if (!email) { say("Type the email you sign in with.", true); $("signInEmail").focus(); return; }
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
      <p class="muted small">This account (${esc(session.user.email)}) isn't on the staff list. Sign out and use your Re-Charge account, or ask the owner to add you.</p>
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
  const navKey = seg[0] === "c" || seg[0] === "sites" ? "clients" : seg[0] === "p" || seg[0] === "outreach" ? "pipeline" : seg[0] === "templates" || seg[0] === "contracts" ? "settings" : seg[0] === "calls" ? "overview" : seg[0] === "numbers" ? "money" : (seg[0] || "overview");
  const underMore = ["clients", "settings", "marketing", "help", "more"].includes(navKey) && !matchMedia("(min-width: 900px)").matches;
  document.querySelectorAll("#adminNav a").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === navKey || (underMore && a.dataset.nav === "more")));
  if (!S.loaded) view.innerHTML = '<p class="muted adm-boot">Loading…</p>';   // cached data renders instantly; it refreshes when stale
  try {
    await loadAll(false);
    if (mySeq !== routeSeq) return;   // a newer navigation superseded this one
    if (!seg.length) await renderOverview();
    else if (seg[0] === "pipeline") renderPipeline(q);
    else if (seg[0] === "p" && seg[1]) await renderProject(seg[1], q);
    else if (seg[0] === "add") renderAdd(q);
    else if (seg[0] === "calls") renderCalls();
    else if (seg[0] === "clients") seg[1] === "new" ? renderClientEditor(null, q) : renderClients();
    else if (seg[0] === "c" && seg[1]) { if (!clientById(seg[1])) view.innerHTML = '<p class="adm-error">Client not found.</p>'; else if (seg[2] === "edit") renderClientEditor(clientById(seg[1]), q); else await renderClient(seg[1], q); }
    else if (seg[0] === "money") renderMoney(q);
    else if (seg[0] === "numbers") await renderNumbers(q);
    else if (seg[0] === "sites") seg[1] ? await renderSiteEditor(seg[1] === "new" ? null : S.sites.find((x) => x.id === seg[1]) || "missing", q) : renderSites(q);
    else if (seg[0] === "marketing") seg[1] === "post" ? await renderPostEditor(seg[2], q) : seg[1] === "campaign" ? renderCampaignEditor(seg[2], q) : renderMarketing(q);
    else if (seg[0] === "templates") renderTemplates(seg[1] || "", q);
    else if (seg[0] === "outreach") await renderOutreach(q);
    else if (seg[0] === "settings") renderSettings();
    else if (seg[0] === "contracts") renderContracts(q);
    else if (seg[0] === "more") renderMore();
    else if (seg[0] === "help") renderHelp();
    else if (seg[0] === "search") await renderSearch(q.get("q") || "");
    else location.hash = "#/";
    if (!seg[1] || seg[0] === "outreach") addSubTabs(seg[0]);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="adm-error">Something went wrong: ${esc(e.message)}</p>`;
  }
  // A page that put the focus on something itself (a form it opened: ?pay=1, ?do=…) keeps it; otherwise start at the top
  const fa = document.activeElement;
  if (!fa || fa === view || fa === document.body || !view.contains(fa)) { view.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
// Pages that share a menu item get tabs under their heading
const SUB_TABS = [[["pipeline", "All leads"], ["outreach", "To contact"]], [["money", "Payments"], ["numbers", "Numbers"]], [["clients", "Clients"], ["sites", "Websites & mockups"]]];
function addSubTabs(cur) {
  const group = SUB_TABS.find((g) => g.some(([k]) => k === cur)); if (!group) return;
  const head = view.querySelector(".adm-head"); if (!head || view.querySelector(".adm-pagetabs")) return;
  head.insertAdjacentHTML("afterend", `<nav class="adm-pagetabs" aria-label="Sections">${group.map(([k, l]) => `<a href="#/${k}"${k === cur ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</nav>`);
}
// The smaller filter / period switch under a page's tabs (Money, Numbers, Social posts, Message wording)
const subTabs = (items, cur, label) => `<nav class="adm-subtabs" aria-label="${esc(label)}">${items.map(([v, l, href]) => `<a href="${esc(href)}"${v === cur ? ' class="is-active" aria-current="true"' : ""}>${l}</a>`).join("")}</nav>`;
const projectRow = (p, extra = "") => `
  <button type="button" class="adm-row__quick" data-quick="${esc(p.id)}" aria-label="Quick actions for ${esc(p.business || p.name || p.ref)}" title="Quick actions">⋯</button>
  <a class="adm-row" href="#/p/${esc(p.id)}">
    <div class="adm-row__main">
      <div class="adm-row__title">${S.features.star && p.starred ? '<span class="star" aria-label="Starred">★</span>' : ""}<span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}${p.business && p.name ? `<span class="muted" style="font-weight:400">${esc(p.name)}</span>` : ""}</div>
      ${(() => { const st = nextStep(p); return `<div class="adm-row__sub" title="${esc(st.title)}">${st.due ? '<b class="due">Do now:</b> ' : ""}${esc(st.title)}</div>`; })()}
      <div class="adm-row__meta">${stageChip(p.status)}${p.status === "contacted" ? '<span class="chip">contacted</span>' : ""}${trialChip(p)}${offerChip(p)}${potChip(p)}${webChip(p)}${estChip(p)}${p.location ? `<span class="chip chip--loc" title="Location">${esc(p.location)}</span>` : ""}${srcChip(p)}${aiChip(p)}${extra}</div>
    </div>
    <div class="adm-row__side"><span title="${esc(fmtDT(p.updated_at))}">${esc(rel(p.updated_at))}</span>${p.quote_cents ? `<span>${money(p.quote_cents)}</span>` : ""}${p.next_action_at ? `<span class="${Date.parse(p.next_action_at) < Date.now() ? "adm-error" : ""}">⏰ ${esc(fmtD(p.next_action_at))}</span>` : ""}</div>
  </a>`;

// ---------- overview ----------
async function renderOverview() {
  const active = S.projects.filter(isActive);
  const now = Date.now();
  const snoozeOn = S.features.star;

  const todo = active.filter((p) => !(snoozeOn && isSnoozed(p))).map((p) => ({ p, s: nextStep(p) })).filter((x) => x.s.due)
    .sort((a, b) => a.s.urgency - b.s.urgency || potRank(b.p) - potRank(a.p) || (b.p.quote_cents || 0) - (a.p.quote_cents || 0));
  const unmatched = S.payments.filter(isUnmatched);
  const renewals = S.clients.filter((c) => c.care_active && c.care_renews_at && (isMonthly(c) ? now - Date.parse(c.care_renews_at) > 4 * 86400e3 : (Date.parse(c.care_renews_at) - now) < 30 * 86400e3));
  const soon = active.filter((p) => p.next_action_at && Date.parse(p.next_action_at) > endOfToday().getTime() && Date.parse(p.next_action_at) < now + 7 * 86400e3)
    .sort((a, b) => a.next_action_at.localeCompare(b.next_action_at)).slice(0, 8);
  const calls = active.filter(isCall).map((p) => ({ p, d: callDate(p) })).filter((x) => x.d && x.d > endOfToday()).sort((a, b) => a.d - b.d).slice(0, 4);
  const sitesDown = S.monitors.filter((m) => m.status === "down");
  const gbpDue = S.clients.filter(gbpCareDue), hol = holidayReminder();
  const yr = new Date().getFullYear(), careClients = S.clients.filter((c) => c.care_active);
  const wrapDue = new Date().getMonth() === 11 && new Date().getDate() <= 24 && careClients.length && !(S.wrapped?.done || []).includes(yr);
  const noTemplates = !S.templates.length;
  const total = todo.length + unmatched.length + renewals.length + sitesDown.length + gbpDue.length + (hol ? 1 : 0) + (wrapDue ? 1 : 0);
  const recent = await api.events.recent(12).catch(() => []);
  const sprintOn = S.features.sprint && sprintNow().active && sprintNow().start;
  const sprintMsgs = sprintOn ? await api.messages.recent(new Date(sprintNow().start + "T00:00:00").toISOString()).catch(() => []) : [];
  const sprint = sprintOn ? sprintStats(sprintMsgs) : null;

  const items = [
    // A site that's down is the most urgent thing until you say you're on it (then it waits in "Next, today" for 2 hours)
    ...sitesDown.map((it) => { const ack = downAck(it.url); return { u: ack ? 1 : 0, h: ((m) => `<li><div class="adm-row adm-row--attn"><span class="dot ${ack ? "warn" : "bad"}"></span><div class="adm-row__main"><div class="adm-row__title">${esc(m.label)}</div><div class="adm-row__sub"><span class="adm-error">Website down</span> since ${esc(fmtDT(m.since))}: ${esc(m.last_error || "not loading")}${ack ? ` · <b>you're on it</b> (since ${esc(hhmm(new Date(ack)))})` : ""}</div></div><div class="adm-inline-actions adm-todo__do">${m.client_id ? `<a class="btn btn--primary" href="#/c/${esc(m.client_id)}?show=health">Open site health</a>${clientById(m.client_id)?.phone || clientById(m.client_id)?.email ? `<button type="button" class="btn btn--ghost" data-down-tell="${esc(m.client_id)}">Tell the client</button>` : ""}` : `<a class="btn btn--primary" href="${esc(m.url)}" target="_blank" rel="noopener">Open site</a>`}${ack ? "" : `<button type="button" class="btn btn--ghost" data-down-ack="${esc(m.url)}">I'm on it</button>`}</div></div></li>`)(it) }; }),
    ...todo.map((it) => ({ u: it.p.ai_sort?.urgency === "now" && !aiHandled(it.p) ? 0 : it.s.urgency, h: (({ p, s }) => `<li><div class="adm-row adm-row--attn"><span class="dot ${s.urgency === 0 ? "bad" : s.urgency === 1 ? "warn" : "ok"}"></span><div class="adm-row__main"><a class="adm-row__title" href="#/p/${esc(p.id)}"><span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}</a>${aiChip(p)}<div class="adm-row__sub">${esc(s.title)}${s.sub ? ` <span class="muted">· ${esc(s.sub)}</span>` : ""}</div></div><div class="adm-inline-actions adm-todo__do">${stepButtons(p, { actions: s.actions.filter((a) => a.primary).slice(0, 1) }, false) || `<a class="btn btn--ghost" href="#/p/${esc(p.id)}">Open</a>`}</div></div></li>`)(it) })),
    ...unmatched.map((it) => ({ u: 1, h: ((x) => `<li><div class="adm-row adm-row--attn"><span class="dot warn"></span><div class="adm-row__main"><div class="adm-row__title">${money(x.amount_cents)} paid by ${esc(x.email || x.reference || "someone")}</div><div class="adm-row__sub">Card payment on ${esc(fmtDT(x.created_at))}. We don't know which lead it's for yet</div></div><div class="adm-inline-actions adm-todo__do"><button class="btn btn--primary" data-match="${esc(x.id)}">Which lead is this?</button></div></div></li>`)(it) })),
    ...renewals.map((it) => ({ u: (Date.parse(it.care_renews_at) < now ? 0 : 2), h: ((c) => { const d = Math.ceil((Date.parse(c.care_renews_at) - now) / 86400e3); return `<li><div class="adm-row adm-row--attn"><span class="dot ${d < 0 ? "bad" : "ok"}"></span><div class="adm-row__main"><a class="adm-row__title" href="#/c/${esc(c.id)}">${esc(c.name)}</a><div class="adm-row__sub">${isMonthly(c) ? `Monthly payment is ${-d} days late (the link was emailed automatically)` : d < 0 ? `Hosting & care renewal is ${-d} day${-d === 1 ? "" : "s"} overdue` : `Hosting & care renews ${esc(fmtD(c.care_renews_at))} (in ${d} day${d === 1 ? "" : "s"})`}</div></div><div class="adm-inline-actions adm-todo__do"><a class="btn btn--primary" href="#/c/${esc(c.id)}">Send renewal</a></div></div></li>`; })(it) })),
    ...(hol ? [{ u: 1, h: `<li><div class="adm-row adm-row--attn"><span class="dot warn"></span><div class="adm-row__main"><div class="adm-row__title">${esc(hol.name)}: ${esc(fmtD(hol.key + "T12:00:00"))}</div><div class="adm-row__sub">Public holiday coming up: set special hours on ${hol.profiles} Google profile${hol.profiles === 1 ? "" : "s"} (closed, or their holiday hours), so customers don't arrive to a locked door.</div></div><div class="adm-inline-actions adm-todo__do"><a class="btn btn--ghost" href="https://business.google.com/" target="_blank" rel="noopener">Open Google Business</a><button type="button" class="btn btn--primary" data-hol-done="${esc(hol.key)}">Done</button></div></div></li>` }] : []),
    ...gbpDue.map((it) => ({ u: 2, h: ((c) => `<li><div class="adm-row adm-row--attn"><span class="dot ok"></span><div class="adm-row__main"><a class="adm-row__title" href="#/c/${esc(c.id)}">${esc(c.name)}</a><div class="adm-row__sub">Monthly Google care: 1–2 posts, reply to reviews, check Google's suggested edits${gbpHasAccess(c) ? "" : ". Ask them for Manager access first"}</div></div><div class="adm-inline-actions adm-todo__do">${c.gbp_url ? `<a class="btn btn--ghost" href="${esc(c.gbp_url)}" target="_blank" rel="noopener">Their profile</a>` : ""}<button type="button" class="btn btn--primary" data-gbp-care="${esc(c.id)}">Done</button></div></div></li>`)(it) })),
    ...(wrapDue ? [{ u: 2, h: `<li><div class="adm-row adm-row--attn"><span class="dot ok"></span><div class="adm-row__main"><div class="adm-row__title">Year in review: ${careClients.length} Care client${careClients.length === 1 ? "" : "s"}</div><div class="adm-row__sub">Send each one their "year online" image (client page → Year in review) with the Year in review message. Clients post them, and every one says "Website by Re-Charge".</div></div><div class="adm-inline-actions adm-todo__do"><a class="btn btn--ghost" href="#/clients">Clients</a><button type="button" class="btn btn--primary" id="wrapDone">Done</button></div></div></li>` }] : []),
  ].sort((x, y) => x.u - y.u);
  const cc = commandCentre(await ccTrials()), tdy = ccToday(items);
  view.innerHTML = `
  <div class="adm-head cc-head"><div><span class="eyebrow">Command centre · ${esc(fmtD(new Date().toISOString()))}</span><h1>${greeting()}${S.profile.my_name ? ", " + esc(S.profile.my_name) : ""}</h1></div>
    ${tdy.top.includes("cc-welcome") ? "" : '<div class="adm-head__actions"><button type="button" class="btn btn--ghost btn--small" id="ccHowTo">How this page works</button></div>'}</div>
  ${tdy.top}
  ${cc.actions}
  ${cc.kpis}
  <div class="cc-grid"><div class="cc-main">

  ${noTemplates ? `<div class="adm-card adm-setup"><h2>One-time setup: ready-made messages</h2><p class="small muted">Add the starter emails and WhatsApp messages (replying to enquiries, quotes, follow-ups, mockups). You can change the wording any time under Settings → Message wording.</p><div class="btn-row"><button class="btn btn--primary btn--small" id="seedNow">Add ready-made messages</button></div></div>` : ""}

  ${sprint ? sprintCard(sprint) : ""}

  ${tdy.rest}

  ${monStale() ? `<p class="adm-hint">Website monitoring hasn't checked your client sites in the last hour. <a href="#/settings">See Settings → Website monitoring</a></p>` : ""}
  ${soon.length || calls.length ? `<details class="adm-section adm-recent"><summary><h2>Coming up this week <span class="count">${soon.length + calls.length}</span></h2></summary><ul class="adm-list">
    ${calls.map(({ p, d }) => `<li><a class="adm-row" href="#/p/${esc(p.id)}"><div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}</div><div class="adm-row__sub">📞 Call ${esc(fmtD(d))}${p.details?.callTime ? ", " + esc(p.details.callTime) : ""}</div></div></a></li>`).join("")}
    ${soon.map((p) => `<li><a class="adm-row" href="#/p/${esc(p.id)}"><div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}</div><div class="adm-row__sub">${esc(p.next_action || "Follow up")} · ${esc(fmtD(p.next_action_at))}</div></div></a></li>`).join("")}
  </ul></details>` : ""}

  <details class="adm-section adm-recent"><summary><h2>What happened recently</h2></summary>
    <ul class="adm-timeline">${(() => { const rows = recent.filter((e) => !byId(e.project_id)?.spam && e.kind !== "time"); return rows.length ? rows.map((e) => `<li data-kind="${esc(e.kind)}"><span class="tl-dot"></span><div><time>${esc(fmtDT(e.created_at))} · <a href="#/p/${esc(e.project_id)}">${esc(e.projects?.business || e.projects?.name || e.projects?.ref || "")}</a></time><p>${esc(eventText(e))}</p></div></li>`).join("") : '<li class="adm-empty">Nothing yet.</li>'; })()}</ul></details>
  </div>${cc.side}</div>`;
  wireCommandCentre();
  view.querySelectorAll("[data-match]").forEach((b) => b.addEventListener("click", () => openMatch(b.dataset.match)));
  view.querySelectorAll("[data-down-ack]").forEach((b) => b.addEventListener("click", () => { setDownAck(b.dataset.downAck); toast("Noted: it waits under Next, today for 2 hours"); route(); }));
  view.querySelectorAll("[data-down-tell]").forEach((b) => b.addEventListener("click", () => {
    const c = clientById(b.dataset.downTell); if (!c) return;
    const pp = clientProject(c), kind = isMobile(pp.phone) ? "whatsapp" : pp.email ? "email" : "whatsapp";
    openCompose(pp, kind, { templateId: tplFor(kind, "site_down")?.id, moment: "site_down", onDone: () => route() });
  }));
  $("sprintEnd")?.addEventListener("click", async (e) => {
    const sp = sprintNow();
    if (!confirm(sprint?.over ? "Close this sprint?" : "End the sales sprint now? You can start a new one any time in Settings → Sales sprint.")) return;
    e.target.disabled = true;
    try { await api.settings.set("sprint", { ...sp, active: false }); S.sprint = { ...sp, active: false }; toast("Sprint ended"); route(); } catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  });
  $("sprintWalkin")?.addEventListener("click", async (e) => {
    const sp = sprintNow(), k = localDate(), manual = { ...(sp.manual || {}), [k]: (Number(sp.manual?.[k]) || 0) + 1 };
    e.target.disabled = true;
    try { await api.settings.set("sprint", { ...sp, manual }); S.sprint = { ...sp, manual }; toast("Logged: +1 contact today"); route(); } catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  });
  view.querySelectorAll("[data-gbp-care]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await api.clients.update(b.dataset.gbpCare, { gbp_care_at: new Date().toISOString() }); toast("Google care ticked off for this month"); await loadAll(true); route(); }
    catch (ex) { b.disabled = false; toast(/gbp_/.test(ex.message) ? "Run the database update first (supabase db push: migration 0020)" : ex.message, true); }
  }));
  $("wrapDone")?.addEventListener("click", async (e) => {
    e.target.disabled = true; const done = [...new Set([...(S.wrapped?.done || []), new Date().getFullYear()])];
    try { await api.settings.set("wrapped", { done }); S.wrapped = { done }; toast("Year in review done"); route(); } catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  });
  view.querySelectorAll("[data-hol-done]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    const done = [...new Set([...(S.gbpHolidays?.done || []), b.dataset.holDone])].slice(-40);
    try { await api.settings.set("gbp_holidays", { done }); S.gbpHolidays = { done }; toast("Holiday hours done"); route(); } catch (ex) { b.disabled = false; toast(ex.message, true); }
  }));
  $("seedNow")?.addEventListener("click", async (e) => { e.target.disabled = true; try { await seedTemplates(); _seedCount = null; toast("Ready-made messages added"); await loadAll(true); route(); } catch (ex) { toast(ex.message, true); e.target.disabled = false; } });
}
// "I'm on it" for a site that's down: remembered in this browser for 2 hours
const DOWN_ACK = "adm.downack", _downAck = {};
const downAck = (url) => { let t = _downAck[url]; try { t = JSON.parse(localStorage.getItem(DOWN_ACK) || "{}")[url] || t; } catch {} return t && Date.now() - t < 2 * 3600e3 ? t : 0; };
const setDownAck = (url) => { _downAck[url] = Date.now(); try { const m = JSON.parse(localStorage.getItem(DOWN_ACK) || "{}"); m[url] = Date.now(); localStorage.setItem(DOWN_ACK, JSON.stringify(m)); } catch {} };
// ---------- "What do I do now?" ----------
// Built so someone new can open the panel and know at once: one black card with the single most
// urgent thing (do it, and the next one moves up), then the rest of today, then what can wait.
// A first-visit welcome explains the page; the daily routine covers what isn't a lead's next step.
const WHY = ["It can't wait: it's due now or already late.", "Due today.", "Worth doing today if you have time."];
function ccToday(items) {
  const now = items[0], today = items.slice(1).filter((x) => x.u <= 1), later = items.slice(1).filter((x) => x.u >= 2);
  const dueToday = items.filter((x) => x.u <= 1).length;
  const top = `${ccWelcome()}
  ${now ? `<section class="cc-now" aria-labelledby="ccNowH"><div class="cc-now__label"><h2 id="ccNowH">Do this now</h2><small>${dueToday ? `${dueToday} thing${dueToday === 1 ? "" : "s"} due today` : "Nothing urgent: this is the best next step"}</small></div>
    <p class="cc-now__why">${esc(WHY[Math.min(now.u, 2)])} When it's done, the next one moves up here.</p>
    <ul class="adm-list">${now.h}</ul></section>` : `<section class="cc-now cc-now--clear"><div class="cc-now__label"><h2>All caught up</h2></div><p class="cc-now__why">Nothing is waiting on you. A good use of a quiet moment: contact five new businesses.</p><div class="btn-row"><a class="btn btn--primary" href="#/outreach">Find people to contact</a></div></section>`}`;
  const rest = `${today.length ? `<section class="adm-section"><h2>Next, today <span class="count">${today.length}</span></h2><ul class="adm-list">${today.map((x) => x.h).join("")}</ul></section>` : ""}
  ${later.length ? `<details class="adm-section adm-recent cc-later"${today.length ? "" : " open"}><summary><h2>When you have time <span class="count">${later.length}</span></h2></summary><p class="small muted">None of these are late. Do them after everything above.</p><ul class="adm-list">${later.map((x) => x.h).join("")}</ul></details>` : ""}
  ${ccRoutine()}`;
  return { top, rest };
}
const ROUTINE = [
  ["reply", "Reply to every new enquiry", "We promise a reply by 17:00 the next business day. New ones show up in the list above.", "#/pipeline?view=board", "Leads"],
  ["pay", "Record any EFT or cash payment", "Card payments show up by themselves. Anything else, record it so the numbers are right.", "#/money?pay=1", "I received a payment"],
  ["reach", "Contact five new businesses", "From To contact, using the ready-made WhatsApp message. This is what fills next month.", "#/outreach", "To contact"],
  ["clear", "Finish with the list above empty", "Nothing left under Do this now and Next, today. Anything that can't be done, set a reminder date on the lead.", "", ""],
];
const dayKey = () => "adm.routine." + localDate();
function ccRoutine() {
  let done = {}; try { done = JSON.parse(localStorage.getItem(dayKey()) || "{}"); } catch {}
  const n = ROUTINE.filter(([k]) => done[k]).length;
  return `<details class="adm-section adm-recent cc-routine"${n < ROUTINE.length ? " open" : ""}><summary><h2>Every day <span class="count">${n} of ${ROUTINE.length}</span></h2></summary>
    <p class="small muted">The things to do every working day, whatever the list says. Ticks reset tomorrow.</p>
    <ul class="cc-checks">${ROUTINE.map(([k, t, why, href, label]) => `<li><label><input type="checkbox" data-routine="${k}"${done[k] ? " checked" : ""} /><span><b>${esc(t)}</b><small>${esc(why)}</small></span></label>${href ? `<a class="btn btn--ghost btn--small" ${href.includes("pay=1") ? `data-panel="${href}" href="${href}"` : `href="${href}"`}>${esc(label)}</a>` : ""}</li>`).join("")}</ul></details>`;
}
function ccWelcome() {
  let seen = false, before = false, now = false;
  try { seen = localStorage.getItem("adm.welcome.v1") === "1"; before = localStorage.getItem("adm.welcome.shown") === "1"; now = sessionStorage.getItem("adm.welcome.shown") === "1"; } catch {}
  if (seen && !ccWelcome.force) return "";
  // After the first visit (an earlier session) it shrinks to one line, so "Do this now" is on a phone's first screen
  if (before && !now && !ccWelcome.force) return `<section class="cc-welcome cc-welcome--mini" id="ccWelcome"><p>New here? <button type="button" class="inline-link" id="ccWelcomeMore">How this page works</button></p><button type="button" class="btn btn--ghost btn--small" id="ccWelcomeOk">Hide this</button></section>`;
  try { localStorage.setItem("adm.welcome.shown", "1"); sessionStorage.setItem("adm.welcome.shown", "1"); } catch {}
  return `<section class="cc-welcome" id="ccWelcome" aria-labelledby="ccWelcomeH"><h2 id="ccWelcomeH">New here? This page is your day.</h2>
    <ol>
      <li><b>Do the black card first.</b> It's always the single most urgent thing. Press its button, finish it, and the next one moves up.</li>
      <li><b>Then work down "Next, today".</b> Each line says what to do and has the button to do it.</li>
      <li><b>"When you have time" can wait.</b> Nothing there is late.</li>
      <li><b>Tick off "Every day"</b> before you finish: new enquiries answered, payments recorded, five new businesses contacted.</li>
      <li><b>The numbers and the summary boxes</b> show how the business is doing. Tap any lead or client to open it (on a computer it opens beside this page; press Done to come back).</li>
    </ol>
    <div class="btn-row"><button type="button" class="btn btn--primary btn--small" id="ccWelcomeOk">Got it</button><a class="btn btn--ghost btn--small" href="#/help">How everything works</a></div></section>`;
}
// ---------- AI sorting (0031): the home AI hub sorts emails, WhatsApps and website enquiries ----------
const AI_KIND = { quote: "Wants a quote", booking: "Wants a call", question: "Question", support: "Client needs help", payment: "Payment", complaint: "Complaint", supplier: "Someone selling to us", job: "Job seeker", spam: "Spam", other: "Other" };
const AI_URG = { now: "Now", today: "Today", later: "Can wait" };
// The AI's "next" goes stale once you've acted on it: a message sent, the quote sent or the stage moved after it sorted
const aiHandled = (p) => { const a = p?.ai_sort; if (!a?.at) return false; const at = Date.parse(a.at); return lastOutAt(p) > at || Date.parse(p.quote_sent_at || 0) > at || Boolean(a.stage && stageOf(a.stage) !== stageOf(p.status)); };
const aiChipText = (p) => { const a = p.ai_sort; return aiHandled(p) ? `AI ${fmtD(a.at).replace(/^\w+ /, "")}: ${AI_KIND[a.kind] || a.kind} · done` : `AI · ${AI_KIND[a.kind] || a.kind} · ${AI_URG[a.urgency] || ""}`; };
const aiChip = (p) => { const a = p.ai_sort; if (!a?.kind) return ""; return `<span class="chip chip--ai${aiHandled(p) ? " is-done" : ""}" data-u="${esc(a.urgency)}" title="${esc((a.summary || "") + (a.next_step ? " · Next: " + a.next_step : "") + (a.engine ? ` (sorted ${a.engine === "local" ? "by the AI hub" : "by Claude"})` : "") + (aiHandled(p) ? " · already acted on" : ""))}">${esc(aiChipText(p))}</span>`; };
const aiLine = (p) => { const a = p.ai_sort, done = aiHandled(p); return `<div class="adm-ai-line${done ? " is-done" : ""}">${a?.kind ? `<span class="chip chip--ai${done ? " is-done" : ""}" data-u="${esc(a.urgency)}">${esc(aiChipText(p))}</span><span>${esc(a.summary || "")}${a.next_step ? ` <b>${done ? "It suggested:" : "Next:"}</b> ${esc(a.next_step)}` : ""}${done ? ' <span class="tiny muted">(you\'ve acted on it since)</span>' : ""}</span>` : '<span class="muted small">Not sorted by AI yet.</span>'}<span class="adm-ai-line__acts">${p.email ? `<button type="button" class="btn btn--primary btn--small" data-ai-draft="email" data-pid="${esc(p.id)}">Draft a reply (email)</button>` : ""}${isMobile(p.phone) ? `<button type="button" class="btn btn--ghost btn--small" data-ai-draft="whatsapp" data-pid="${esc(p.id)}">Draft a WhatsApp</button>` : ""}<button type="button" class="inline-link small" data-ai-resort="${esc(p.id)}">${a?.kind ? "Sort again" : "Sort it"}</button></span></div>`; };
document.addEventListener("click", async (e) => {
  const b = e.target.closest?.("[data-ai-resort]"); if (!b) return;
  b.disabled = true; b.textContent = "Sorting…";
  try { const r = await api.aiHub("resort", { projectId: b.dataset.aiResort }); const i = S.projects.findIndex((x) => x.id === b.dataset.aiResort); if (i >= 0) S.projects[i] = { ...S.projects[i], ai_sort: r.ai_sort }; toast("Sorted"); route(); }
  catch (ex) { b.disabled = false; b.textContent = "Sort it"; toast(ex.message, true); }
});
// A price in the draft well above what they said they'd spend: worth a look before it goes out
const randsIn = (t) => [...String(t || "").matchAll(/R\s?(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:k\b)?/gi)].map((m) => Number(m[1].replace(/[ ,]/g, "")) * (/k$/i.test(m[0]) ? 1000 : 1)).filter((n) => n >= 100);
function budgetWarning(p, body) {
  const cap = Math.max(0, ...randsIn(p?.budget)); if (!cap) return "";
  const top = Math.max(0, ...randsIn(body));
  return top > cap * 1.2 ? `Their budget is ${p.budget}; this draft mentions ${money(top * 100)}. Check it says why, or offer something that fits.` : "";
}
// Draft a reply to a lead with AI (0031 + draft_lead.ts), then open it in the normal compose window
async function draftReply(p, channel, message = "", best = false) {
  if (!p) return;
  if (channel === "email" && !p.email) return toast("This lead has no email address", true);
  if (channel === "whatsapp" && !p.phone) return toast("This lead has no phone number", true);
  const dlg = $("composeDialog");
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><h2>Drafting a reply…</h2></div><p class="small muted">${best ? "Claude is writing it." : "Your AI hub is writing it. This takes a few seconds."}</p><div class="adm-ai-wait" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
  if (!dlg.open) dlg.showModal();
  // What the panel knows that the draft should fit (shown under it, and sent along for the AI to use)
  const tr = trialOpen(p), ctx = { stage: STAGE[p.status]?.label || p.status, trial: tr ? { day: Math.max(1, tr.st.day), hours: tr.st.hours, target: tr.st.target } : null, budget: p.budget || null, quote: p.quote_cents ? moneyIn(p.quote_cents, qCur(p)) : null };
  try {
    const r = await api.aiHub("draft", { projectId: p.id, channel, message, best, context: ctx });
    const based = [message ? "their message" : p.goal ? "what they asked for" : "", `stage ${ctx.stage}`, ctx.trial ? `Inbox Assistant trial day ${ctx.trial.day} of 14 (${ctx.trial.hours} of ${ctx.trial.target} h)` : "", ctx.quote ? `their quote ${ctx.quote}` : "", ctx.budget ? `budget ${ctx.budget}` : ""].filter(Boolean);
    openCompose(p, channel, { template: { id: null, subject: r.draft.subject, body: r.draft.body, meta: null }, aiInfo: { engine: r.engine, check: r.draft.check, based, warn: budgetWarning(p, r.draft.body) }, onRedo: () => draftReply(p, channel, message, true), onDone: () => route() });
  } catch (ex) {
    dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><h2>Couldn't draft it</h2><button type="button" class="adm-dialog__x" data-close aria-label="Close">×</button></div><p class="small adm-error">${esc(ex.message)}</p><div class="btn-row"><button type="button" class="btn btn--ghost btn--small" data-close>Close</button>${best ? "" : '<button type="button" class="btn btn--primary btn--small" id="draftBest">Try the cloud AI (small cost)</button>'}</div></div>`;
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
    $("draftBest")?.addEventListener("click", () => draftReply(p, channel, message, true));
  }
}
document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-ai-draft]"); if (!b) return; draftReply(byId(b.dataset.pid), b.dataset.aiDraft); });
function openSort() {
  let d = $("sortDlg");
  if (!d) {
    document.body.insertAdjacentHTML("beforeend", `<dialog class="adm-dialog" id="sortDlg" aria-labelledby="sortH"><div class="adm-dialog__inner"><div class="adm-dialog__head"><h2 id="sortH">Sort a message</h2><button type="button" class="adm-dialog__x" data-close aria-label="Close">×</button></div>
      <p class="small muted">Paste an email or WhatsApp (copy the whole chat if you like). The AI says what it is, how urgent it is and what to do next, and finds the lead it belongs to.</p>
      <form class="adm-form" id="sortForm"><label>Where it came from<select name="source"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone call (your notes)</option><option value="other">Somewhere else</option></select></label>
        <label>The message<textarea name="text" rows="7" style="min-height:140px" required placeholder="Paste it here"></textarea></label>
        <div class="btn-row" style="justify-content:flex-end"><button type="submit" class="btn btn--primary btn--small">Sort it</button></div></form>
      <div id="sortOut"></div></div></dialog>`);
    d = $("sortDlg");
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    $("sortForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, text = f.text.value.trim(), source = f.source.value, out = $("sortOut");
      if (!text) return;
      await busy(f.querySelector("[type=submit]"), async () => {
        try {
          const r = await api.aiHub("sort", { text, source }), a = r.sorted;
          out.innerHTML = `<div class="adm-card adm-sort-res"><div class="pill-row"><span class="chip chip--ai" data-u="${esc(a.urgency)}">${esc(AI_KIND[a.kind] || a.kind)}</span><span class="chip">${esc(AI_URG[a.urgency])}</span><span class="tiny muted">${r.engine === "local" ? "Sorted by your AI hub" : "Sorted by Claude"} · ${(r.ms / 1000).toFixed(1)}s</span></div>
            <p style="margin:.6rem 0 .2rem"><b>${esc(a.summary)}</b></p>
            ${Array.isArray(a.asks) && a.asks.length ? `<p class="small" style="margin:.3rem 0 0"><b>They asked:</b></p><ul class="small adm-asks">${a.asks.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
            <p class="small">Next: ${esc(a.next_step)}${dueOf(a) ? ` <span class="due">by ${esc(fmtD(dueOf(a).toISOString()))}</span>` : ""}</p>
            ${a.why ? `<p class="tiny muted">Why ${esc((AI_KIND[a.kind] || a.kind).toLowerCase())}: ${esc(a.why)}</p>` : ""}
            ${[a.who.name, a.who.business, a.who.email, a.who.phone].some(Boolean) ? `<p class="tiny muted">From: ${esc([a.who.name, a.who.business, a.who.email, a.who.phone].filter(Boolean).join(" · "))}</p>` : ""}
            ${(r.matches || []).length && a.next_step && !["spam", "supplier", "job"].includes(a.kind) ? `<label class="check small" style="margin-top:.6rem"><input type="checkbox" id="sortRemind" checked /> When I add it to a lead: make "${esc(a.next_step)}" its next step, with a reminder for ${esc(fmtD((dueOf(a) || workdaysFrom(1)).toISOString()))}</label>` : ""}
            <div class="adm-inline-actions" style="margin-top:.7rem">${(r.matches || []).map((m) => `<button type="button" class="btn btn--primary btn--small" data-addto="${esc(m.id)}">Add to ${esc(m.ref)} ${esc(m.business || m.name || "")}</button>`).join("")}
              ${a.kind !== "spam" ? `<button type="button" class="btn ${(r.matches || []).length ? "btn--ghost" : "btn--primary"} btn--small" id="sortNew">Make it a new lead</button>` : ""}</div>
            ${!["spam", "supplier", "job"].includes(a.kind) ? `<label class="check small" style="margin-top:.6rem"><input type="checkbox" id="sortDraft" checked /> Then draft a reply ${source === "whatsapp" ? "on WhatsApp" : "by email"}</label>` : ""}
            <div class="adm-inline-actions" style="margin-top:.4rem"><button type="button" class="btn btn--ghost btn--small" id="sortDone">${a.kind === "spam" || a.kind === "supplier" ? "Ignore it" : "Done"}</button></div></div>`;
          const ai_sort = { ...a, engine: r.engine, at: new Date().toISOString() }, label = { email: "Email", whatsapp: "WhatsApp", phone: "Phone call", other: "Message" }[source];
          const remind = () => ($("sortRemind")?.checked ? { next_action: a.next_step.slice(0, 200), next_action_at: (dueOf(a) || workdaysFrom(1)).toISOString() } : {});
          out.querySelectorAll("[data-addto]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
            try { const wantDraft = $("sortDraft")?.checked; await api.events.insert(b.dataset.addto, "note", `${label} received: ${text.slice(0, 3000)}`, { ai_sort }); await api.projects.update(b.dataset.addto, { ai_sort: { ...ai_sort, stage: byId(b.dataset.addto)?.status || null }, ...remind() }); toast($("sortRemind")?.checked ? "Added to the lead, with the next step as a reminder" : "Added to the lead"); d.close(); await loadAll(true); location.hash = "#/p/" + b.dataset.addto; if (wantDraft) setTimeout(() => draftReply(byId(b.dataset.addto), source === "whatsapp" ? "whatsapp" : "email", text), 400); }
            catch (ex) { toast(ex.message, true); }
          }, "Adding…")));
          $("sortNew")?.addEventListener("click", (ev) => busy(ev.target, async () => {
            try {
              const row = { business: a.who.business || null, name: a.who.name || (!a.who.business ? (a.who.email || a.who.phone || `${label} ${fmtD(new Date().toISOString())}`) : null), email: (a.who.email || "").toLowerCase() || null, phone: a.who.phone || null, source: source === "whatsapp" ? "whatsapp" : source === "phone" ? "phone" : "other", status: "new", category: [], goal: text.slice(0, 4000), ai_sort: { ...ai_sort, stage: "new" }, details: { formType: `${label} (sorted by AI)` } };   // a new lead's next step is the reply itself, so no reminder
              const pr = await api.projects.insert(row); if (!api.mock) await api.events.insert(pr.id, "created", `Added from a pasted ${label.toLowerCase()} (AI sorted: ${AI_KIND[a.kind]})`);
              const wantDraft = $("sortDraft")?.checked;
              toast("New lead added"); d.close(); await loadAll(true); location.hash = "#/p/" + pr.id;
              if (wantDraft) setTimeout(() => draftReply(byId(pr.id), source === "whatsapp" ? "whatsapp" : "email", text), 400);
            } catch (ex) { toast(ex.message, true); }
          }, "Adding…"));
          $("sortDone")?.addEventListener("click", () => d.close());
        } catch (ex) { out.innerHTML = `<p class="small adm-error">${esc(ex.message)}</p>`; }
      }, "Sorting…");
    });
  }
  $("sortForm").reset(); $("sortOut").innerHTML = ""; d.showModal(); $("sortForm").text.focus();
}
// A plain status line, with the exact setup steps (ADMIN.md sections, migrations) folded under "Setup notes"
const setupNote = (status, steps, cls = "small muted") => `${status ? `<p class="${cls}">${status}</p>` : ""}${steps ? `<details class="adm-setupnote"><summary class="tiny">Setup notes</summary><p class="tiny muted">${steps}</p></details>` : ""}`;
async function fillAiHub() {
  const box = $("aiBox"), sum = $("aiSum"); if (!box) return;
  let st; try { st = await api.aiHub("status"); } catch (e) { box.innerHTML = /ai-hub|404|not found/i.test(e.message) ? setupNote("The AI hub isn't set up yet.", "Run database updates 0031 and 0035 and deploy the ai-hub function (ADMIN.md 8cq and 8da).") : `<p class="small adm-error">${esc(e.message)}</p>`; sum.textContent = "Not set up"; return; }
  const h = st.hub;
  sum.textContent = h.configured ? (h.online ? "Online" : st.claude ? "Offline: using Claude" : "Offline") : st.claude ? "Using Claude (no hub yet)" : "Not set up";
  box.innerHTML = `<ul class="cc-kv small">
      <li><span>Office PC</span><b>${h.configured ? (h.online ? `Online${h.models.length ? " · " + esc(h.models[0]) : ""}` : `Offline${h.error ? " (" + esc(h.error) + ")" : ""}`) : "Not connected yet"}</b></li>
      ${h.configured ? `<li><span>Connection</span><b>${h.mode === "direct" ? (h.api === "chat" ? "Your /chat API, through a tunnel (LOCAL_AI_URL)" : "Direct address (LOCAL_AI_URL)") : "The PC collects its jobs (no address needed)"}</b></li>` : ""}
      <li><span>Claude fallback</span><b>${st.claude ? "On" : "Off (no ANTHROPIC_API_KEY)"}</b></li>
      <li><span>Sorted today</span><b>${st.today.local} by the PC · ${st.today.claude} by Claude</b></li>
      ${st.calls_waiting != null ? `<li><span>Calls waiting</span><b>${st.calls_waiting ? `${st.calls_waiting} for the office PC` : "None"}</b></li>` : ""}
      <li><span>Last 7 days</span><b>${st.week.local} by the PC · ${st.week.claude} by Claude${st.avg_local_ms ? ` · ${(st.avg_local_ms / 1000).toFixed(1)}s each on the PC` : ""}</b></li></ul>
    <div class="adm-inline-actions" style="margin-top:.7rem"><button type="button" class="btn btn--primary btn--small" id="aiTry">Try it</button><button type="button" class="btn btn--ghost btn--small" id="aiRefresh">Check again</button></div>
    ${h.configured ? "" : setupNote("The office PC isn't connected yet, so Claude does the sorting.", "Follow hub/README.md: run database update 0035, deploy the four functions that use the PC (supabase functions deploy hub-jobs assistant ai-hub project-intake --project-ref aqwdncyihcbktbbuvvzd), add LOCAL_AI_TOKEN as a Supabase secret and start start-hub.bat on the PC (ADMIN.md 8da).", "tiny muted")}`;
  $("aiRefresh").addEventListener("click", () => fillAiHub());
  $("aiTry").addEventListener("click", () => { openSort(); const f = $("sortForm"); f.source.value = "email"; f.text.value = "Hi there, we're a 20-person accounting firm in Sandton. We get about 80 client emails a day asking for the same documents. Could you quote us for something that drafts the replies? Thanks, Priya Naidoo, Naidoo & Co, 082 555 0101"; });
}
// ---------- Reading invoices and payment proofs (0032): AI turns a PDF, photo or text into a payment or a cost ----------
const COST_CAT = { hosting: "Hosting & domains", software: "Software & subscriptions", ai: "AI usage", marketing: "Marketing & ads", equipment: "Equipment", office: "Office & internet", travel: "Travel", professional: "Accountant, legal & bank", other: "Other" };
const loadScript = (src) => new Promise((res, rej) => { if ([...document.scripts].some((x) => x.src === src)) return res(); const el = document.createElement("script"); el.src = src; el.onload = () => res(); el.onerror = () => rej(new Error("Couldn't load the reader. Check your connection.")); document.head.appendChild(el); });
async function ocrImages(images, say) {
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js");
  say("Reading the text in the picture…");
  const w = await window.Tesseract.createWorker("eng");
  let t = ""; for (const img of images) t += (await w.recognize(img)).data.text + "\n";
  await w.terminate(); return t;
}
// The model on the office PC reads text, not pictures: pull the text out here first
async function textFromFile(file, say) {
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    say("Opening the PDF…");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) { const c = await (await pdf.getPage(i)).getTextContent(); text += c.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n"; }
    if (text.replace(/\s/g, "").length > 40) return text;
    const pages = [];   // a scanned PDF: draw the first pages and read them like a photo
    for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) { const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 2 }), cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; pages.push(cv); }
    return ocrImages(pages, say);
  }
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new Error("iPhone HEIC photos can't be read here. Take a screenshot of it, or share it as a PDF.");
  return ocrImages([file], say);
}
async function recordPayment(p, { cents, kind, provider, date, note }) {
  await api.payments.insert({ project_id: p.id, client_id: p.client_id || null, provider, amount_cents: cents, currency: "ZAR", kind, note: note || null, status: "succeeded", matched: true, paid_at: new Date(date + "T12:00:00").toISOString() });
  await api.events.insert(p.id, "payment", `${money(cents)} ${KIND_LABEL[kind].toLowerCase()} received (${provider.toUpperCase()})${note ? " — " + note : ""}`, { manual: true, kind, read_by_ai: true });
  if (kind === "deposit" && !p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true, ...(["new", "prospect", "contacted"].includes(p.status) ? { status: "deposit_paid" } : {}) });
}
// A lead picker for the dialogs: likely matches first (★), then current leads, lost and archived ones under
// "Older", each as "RC-ref · business · stage · quote", nothing chosen unless we're sure, and a box to type into.
function leadPicker(name, { selected = "", guesses = [], others = null, filter = true, why = {} } = {}) {
  const pool = (others || S.projects.filter((p) => !p.spam)).filter((p) => !guesses.some((g) => g.id === p.id));
  const label = (p) => `${p.ref || ""} · ${p.business || p.name || ""} · ${STAGE[p.status]?.label || p.status || ""}${p.quote_cents ? " · " + money(p.quote_cents) : ""}`;
  const opt = (p, star) => `<option value="${esc(p.id)}"${p.id === selected ? " selected" : ""}>${star ? "★ " : ""}${esc(label(p))}${why[p.id] ? " · " + esc(why[p.id]) : ""}</option>`;
  const byName = (a, b) => (a.business || a.name || "").localeCompare(b.business || b.name || "");
  const old = (p) => !isActive(p) || stageOf(p.status) === "declined";
  const current = pool.filter((p) => !old(p)).sort(byName), older = pool.filter(old).sort(byName);
  return `${filter ? `<input type="search" class="adm-pick__find" placeholder="Type to find a lead…" aria-label="Find a lead" data-pick-find="${esc(name)}" autocomplete="off" />` : ""}<select name="${esc(name)}" aria-label="Lead" required><option value=""${selected ? "" : " selected"}>Choose the lead…</option>${guesses.length ? `<optgroup label="Likely matches">${guesses.map((p) => opt(p, true)).join("")}</optgroup>` : ""}${current.length ? `<optgroup label="Current leads">${current.map((p) => opt(p)).join("")}</optgroup>` : ""}${older.length ? `<optgroup label="Older (lost or archived)">${older.map((p) => opt(p)).join("")}</optgroup>` : ""}</select>`;
}
function wireLeadPicker(root) {
  root.querySelectorAll("[data-pick-find]").forEach((inp) => {
    const sel = root.querySelector(`select[name="${inp.dataset.pickFind}"]`); if (!sel) return;
    inp.addEventListener("input", () => {
      const t = inp.value.trim().toLowerCase(); let first = null;
      sel.querySelectorAll("option").forEach((o) => { if (!o.value) return; const hit = !t || o.textContent.toLowerCase().includes(t); o.hidden = !hit; if (hit && !first) first = o; });
      sel.querySelectorAll("optgroup").forEach((g) => { g.hidden = ![...g.children].some((o) => !o.hidden); });
      if (t && first && sel.value !== first.value) { sel.value = first.value; sel.dispatchEvent(new Event("change")); }
    });
  });
}
function openReader() {
  let d = $("readDlg");
  if (!d) {
    document.body.insertAdjacentHTML("beforeend", `<dialog class="adm-dialog" id="readDlg" aria-labelledby="readH"><div class="adm-dialog__inner"><div class="adm-dialog__head"><h2 id="readH">Read an invoice or payment</h2><button type="button" class="adm-dialog__x" data-close aria-label="Close">×</button></div>
      <p class="small muted">A client's proof of payment, or a bill you received: a PDF, a photo or screenshot, or paste the text. The AI fills in the details; you check them and save.</p>
      <form class="adm-form" id="readForm"><label>The file<input type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp" /></label>
        <details><summary class="small">Or paste the text instead</summary><textarea name="text" rows="5" style="min-height:110px" placeholder="Paste the email or the text of the invoice"></textarea></details>
        <div class="btn-row" style="justify-content:flex-end"><button type="submit" class="btn btn--primary btn--small">Read it</button></div>
        <p class="small muted" id="readSay" aria-live="polite"></p></form>
      <div id="readOut"></div></div></dialog>`);
    d = $("readDlg");
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    $("readForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, file = f.file.files[0], out = $("readOut"), say = (t) => { $("readSay").textContent = t; };
      if (!file && !f.text.value.trim()) return say("Choose a file, or paste the text.");
      if (file && file.size > 10 * 1024 * 1024) return say("That file is over 10 MB.");
      await busy(f.querySelector("[type=submit]"), async () => {
        try {
          const text = file ? await textFromFile(file, say) : f.text.value.trim();
          say("The AI is reading it…");
          const r = await api.aiHub("read", { text });
          say(`${r.engine === "local" ? "Read by your AI hub" : "Read by Claude"} in ${(r.ms / 1000).toFixed(1)}s. Check everything before you save.`);
          showRead(r, file, text);
        } catch (ex) { say(""); out.innerHTML = `<p class="small adm-error">${esc(ex.message)}</p>`; }
      }, "Reading…");
    });
  }
  $("readForm").reset(); $("readOut").innerHTML = ""; $("readSay").textContent = ""; d.showModal();
}
function showRead(r, file, text) {
  const d0 = r.doc, out = $("readOut"), today = localDate();
  // A lead is only picked for you when the document carries its RC number (or the AI matched it by reference or
  // email); otherwise you choose, so a payment can't land on the first lead in the list by accident.
  const rcIn = String([d0.reference, text].join(" ")).match(/\bRC-?(\d{4,6})\b/i), rc = rcIn ? "RC-" + rcIn[1].padStart(5, "0") : "";
  const byRef = rc ? S.projects.find((p) => p.ref === rc) : null;
  const sure = byRef || (r.matches || []).map((m) => (["ref", "email"].includes(m.why) ? byId(m.id) || m : null)).find(Boolean) || null;
  const guesses = [...(sure ? [sure] : []), ...(r.matches || []).map((m) => byId(m.id) || m).filter((m) => m.id !== sure?.id)];
  const others = S.projects.filter((p) => !guesses.some((g) => g.id === p.id) && !p.spam);
  const bp = sure;
  // Not sure what it is? Then neither is picked: a client's payment saved as a bill is the costly mistake
  const type0 = d0.doc_type === "supplier_invoice" ? "cost" : d0.doc_type === "payment_proof" || d0.doc_type === "client_invoice" ? "pay" : rc ? "pay" : "";
  out.innerHTML = `<div class="adm-card adm-sort-res"><form class="adm-form" id="readRes">
    <div class="demo__seg" role="group" aria-label="What is it"><button type="button" data-t="pay">A client paid us</button><button type="button" data-t="cost">A bill we pay</button></div>
    ${d0.doc_type === "client_invoice" ? '<p class="small muted">This looks like an invoice <b>you</b> sent. If it has been paid, record it here.</p>' : d0.doc_type === "other" ? (rc ? `<p class="small muted">The AI wasn't sure what this is, but it carries the reference ${esc(rc)}, so it's set as a client payment. Check every field.</p>` : '<p class="small muted">The AI wasn\'t sure what this is. Pick one above and check every field.</p>') : ""}
    <div data-for="pay">
      <label>Which lead${sure ? ` <span class="muted" style="font-weight:400">(${byRef ? `matches the reference ${esc(rc)}` : "matched by the AI"})</span>` : guesses.length ? ` <span class="muted" style="font-weight:400">(★ possible matches first: check before you save)</span>` : ""}${leadPicker("project", { selected: sure?.id, guesses, others, filter: true })}</label>
      <div class="row2"><label>For<select name="kind"><option value=""${bp ? "" : " selected"}>Choose…</option><option value="deposit"${bp && !bp.deposit_paid ? " selected" : ""}>The deposit</option><option value="balance"${bp && bp.deposit_paid ? " selected" : ""}>The balance</option><option value="care">Hosting, care or a monthly plan</option><option value="other">Other</option></select></label>
        <label>How<select name="provider"><option value="eft">EFT / bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label></div>
    </div>
    <div data-for="cost">
      <div class="row2"><label>Supplier<input name="supplier" value="${esc(d0.party)}" /></label><label>Category<select name="category">${Object.entries(COST_CAT).map(([k, l]) => `<option value="${k}"${d0.category === k ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="row2"><label>Invoice number<input name="invoice_no" value="${esc(d0.invoice_no)}" /></label><label>VAT in the total <span class="muted" style="font-weight:400">(R, if shown)</span><input name="vat" inputmode="decimal" value="${d0.vat ?? ""}" /></label></div>
    </div>
    <div class="row2"><label>Amount <span class="muted" style="font-weight:400">(R${d0.currency !== "ZAR" ? `; the document says ${esc(d0.currency)}` : ""})</span><input name="amount" inputmode="decimal" required value="${d0.amount ?? ""}" /></label><label>Date<input type="date" name="date" value="${esc(d0.date || today)}" /></label></div>
    <label>Note<input name="note" value="${esc([d0.reference && "Ref " + d0.reference, d0.description].filter(Boolean).join(" · "))}" /></label>
    ${!d0.amount ? '<p class="adm-missing">The AI couldn\'t find the amount: type it in.</p>' : ""}
    <p class="adm-error tiny" id="readErr" hidden></p>
    <div class="btn-row"><button type="button" class="btn btn--ghost btn--small" id="readBest"${r.engine === "claude" ? " hidden" : ""}>Read it with the cloud AI instead (small cost)</button><button type="submit" class="btn btn--primary btn--small" id="readSave">Save</button></div>
  </form></div>`;
  const f = $("readRes");
  const setType = (t) => { f.dataset.t = t; f.querySelectorAll("[data-t]").forEach((b) => { b.classList.toggle("is-active", b.dataset.t === t); b.setAttribute("aria-pressed", String(b.dataset.t === t)); }); f.querySelectorAll("[data-for]").forEach((x) => { x.hidden = x.dataset.for !== t; }); $("readSave").textContent = t === "pay" ? "Record the payment" : t === "cost" ? "Save to Costs" : "Pick one above first"; $("readSave").disabled = !t; };
  f.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => setType(b.dataset.t))); setType(type0);
  wireLeadPicker(f);
  // the deposit or the balance follows the lead you pick, until you choose yourself
  let kindTouched = Boolean(bp);
  f.kind.addEventListener("change", () => { kindTouched = true; });
  f.project.addEventListener("change", () => { const p = byId(f.project.value); if (p && !kindTouched) f.kind.value = p.deposit_paid ? "balance" : "deposit"; });
  $("readBest").addEventListener("click", (e) => busy(e.target, async () => { try { const r2 = await api.aiHub("read", { text, best: true }); showRead(r2, file, text); } catch (ex) { toast(ex.message, true); } }, "Reading…"));
  f.addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("readErr"); err.hidden = true;
    const cents = Math.round(Number(String(f.amount.value).replace(/[^\d.]/g, "")) * 100), date = f.date.value || today;
    if (!cents) { err.hidden = false; err.textContent = "Enter the amount."; return; }
    await busy($("readSave"), async () => {
      try {
        if (!f.dataset.t) throw new Error("Pick what it is: a client paid us, or a bill we pay.");
        if (f.dataset.t === "pay") {
          const p = byId(f.project.value); if (!p) throw new Error("Choose the lead it's for.");
          if (!f.kind.value) throw new Error("Choose what the payment was for.");
          await recordPayment(p, { cents, kind: f.kind.value, provider: f.provider.value, date, note: f.note.value.trim() });
          if (file) { try { const path = await api.docs.upload(file); await api.events.insert(p.id, "note", "Proof of payment saved", { doc: path }); } catch (ex) { console.warn("proof upload", ex); } }
          toast(`Payment recorded for ${p.business || p.name || p.ref}`);
        } else {
          if (!f.supplier.value.trim()) throw new Error("Add the supplier.");
          const vat = Math.round(Number(String(f.vat.value).replace(/[^\d.]/g, "")) * 100) || null;
          const file_path = file ? await api.docs.upload(file) : null;
          await api.expenses.insert({ spent_on: date, supplier: f.supplier.value.trim(), amount_cents: cents, vat_cents: vat, category: f.category.value, invoice_no: f.invoice_no.value.trim() || null, note: f.note.value.trim() || null, file_path, read_by: r.engine });
          toast("Saved to Costs");
        }
        $("readDlg").close(); await loadAll(true); route();
      } catch (ex) { err.hidden = false; err.textContent = /expenses|documents|bucket/i.test(ex.message) ? "Run database update 0032 first (ADMIN.md 8ct)." : ex.message; }
    }, "Saving…");
  });
}
// ---------- Call recordings (0033): transcribed and summarised on the office PC ----------
const fmtSecs = (n) => n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "";
async function fillCalls(p) {
  const box = $("callsBox"); if (!box || !api.calls) return;
  let rows; try { rows = await api.calls.list(p.id); } catch (e) { box.innerHTML = /calls/i.test(e.message) ? "" : `<p class="small adm-error">${esc(e.message)}</p>`; return; }
  const busyRow = rows.some((c) => c.status === "queued" || c.status === "working");
  box.innerHTML = `<details class="adm-card adm-more-details" style="margin-top:1rem"${rows.length ? " open" : ""}><summary><h2>Calls</h2><span class="muted small">${rows.length ? `${rows.length} recorded` : "none yet"}</span></summary><div class="adm-fold">
    ${rows.map((c) => { const sm = c.summary || {}; return `<div class="adm-call" data-call="${esc(c.id)}">
      <div class="adm-call__top"><b>${esc(c.title || "Call")}</b><span class="tiny muted">${esc(fmtDT(c.created_at))}${c.seconds ? " · " + fmtSecs(c.seconds) : ""}</span>
        <span class="chip ${c.status === "done" ? "chip--ok" : c.status === "failed" ? "chip--mon" : "chip--warn"}">${{ queued: "Waiting for the office PC", working: "Transcribing on the office PC…", done: "Notes ready", failed: "Couldn't transcribe" }[c.status]}</span></div>
      ${c.status === "done" ? `<p style="margin:.4rem 0">${esc(sm.summary || "")}</p>
        ${sm.actions?.length ? `<p class="small"><b>To do:</b></p><ul class="small">${sm.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        ${sm.decisions?.length ? `<p class="small"><b>Agreed:</b> ${esc(sm.decisions.join("; "))}</p>` : ""}
        ${sm.prices?.length ? `<p class="small"><b>Money mentioned:</b> ${esc(sm.prices.join("; "))}</p>` : ""}
        ${sm.next_step ? `<p class="small"><b>Next:</b> ${esc(sm.next_step)}${sm.follow_up && !sm.next_step.toLowerCase().includes(String(sm.follow_up).toLowerCase()) ? ` <span class="muted">(${esc(sm.follow_up)})</span>` : ""}</p>` : ""}
        <div class="adm-inline-actions">${sm.next_step ? `<button type="button" class="btn btn--primary btn--small" data-call-next="${esc(c.id)}">${p.next_action === sm.next_step ? "It's the next step ✓" : "Make this the next step"}</button>` : ""}${p.email ? `<button type="button" class="btn btn--${sm.next_step ? "ghost" : "primary"} btn--small" data-call-draft="${esc(c.id)}">Draft a follow-up email</button>` : ""}<button type="button" class="btn btn--ghost btn--small" data-call-audio="${esc(c.audio_path)}">Play the recording</button></div>
        <details class="small" style="margin-top:.5rem"><summary>Transcript</summary><p class="adm-transcript">${esc(c.transcript || "")}</p></details>` : ""}
      ${c.status === "failed" ? `<p class="small adm-error">${esc(c.error || "")}</p><button type="button" class="btn btn--ghost btn--small" data-call-retry="${esc(c.id)}">Try again</button>` : ""}
      ${c.status === "queued" ? '<p class="tiny muted">The office PC picks it up within a minute when it\'s on. A 10-minute call takes a few minutes to transcribe.</p>' : ""}
      <button type="button" class="inline-link tiny" data-call-del="${esc(c.id)}">Delete</button></div>`; }).join("")}
    <div class="adm-inline-actions" style="margin-top:.6rem"><button type="button" class="btn btn--ghost btn--small" data-call-add>Add a call recording</button></div></div></details>`;
  box.querySelector("[data-call-add]").addEventListener("click", () => openCallUpload(p));
  // what was agreed on the call becomes the lead's next step, with a reminder on the agreed day
  box.querySelectorAll("[data-call-next]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const sm = rows.find((x) => x.id === b.dataset.callNext)?.summary || {};
    const at = dateFromWords(sm.follow_up) || dateFromWords(sm.next_step) || workdaysFrom(1);
    try {
      const np = await api.projects.update(p.id, { next_action: String(sm.next_step).slice(0, 200), next_action_at: at.toISOString(), details: { ...(byId(p.id)?.details || p.details || {}), calledAt: (byId(p.id) || p).details?.calledAt || new Date().toISOString() } });
      const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np;
      toast(`Next step set: ${sm.next_step} (reminder ${fmtD(at.toISOString())})`); route();
    } catch (ex) { toast(ex.message, true); }
  }, "Saving…")));
  box.querySelectorAll("[data-call-draft]").forEach((b) => b.addEventListener("click", () => { const c = rows.find((x) => x.id === b.dataset.callDraft), sm = c?.summary || {}; draftReply(p, "email", `Follow-up after our phone call. What we discussed: ${sm.summary || ""} Agreed: ${(sm.decisions || []).join("; ")}. Our next step: ${sm.next_step || ""}.`); }));
  box.querySelectorAll("[data-call-audio]").forEach((b) => b.addEventListener("click", async () => { try { const u = await api.calls.audioUrl(b.dataset.callAudio); if (!u) return toast("No recording in demo mode"); const w = window.open(u, "_blank"); if (w) w.opener = null; } catch (ex) { toast(ex.message, true); } }));
  box.querySelectorAll("[data-call-retry]").forEach((b) => b.addEventListener("click", async () => { await api.calls.retry(b.dataset.callRetry); fillCalls(p); }));
  box.querySelectorAll("[data-call-del]").forEach((b) => b.addEventListener("click", async () => { const c = rows.find((x) => x.id === b.dataset.callDel); if (!c || !confirm("Delete this call, its recording and transcript?")) return; await api.calls.remove(c.id); await api.calls.removeAudio(c.audio_path).catch(() => {}); fillCalls(p); }));
  clearTimeout(fillCalls._t); if (busyRow) fillCalls._t = setTimeout(() => { if ($("callsBox")) fillCalls(byId(p.id) || p); }, 15000);
}
function openCallUpload(p0) {
  let d = $("callDlg");
  if (!d) { document.body.insertAdjacentHTML("beforeend", '<dialog class="adm-dialog" id="callDlg" aria-labelledby="callH"></dialog>'); d = $("callDlg"); }
  let rec = null, chunks = [], recorded = null, started = 0, tick = null;
  d.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><h2 id="callH">Add a call recording</h2><button type="button" class="adm-dialog__x" data-close aria-label="Close">×</button></div>
    <p class="small muted">Your office PC transcribes it and writes the call notes: what they want, what was agreed, your to-dos and the next step. The recording stays private and never goes to an outside AI.</p>
    <form class="adm-form" id="callForm">
      ${p0 ? `<p class="small"><b>${esc(p0.ref)}</b> · ${esc(p0.business || p0.name || "")}</p>` : (() => { const calls = S.projects.filter((p) => isActive(p) && isCall(p) && !p.details?.calledAt).map((p) => ({ p, d: callDate(p) })).filter((x) => x.d && Math.abs(x.d - Date.now()) < 2 * 86400e3).sort((a, b) => Math.abs(a.d - Date.now()) - Math.abs(b.d - Date.now())).map((x) => x.p); return `<label>Which lead${calls.length ? ' <span class="muted" style="font-weight:400">(★ calls booked around now first)</span>' : ""}${leadPicker("project", { guesses: calls, selected: calls.length === 1 ? calls[0].id : "", why: Object.fromEntries(calls.map((p) => [p.id, "call " + (p.details?.callTime || "booked").split(" (")[0].toLowerCase()])) })}</label>`; })()}
      <label>What was the call <span class="muted" style="font-weight:400">(optional)</span><input name="title" placeholder="e.g. Discovery call" /></label>
      <label>The recording<input type="file" name="file" accept="audio/*,video/mp4,.m4a,.amr,.opus,.ogg,.wav,.mp3" /></label>
      <div class="adm-inline-actions"><span class="small muted">or</span><button type="button" class="btn btn--ghost btn--small" id="recBtn">● Record now</button><span class="small" id="recState" aria-live="polite"></span></div>
      <p class="tiny muted">Record now uses this device's microphone: put the call on speaker, or use it for a meeting.</p>
      <label class="check"><input type="checkbox" name="consent" required /><span>The other person knows this call is being recorded (POPIA)</span></label>
      <p class="adm-error tiny" id="callErr" hidden></p>
      <div class="btn-row"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><button type="submit" class="btn btn--primary btn--small">Send to the office PC</button></div>
    </form></div>`;
  const stopRec = () => { if (rec && rec.state !== "inactive") rec.stop(); clearInterval(tick); };
  d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { stopRec(); d.close(); }));
  $("recBtn").addEventListener("click", async () => {
    if (rec && rec.state === "recording") { stopRec(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); recorded = new Blob(chunks, { type: rec.mimeType || "audio/webm" }); $("recBtn").textContent = "● Record again"; $("recState").textContent = `Recorded ${fmtSecs(Math.round((Date.now() - started) / 1000))}`; };
      rec.start(1000); started = Date.now(); recorded = null; $("recBtn").textContent = "■ Stop";
      tick = setInterval(() => { $("recState").textContent = `Recording ${fmtSecs(Math.round((Date.now() - started) / 1000))}`; }, 500);
    } catch (ex) { $("recState").textContent = "The microphone isn't available here."; }
  });
  $("callForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("callErr"); err.hidden = true;
    const p = p0 || byId(f.project?.value), file = f.file.files[0], blob = file || recorded;
    if (!p) { err.hidden = false; err.textContent = "Choose the lead."; return; }
    if (!blob) { err.hidden = false; err.textContent = rec && rec.state === "recording" ? "Press Stop first." : "Choose the recording, or record one."; return; }
    if (blob.size > 50 * 1024 * 1024) { err.hidden = false; err.textContent = "That recording is over 50 MB. Share a shorter or compressed version (m4a or mp3)."; return; }
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        const audio_path = await api.calls.upload(blob, file ? file.name : "recording." + ((blob.type.split("/")[1] || "webm").split(";")[0]));
        await api.calls.create({ project_id: p.id, title: f.title.value.trim() || null, audio_path });
        // a call they booked on the site has now happened: the lead stops saying "Call them today"
        if (isCall(p) && !p.details?.calledAt) { try { const np = await api.projects.update(p.id, { details: { ...(p.details || {}), calledAt: new Date().toISOString() } }); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np; } catch (ex) { console.warn("calledAt", ex); } }
        toast("Sent to the office PC. The notes appear on the lead when they're ready."); d.close();
        if (location.hash === "#/p/" + p.id) route(); else location.hash = "#/p/" + p.id;
      } catch (ex) { err.hidden = false; err.textContent = /calls|bucket/i.test(ex.message) ? "Run database update 0033 first (ADMIN.md 8cu)." : ex.message; }
    }, "Uploading…");
  });
  wireLeadPicker(d);
  d.showModal();
}
// ---------- command centre ----------
// The Today page is the one place to run the business from: quick actions, the key numbers,
// the to-do list, and a side column with the pipeline, money, and clients & websites.
// On a computer, leads, clients and actions open in a side panel (the same pages, embedded),
// so nothing takes you away; closing the panel refreshes the numbers.
// Inbox Assistant trials: every account that is set up, with this week's measured hours
// (loaded with everything else in loadAll; a trial with a recorded result, kept or refunded, has left the list)
async function ccTrials() {
  return [...S.trials.values()].filter(({ a }) => !byId(a.project_id)?.details?.trialResult);
}
// Income per week for the last 12 weeks (Monday to Sunday), from succeeded payments
function weeklyIncome(ok) {
  const monday = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const thisWk = monday(Date.now());
  const weeks = [...Array(12)].map((_, i) => ({ start: thisWk - (11 - i) * 7 * 864e5, total: 0 }));
  for (const x of ok) { const w = monday(Date.parse(paidAt(x))); const k = weeks.find((y) => y.start === w); if (k) k.total += x.amount_cents || 0; }
  return weeks;
}
function commandCentre(trials = []) {
  const now = Date.now(), som = startOfMonth().getTime(), d30 = now - 30 * 86400e3;
  const ok = S.payments.filter((x) => x.status === "succeeded");
  const sum = (arr, f = (x) => x.amount_cents || 0) => arr.reduce((a, x) => a + f(x), 0);
  const thisMonth = sum(ok.filter((x) => Date.parse(paidAt(x)) >= som));
  const last30 = sum(ok.filter((x) => Date.parse(paidAt(x)) >= d30));
  const recurring = S.clients.filter((c) => c.care_active && careMonth(c) > 0);
  const mrr = recurring.reduce((a, c) => a + careMonth(c), 0);
  const openReqs = S.requests.filter((r) => r.status === "open");
  const active = S.projects.filter((p) => isActive(p) && p.status !== "declined");
  const col = (k) => active.filter((p) => boardCol(p) === k);
  const quoted = col("quoted"), talking = col("leads"), toContact = col("outreach"), won = col("won");
  const quotedValue = sum(quoted, (p) => p.quote_cents || 0);
  const down = S.monitors.filter((m) => m.status === "down"), watched = S.monitors.length;
  const hot = [...quoted, ...talking].sort((a, b) => potRank(b) - potRank(a) || (b.quote_cents || 0) - (a.quote_cents || 0)).slice(0, 4);
  const lastPays = ok.slice().sort((a, b) => paidAt(b).localeCompare(paidAt(a))).slice(0, 4);
  const who = (x) => byId(x.project_id)?.business || clientById(x.client_id)?.name || x.email || x.reference || "Unmatched";
  const tile = (label, value, sub, href) => `<a class="cc-kpi" href="${href}"><span>${esc(label)}</span><b>${value}</b><small>${esc(sub)}</small></a>`;
  const act = (label, attrs, icon) => `<button type="button" class="cc-act" ${attrs}><span aria-hidden="true">${icon}</span>${esc(label)}</button>`;
  return {
    actions: `<div class="cc-actions" role="toolbar" aria-label="Quick actions">
      ${act("Sort a message", 'data-sort', "✦")}
      ${act("Read an invoice or payment", 'data-read', "≡")}
      ${act("Add a call recording", 'data-call', "◉")}
      ${act("Add a lead", 'data-panel="#/add"', "+")}
      ${act("I received a payment", 'data-panel="#/money?pay=1"', '<svg class="cc-act__svg" viewBox="0 0 24 24"><rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M6.5 9.5v5M17.5 9.5v5"/></svg>')}
      ${act("Find people to contact", 'data-go="#/outreach"', "↗")}
      ${act("Leads board", 'data-go="#/pipeline?view=board"', "▦")}
      ${S.features.social ? act("New post", 'data-panel="#/marketing/post/new"', "✎") : ""}
      ${watched ? act("Check websites now", 'data-checksites', "✓") : ""}
      ${act("Search", 'data-search', "⌕")}
    </div>`,
    kpis: `<div class="cc-kpis">
      ${tile("This month", money(thisMonth), `${money(last30)} in the last 30 days`, "#/money")}
      ${tile("Recurring", rands(mrr) + "<i>/mo</i>", `${recurring.length} client${recurring.length === 1 ? "" : "s"} on a plan`, "#/money")}
      ${tile("Quotes out", money(quotedValue), `${quoted.length} waiting for a yes`, "#/pipeline?view=board")}
      ${tile("Talking", String(talking.length), `${toContact.length} more to contact`, "#/pipeline?view=board")}
      ${tile("Unpaid links", money(sum(openReqs)), `${openReqs.length} card link${openReqs.length === 1 ? "" : "s"} open`, "#/money")}
      ${watched ? tile("Websites", down.length ? `${down.length} down` : "All up", `${watched} watched`, "#/clients") : tile("Clients", String(realClients().length), "", "#/clients")}
    </div>`,
    side: `<aside class="cc-side" aria-label="Overview">
      ${(() => { const wk = weeklyIncome(ok), mx = Math.max(1, ...wk.map((w) => w.total)), tot = wk.reduce((a, w) => a + w.total, 0), avg = tot / 12;
        const lbl = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
        return `<section class="cc-panel"><h2><a href="#/money">Income by week</a></h2>
        <p class="cc-chart__sum"><b>${money(wk[11].total)}</b> this week <span>· ${money(Math.round(avg / 100) * 100)} a week on average</span></p>
        <div class="cc-chart" role="img" aria-label="Income for each of the last 12 weeks: ${wk.map((w) => lbl(w.start) + " " + money(w.total)).join(", ")}">
          ${wk.map((w, i) => `<span class="cc-bar${i === 11 ? " is-now" : ""}" style="--h:${w.total ? Math.max(4, Math.round(w.total / mx * 100)) : 0}%" title="Week of ${esc(lbl(w.start))}: ${esc(money(w.total))}"></span>`).join("")}
        </div>
        <div class="cc-chart__axis"><span>${esc(lbl(wk[0].start))}</span><span>12 weeks</span><span>This week</span></div></section>`; })()}
      <section class="cc-panel"><h2><a href="#/pipeline?view=board">Pipeline</a></h2>
        <ol class="cc-funnel">${[["To contact", toContact], ["Talking", talking], ["Quoted", quoted], ["Won", won]].map(([l, a]) => `<li><span>${l}</span><b>${a.length}</b></li>`).join("")}</ol>
        ${hot.length ? `<h3>Closest to a yes</h3><ul class="cc-mini">${hot.map((p) => `<li><a href="#/p/${esc(p.id)}"><b>${esc(p.business || p.name || p.ref)}</b><small>${esc(STAGE[p.status]?.label || "")}${p.quote_cents ? " · " + money(p.quote_cents) : ""}</small></a></li>`).join("")}</ul>` : ""}
      </section>
      ${trials.length ? `<section class="cc-panel"><h2>Inbox Assistant trials</h2><ul class="cc-trials">${trials.map(({ a, st }) => {
        const p = byId(a.project_id), name = p?.business || a.business || "Trial", h = st.day >= 8 ? st.measured : st.hours, pct = Math.min(100, Math.round(h / (st.target || 5) * 100));
        const verdict = a.status === "pending" ? "Being set up" : a.status === "paused" ? "Paused" : st.day >= 14 ? (st.measured >= st.target ? '<b class="cc-ok">Hit the target: send the quote</b>' : '<b class="cc-bad">Missed: refund the R1,500</b>') : `Day ${Math.max(st.day, 1)} of 14`;
        return `<li><a href="${p ? "#/p/" + esc(p.id) : "#/pipeline"}"><span class="cc-trials__top"><b>${esc(name)}</b><small>${verdict}</small></span>
          <span class="cc-meter" aria-hidden="true"><i style="width:${pct}%"></i></span>
          <small>${h} of ${st.target} hours ${st.day >= 8 ? "in the measured week" : "in the last 7 days"} · ${st.drafted} replies (${st.asIs} as is, ${st.edited} edited${st.waiting ? `, ${st.waiting} not marked` : ""})</small></a></li>`; }).join("")}</ul></section>` : ""}
      <section class="cc-panel"><h2><a href="#/money">Money</a></h2>
        ${lastPays.length ? `<ul class="cc-mini">${lastPays.map((x) => `<li><a href="${x.project_id ? "#/p/" + esc(x.project_id) : x.client_id ? "#/c/" + esc(x.client_id) : "#/money"}"><b>${money(x.amount_cents)}</b><small>${esc(who(x))} · ${esc(rel(paidAt(x)))}</small></a></li>`).join("")}</ul>` : '<p class="small muted">No payments yet.</p>'}
      </section>
      <section class="cc-panel"><h2><a href="#/clients">Clients &amp; websites</a></h2>
        ${down.length ? `<p class="small adm-error">${down.length} website${down.length === 1 ? "" : "s"} down</p>` : ""}
        ${realClients().length ? `<ul class="cc-mini">${realClients().sort((a, b) => careMonth(b) - careMonth(a)).slice(0, 5).map((c) => `<li><a href="#/c/${esc(c.id)}"><b>${esc(c.name)}</b><small>${c.care_active ? esc(PLAN_LABEL[c.care_plan] || "Care") + (c.care_amount_cents ? " · " + esc(carePer(c)) + (isMonthly(c) ? "" : ` (≈ ${esc(rands(careMonth(c)))}/mo)`) : "") : "No plan"}</small></a></li>`).join("")}</ul>` : '<p class="small muted">No clients yet.</p>'}
      </section>
    </aside>`,
  };
}
const ccWide = () => matchMedia("(min-width: 1100px)").matches;
function openPanel(hash) {
  let d = $("ccPanel");
  if (!d) {
    document.body.insertAdjacentHTML("beforeend", `<dialog id="ccPanel" class="cc-drawer" aria-label="Details"><div class="cc-drawer__bar"><a id="ccPanelFull" class="btn btn--ghost btn--small" href="#">Open full page</a><button type="button" class="btn btn--primary btn--small" id="ccPanelClose">Done</button></div><iframe id="ccPanelFrame" title="Details"></iframe></dialog>`);
    d = $("ccPanel");
    // Not modal: the list behind stays usable, so clicking the next row swaps the lead in the panel.
    // Done refreshes the numbers and puts you back where you were on the page.
    const close = async () => { if (!d.open) return; const y = window.scrollY; d.close(); $("ccPanelFrame").src = "about:blank"; await loadAll(true); await route(); window.scrollTo(0, y); };
    $("ccPanelClose").addEventListener("click", close);
    window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data === "cc-close" && d.open) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && d.open && !document.querySelector("dialog.adm-dialog[open]")) close(); });
    // going to another page (a tile, the menu) takes the panel away with it
    window.addEventListener("hashchange", () => { if (d.open) { d.close(); $("ccPanelFrame").src = "about:blank"; } });
    $("ccPanelFull").addEventListener("click", (e) => { e.preventDefault(); const h = $("ccPanelFull").dataset.hash; d.close(); $("ccPanelFrame").src = "about:blank"; location.hash = h; });
  }
  $("ccPanelFull").dataset.hash = hash;
  $("ccPanelFrame").src = `${location.pathname}?embed=1${MOCK ? "&mock=1" : ""}${hash}`;
  if (!d.open) d.show();
  $("ccPanelFrame").focus();
}
function wireCommandCentre() {
  view.querySelectorAll("[data-routine]").forEach((c) => c.addEventListener("change", () => {
    let done = {}; try { done = JSON.parse(localStorage.getItem(dayKey()) || "{}"); } catch {}
    done[c.dataset.routine] = c.checked; try { localStorage.setItem(dayKey(), JSON.stringify(done)); } catch {}
    const n = ROUTINE.filter(([k]) => done[k]).length; const cnt = view.querySelector(".cc-routine .count"); if (cnt) cnt.textContent = `${n} of ${ROUTINE.length}`;
    if (n === ROUTINE.length) toast("Every-day list done. Good day's work.");
  }));
  $("ccWelcomeOk")?.addEventListener("click", () => { try { localStorage.setItem("adm.welcome.v1", "1"); } catch {} ccWelcome.force = false; $("ccWelcome")?.remove(); });
  $("ccHowTo")?.addEventListener("click", () => { ccWelcome.force = true; route(); });
  $("ccWelcomeMore")?.addEventListener("click", () => { ccWelcome.force = true; route(); });
  view.querySelectorAll("[data-panel]").forEach((b) => b.addEventListener("click", () => ccWide() ? openPanel(b.dataset.panel) : (location.hash = b.dataset.panel)));
  view.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.go; }));
  view.querySelector("[data-sort]")?.addEventListener("click", () => openSort());
  view.querySelector("[data-read]")?.addEventListener("click", () => openReader());
  view.querySelector("[data-call]")?.addEventListener("click", () => openCallUpload(null));
  view.querySelector("[data-checksites]")?.addEventListener("click", (e) => checkSitesNow(e.currentTarget));
  view.querySelector("[data-search]")?.addEventListener("click", () => { const i = document.querySelector(".adm-search input"); if (i) i.focus(); });
  // leads and clients open in the side panel on a computer (Today only; added once, view outlives the page)
  if (!view._ccClick) {
    view._ccClick = true;
    view.addEventListener("click", (e) => {
      if (!ccWide() || e.metaKey || e.ctrlKey || e.shiftKey || !view.querySelector(".cc-grid")) return;
      const a = e.target.closest('a[href^="#/p/"], a[href^="#/c/"]'); if (!a || !view.contains(a)) return;
      e.preventDefault(); openPanel(a.getAttribute("href"));
    });
  }
}
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function openMatch(payId) {
  const x = S.payments.find((y) => y.id === payId); if (!x) return;
  const dlg = $("composeDialog");
  // Guesses carry their reason; only a matching email or RC reference is picked for you
  const pool = S.projects.filter((p) => !p.spam && !["prospect", "contacted"].includes(p.status));
  const whyOf = (p) => { const w = []; if (x.email && p.email && p.email.toLowerCase() === x.email.toLowerCase()) w.push("same email"); if (x.reference && p.ref && String(x.reference).toUpperCase().includes(p.ref)) w.push("their reference"); return w; };
  const exact = pool.filter((p) => whyOf(p).length);
  const amountFits = (p) => p.quote_cents && [depositOf(p), balanceDue(p), p.quote_cents].includes(x.amount_cents);
  const waiting = pool.filter((p) => !exact.includes(p) && isActive(p) && (stageOf(p.status) === "quote_sent" || amountFits(p))).sort((a, b) => amountFits(b) - amountFits(a) || b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const why = Object.fromEntries([...exact.map((p) => [p.id, "why: " + whyOf(p).join(", ")]), ...waiting.map((p) => [p.id, amountFits(p) ? `why: ${money(x.amount_cents)} fits their quote` : "why: quote waiting"])]);
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">Which lead is this payment for?</h2><p>${money(x.amount_cents)} from ${esc(x.email || x.reference || "an unknown payer")}, ${esc(fmtDT(x.created_at))}${x.reference ? ` · reference “${esc(x.reference)}”` : ""}</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="matchForm">
      <label>Lead${leadPicker("pid", { guesses: [...exact, ...waiting], others: pool, selected: exact.length === 1 ? exact[0].id : "", why })}</label>
      <label>It was for<select name="kind">${Object.entries(KIND_LABEL).map(([v, l]) => `<option value="${v}"${v === x.kind ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <p class="tiny muted">${exact.length === 1 ? "Picked because it has the same email or reference. Check it, then save." : "★ are possible matches, each with the reason. Nothing is picked unless the email or the reference matches, so choose the right one."}</p>
      <div class="btn-row"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  wireLeadPicker(dlg);
  $("matchForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target; const p = byId(f.pid.value); if (!p) { toast("Choose the lead it's for", true); f.pid.focus(); return; }
    await busy(f.querySelector("[type=submit]"), async () => { try {
      if (f.kind.value !== x.kind && api.payments.setKind) await api.payments.setKind(x.id, f.kind.value);
      const pay = await api.payments.match(x.id, p.id, p.client_id || null);
      await api.events.insert(p.id, "payment", `${money(pay.amount_cents)} ${KIND_LABEL[f.kind.value].toLowerCase()} matched to this lead`, { paymentId: x.id });
      if (f.kind.value === "deposit" && !p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true });
      dlg.close(); toast(`Saved against ${p.business || p.ref}`); await loadAll(true); route();
    } catch (ex) { toast(ex.message, true); } }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
// The Re-Charge Standard: what every site passes before it goes live. Same
// list, every client, every time. That consistency is the product.
const STANDARD = [
  ["phone", "Works on a phone", "Every page checked on a real phone, nothing cut off or too small to tap."],
  ["fast", "Loads fast", "Mobile PageSpeed score of 80 or more.", (site) => site ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent("https://" + site)}&form_factor=mobile` : ""],
  ["contact", "Call and WhatsApp buttons work", "Tapped both: they open the right number."],
  ["facts", "Details checked with the client", "Name, phone, address, hours and prices are right."],
  ["google", "Ready for Google", "Page title and description name the business and area; their Google Business Profile links to the site."],
  ["secure", "Secure on their domain", "Opens on https:// with the padlock, with and without www."],
  ["watch", "Monitored and backed up", "Website monitoring is on for this client, and the site files are safe in GitHub."],
  ["approved", "Client approved it", "They said they're happy, in writing (WhatsApp or email)."],
];
// Build (or edit) a prospect's demo assistant: write what it may know, save, send the link.
async function openDemoBuilder(p, done) {
  const dlg = $("composeDialog");
  let row = null;
  try { row = await api.demos.forProject(p.id); } catch (e) { /* table not there yet */ }
  const slug = row?.slug || p.details?.demoSlug || demoSlugFor(p);
  // Once they're paying, the same row becomes their live assistant: it stops being a
  // demo built from guesswork and starts being the thing the monthly report counts.
  const canGoLive = Boolean(p.client_id);
  const isLive = row?.kind === "live";
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">${row ? "Edit" : "Build"} their ${isLive ? "assistant" : "demo assistant"}</h2><p>${esc(p.business || p.name || p.ref)} — ${isLive ? "this is their live assistant. What it knows here is what their customers are told, so keep prices and hours current." : "a working assistant they can try before they buy anything. Only put in what's public: their website, Google listing, Facebook page."}</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="demoForm">
      <label>Business name <span class="muted" style="font-weight:400">(the assistant answers as them)</span><input name="business" required value="${esc(row?.business || p.business || p.name || "")}" /></label>
      <label>What it may know <span class="muted" style="font-weight:400">(services, prices, hours, where, common questions)</span><textarea name="knowledge" rows="14" required>${esc(row?.knowledge || demoKnowledgeFor(p))}</textarea></label>
      <p class="tiny muted">Replace anything in [square brackets] before you save. It's told never to invent a price, and to send people to the business for anything it isn't sure about.</p>
      ${canGoLive ? `<label class="check"><input type="checkbox" name="live"${isLive ? " checked" : ""} /> <span>This is their live assistant — they're paying for it<br><span class="tiny muted">Counts towards their monthly report, and what it says is now official.</span></span></label>` : ""}
      ${row ? `<p class="small">Link: <code class="adm-reflink">${esc(demoUrl(slug).replace("https://", ""))}</code> · ${esc(row.views || 0)} view${(row.views || 0) === 1 ? "" : "s"}</p>` : ""}
      <p class="adm-error tiny" id="demoErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><span class="adm-inline-actions" style="margin:0">${row ? `<button type="button" class="btn btn--ghost btn--small" id="demoOpen">See it</button>` : ""}<button class="btn btn--primary btn--small" type="submit">${row ? "Save" : "Build it"}</button></span></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  $("demoOpen")?.addEventListener("click", () => window.open(demoUrl(slug), "_blank", "noopener"));
  $("demoForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("demoErr");
    const business = f.business.value.trim(), knowledge = f.knowledge.value.trim();
    if (!business || !knowledge) return;
    if (/\[[^\]]+\]/.test(knowledge) && !confirm("There are still [square brackets] in what it may know. Save anyway?")) return;
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        const goLive = canGoLive && f.live?.checked;
        await api.demos.upsert({ id: row?.id, slug, business, knowledge, project_id: p.id, kind: goLive ? "live" : "demo", client_id: goLive ? p.client_id : null });
        if (p.details?.demoSlug !== slug) await api.projects.update(p.id, { details: { ...(p.details || {}), demoSlug: slug } });
        await api.events.insert(p.id, "note", goLive && !isLive ? `Their assistant is live: ${demoUrl(slug)}` : row ? `Updated their ${goLive ? "assistant" : "demo assistant"}` : `Built them a demo assistant: ${demoUrl(slug)}`, { demo: slug, live: goLive });
        dlg.close(); toast(goLive && !isLive ? "Live — it now counts towards their report" : row ? "Saved" : "Demo built — send them the link"); await loadAll(true); done?.();
      } catch (ex) { err.hidden = false; err.textContent = /assistant_demos/.test(ex.message) ? "Run the database update first (supabase db push: migrations 0024 and 0025)" : ex.message; }
    }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
// ---------- Live demos (0029): a public page per prospect showing the AI at work on their own mix ----------
// You enter roughly what comes in; the AI writes ten realistic examples and decides what happens to each.
// They open the link, press Run AI and see it sort, forward, draft and flag, with the time it saves.
const liveDemoUrl = (slug) => `https://re-charge.co.za/live-demo?d=${slug}`;
const LD_KINDS = {
  email: { label: "Email automation", what: "emails", types: "Quote requests for aircon installs, service bookings, supplier invoices, a complaint now and then, newsletters", routing: "Accounts: Lerato (invoices, statements)\nBookings: Sipho\nComplaints: the owner\nFolders: Invoices, Suppliers, Newsletters" },
  invoices: { label: "Invoice capture", what: "invoices and statements", types: "Supplier invoices (PDF), monthly statements, credit notes, the odd duplicate", routing: "Accounts: Lerato\nApprovals over R20,000: the owner\nFolders: Paid, Queries, Statements" },
  enquiries: { label: "Website enquiries", what: "enquiries", types: "Price questions, booking requests, bigger jobs worth a call, price-shoppers", routing: "Bookings: front desk\nBig jobs: the owner\nComplaints: the manager" },
  reviews: { label: "Google reviews", what: "reviews", types: "Mostly 4–5 star reviews, a few complaints about wait times, the odd 1-star", routing: "Complaints: the manager\nWeekly themes: the owner" },
  calls: { label: "Phone calls (missed and after hours)", what: "calls", types: "Bookings, after-hours emergencies, price questions, calls for a specific person, the odd unhappy customer", routing: "On-call (after hours): Sizwe\nQuotes and big jobs: the owner\nBookings: the diary (weekdays 8-17)" },
  meetings: { label: "Meeting notes and to-dos", what: "meetings", types: "Weekly team meeting: delays, staffing, customers, who does what by when", routing: "People in the meeting and their roles, e.g. Thandi (ops manager), Pieter (fleet), Ayesha (customer service)\nOutside people they email afterwards, e.g. a key customer" },
  followups: { label: "Following up quotes and leads", what: "open quotes", types: "Quotes sent in the last two months: sizes, stages, what each customer said last", routing: "Sales: Sipho\nBig deals (over R200,000): the owner" },
  feedback: { label: "Customer feedback (what they're saying)", what: "customer comments", types: "Survey answers, Google reviews and WhatsApp messages: praise, complaints, ideas", routing: "Service problems: the manager\nPrices and big decisions: the owner" },
  posts: { label: "Social posts and newsletters", what: "posts", types: "What's happening this month: new products, a customer story, an offer, the team, seasonal dates. Channels: LinkedIn, Instagram, Facebook, email", routing: "Who approves posts: the owner" },
  questions: { label: "Staff questions (from their documents)", what: "questions", types: "Leave, payroll dates, how-to questions about the systems, the odd question that isn't in the documents", routing: "HR: Thandi\nIT: Johan\nAnything else: the office manager" },
};
const LD_FACTS = "Prices, policies, hours, how they like to reply. Anything left out becomes a [gap] in the example replies.";
async function fillLiveDemo(p, openId) {
  const body = $("liveDemoBody"), sum = $("liveDemoSum");
  if (!body) return;
  let rows;
  try { rows = await api.liveDemos.forProject(p.id); } catch (e) { body.innerHTML = setupNote("Live demos aren't switched on yet.", "Run database update 0029 in the Supabase SQL editor."); return; }
  sum.textContent = rows.length ? `${rows.length} page${rows.length === 1 ? "" : "s"}${rows.some((r) => r.views) ? ` · opened ${rows.reduce((n, r) => n + (r.views || 0), 0)}×` : ""}` : "none yet";
  const first = (p.name || "").split(" ")[0] || "there";
  const wa = (d) => p.phone ? `https://wa.me/${String(p.phone).replace(/\D/g, "").replace(/^0/, "27")}?text=${encodeURIComponent(`Hi ${first}, as promised: here's what AI would do with ${p.business ? p.business + "'s" : "your"} ${LD_KINDS[d.kind]?.what || "work"}, set up with your own mix: ${liveDemoUrl(d.slug)}\n\nPress Run AI and watch it work through them. It takes about a minute to look through.`)}` : "";
  const sel = rows.find((r) => r.id === openId) || null;
  const list = rows.map((d) => `<li><div class="adm-row"><div class="adm-row__main"><div class="adm-row__title">${esc(LD_KINDS[d.kind]?.label || d.kind)}${d.data?.items?.length ? "" : ` <span class="chip chip--warn">not built</span>`}</div><div class="adm-row__sub">${d.views ? `opened ${esc(d.views)}×${d.last_viewed_at ? `, last ${esc(String(d.last_viewed_at).slice(0, 10))}` : ""}` : "not opened yet"}${d.data?.built_at ? ` · built ${esc(String(d.data.built_at).slice(0, 10))}` : ""}</div>
      ${d.data?.items?.length ? `<div class="adm-inline-actions" style="margin-top:0.4rem"><input class="adm-reflink" readonly value="${esc(liveDemoUrl(d.slug))}" style="flex:1;min-width:14rem" /><button class="btn btn--ghost btn--small" data-ld-copy="${esc(liveDemoUrl(d.slug))}">Copy</button><a class="btn btn--ghost btn--small" href="${esc(liveDemoUrl(d.slug))}" target="_blank" rel="noopener">Open</a>${wa(d) ? `<a class="btn btn--primary btn--small" target="_blank" rel="noopener" href="${esc(wa(d))}">Send on WhatsApp</a>` : ""}</div>` : ""}
    </div><div class="adm-row__side"><button class="btn btn--ghost btn--small" data-ld-edit="${esc(d.id)}">${sel?.id === d.id ? "Editing" : "Edit"}</button></div></div></li>`).join("");
  const c = sel?.config || {}, kind = sel?.kind || "email", K = LD_KINDS[kind];
  body.innerHTML = `
    <p class="small muted">A public page with ten examples of their own work and a <b>Run AI</b> button: they watch it sort, forward, draft replies and flag what needs a person, with the time it saves at their volume. Give first: send it during or right after the conversation. <a href="https://re-charge.co.za/live-demo?sample=email" target="_blank" rel="noopener">See the sample</a>.</p>
    ${rows.length ? `<ul class="adm-list">${list}</ul>` : ""}
    <form class="adm-form" id="ldForm" style="margin-top:0.9rem">
      <h3 style="font-size:0.95rem;margin:0">${sel ? "Edit this demo" : "New live demo"}</h3>
      <div class="row2"><label>What it shows<select name="kind">${Object.entries(LD_KINDS).map(([k, v]) => `<option value="${k}"${k === kind ? " selected" : ""}>${esc(v.label)}</option>`).join("")}</select></label>
        <label>Business name<input name="business" required value="${esc(sel?.business || p.business || p.name || "")}" /></label></div>
      <div class="row2"><label>How many a day <span class="muted" style="font-weight:400">(roughly)</span><input name="per_day" type="number" min="1" step="1" value="${esc(c.per_day || 40)}" /></label>
        <label>Minutes each by hand<input name="manual_minutes" type="number" min="0.5" step="0.5" value="${esc(c.manual_minutes || 6)}" /></label></div>
      <label>What comes in <span class="muted" style="font-weight:400">(the types, in rough proportion)</span><textarea name="types" rows="3" placeholder="${esc(K.types)}">${esc(c.types || "")}</textarea></label>
      <label>Who handles what <span class="muted" style="font-weight:400">(people and folders it forwards or files to)</span><textarea name="routing" rows="3" placeholder="${esc(K.routing)}">${esc(c.routing || "")}</textarea></label>
      <label>What it may know <span class="muted" style="font-weight:400">(${esc(LD_FACTS)})</span><textarea name="facts" rows="5">${esc(c.facts || "")}</textarea></label>
      <label>Sign-off<textarea name="signoff" rows="2" placeholder="Kind regards&#10;${esc(p.business || "The team")}">${esc(c.signoff || "")}</textarea></label>
      <p class="tiny muted">Don't paste their real customers' details: the page is public to anyone with the link. The AI writes realistic made-up examples from the mix above. Building takes up to a minute.</p>
      <p class="small adm-error" id="ldErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between">${sel ? `<span><button type="button" class="btn btn--ghost btn--small" id="ldNew">New one instead</button> <button type="button" class="btn btn--ghost btn--small" id="ldDel">Delete</button></span>` : "<span></span>"}<button class="btn btn--primary btn--small" type="submit">${sel ? (sel.data?.items?.length ? "Save and rebuild" : "Save and build") : "Build the demo"}</button></div>
    </form>`;
  body.querySelectorAll("[data-ld-copy]").forEach((b) => b.addEventListener("click", () => { navigator.clipboard?.writeText(b.dataset.ldCopy); toast("Link copied"); }));
  body.querySelectorAll("[data-ld-edit]").forEach((b) => b.addEventListener("click", () => fillLiveDemo(p, b.dataset.ldEdit)));
  $("ldNew")?.addEventListener("click", () => fillLiveDemo(p));
  $("ldDel")?.addEventListener("click", async () => { if (!confirm("Delete this demo? The link stops working.")) return; try { await api.liveDemos.remove(sel.id); toast("Deleted"); fillLiveDemo(p); } catch (ex) { toast(ex.message, true); } });
  const f = $("ldForm");
  f.kind.addEventListener("change", () => { const k = LD_KINDS[f.kind.value]; f.types.placeholder = k.types; f.routing.placeholder = k.routing; });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("ldErr"); err.hidden = true;
    const config = { per_day: Math.max(1, Number(f.per_day.value) || 40), manual_minutes: Number(f.manual_minutes.value) || 6, light_minutes: Math.min(2, (Number(f.manual_minutes.value) || 6) / 4), types: f.types.value.trim(), routing: f.routing.value.trim(), facts: f.facts.value.trim(), signoff: f.signoff.value.trim() };
    const business = f.business.value.trim();
    busy(f.querySelector("[type=submit]"), async () => {
      try {
        let d = sel;
        // Changing what it shows keeps the same link; the rebuild below makes the new kind's examples.
        if (d) d = await api.liveDemos.update(d.id, { business, config, kind: f.kind.value });
        else {
          const slug = `${slugify(business).slice(0, 30)}-${[...crypto.getRandomValues(new Uint8Array(4))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
          d = await api.liveDemos.create({ slug, kind: f.kind.value, project_id: p.id, business, config });
          await api.events.insert(p.id, "note", `Live demo (${LD_KINDS[d.kind].label}): ${liveDemoUrl(slug)}`).catch(() => {});
        }
        const r = await api.liveDemoBuild(d.id);
        if (r && r.ok === false) throw new Error(r.error || "The build failed");
        toast("Built: open it to check, then send them the link");
        fillLiveDemo(p, d.id);
      } catch (ex) { err.hidden = false; err.textContent = /live_demos/.test(ex.message) ? "Run the database update first (migration 0029, in the SQL editor)" : ex.message; }
    }, "Building… (up to a minute)");
  });
}
// ---------- Inbox Assistant (0027): the two-week trial and the live service, on the lead page ----------
// The trial is judged on one number: hours a week saved, from drafts that were actually sent.
// A draft sent nearly as written (≥75% the same) saves the full time it would have taken to
// write; one sent after real edits (40–75%) saves half; a rewrite or a discarded draft saves nothing.
const trialUrl = (slug) => `https://re-charge.co.za/trial?t=${slug}`;
const INBOX_KNOWLEDGE = "Services and prices:\n- \n\nHours and where we work:\n\nPolicies (deposits, cancellations, refunds, delivery times):\n\nThings we always mention:\n\nHow we like to sound (e.g. friendly and brief, first names):\n";
function inboxStats(acc, drafts) {
  const now = Date.now(), start = acc.trial_started_at ? Date.parse(acc.trial_started_at) : null;
  const per = Math.max(0, Number(acc.baseline_minutes || 6) - Number(acc.check_minutes || 1));   // same as _shared/inbox_stats.ts
  const count = (from, to) => {
    const wk = drafts.filter((d) => { const t = Date.parse(d.created_at); return t >= from && t < to && d.status !== "skipped"; });
    const asIs = wk.filter((d) => d.status === "sent" && Number(d.similarity) >= 0.75).length;
    const edited = wk.filter((d) => d.status === "sent" && Number(d.similarity) >= 0.4 && Number(d.similarity) < 0.75).length;
    const rewritten = wk.filter((d) => d.status === "sent" && !(Number(d.similarity) >= 0.4)).length;
    const unused = wk.filter((d) => d.status === "discarded" || d.status === "expired").length;
    const waiting = wk.filter((d) => d.status === "drafted").length;
    return { drafted: wk.length, asIs, edited, rewritten, unused, waiting, hours: Math.round(((asIs + edited / 2) * per / 60) * 10) / 10 };
  };
  const day = start ? Math.floor((now - start) / 864e5) + 1 : 0;
  // The trial is judged on its second week, days 8 to 14, from the taps under each reply (the measurement agreement says so)
  const week2 = start && day >= 8 ? count(start + 7 * 864e5, start + 14 * 864e5) : null;
  return { ...count(now - 7 * 864e5, Infinity), day, per, week2, measured: week2 ? week2.hours : null, target: Number(acc.target_hours || 5) };
}
// ---------- the trial, everywhere else in the panel (Today, the next step, the board, Money) ----------
const trialOf = (p) => (p?.id ? S.trials.get(p.id) || null : null);
// Still running, or waiting for its result: active, started, and no result recorded on the lead yet
const trialOpen = (p) => { const t = trialOf(p); return t && t.a.status === "active" && t.a.trial_started_at && !p.details?.trialResult ? t : null; };
const trialChip = (p) => { const t = trialOpen(p); return t ? `<span class="chip chip--trial" title="Inbox Assistant trial">Trial · ${t.st.day > 14 ? "result due" : `day ${Math.max(1, t.st.day)} of 14`}</span>` : ""; };
const trialHit = (st) => (st.measured ?? st.hours) >= st.target;
// The numbers for the trial messages ({{trial_…}} in Message wording)
function trialVars(p) {
  const t = trialOf(p); if (!t) return {};
  const { a, st } = t, w = st.week2 || st, mins = (n) => { const v = Math.round(Number(n) * 10) / 10; return `${v} minute${v === 1 ? "" : "s"}`; };
  const n = st.per > 0 ? Math.ceil((st.target * 60) / st.per) : 0;
  return {
    trial_link: a.slug ? trialUrl(a.slug) : "", trial_day: String(Math.max(1, st.day)),
    trial_baseline: mins(a.baseline_minutes || 6), trial_check: mins(a.check_minutes || 1), trial_saving: mins(st.per), trial_saving_half: mins(st.per / 2),
    trial_target: `${st.target} hours`, trial_replies: n ? String(n) : "", trial_replies_edited: n ? String(n * 2) : "",
    trial_drafted: String(w.drafted), trial_as_is: String(w.asIs), trial_edited: String(w.edited), trial_unused: String(w.rewritten + w.unused), trial_hours: String(w.hours),
  };
}
// The trial's own next step: it overrides the stage while it runs (a trial lead is often still "Talking")
function trialStep(p, { a, st }, S_) {
  const d = p.details || {}, day = Math.max(1, st.day), marked = st.drafted - st.waiting;
  const sub = `${day <= 14 ? `Day ${day} of 14. ` : ""}${st.day >= 8 ? `${st.measured} of ${st.target} hours in the measured week (days 8 to 14)` : `${st.hours} of ${st.target} hours in the last 7 days (it's measured on days 8 to 14)`}`;
  const open = { label: "Open the trial", act: "inbox" };
  if (day >= 14) {
    const sent = Boolean(d.trialResultSentAt);
    if (trialHit(st)) return S_("Trial hit the target: send the result, then the quote (setup + first month)", { sub, due: true, urgency: day >= 15 ? 0 : 1, actions: [{ ...sayFlag(p, "Send the result", "trial_won", "result"), primary: !sent }, p.quote_cents ? { label: "Send quote", act: "quote:send", primary: sent } : { label: "Write the quote", act: "quote:inbox", primary: sent }, { label: "Mark it kept", act: "trial:kept" }, open] });
    return S_(`Trial below the target: talk to them, then refund the ${money(INBOX_DEPOSIT)} within 7 days`, { sub: `${sub}. Adjust and re-measure, or refund the deposit in full and switch the page off (no refund if they didn't give the agreed access or information).`, due: true, urgency: day >= 18 ? 0 : 1, actions: [{ ...sayFlag(p, "Send the result", "trial_missed", "result"), primary: !sent }, { label: `Refunded ${money(INBOX_DEPOSIT)} + switch off`, act: "trial:refunded", primary: sent }, open] });
  }
  if (day === 13) return S_("Trial ends tomorrow: book the result call", { sub, due: true, urgency: 1, actions: [{ ...sayAct(p, "Book the call", "trial_call"), primary: true }, open] });
  if (day >= 7 && st.drafted >= 4 && marked < st.drafted / 2) return S_("Many replies aren't marked yet: ask the team to tap how each one went", { sub: `${marked} of ${st.drafted} replies marked in the last 7 days. Unmarked replies count as nothing saved.`, due: true, urgency: 1, actions: [{ ...sayAct(p, "Ask them to mark replies", "trial_mark"), primary: true }, open] });
  if (day >= 7 && st.hours < st.target / 2) return S_(`Trial behind (${st.hours} of ${st.target} h this week): check in`, { sub, due: true, urgency: 1, actions: [{ ...sayAct(p, "Check in", "trial"), primary: true }, open] });
  if (day >= 3 && marked <= 0) return S_("They haven't used their trial page yet: check in", { sub, due: true, urgency: 1, actions: [{ ...sayAct(p, "Check in", "trial_unused"), primary: true }, open] });
  if (!d.trialAgreementAt) return S_("Send the measurement agreement: how the 5 hours are counted", { sub: "In writing, before the measured week (days 8 to 14) starts. Time 5 to 10 of their emails first (the trial card).", due: day >= 2, urgency: day >= 4 ? 1 : 2, actions: [{ ...sayFlag(p, "Send the agreement", "trial_agree", "agreed"), primary: true }, open] });
  return S_(`Inbox Assistant trial: day ${day} of 14`, { sub, actions: [open, sayAct(p, "Check in", "trial")] });
}
// The agreement and the result are logged on the lead, with the numbers they were sent with
async function logTrialMessage(p, what) {
  const t = trialOf(p); if (!t) return;
  const tv = trialVars(p), st = t.st, w = st.week2 || st, cur = byId(p.id) || p;
  const note = what === "agreed"
    ? `Inbox Assistant: measurement agreement sent. ${tv.trial_baseline} to answer one by hand, ${tv.trial_check} to check a draft, so each reply sent as is saves ${tv.trial_saving} (half that after edits). Target ${tv.trial_target} a week (about ${tv.trial_replies} replies sent as is), measured on days 8 to 14.`
    : `Inbox Assistant: trial result sent. ${w.hours} of ${st.target} hours in the measured week (${w.drafted} replies: ${w.asIs} as is, ${w.edited} after edits, ${w.rewritten + w.unused} not used): ${trialHit(st) ? "hit the target, the rest gets invoiced" : `below the target, the ${money(INBOX_DEPOSIT)} deposit is refunded within 7 days`}.`;
  await api.events.insert(p.id, "note", note, { trial: what }).catch(() => {});
  try { const np = await api.projects.update(p.id, { details: { ...(cur.details || {}), [what === "agreed" ? "trialAgreementAt" : "trialResultSentAt"]: new Date().toISOString() } }); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np; } catch (ex) { console.warn("trial log", ex); }
}
// Kept, or refunded and switched off: the trial leaves Today and the side column
async function recordTrialResult(p, result) {
  const t = trialOf(p), cur = byId(p.id) || p;
  if (result === "refunded") {
    if (!confirm(`Mark the trial as ended: the ${money(INBOX_DEPOSIT)} deposit refunded and their page switched off?\n\nRefund it yourself in Yoco (or by EFT) within 7 days of the trial ending.`)) return false;
    if (t) await api.inbox.update(t.a.id, { status: "paused" });
  }
  const np = await api.projects.update(p.id, { details: { ...(cur.details || {}), trialResult: result, trialResultAt: new Date().toISOString() } });
  const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np;
  await api.events.insert(p.id, "note", result === "kept" ? "Inbox Assistant trial: hit the target, they're keeping it" : `Inbox Assistant trial: below the target, ${money(INBOX_DEPOSIT)} deposit refunded and the page switched off`).catch(() => {});
  toast(result === "kept" ? "Marked as kept. Next: the quote, then set up their monthly plan when it's live" : "Marked as refunded, and their page is paused");
  return true;
}
// Open the composer on a trial message, then log it on the lead
function sendTrialMessage(p, moment, what, onDone) {
  const kind = p.email ? "email" : isMobile(p.phone) ? "whatsapp" : null;
  if (!kind) return toast("Add an email or a mobile number for them first", true);
  openCompose(p, kind, { templateId: tplFor(kind, moment)?.id, moment, onDone: async () => { if (what) await logTrialMessage(p, what); S.loaded = 0; await loadAll(true); onDone ? onDone() : route(); } });
}
// The R1,500 deposit comes first: a card payment link (or an EFT you record), from the lead's Payments card
function askInboxDeposit(kind) {
  unfold($("payCard"));
  const f = $(kind === "eft" ? "eftForm" : "reqForm"), other = $(kind === "eft" ? "reqForm" : "eftForm"); if (!f) return;
  f.hidden = false; if (other) other.hidden = true;
  f.amount.value = String(INBOX_DEPOSIT / 100); f.kind.value = "deposit";
  if (f.description) f.description.value = "Inbox Assistant deposit (refundable; it comes off the setup)";
  if (f.note) f.note.value = "Inbox Assistant deposit";
  f.scrollIntoView({ behavior: "smooth", block: "center" }); f.amount.focus({ preventScroll: true });
}
const parseTimings = (t) => String(t || "").split(/[^\d.]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 240);
async function fillInbox(p) {
  const body = $("inboxBody"), sum = $("inboxSum");
  if (!body) return;
  let acc = null;
  try { acc = await api.inbox.forProject(p.id); } catch (e) { body.innerHTML = setupNote("The Inbox Assistant isn't switched on yet.", "Run database updates 0027 and 0028 in the Supabase SQL editor."); return; }
  const depPaid = Boolean(p.deposit_paid) || S.payments.some((x) => x.project_id === p.id && x.kind === "deposit" && x.status === "succeeded");
  const depRow = depPaid ? "" : `<div class="adm-inline-actions adm-inbox-dep"><span class="small">${acc ? `No ${money(INBOX_DEPOSIT)} deposit recorded on this lead yet.` : `First, the refundable ${money(INBOX_DEPOSIT)} deposit:`}</span><button type="button" class="btn btn--${acc ? "ghost" : "primary"} btn--small" data-inbox-dep="card">Send a card payment link</button><button type="button" class="btn btn--ghost btn--small" data-inbox-dep="eft">They paid by EFT</button></div>`;
  const wireDep = () => body.querySelectorAll("[data-inbox-dep]").forEach((b) => b.addEventListener("click", () => askInboxDeposit(b.dataset.inboxDep)));
  if (!acc) {
    sum.textContent = depPaid ? "deposit paid, not set up yet" : "not started";
    body.innerHTML = `<p class="small muted">Their own private page on re-charge.co.za, set up with their prices and sign-off: they paste a customer email and get the reply. Under each reply they tap how it went, which measures the time saved. A refundable ${money(INBOX_DEPOSIT)} deposit first (it comes off the ${money(INBOX_SETUP)} setup), then two weeks on their real emails. They pay the rest only if it saves their team 5+ hours a week; if it doesn't, the deposit is refunded in full within 7 days.</p>
      ${depRow}
      <div class="btn-row" style="margin-top:0.6rem"><button class="btn btn--${depPaid ? "primary" : "ghost"} btn--small" id="inboxStart">Set up their Inbox Assistant page</button></div>`;
    wireDep();
    $("inboxStart").addEventListener("click", (e) => busy(e.target, async () => {
      try {
        const business = p.business || p.name || p.ref;
        const slug = `${String(business).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "inbox"}-${[...crypto.getRandomValues(new Uint8Array(4))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
        await api.inbox.create({ project_id: p.id, client_id: p.client_id || null, business, knowledge: INBOX_KNOWLEDGE, provider: "page", status: "active", slug, trial_started_at: new Date().toISOString() });
        if (!p.details?.inbox) await api.projects.update(p.id, { details: { ...(p.details || {}), inbox: true } });
        await api.events.insert(p.id, "note", `Inbox Assistant page set up: ${trialUrl(slug)}`);
        toast("Page set up: fill in what it may know, time a few of their emails, then send them the link"); await loadAll(true); fillInbox(byId(p.id) || p);
      } catch (ex) { toast(ex.message, true); }
    }, "Setting up…"));
    return;
  }
  const isPage = acc.provider === "page" || (!acc.email && acc.slug);
  const drafts = await api.inbox.drafts(acc.id, new Date(Date.now() - 30 * 864e5).toISOString()).catch(() => []);
  const st = inboxStats(acc, drafts);
  const label = isPage ? ({ active: "page live", paused: "page paused" }[acc.status] || acc.status) : ({ pending: "waiting for them to connect", active: "drafting in their inbox", paused: "paused", error: "needs a new connect link", disconnected: "disconnected" }[acc.status] || acc.status);
  const result = p.details?.trialResult, inTrial = acc.status === "active" && st.day > 0 && !result;
  const onTrack = st.hours >= st.target, w2 = st.week2, marked = st.drafted - st.waiting;
  const timings = p.details?.inboxTimings?.mins || [];
  sum.textContent = result ? (result === "kept" ? "trial passed: kept" : "trial ended: refunded") : acc.status === "active" ? `${w2 ? `${st.measured} h in the measured week` : `${st.hours} h saved this week`}${st.day && st.day <= 14 ? ` · trial day ${st.day} of 14` : st.day > 14 ? " · result due" : ""}` : label;
  const SLBL = { drafted: isPage ? "not marked yet" : "waiting", sent: "sent", discarded: "not used", expired: "not used", skipped: "skipped" };
  const link = acc.slug ? trialUrl(acc.slug) : "";
  const verdict = !inTrial || st.day < 14 ? "" : trialHit(st)
    ? `<p class="small cc-ok"><b>It hit the target in the measured week.</b> Send them the result, then the quote: the rest of the setup and the first month (the ${money(INBOX_DEPOSIT)} deposit comes off the setup).</p>`
    : `<p class="small adm-error"><b>It's below the target.</b> Talk to them first: adjust it and measure another week, or refund the ${money(INBOX_DEPOSIT)} deposit in full within 7 days and switch the page off (no refund if they didn't give the agreed access or information).</p>`;
  body.innerHTML = `
    <p class="small"><span class="chip ${acc.status === "active" ? "chip--ok" : acc.status === "error" ? "chip--warn" : ""}">${esc(label)}</span> ${!isPage && acc.email ? `<b>${esc(acc.email)}</b> <span class="muted">(${acc.provider === "outlook" ? "Microsoft 365" : "Gmail"})</span>` : ""}${isPage && acc.page_views ? ` opened ${esc(acc.page_views)} time${acc.page_views === 1 ? "" : "s"}` : ""}${!isPage && acc.last_run_at ? ` · checked ${esc(rel(acc.last_run_at))}` : ""}${result ? ` <span class="chip">${result === "kept" ? "Trial passed: kept" : "Trial ended: refunded"} ${esc(fmtD(p.details.trialResultAt))}</span>` : ""}</p>
    ${depRow}
    ${link ? `<div class="adm-inline-actions" style="margin:0.4rem 0 0.2rem"><input class="adm-reflink" id="trialUrl" readonly value="${esc(link)}" style="flex:1;min-width:14rem" /><button class="btn btn--ghost btn--small" id="trialCopy">Copy</button><a class="btn btn--ghost btn--small" href="${esc(link)}" target="_blank" rel="noopener">Open</a>${p.phone ? `<a class="btn btn--primary btn--small" target="_blank" rel="noopener" href="https://wa.me/${esc(String(p.phone).replace(/\D/g, "").replace(/^0/, "27"))}?text=${encodeURIComponent(`Hi ${(p.name || "").split(" ")[0] || "there"}, here's your Inbox Assistant, set up with your prices: ${link}\n\nPaste any customer email in and you'll get the reply in seconds. After you send it, tap how it went: that's how we measure the time it saves you. For the next two weeks it runs on your real emails, and you pay the rest of the setup only if it saves your team 5 hours a week.`)}">Send on WhatsApp</a>` : ""}</div>` : ""}
    ${acc.last_error ? `<p class="small adm-error">${esc(acc.last_error)}</p>` : ""}
    ${acc.status !== "pending" ? `<div class="adm-inbox-stats">
      <div><b>${st.hours} h</b><span>saved in the last 7 days <small>(target ${esc(st.target)} h${onTrack ? ", on track" : ""})</small></span></div>
      <div><b>${st.drafted}</b><span>drafts</span></div>
      <div><b>${st.asIs}</b><span>sent nearly as written</span></div>
      <div><b>${st.edited}</b><span>sent after edits</span></div>
      <div><b>${st.rewritten + st.unused}</b><span>rewritten or not used</span></div>
      <div><b>${st.waiting}</b><span>${isPage ? "not marked yet" : "waiting in their inbox"}</span></div>
    </div>
    ${w2 ? `<p class="small adm-inbox-week"><b>Measured week (days 8 to 14${st.day < 14 ? ", so far" : ""}): ${w2.hours} of ${st.target} hours.</b> ${w2.drafted} replies: ${w2.asIs} sent as is, ${w2.edited} after edits, ${w2.rewritten + w2.unused} not used${w2.waiting ? `, ${w2.waiting} not marked` : ""}.</p>` : ""}
    ${inTrial && st.day >= 7 && st.drafted >= 4 && marked < st.drafted / 2 ? `<p class="adm-missing">Many replies aren't marked yet (${marked} of ${st.drafted} this week): ask the team to tap how each one went. Unmarked replies count as nothing saved. <button type="button" class="inline-link" data-trial-send="trial_mark">Ask them now</button></p>` : ""}
    ${verdict}
    ${st.day ? `<p class="tiny muted">${inTrial && st.day <= 14 ? `Trial day ${st.day} of 14. It's judged on days 8 to 14. ` : ""}${isPage ? "Each reply they mark as sent counts " : "Each sent draft counts "}${esc(st.per)} min saved (${esc(acc.baseline_minutes)} to answer by hand, less ${esc(acc.check_minutes)} to check it), half that if it was edited.</p>` : ""}
    ${inTrial ? `<div class="adm-inline-actions">
      <button type="button" class="btn btn--${p.details?.trialAgreementAt ? "ghost" : "primary"} btn--small" data-trial-send="trial_agree" data-trial-log="agreed">${p.details?.trialAgreementAt ? `Agreement sent ${esc(fmtD(p.details.trialAgreementAt))}: send again` : "Send the measurement agreement"}</button>
      ${st.day >= 14 ? `<button type="button" class="btn btn--${p.details?.trialResultSentAt ? "ghost" : "primary"} btn--small" data-trial-send="${trialHit(st) ? "trial_won" : "trial_missed"}" data-trial-log="result">${p.details?.trialResultSentAt ? "Result sent: send again" : "Send the result"}</button><button type="button" class="btn btn--ghost btn--small" data-trial-result="kept">Mark it kept</button><button type="button" class="btn btn--ghost btn--small" data-trial-result="refunded">Refunded ${money(INBOX_DEPOSIT)} + switch off</button>` : ""}
    </div>` : ""}` : `<p class="small muted">Send them the connect link for the email they answer customers from (Gmail or Microsoft 365). They sign in and press Allow (Accept on Microsoft). Drafts start within 30 minutes.</p>`}
    <div class="adm-inline-actions" style="margin-top:0.6rem">
      ${!isPage ? `<button class="btn btn--${acc.status === "pending" || acc.status === "error" ? "primary" : "ghost"} btn--small" data-inbox-link="outlook">${acc.status === "pending" ? "Connect link: Microsoft 365" : "New link: Microsoft 365"}</button>` : ""}
      ${!isPage && (acc.status === "active" || acc.status === "paused") ? `<button class="btn btn--ghost btn--small" id="inboxRun">Check their inbox now</button>` : ""}
      ${acc.status === "active" || acc.status === "paused" ? `<button class="btn btn--ghost btn--small" id="inboxPause">${acc.status === "paused" ? "Resume" : "Pause"}</button>` : ""}
      ${isPage ? `<details class="adm-inbox-ms"><summary class="small muted">Optional: drafts straight into their Microsoft 365 inbox</summary><p class="tiny muted">For clients on Microsoft 365 / Outlook who want the drafts waiting in their inbox instead of pasting. Their page keeps working either way.</p>${setupNote("", "Needs the one-time Microsoft app setup first (ADMIN.md 8ce).")}<button class="btn btn--ghost btn--small" data-inbox-link="outlook">Connect link: Microsoft 365</button></details>` : ""}
    </div>
    <div id="inboxLinkBox" hidden style="margin-top:0.6rem"><input class="adm-reflink" id="inboxLinkUrl" readonly style="width:100%" /><div class="adm-inline-actions" style="margin-top:0.4rem"><button class="btn btn--ghost btn--small" id="inboxCopy">Copy</button>${p.phone ? `<a class="btn btn--ghost btn--small" id="inboxWa" target="_blank" rel="noopener">Send on WhatsApp</a>` : ""}</div><p class="tiny muted" id="inboxLinkNote">Valid for 14 days. Nothing is ever sent without them.</p></div>
    <form class="adm-form" id="inboxForm" style="margin-top:0.9rem">
      <label>What it may know <span class="muted" style="font-weight:400">(prices, policies, hours, how they like to reply; anything missing becomes a [gap] for them to fill)</span><textarea name="knowledge" rows="10">${esc(acc.knowledge || "")}</textarea></label>
      <label>Sign-off<textarea name="signoff" rows="3" placeholder="Kind regards&#10;Thandi&#10;Mokoena Inc">${esc(acc.signoff || "")}</textarea></label>
      <fieldset class="adm-timings"><legend>Day-one timings <span class="muted" style="font-weight:400">(on the first call, time 5 to 10 of their real emails answered by hand)</span></legend>
        <label>Minutes for each one, in any order<input name="timings" inputmode="decimal" autocomplete="off" value="${esc(timings.join(", "))}" placeholder="e.g. 4, 6.5, 7, 5, 8, 6" /></label>
        <p class="tiny muted" id="timingsOut" aria-live="polite"></p></fieldset>
      <div class="row2"><label>Minutes to answer one by hand <span class="muted" style="font-weight:400">(the median of the timings)</span><input name="baseline" type="number" min="1" step="0.5" value="${esc(acc.baseline_minutes)}" /></label><label>Minutes to check a draft<input name="check" type="number" min="0" step="0.5" value="${esc(acc.check_minutes)}" /></label></div>
      <label>Target, hours a week<input name="target" type="number" min="1" step="0.5" value="${esc(acc.target_hours)}" /></label>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form>
    ${drafts.length ? `<h3 style="margin-top:1rem;font-size:0.95rem">Recent replies</h3><ul class="adm-list">${drafts.filter((d) => d.status !== "skipped").slice(0, 10).map((d) => `<li><div class="adm-row"><div class="adm-row__main"><div class="adm-row__title">${esc(d.gist || "Customer email")}</div><div class="adm-row__sub">${esc(SLBL[d.status] || d.status)}${d.status === "sent" && d.similarity != null ? ` · ${Math.round(d.similarity * 100)}% as drafted` : ""}${(d.checks || []).length ? ` · ${d.checks.length} gap${d.checks.length === 1 ? "" : "s"} to fill` : ""} · ${esc(rel(d.created_at))}</div></div></div></li>`).join("")}</ul>${isPage ? "" : `<p class="tiny muted">${drafts.filter((d) => d.status === "skipped").length} newsletters, notifications and answered threads skipped in the last 30 days.</p>`}` : ""}`;
  wireDep();
  $("trialCopy")?.addEventListener("click", () => { navigator.clipboard?.writeText(link); toast("Link copied"); });
  body.querySelectorAll("[data-trial-send]").forEach((b) => b.addEventListener("click", () => sendTrialMessage(byId(p.id) || p, b.dataset.trialSend, b.dataset.trialLog || null)));
  body.querySelectorAll("[data-trial-result]").forEach((b) => b.addEventListener("click", () => busy(b, async () => { try { if (await recordTrialResult(byId(p.id) || p, b.dataset.trialResult)) { await loadAll(true); route(); } } catch (ex) { toast(ex.message, true); } })));
  view.querySelectorAll("[data-inbox-link]").forEach((btn) => btn.addEventListener("click", (e) => busy(e.target, async () => {
    const provider = btn.dataset.inboxLink, ms = provider === "outlook";
    try {
      const r = await api.inboxConnect(acc.id, provider);
      $("inboxLinkBox").hidden = false; $("inboxLinkUrl").value = r.url;
      $("inboxLinkNote").textContent = `Valid for 14 days. ${ms ? "Microsoft asks them to accept access to read and write their mail (it can't send)." : "Google shows \"Re-Charge wants to read, compose and label your email\"; until the app is verified they press Advanced, then Go to Re-Charge."} Nothing is ever sent without them.`;
      const wa = $("inboxWa"); if (wa) wa.href = `https://wa.me/${String(p.phone).replace(/\D/g, "").replace(/^0/, "27")}?text=${encodeURIComponent(`Hi ${(p.name || "").split(" ")[0] || "there"}, here's the link to connect your inbox to the Inbox Assistant. Sign in with the ${ms ? "Microsoft 365 / Outlook" : "Gmail"} account you answer customers from and press ${ms ? "Accept" : "Allow"}; drafts start within 30 minutes, and nothing is ever sent without you:\n${r.url}`)}`;
      if (acc.status === "error") await api.inbox.update(acc.id, { status: "pending" });
    } catch (ex) { toast(ex.message, true); }
  }, "Making the link…")));
  $("inboxCopy")?.addEventListener("click", () => { navigator.clipboard?.writeText($("inboxLinkUrl").value); toast("Link copied"); });
  $("inboxRun")?.addEventListener("click", (e) => busy(e.target, async () => {
    try { const r = await api.inboxRun(acc.id); const x = r.inboxes?.[0] || {}; toast(x.error ? x.error : `Checked: ${x.drafted || 0} new draft${x.drafted === 1 ? "" : "s"}, ${x.measured || 0} measured`, Boolean(x.error)); fillInbox(p); }
    catch (ex) { toast(ex.message, true); }
  }, "Checking…"));
  $("inboxPause")?.addEventListener("click", async () => { try { await api.inbox.update(acc.id, { status: acc.status === "paused" ? "active" : "paused" }); toast(acc.status === "paused" ? (isPage ? "Their page is live again" : "Drafting again") : (isPage ? "Paused: their page shows a paused note until you resume" : "Paused: no new drafts until you resume")); await loadAll(true); fillInbox(p); } catch (ex) { toast(ex.message, true); } });
  // Day-one timings: the median of 5 to 10 timed emails becomes the minutes to answer one by hand
  const form = $("inboxForm");
  const showTimings = (fill) => {
    const xs = parseTimings(form.timings.value), m = median(xs), out = $("timingsOut");
    if (!xs.length) { out.textContent = "Type the minutes each email took, separated by commas. The median becomes the minutes to answer one by hand."; return null; }
    const base = Math.max(0.5, Math.round(m * 2) / 2);
    out.textContent = `Median ${base} min from ${xs.length} email${xs.length === 1 ? "" : "s"}${xs.length < 5 ? `: time at least 5 for a fair number (${5 - xs.length} more)` : ""}. Saved as the minutes to answer one by hand.`;
    if (fill) form.baseline.value = base;
    return { xs, base };
  };
  showTimings(false);
  form.timings.addEventListener("input", () => showTimings(true));
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, tm = showTimings(true);
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        await api.inbox.update(acc.id, { knowledge: f.knowledge.value.trim(), signoff: f.signoff.value.trim(), baseline_minutes: Number(f.baseline.value) || 6, check_minutes: Number(f.check.value) || 0, target_hours: Number(f.target.value) || 5 });
        const cur = byId(p.id) || p, before = (cur.details?.inboxTimings?.mins || []).join(",");
        if (tm && tm.xs.join(",") !== before) {
          const np = await api.projects.update(p.id, { details: { ...(cur.details || {}), inboxTimings: { mins: tm.xs, median: tm.base, at: new Date().toISOString() } } });
          const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np;
          await api.events.insert(p.id, "note", `Inbox Assistant day-one timings: ${tm.xs.join(", ")} minutes (median ${tm.base}, from ${tm.xs.length} email${tm.xs.length === 1 ? "" : "s"}). Minutes to answer one by hand set to ${f.baseline.value}.`, { timings: tm.xs }).catch(() => {});
        }
        toast("Saved: new drafts use it straight away"); await loadAll(true); fillInbox(byId(p.id) || p);
      } catch (ex) { toast(ex.message, true); }
    }, "Saving…");
  });
}
// Write down the number before the work starts. Kept short on purpose: three fields,
// one of them optional, so there's no excuse to skip it.
function openBaseline(p, done) {
  const dlg = $("composeDialog"), b = baselineOf(p) || {};
  const custom = b.metric && !BASELINE_METRICS.includes(b.metric);
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">${b.metric ? "The number we're improving" : "Write down the number first"}</h2><p>${esc(p.business || p.name || p.ref)} — one number, taken before anything changes. In three months this is what proves the plan was worth paying for.</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="baseForm">
      <label>What we're improving<select name="metric">${BASELINE_METRICS.map((m) => `<option${b.metric === m ? " selected" : ""}>${esc(m)}</option>`).join("")}<option value="__other"${custom ? " selected" : ""}>Something else…</option></select></label>
      <label id="baseOtherWrap"${custom ? "" : " hidden"}>Describe it<input name="other" value="${esc(custom ? b.metric : "")}" placeholder="e.g. Quotes sent out late" /></label>
      <div class="row2">
        <label><span id="baseValLbl">Where it is today</span><input name="value" type="number" min="0" step="0.5" required value="${esc(b.value ?? "")}" placeholder="e.g. 12" /></label>
        <label id="baseVolWrap" hidden>How many<input name="volume" type="number" min="0" step="1" value="${esc(b.volume ?? "")}" placeholder="e.g. 120" /></label>
        <label>Per<select name="unit">${BASELINE_UNITS.map((u) => `<option${(b.unit || "a week") === u ? " selected" : ""}>${esc(u)}</option>`).join("")}</select></label>
      </div>
      <label>Loaded hourly cost, R <span class="muted" style="font-weight:400">(optional — turns hours into Rands: salary × 1.3 ÷ 173, so R28,000 → R210)</span><input name="hourly" type="number" min="0" step="1" value="${esc(b.hourly ?? "")}" placeholder="e.g. 210" /></label>
      <label>How we know<select name="how">${BASELINE_HOW.map((h) => `<option${(b.how || BASELINE_HOW[0]) === h ? " selected" : ""}>${esc(h)}</option>`).join("")}</select></label>
      <label>Note <span class="muted" style="font-weight:400">(optional — where the number came from)</span><input name="note" value="${esc(b.note || "")}" placeholder="e.g. two reviews say they never got a reply" /></label>
      <p class="tiny muted">An honest guess from the owner is fine. The monthly report says where the number came from, so it never looks like we measured something we didn't.</p>
      <p class="adm-error tiny" id="baseErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><button class="btn btn--primary btn--small" type="submit">Save it</button></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", () => dlg.close()));
  const f = $("baseForm");
  const kindNow = () => metricKind(f.metric.value === "__other" ? f.other.value : f.metric.value);
  const relabel = () => { const m = kindNow() === "minutes"; $("baseVolWrap").hidden = !m; $("baseValLbl").textContent = m ? "Minutes each" : "Where it is today"; };
  f.metric.addEventListener("change", () => { $("baseOtherWrap").hidden = f.metric.value !== "__other"; if (f.metric.value === "__other") f.other.focus(); relabel(); });
  f.other.addEventListener("input", relabel);
  relabel();
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const metric = f.metric.value === "__other" ? f.other.value.trim() : f.metric.value;
    const value = Number(f.value.value);
    const err = $("baseErr");
    if (!metric) { err.hidden = false; err.textContent = "Say what we're improving."; return; }
    if (!Number.isFinite(value) || value < 0) { err.hidden = false; err.textContent = "Give the number as it is today, even if it's zero."; return; }
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        const vol = Number(f.volume.value), hourly = Number(f.hourly.value);
        const baseline = { metric, value, unit: f.unit.value, how: f.how.value, note: f.note.value.trim() || null, at: b.at || new Date().toISOString(),
          ...(metricKind(metric) === "minutes" && vol > 0 ? { volume: vol } : {}), ...(hourly > 0 ? { hourly } : {}) };
        const details = { ...(p.details || {}), baseline };
        delete details.baselineSkipped;
        await api.projects.update(p.id, { details });
        await api.events.insert(p.id, "note", `Baseline before we start — ${baselineLine(baseline)} (${baseline.how.toLowerCase()})`, { baseline });
        dlg.close(); toast("Baseline saved"); await loadAll(true); done?.();
      } catch (ex) { err.hidden = false; err.textContent = ex.message; }
    }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
// The same measure, after go-live (phase 4 for a proof of concept, then monthly).
// Same definition as the baseline or it means nothing, so the dialog repeats it.
function openAfter(p, done) {
  const dlg = $("composeDialog"), b = baselineOf(p), a0 = afterOf(p) || {};
  if (!b) return openBaseline(p, done);
  const mins = metricKind(b.metric) === "minutes";
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">The same number, now</h2><p>${esc(b.metric)} — measured the same way as before: <b>${esc(b.value)}${mins ? " minutes each" : " " + esc(b.unit)}</b> when we started (${esc((b.how || "recorded").toLowerCase())}).</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="afterForm">
      <label>${mins ? "Minutes each, now" : `Now, ${esc(b.unit)}`}<input name="value" type="number" min="0" step="0.5" required value="${esc(a0.value ?? "")}" /></label>
      <label>How we know<select name="how">${BASELINE_HOW.map((h) => `<option${(a0.how || "We counted it") === h ? " selected" : ""}>${esc(h)}</option>`).join("")}</select></label>
      <label>Note <span class="muted" style="font-weight:400">(optional — over what period, how many items)</span><input name="note" value="${esc(a0.note || "")}" placeholder="e.g. 2 weeks, 214 enquiries, timed from the log" /></label>
      <p class="adm-error tiny" id="afterErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><button class="btn btn--primary btn--small" type="submit">Save it</button></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", () => dlg.close()));
  const f = $("afterForm");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = Number(f.value.value), err = $("afterErr");
    if (!Number.isFinite(value) || value < 0) { err.hidden = false; err.textContent = "Give the number as it is now."; return; }
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        const after = { value, how: f.how.value, note: f.note.value.trim() || null, at: new Date().toISOString() };
        const r = roiOf(b, after);
        await api.projects.update(p.id, { details: { ...(p.details || {}), after } });
        await api.events.insert(p.id, "note", `Measured after — ${b.metric}: ${b.value} → ${value}${r.pct != null ? ` (${r.pct}% less)` : ""}${r.hours != null ? `, ≈ ${Math.round(r.hours)} h a month back` : ""}${r.rands != null ? `, ≈ R${Math.round(r.rands).toLocaleString("en-ZA")} a month` : ""}`, { after });
        dlg.close(); toast("Saved"); await loadAll(true); done?.();
      } catch (ex) { err.hidden = false; err.textContent = ex.message; }
    }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
// The flywheel's "case study" step: measured result → Problem / Solution / Result,
// with the client's approval recorded. Copies out as a LinkedIn post or a card for
// the site (same markup as the homepage examples), never published from here.
function caseDraft(p) {
  const d = discOf(p), map = d.map || {}, b = baselineOf(p), top = [...(d.opps || [])].map((o) => ({ ...o, ...oppVerdict(o) })).sort((x, y) => y.score - x.score)[0];
  const mins = b && metricKind(b.metric) === "minutes";
  const base = b ? (mins ? `It took about ${b.value} minutes ${b.metric.replace(/^minutes\s*/i, "")}${b.volume ? `, about ${b.volume} times ${b.unit}` : ""}.` : `${b.metric}: about ${b.value} ${b.unit}.`) : "";
  return {
    title: top ? top.name : (p.business || "Case study"),
    who: p.business || "",
    kind: (p.category || []).find((c) => !/ai|process|automation|request|review/i.test(c)) || "AI system",
    problem: [map.repetitive || map.bottlenecks || p.goal || "", base].filter(Boolean).join(" "),
    solution: top ? `${top.name}${map.software ? `, connected to ${map.software}` : ""}. A person approves anything that matters.` : "",
    result: resultLine(p), quote: "", approved: false,
  };
}
function caseText(c, kind) {
  if (kind === "linkedin") return `${c.title}${c.who ? ` at ${c.who}` : ""}\n\nThe problem: ${c.problem}\n\nWhat we built: ${c.solution}\n\nThe result, measured the same way before and after: ${c.result}${c.quote ? `\n\n\u201c${c.quote}\u201d` : ""}\n\nFind the work your employees shouldn't be doing: re-charge.co.za\n\n#AI #SmallBusiness #SouthAfrica`;
  const e = (t) => esc(t || "");
  return `<article class="psr reveal">\n  <span class="psr__kind">${e(c.kind)}${c.who ? " · " + e(c.who) : ""}</span>\n  <div class="psr__row"><span class="psr__k">Problem</span><p>${e(c.problem)}</p></div>\n  <div class="psr__row"><span class="psr__k">Solution</span><p>${e(c.solution)}</p></div>\n  <div class="psr__row psr__row--result"><span class="psr__k">Result</span><p><b>${e(c.result)}</b></p></div>\n</article>`;
}
function openCaseStudy(p, done) {
  const dlg = $("composeDialog"), c = { ...caseDraft(p), ...(p.details?.caseStudy || {}) };
  if (!c.result) c.result = resultLine(p);
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">Case study</h2><p>${esc(p.business || p.ref)} — drafted from the map, the top opportunity and the measured result. Edit freely; it's only shared once they approve the wording.</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="caseForm">
      <div class="row2"><label>Title<input name="title" value="${esc(c.title)}" /></label><label>Shown as <span class="muted" style="font-weight:400">(name, or e.g. "a 15-person law firm")</span><input name="who" value="${esc(c.who)}" /></label></div>
      <label>Industry tag<input name="kind" value="${esc(c.kind)}" /></label>
      <label>Problem<textarea name="problem" rows="3">${esc(c.problem)}</textarea></label>
      <label>Solution<textarea name="solution" rows="2">${esc(c.solution)}</textarea></label>
      <label>Result <span class="muted" style="font-weight:400">(measured — keep the numbers as recorded)</span><textarea name="result" rows="2">${esc(c.result)}</textarea></label>
      <label>Their words <span class="muted" style="font-weight:400">(optional quote, with their permission)</span><input name="quote" value="${esc(c.quote || "")}" /></label>
      <label class="adm-check"><input type="checkbox" name="approved"${c.approved ? " checked" : ""} /> They approved this wording${c.approvedAt ? ` <span class="tiny muted">(${esc(fmtD(c.approvedAt))})</span>` : ""}</label>
      <p class="adm-error tiny" id="caseErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
        <span class="btn-row" style="gap:0.4rem"><button type="button" class="btn btn--ghost btn--small" data-case-copy="linkedin">Copy for LinkedIn</button><button type="button" class="btn btn--ghost btn--small" data-case-copy="site">Copy for the website</button></span>
        <button class="btn btn--primary btn--small" type="submit">Save</button>
      </div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", () => dlg.close()));
  const f = $("caseForm");
  const read = () => ({ title: f.title.value.trim(), who: f.who.value.trim(), kind: f.kind.value.trim(), problem: f.problem.value.trim(), solution: f.solution.value.trim(), result: f.result.value.trim(), quote: f.quote.value.trim(), approved: f.approved.checked, approvedAt: f.approved.checked ? (c.approvedAt || new Date().toISOString()) : null });
  dlg.querySelectorAll("[data-case-copy]").forEach((b) => b.addEventListener("click", async () => {
    const r = read();
    if (!r.approved && !confirm("They haven't approved this wording yet. Copy it anyway (to send them for approval)?")) return;
    const t = caseText(r, b.dataset.caseCopy);
    try { await navigator.clipboard.writeText(t); toast(b.dataset.caseCopy === "site" ? "Copied: paste it into the examples on the homepage or Solutions page" : "Copied"); } catch { prompt("Copy this:", t); }
  }));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        const r = read();
        await api.projects.update(p.id, { details: { ...(p.details || {}), caseStudy: r } });
        if (r.approved && !c.approved) await api.events.insert(p.id, "note", "Case study approved by the client");
        dlg.close(); toast(r.approved ? "Case study saved (approved)" : "Case study draft saved"); await loadAll(true); done?.();
      } catch (ex) { const err = $("caseErr"); err.hidden = false; err.textContent = ex.message; }
    }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
// Phase 1: the discovery map — seven questions, one box each.
function openMap(p, done) {
  const dlg = $("composeDialog"), map = discOf(p).map || {};
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">Discovery map</h2><p>${esc(p.business || p.name || p.ref)} — how the work really happens today. Short notes are fine.</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="mapForm">
      ${MAP_FIELDS.map(([k, l, hint]) => `<label>${esc(l)} <span class="muted" style="font-weight:400">— ${esc(hint)}</span><textarea name="${k}" rows="2">${esc(map[k] || "")}</textarea></label>`).join("")}
      <p class="adm-error tiny" id="mapErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><button class="btn btn--primary btn--small" type="submit">Save the map</button></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", () => dlg.close()));
  const f = $("mapForm");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    await busy(f.querySelector("[type=submit]"), async () => {
      try {
        const next = {}; MAP_FIELDS.forEach(([k]) => { const v = f[k].value.trim(); if (v) next[k] = v; });
        await api.projects.update(p.id, { details: { ...(p.details || {}), discovery: { ...discOf(p), map: next } } });
        dlg.close(); toast("Map saved"); await loadAll(true); done?.();
      } catch (ex) { const err = $("mapErr"); err.hidden = false; err.textContent = ex.message; }
    }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
// Phase 2: score one opportunity (new, or edit/remove an existing one by index).
function openOpp(p, which, done) {
  const dlg = $("composeDialog"), list = [...(discOf(p).opps || [])], idx = which === "new" ? -1 : Number(which), o = idx >= 0 ? list[idx] || {} : {};
  const val = (k) => (o[k] ?? 5);
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">${idx >= 0 ? "Opportunity" : "Score an opportunity"}</h2><p>0 to 10 on each. Difficulty and risk count against it.</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="oppForm">
      <label>The opportunity<input name="name" required maxlength="80" value="${esc(o.name || "")}" placeholder="e.g. Prepare replies to website enquiries" /></label>
      <div class="adm-oppgrid">${OPP_FACTORS.map(([k, l, hint]) => `<label>${esc(l)}${hint ? ` <span class="muted" style="font-weight:400">(${hint})</span>` : ""}<select name="${k}">${Array.from({ length: 11 }, (_, n) => `<option${Number(val(k)) === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div>
      <p class="adm-oppscore" id="oppLive"></p>
      <label>Note <span class="muted" style="font-weight:400">(optional)</span><input name="note" value="${esc(o.note || "")}" placeholder="e.g. 2 people, most mornings; inbox + Excel" /></label>
      <p class="adm-error tiny" id="oppErr" hidden></p>
      <div class="btn-row" style="justify-content:space-between">${idx >= 0 ? '<button type="button" class="btn btn--ghost btn--small is-danger" id="oppDel">Remove</button>' : '<button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button>'}<button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", () => dlg.close()));
  const f = $("oppForm");
  const read = () => { const r = { name: f.name.value.trim(), note: f.note.value.trim() || null }; OPP_FACTORS.forEach(([k]) => { r[k] = Number(f[k].value); }); return r; };
  const live = () => { const v = oppVerdict(read()); $("oppLive").innerHTML = `<b>${v.score}</b>/100 · ${esc(v.label)}${v.gate ? ` · <span class="adm-error">${esc(v.gate)}</span>` : ""}`; };
  f.addEventListener("change", live); live();
  const save = async (next, msg) => {
    try { await api.projects.update(p.id, { details: { ...(p.details || {}), discovery: { ...discOf(p), opps: next } } }); dlg.close(); toast(msg); await loadAll(true); done?.(); }
    catch (ex) { const err = $("oppErr"); err.hidden = false; err.textContent = ex.message; }
  };
  $("oppDel")?.addEventListener("click", () => { if (confirm("Remove this opportunity?")) { list.splice(idx, 1); save(list, "Removed"); } });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = read();
    if (!r.name) { const err = $("oppErr"); err.hidden = false; err.textContent = "Name the opportunity."; return; }
    if (idx >= 0) list[idx] = r; else list.push(r);
    await busy(f.querySelector("[type=submit]"), () => save(list, `Scored ${oppScore(r)}/100`), "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
function openGoLive(p, done) {
  const dlg = $("composeDialog"), c0 = p.client_id ? clientById(p.client_id) : null;
  const careLine = (p.quote_items || []).find((i) => /hosting|care plan|care\b/i.test(i.desc || ""));
  const renew = new Date(); renew.setFullYear(renew.getFullYear() + 1);
  const domain = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const plan = c0?.care_active ? c0.care_plan : trialOf(p) || p.details?.inbox ? "inbox" : usesMethod(p) && !careLine ? "operate" : "care";   // AI work goes onto operations; an Inbox Assistant client onto its plan
  const checks = stageOf(p.status) !== "live";   // already live: just editing the plan
  // the quote's Care line is the first year, paid up front; without one they may prefer monthly
  // a pay-monthly website: the first month was paid with the quote; billing carries on from there
  const pm = p.details?.payMonthly?.cents ? p.details.payMonthly : null;
  const firstPay = pm ? (S.payments.filter((x) => x.project_id === p.id && x.kind === "deposit" && x.status === "succeeded").map(paidAt).sort()[0] || new Date().toISOString()) : null;
  const pmStart = firstPay ? new Date(firstPay) : null;
  const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return localDate(x); };
  const monthly0 = c0 ? isMonthly(c0) : Boolean(pm) || OPS_PLANS.includes(plan);
  dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">Site is live 🎉</h2><p>${esc(p.business || p.name || p.ref)} — this moves the lead to Live and keeps their hosting & care details on the client page.</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <form class="adm-form" id="goLiveForm">
      <div class="row2"><label>Client name<input name="name" required value="${esc(c0?.name || p.business || p.name || "")}" /></label><label>Their website address<input name="site" value="${esc(c0?.site_label || domain(p.website) || "")}" placeholder="mikesplumbing.co.za" /></label></div>
      <label>Hosting & care plan<select name="plan"><option value="">No plan</option>${Object.entries(PLAN_LABEL).map(([v, l]) => `<option value="${v}"${v === plan ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label>They pay<select name="billing"><option value="yearly"${!monthly0 ? " selected" : ""}>Yearly (cheaper: 2 months free)</option><option value="monthly"${monthly0 ? " selected" : ""}>Monthly</option></select></label>
      <div class="row2"><label><span id="glPer">${monthly0 ? "Price per month" : "Price per year"}</span><span class="money"><input name="amount" inputmode="decimal" value="${c0?.care_amount_cents ? c0.care_amount_cents / 100 : pm ? pm.cents / 100 : careLine?.cents && !monthly0 ? careLine.cents / 100 : planPrice(plan, monthly0) / 100}" /></span></label><label><span id="glDue">${monthly0 ? "First monthly payment due" : "Renews on"}</span><input type="date" name="renews" value="${esc(c0?.care_renews_at || (pm ? addMonths(pmStart, 1) : "") || localDate(renew))}" /></label></div>
      ${(() => { const by = liveBy(p); if (!checks || !by || Date.now() <= by.getTime()) return ""; const late = Math.ceil((Date.now() - by.getTime()) / 86400e3); return `<label class="check adm-pm-note"><input type="checkbox" name="latefree" checked /> <span>Live ${late} day${late === 1 ? "" : "s"} after the ${LIVE_DAYS}-day promise: give them their first month of Care free (moves the ${monthly0 ? "next payment" : "renewal"} a month later)</span></label>`; })()}
      ${pm && !c0?.term_until ? `<p class="small adm-pm-note"><b>Pay monthly:</b> ${money(pm.cents)} a month until ${esc(new Date(addMonths(pmStart, pm.months) + "T12:00:00").toLocaleDateString("en-ZA", { month: "long", year: "numeric" }))} (${pm.months} payments, the first one's in), then ${money(pm.afterCents || PLAN_MONTHLY.care)} a month for Care. The switch happens by itself.</p>` : ""}
      <label class="check"><input type="checkbox" name="credit"${c0?.notes && /footer credit/i.test(c0.notes) ? " checked" : ""} /> Keeps the "Website by Re-Charge" link in their footer (R100 off a year, R10 a month)</label>
      <p class="tiny muted" id="glHelp">${monthly0 ? "Each month, 3 days before it's due, they're emailed a card payment link automatically. When they pay, the date moves on a month." : "You'll see a reminder on Today 30 days before it renews. When they pay the renewal, the date moves on a year by itself."}</p>
      ${checks ? `<fieldset class="adm-standard"><legend>The Re-Charge Standard <span>tick each one before it goes live</span></legend>${STANDARD.map(([k, t, d, link]) => `<label class="check"><input type="checkbox" name="std_${k}" /><span><b>${esc(t)}</b><span class="tiny muted">${esc(d)}${link ? ` <a class="inline-link" data-std-link="${k}" target="_blank" rel="noopener" href="#">Test it ↗</a>` : ""}</span></span></label>`).join("")}</fieldset>` : ""}
      <p class="adm-error tiny" id="glErr" hidden></p>
      <div class="btn-row"><button type="button" class="btn btn--ghost btn--small" data-close>Cancel</button><button class="btn btn--primary btn--small" type="submit" id="glSave">Save — it's live</button></div>
    </form></div>`;
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  const glForm = $("goLiveForm");
  const syncStd = () => {
    if (!checks) return;
    const left = STANDARD.filter(([k]) => !glForm["std_" + k].checked).length, btn = $("glSave");
    btn.disabled = left > 0; btn.textContent = left ? `Tick ${left} more to go live` : "Save — it's live";
    const site = domain(glForm.site.value.trim());
    glForm.querySelectorAll("[data-std-link]").forEach((a) => { const u = STANDARD.find(([k]) => k === a.dataset.stdLink)[3](site); a.href = u || "#"; a.hidden = !u; });
  };
  glForm.addEventListener("input", syncStd); glForm.addEventListener("change", syncStd); syncStd();
  // price follows the plan and the footer credit, until you type your own
  let priceTouched = Boolean(c0?.care_amount_cents || careLine?.cents || pm);
  glForm.amount.addEventListener("input", () => { priceTouched = true; });
  const setPrice = () => { if (priceTouched || !glForm.plan.value) return; glForm.amount.value = planPrice(glForm.plan.value, glForm.billing.value === "monthly", glForm.credit.checked) / 100; };
  glForm.plan.addEventListener("change", () => {
    // Operations plans are monthly; switching to one flips billing (which also resets the price).
    if (OPS_PLANS.includes(glForm.plan.value) && glForm.billing.value !== "monthly") { glForm.billing.value = "monthly"; glForm.billing.dispatchEvent(new Event("change")); return; }
    setPrice();
  }); glForm.credit.addEventListener("change", () => { if (careLine?.cents && !c0?.care_amount_cents && glForm.billing.value === "yearly") { glForm.amount.value = Math.max(0, careLine.cents - (glForm.credit.checked ? CREDIT_OFF : 0)) / 100; } else setPrice(); });
  glForm.billing.addEventListener("change", () => {
    const m = glForm.billing.value === "monthly";
    $("glPer").textContent = m ? "Price per month" : "Price per year";
    $("glDue").textContent = m ? "First monthly payment due" : "Renews on";
    $("glHelp").textContent = m ? "Each month, 3 days before it's due, they're emailed a card payment link automatically. When they pay, the date moves on a month." : "You'll see a reminder on Today 30 days before it renews. When they pay the renewal, the date moves on a year by itself.";
    if (!c0?.care_renews_at) { const d = new Date(); if (m && !careLine?.cents) d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1); glForm.renews.value = localDate(d); }
    priceTouched = false; setPrice();
  });
  glForm.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("glErr");
    if (checks && STANDARD.some(([k]) => !f["std_" + k].checked)) return;
    const amt = f.amount.value.replace(/[^\d.]/g, "");
    const creditNote = f.credit.checked ? "Keeps the Website by Re-Charge footer credit (R100 off)." : "";
    const notes = [String(c0?.notes || "").replace(/\s*Keeps the Website by Re-Charge footer credit \(R100 off\)\.?/i, "").trim(), creditNote].filter(Boolean).join("\n") || null;
    const row = { notes, name: f.name.value.trim(), site_label: domain(f.site.value.trim()) || null, email: c0?.email || p.email || null, phone: c0?.phone || p.phone || null, care_active: Boolean(f.plan.value), care_plan: f.plan.value || c0?.care_plan || "care", care_amount_cents: amt ? Math.round(Number(amt) * 100) : null, care_renews_at: f.plan.value ? (f.renews.value || null) : null };
    if (f.billing.value === "monthly" || c0?.billing) row.billing = f.billing.value;   // column arrives with 0019
    if (pm && !c0?.term_until && f.billing.value === "monthly") { row.term_until = addMonths(pmStart, pm.months); row.term_after_cents = pm.afterCents || PLAN_MONTHLY.care; }   // 0022
    if (!row.name) return;
    const lateFree = Boolean(f.latefree?.checked && row.care_renews_at);
    if (lateFree) row.care_renews_at = addMonths(new Date(row.care_renews_at + "T12:00:00"), 1);
    await busy(f.querySelector("[type=submit]"), async () => { try {
      const c = c0 ? await api.clients.update(c0.id, row) : await api.clients.insert({ ...row, slug: slugify(row.name) + "-" + Math.random().toString(36).slice(2, 6) });
      const liveDetails = { ...(p.details || {}), liveAt: p.details?.liveAt || new Date().toISOString(), ...(checks ? { standard: { passed: STANDARD.map(([k]) => k), at: new Date().toISOString() } } : {}) };
      await api.projects.update(p.id, { client_id: c.id, status: "live", next_action: null, next_action_at: null, details: liveDetails });
      await api.events.insert(p.id, "note", `Live${checks ? ", passed the Re-Charge Standard (" + STANDARD.length + "/" + STANDARD.length + ")" : ""}${row.care_active ? ` — ${PLAN_LABEL[row.care_plan]}, ${carePer({ ...row, billing: f.billing.value })}, ${f.billing.value === "monthly" ? "first payment due" : "renews"} ${fmtD(row.care_renews_at + "T12:00:00")}` : " (no care plan)"}`);
      if (lateFree) await api.events.insert(p.id, "note", `Went live after the ${LIVE_DAYS}-day promise: first month of Care free (${f.billing.value === "monthly" ? "first payment" : "renewal"} moved to ${fmtD(row.care_renews_at + "T12:00:00")})`);
      const by = p.details?.referredBy?.clientId && !p.details?.referralRewarded ? clientById(p.details.referredBy.clientId) : null;
      if (by) {
        // their next year of Care is free: the renewal moves a year later
        const base = by.care_renews_at ? new Date(by.care_renews_at + "T12:00:00") : new Date();
        base.setFullYear(base.getFullYear() + 1);
        const next = localDate(base);
        await api.clients.update(by.id, { care_renews_at: by.care_active ? next : by.care_renews_at, notes: [by.notes, `Referral reward: a free year of Care for referring ${row.name} (${fmtD(new Date().toISOString())}).`].filter(Boolean).join("\n") });
        await api.projects.update(p.id, { details: { ...liveDetails, referralRewarded: true } });
        await api.events.insert(p.id, "note", `Referral reward: ${by.name}'s next year of Care is free${by.care_active ? ` (renewal moved to ${fmtD(next + "T12:00:00")})` : " (they have no active plan: noted on their client page)"}`);
      }
      dlg.close(); toast(by ? `Live, and ${by.name} gets a free year of Care for the referral` : "Live — well done!"); await loadAll(true); done?.();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; } }, "Saving…");
  });
  if (!dlg.open) dlg.showModal();
}
const callRow = ({ p, d }) => `<li><div class="adm-row">
  <div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(p.ref)}</span>${esc(p.name || p.business || "—")}${p.business && p.name ? `<span class="muted" style="font-weight:400">· ${esc(p.business)}</span>` : ""}</div>
  <div class="adm-row__sub">${esc(fmtD(d))} · ${esc(p.details?.callTime || "")}${p.details?.callNote ? " — " + esc(p.details.callNote) : ""}</div>
  <div class="adm-inline-actions">${p.phone ? `<a class="btn btn--primary" href="${esc(telLink(p.phone))}">Call ${esc(p.phone)}</a>` : ""}<button class="btn btn--ghost" data-ics="${esc(p.id)}">Add to calendar</button><a class="btn btn--ghost" href="#/p/${esc(p.id)}">Open</a></div></div>
  <div class="adm-row__side">${d < endOfToday() && d >= startOfToday() ? "<span class=\"adm-error\">today</span>" : `<span>${esc(rel(d.toISOString()))}</span>`}</div></div></li>`;
document.addEventListener("click", (e) => {
  const qb = e.target.closest("[data-quick]");
  if (qb) { e.preventDefault(); const p = byId(qb.dataset.quick); if (p) openQuickActions(p); return; }
  const b = e.target.closest("[data-ics]"); if (!b) return;
  const p = byId(b.dataset.ics); if (p) download(`call-${p.ref}.ics`, icsFor(p), "text/calendar");
});

// ---------- pipeline ----------
function renderPipeline(q) {
  const show = ["active", "archived", "spam"].includes(q.get("show")) ? q.get("show") : "active";
  const group = q.get("group") || "", cat = q.get("cat") || "", src = q.get("src") || "", pot = q.get("pot") || "", text = (q.get("q") || "").toLowerCase();
  const star = S.features.star;
  const mode = q.get("view") || localStorage.getItem("adm.pipeline.view") || (matchMedia("(min-width: 900px)").matches ? "board" : "list");
  try { localStorage.setItem("adm.pipeline.view", mode); } catch {}
  const cats = [...new Set(S.projects.flatMap((p) => p.category || []).filter((c) => !/request$/i.test(c)))].sort();
  let rows = S.projects.filter((p) => show === "spam" ? p.spam : show === "archived" ? (p.archived && !p.spam) : isActive(p));
  if (group) rows = rows.filter((p) => STAGE[p.status]?.group === group);
  else if (show === "active") rows = rows.filter((p) => p.status !== "declined");
  if (cat) rows = rows.filter((p) => (p.category || []).includes(cat));
  if (src) rows = rows.filter((p) => sourceOf(p) === src);
  if (pot) rows = rows.filter((p) => pot === "none" ? !p.potential : p.potential === pot);
  if (text) rows = rows.filter((p) => [p.ref, p.name, p.business, p.email, p.phone, p.goal, p.potential_note, p.website, p.location].join(" ").toLowerCase().includes(text));
  const sort = q.get("sort") || "updated";
  const dueKey = (p) => p.next_action_at ? Date.parse(p.next_action_at) : Infinity;
  rows.sort((a, b) => (star ? b.starred - a.starred : 0) || (sort === "due" ? dueKey(a) - dueKey(b) : sort === "value" ? (b.quote_cents || 0) - (a.quote_cents || 0) : sort === "potential" ? (priority(b) - priority(a)) || b.updated_at.localeCompare(a.updated_at) : sort === "established" ? ((b.activity_score ?? -1) - (a.activity_score ?? -1)) : sort === "oldest" ? a.updated_at.localeCompare(b.updated_at) : b.updated_at.localeCompare(a.updated_at)));
  const link = (k, v) => { const n = new URLSearchParams(q); v ? n.set(k, v) : n.delete(k); return "#/pipeline?" + n.toString(); };
  const sel = (name, opts, cur, label, placeholder = true) => `<select aria-label="${label}" data-filter="${name}">${placeholder ? `<option value="">${label}</option>` : ""}${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Leads</span><h1>${rows.length} ${esc(show === "active" ? "" : show + " ")}${rows.length === 1 ? "lead" : "leads"}</h1></div>
    <div class="adm-head__actions"><a class="btn btn--primary btn--small" href="#/add">+ Add lead</a></div></div>
  <div class="adm-filters">
    ${sel("group", [...GROUPS, ["declined", "Lost"]], group, "Every stage")}
    ${sel("pot", [...Object.entries(POTENTIAL), ["none", "Not rated"]], pot, "Any fit")}
    ${sel("show", [["active", "Current"], ["archived", "Archived"], ["spam", "Spam"]], show, "Show", false)}
    ${sel("sort", [["updated", "Latest first"], ["due", "Reminder date"], ["value", "Biggest quote"], ["potential", "Best fit"], ["established", "Most established"], ["oldest", "Oldest first"]], sort, "Sort")}
    <input type="search" id="pipeQ" value="${esc(q.get("q") || "")}" placeholder="Find a lead…" aria-label="Find a lead" />
    <div class="demo__seg" role="group" aria-label="View"><button type="button" data-view="list" class="${mode === "list" ? "is-active" : ""}">List</button><button type="button" data-view="board" class="${mode === "board" ? "is-active" : ""}">Board</button></div>
  </div>
  ${mode === "board" && show === "active" ? renderBoard(rows, group) : `<ul class="adm-list">${rows.length ? rows.map((p) => `<li>${projectRow(p)}</li>`).join("") : '<li class="adm-empty">Nothing here.</li>'}</ul>`}
  <p class="tiny muted" style="margin-top:1rem"><button type="button" class="inline-link" id="exportCsv">Download as a spreadsheet (CSV)</button></p>`;

  view.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("change", () => { location.hash = link(el.dataset.filter, el.value); }));
  view.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { location.hash = link("view", b.dataset.view); }));
  wireBoard();
  // filter as you type, in place (no re-render, no lost focus)
  $("pipeQ").addEventListener("input", () => {
    const t = $("pipeQ").value.trim().toLowerCase();
    view.querySelectorAll(".adm-list > li").forEach((li) => { li.hidden = Boolean(t) && !li.textContent.toLowerCase().includes(t); });
  });
  $("exportCsv").addEventListener("click", () => exportCsv(rows));
}
// The board: four columns you can drag leads between. Building and Live are statuses inside "Won"
// (a pill on the card), not columns of their own.
const BOARD = [
  ["outreach", "To contact", ["prospect"], "Found them, not in touch yet"],
  ["leads", "Talking", ["new"], "They enquired or replied: you're in conversation. Reply, then send a quote"],
  ["quoted", "Quoted", ["quote_sent"], "Quote sent: waiting for a yes and the deposit"],
  ["won", "Won", ["in_development", "live"], "They said yes. Building until it's live; drag here when they've paid"],
];
const boardCol = (p) => BOARD.find(([, , st]) => st.includes(stageOf(p.status)))?.[0] || null;
function renderBoard(rows, onlyGroup) {
  const cols = onlyGroup === "declined" ? [["declined", "Lost", ["declined"], ""]] : onlyGroup ? BOARD.filter(([g, , st]) => g === onlyGroup || st.some((x) => STAGE[x]?.group === onlyGroup)) : BOARD;
  return `<p class="tiny muted adm-board__hint"><span class="adm-mouse-only">Drag a lead to another column, or press ⋯ on it to move it.</span><span class="adm-touch-only">Tap ⋯ on a lead to move it to another column.</span> In <b>Won</b>, the pill shows whether it's still being built or already live. Lost leads are under Every stage → Lost.</p>
  <div class="adm-board adm-board--4">${cols.map(([g, label, st, help]) => {
    const items = rows.filter((p) => st.includes(stageOf(p.status)));
    return `<div class="adm-col" data-col="${g}"><h3 title="${esc(help)}">${esc(label)} <span>${items.length}</span></h3><ul class="adm-list">${items.map((p) => `<li draggable="true" data-pid="${esc(p.id)}">${projectRow(p)}${g === "won" ? `<button type="button" class="adm-pill adm-pill--${stageOf(p.status) === "live" ? "live" : "build"}" data-pill="${esc(p.id)}" title="${stageOf(p.status) === "live" ? "Live. Click to move back to Building" : "Being built. Click when it's live"}">${stageOf(p.status) === "live" ? "Live ✓" : "Building · mark live"}</button>` : ""}</li>`).join("") || '<li class="adm-empty tiny"><span class="adm-mouse-only">Drop a lead here</span><span class="adm-touch-only">Nothing here</span></li>'}</ul></div>`;
  }).join("")}</div>`;
}
// Move a lead to a board column. The database still moves leads on its own when the facts change
// (quote created → Quoted, deposit paid → Building).
const COL_STATUS = { outreach: "prospect", leads: "new", quoted: "quote_sent", won: "in_development" };
async function moveToColumn(id, col) {
  const p = byId(id); if (!p || boardCol(p) === col || !COL_STATUS[col]) return false;
  const prev = p.status, colName = BOARD.find(([g]) => g === col)[1];
  const patch = { status: col === "outreach" && p.status === "contacted" ? "contacted" : COL_STATUS[col] };
  if (col === "won" && isGbp(p) && !p.quote_cents) Object.assign(patch, { quote_cents: GBP_PRICE, quote_items: [{ desc: "Google profile setup (once-off)", cents: GBP_PRICE }] });
  try {
    const u = await api.projects.update(id, patch); const i = S.projects.findIndex((x) => x.id === id); if (i >= 0) S.projects[i] = u;
    api.events.insert(id, "note", `Moved to ${colName} on the board`).catch(() => {});
    // every move can be taken back for a few seconds: one slip of the mouse shouldn't change the numbers
    toast(`Moved to ${colName}`, false, { label: "Undo", fn: async () => {
      try { const b = await api.projects.update(id, { status: prev }); const j = S.projects.findIndex((x) => x.id === id); if (j >= 0) S.projects[j] = b; api.events.insert(id, "note", `Moved back to ${STAGE[prev]?.label || prev} (undo)`).catch(() => {}); toast("Moved back"); route(); } catch (e) { toast(e.message, true); }
    } });
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
// Quoted needs a quote and Won needs the deposit: instead of a move the numbers would believe, open the lead
// at the step that makes it true (sending the quote, or recording the deposit, moves it by itself).
async function moveLead(id, col) {
  const p = byId(id); if (!p) return false;
  if (col === "quoted" && !p.quote_cents && boardCol(p) !== "quoted") { toast("Write their quote first: the lead moves to Quoted when you send it"); location.hash = `#/p/${id}?do=quote:write`; return "opened"; }
  if (col === "won" && !p.deposit_paid && !isGbp(p) && boardCol(p) !== "won") { toast("Record their deposit first: the lead moves to Won when it's saved"); location.hash = `#/p/${id}?do=pay:deposit`; return "opened"; }
  return moveToColumn(id, col);
}
function wireBoard() {
  const board = view.querySelector(".adm-board--4"); if (!board) return;
  board.querySelectorAll("li[data-pid] a").forEach((a) => { a.draggable = false; });
  board.querySelectorAll("li[data-pid]").forEach((li) => {
    li.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", li.dataset.pid); e.dataTransfer.effectAllowed = "move"; li.classList.add("is-dragging"); board.classList.add("is-dragging"); });
    li.addEventListener("dragend", () => { li.classList.remove("is-dragging"); board.classList.remove("is-dragging"); board.querySelectorAll(".is-over").forEach((c) => c.classList.remove("is-over")); });
  });
  board.querySelectorAll(".adm-col[data-col]").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; col.classList.add("is-over"); });
    col.addEventListener("dragleave", (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove("is-over"); });
    col.addEventListener("drop", async (e) => {
      e.preventDefault(); col.classList.remove("is-over");
      const id = e.dataTransfer.getData("text/plain"), li = board.querySelector(`li[data-pid="${CSS.escape(id)}"]`);
      const to = col.dataset.col, p = byId(id), guarded = p && ((to === "quoted" && !p.quote_cents) || (to === "won" && !p.deposit_paid && !isGbp(p)));
      if (li && !guarded && to !== li.closest(".adm-col")?.dataset.col) { const ul = col.querySelector(".adm-list"); ul.querySelector(".adm-empty")?.remove(); ul.prepend(li); }
      if ((await moveLead(id, to)) !== "opened") route();
    });
  });
  // Won: Building → Live goes through the usual go-live step (Standard checklist, client and care plan)
  board.querySelectorAll("[data-pill]").forEach((b) => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const p = byId(b.dataset.pill); if (!p) return;
    if (stageOf(p.status) === "live") {
      if (!confirm(`Move ${p.business || p.name || p.ref} back to Building?`)) return;
      try { const u = await api.projects.update(p.id, { status: "in_development" }); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = u; toast("Back to Building"); route(); } catch (ex) { toast(ex.message, true); }
    } else if (isGbp(p)) location.hash = `#/p/${p.id}?do=gbp:done`;
    else location.hash = `#/p/${p.id}?do=golive`;
  }));
}
function exportCsv(rows) {
  const cols = ["ref", "business", "name", "email", "phone", "location", "category", "status", "source", "quote", "next_action", "next_action_at", "created_at", "updated_at", "goal"];
  const cell = csvCell;
  const lines = [cols.join(",")].concat(rows.map((p) => cols.map((c) => cell(
    c === "category" ? (p.category || []).join("; ") : c === "quote" ? (p.quote_cents != null ? p.quote_cents / 100 : "") : c === "source" ? sourceOf(p) : p[c])).join(",")));
  download(`re-charge-pipeline-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
}

// ---------- next step ----------
// One answer to "what do I do with this lead now?", worked out from its
// state. The lead page shows it as a banner with one main button; Today lists
// every lead whose next step is due. Buttons are plain links to the lead with
// ?do=<action>, so the same action code runs whichever screen it came from.
const paidFor = (p) => S.payments.filter((x) => x.project_id === p.id && x.status === "succeeded").reduce((a, x) => a + (x.amount_cents || 0), 0);
// Google profile setup (R450 once-off, paid when done): its own short path through the panel
const GBP_PRICE = 45000;
const isGbp = (p) => (p?.category || []).includes("Google profile setup") || p?.details?.formType === "Google profile setup";
// The Google profile checklist (on Google-setup leads), ticked as you go. Stored in details.gbpSteps.
const GBP_STEPS = [
  ["access", "You're a Manager on their profile", "They add your Gmail under People and access. No listing yet? Create it with them on a quick call"],
  ["verified", "Verified", "Video, phone or email code, done by the owner on their phone. Send them the verification steps"],
  ["name", "Their real business name, no extra keywords", "Keywords in the name get profiles suspended"],
  ["category", "Primary category, plus 2–4 secondary", "As specific as possible: \"Hair salon\", not \"Beauty\""],
  ["area", "Address or service area, normal and holiday hours", "No shop front? Choose service area and hide the address"],
  ["contact", "Phone, and a website or WhatsApp link", "Their site if they have one, otherwise their WhatsApp link or Facebook page"],
  ["services", "Services or menu, with prices", "The biggest improvement for most listings"],
  ["description", "Description written (up to 750 characters)", ""],
  ["photos", "Logo, cover and 5–10 real photos", "Their work, space and team. No stock photos"],
  ["posts", "First two posts", "One about what they do, one offer or update"],
  ["reviews", "Review link saved, review card sent", "Make their review card, and send the image with the \"done\" message"],
];
const GBP_ACCESS = { none: "Not yet", asked: "Asked, waiting", manager: "You're a Manager", owner: "You're the owner" };
const gbpHasAccess = (c) => ["manager", "owner"].includes(c?.gbp_access);
const gbpCares = (c) => Boolean(c?.care_active) && ["care", "business", "partner"].includes(c.care_plan);   // Care plans include the Google profile
const gbpCareDue = (c) => gbpCares(c) && Date.now() - Date.parse(c.created_at || 0) > 7 * 86400e3 && (!c.gbp_care_at || Date.now() - Date.parse(c.gbp_care_at) > 30 * 86400e3);
// Replies to Google reviews: copy, fill in the [brackets], post it from their profile
const REVIEW_REPLIES = [
  ["5 stars", "Thank you so much, [name]! We really appreciate you taking the time to leave a review, and we're glad you enjoyed it. See you again soon!\n\nThe {biz} team"],
  ["4 stars / mixed", "Thanks for the honest feedback, [name]. We're glad you liked [what went well], and we're sorry [what fell short] wasn't up to standard. We've taken it on board, and we'd love the chance to get it all right next time.\n\nThe {biz} team"],
  ["Unhappy", "Hi [name], we're sorry to hear about your experience. That's not the standard we aim for, and we'd like to put it right. Please contact us on [phone / WhatsApp] so we can sort it out.\n\nThe {biz} team"],
];
const reviewRepliesHtml = (biz) => `<details class="adm-replies" style="margin-top:0.8rem"><summary class="small"><b>Reply to a Google review</b> <span class="muted">copy, fill in the [brackets], post</span></summary>
  ${REVIEW_REPLIES.map(([k, t], i) => `<div class="adm-reply"><div class="adm-reply__head"><span class="tiny muted">${esc(k)}</span><button type="button" class="btn btn--ghost btn--small" data-copy-reply="${i}">Copy</button></div><textarea rows="4" data-reply-text="${i}">${esc(t.replace("{biz}", biz || "our"))}</textarea></div>`).join("")}
  <p class="tiny muted" style="margin:0.4rem 0 0">Reply to every review within about 2 days, good or bad. Never argue in public, and never share a customer's private details.</p></details>`;
const wireReviewReplies = (root) => root.querySelectorAll("[data-copy-reply]").forEach((b) => b.addEventListener("click", async () => {
  const t = root.querySelector(`[data-reply-text="${b.dataset.copyReply}"]`)?.value || "";
  try { await navigator.clipboard.writeText(t); toast("Reply copied"); } catch { toast("Select the text and copy it", true); }
}));
// South African public holidays (a Sunday holiday moves to the Monday). Used for "set holiday hours" reminders.
function easterSunday(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
function saHolidays(y) {
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; }, e = easterSunday(y);
  const list = [[new Date(y, 0, 1), "New Year's Day"], [new Date(y, 2, 21), "Human Rights Day"], [plus(e, -2), "Good Friday"], [plus(e, 1), "Family Day"], [new Date(y, 3, 27), "Freedom Day"], [new Date(y, 4, 1), "Workers' Day"], [new Date(y, 5, 16), "Youth Day"], [new Date(y, 7, 9), "National Women's Day"], [new Date(y, 8, 24), "Heritage Day"], [new Date(y, 11, 16), "Day of Reconciliation"], [new Date(y, 11, 25), "Christmas Day"], [new Date(y, 11, 26), "Day of Goodwill"]];
  const out = [];
  for (const [d, n] of list) { out.push({ d, name: n }); if (d.getDay() === 0) out.push({ d: plus(d, 1), name: n + " (Monday off)" }); }
  return out.map((h) => ({ ...h, key: `${h.d.getFullYear()}-${String(h.d.getMonth() + 1).padStart(2, "0")}-${String(h.d.getDate()).padStart(2, "0")}` })).sort((a, b) => a.d - b.d);
}
// The next public holiday within a week that you haven't ticked off yet, if any client's Google profile is yours to update
function holidayReminder() {
  const profiles = S.clients.filter((c) => gbpCares(c) || gbpHasAccess(c)).length;
  if (!profiles) return null;
  const t0 = startOfToday().getTime(), y = new Date().getFullYear(), done = new Set(S.gbpHolidays?.done || []);
  const h = [...saHolidays(y), ...saHolidays(y + 1)].find((x) => x.d.getTime() >= t0 && x.d.getTime() - t0 <= 7 * 86400e3 && !done.has(x.key));
  return h ? { ...h, profiles } : null;
}
// ---------- phone alerts (Web Push) ----------
// The service worker (/admin/sw.js) shows the alert; notify-push stores this device's subscription.
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const deviceLabel = () => { const u = navigator.userAgent; const os = /Android/.test(u) ? "Android" : isIos() ? "iPhone/iPad" : /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "Device"; const br = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : ""; return [os, br].filter(Boolean).join(" · "); };
const b64uToBytes = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function pushSub() { if (!pushSupported()) return null; const reg = await navigator.serviceWorker.getRegistration("/admin/"); return reg ? reg.pushManager.getSubscription() : null; }
async function fillPush() {
  const st = $("pushState"), btns = $("pushBtns"), hint = $("pushHint"); if (!st) return;
  const showHint = (t) => { hint.textContent = t; hint.hidden = !t; };
  if (!pushSupported() || (isIos() && !isInstalled())) {
    st.textContent = isIos() ? "On iPhone, alerts work once the panel is on your home screen." : "This browser can't show alerts. Use Chrome or Edge (or Safari on a Mac).";
    btns.innerHTML = "";
    showHint(isIos() ? "In Safari: tap Share → Add to Home Screen, open the panel from the new icon, then come back here and turn alerts on. Needs iOS 16.4 or later." : "");
    return;
  }
  const sub = await pushSub().catch(() => null);
  let devices = [];
  try { devices = (await api.push("list")).devices || []; } catch { /* function not deployed yet */ }
  const others = devices.filter((d) => !sub || d.endpoint !== sub.endpoint).length;
  if (Notification.permission === "denied") { st.innerHTML = "<b>Blocked:</b> this browser is set to block alerts from the panel."; btns.innerHTML = ""; showHint("Allow notifications for re-charge.co.za in the browser's site settings, then reload this page."); return; }
  if (sub) {
    st.innerHTML = `<span class="chip chip--ok">On for this device ✓</span>${others ? ` <span class="tiny muted">and ${others} other device${others === 1 ? "" : "s"}</span>` : ""}`;
    btns.innerHTML = '<button type="button" class="btn btn--primary btn--small" id="pushTest">Send a test alert</button><button type="button" class="btn btn--ghost btn--small" id="pushOff">Turn off on this device</button>';
    showHint("");
  } else {
    st.innerHTML = `Off on this device.${others ? ` <span class="tiny muted">On for ${others} other device${others === 1 ? "" : "s"}.</span>` : ""}`;
    btns.innerHTML = '<button type="button" class="btn btn--primary btn--small" id="pushOn">Turn on alerts on this device</button>';
    showHint("Your browser will ask to allow notifications: choose Allow.");
  }
  $("pushOn")?.addEventListener("click", (e) => busy(e.target, pushOn, "Turning on…"));
  $("pushTest")?.addEventListener("click", (e) => busy(e.target, async () => { try { const r = await api.push("test"); toast(r.sent ? "Test alert sent: check your notifications" : "No alert went out. Turn alerts off and on again on this device", !r.sent); } catch (ex) { toast(pushErr(ex), true); } }, "Sending…"));
  $("pushOff")?.addEventListener("click", (e) => busy(e.target, async () => { try { const s = await pushSub(); if (s) { await api.push("unsubscribe", { endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe(); } try { localStorage.setItem("adm.push.on", "0"); } catch {} toast("Alerts off on this device"); fillPush(); } catch (ex) { toast(ex.message, true); } }, "Turning off…"));
}
const pushErr = (ex) => /not found|404|Failed to fetch|notify-push/i.test(ex?.message || "") ? "Alerts aren't set up on the server yet: run the database update and deploy the functions" : (ex?.message || String(ex));
async function pushOn() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications weren't allowed, so alerts can't be shown", true); return fillPush(); }
    const { publicKey } = await api.push("key");
    const reg = await navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) }));
    await api.push("subscribe", { subscription: sub.toJSON(), label: deviceLabel() });
    try { localStorage.setItem("adm.push.on", "1"); } catch {}
    const r = await api.push("test").catch(() => null);
    toast(r?.sent ? "Alerts are on: a test alert is on its way" : "Alerts are on for this device");
  } catch (ex) { toast(pushErr(ex), true); }
  fillPush();
}
// tapping an alert while the panel is open: the service worker asks us to go to the lead
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.go) location.href = e.data.go; });

// ---------- sales sprint: a daily contact quota and a client target over N days ----------
const DEFAULT_SPRINT = { active: false, start: "", days: 30, target: 5, daily: 5, manual: {} };
const sprintNow = () => ({ ...DEFAULT_SPRINT, ...(S.sprint || {}) });
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return localDate(d); };
// Counts from what you already do in the panel: first-contact / follow-up / mockup messages, walk-ins you log,
// prospects who replied, and clients won (their first payment) since the sprint started.
function sprintStats(msgs) {
  const sp = sprintNow(), today = localDate(), end = addDays(sp.start, sp.days - 1);
  const day = Math.min(sp.days, Math.max(1, Math.round((Date.parse(today + "T12:00:00") - Date.parse(sp.start + "T12:00:00")) / 86400e3) + 1));
  const weekStart = addDays(today, -6);
  const momentOf = (m) => { const t = S.templates.find((x) => x.id === m.template_id); return t?.meta?.moment || ((LEGACY_NAMES.intro || []).some((n) => t?.name?.toLowerCase().includes(n)) ? "intro" : ""); };
  const inSprint = msgs.filter((m) => localDate(new Date(m.created_at)) >= sp.start && m.status !== "failed");
  // a "contact" is reaching out to a business you're prospecting: any first-contact message, or any message
  // (from any template, or typed yourself) to a lead that's still To contact or came from outreach.
  // Follow-ups don't count as new contacts. Messages sent without a lead count once per number.
  const firstTouch = (m) => {
    const mo = momentOf(m); if (["intro", "gbp_offer"].includes(mo)) return true;
    if (["follow_up", "reactivate"].includes(mo)) return false;
    if (!m.project_id) return Boolean(m.to_address);
    const p = byId(m.project_id); return Boolean(p) && (stageOf(p.status) === "prospect" || sourceOf(p) === "outreach");
  };
  const who = (m) => m.project_id || "to:" + String(m.to_address || "").toLowerCase().replace(/[^a-z0-9@.]/g, "");
  const byDay = {};
  inSprint.filter(firstTouch).forEach((m) => { const k = localDate(new Date(m.created_at)); (byDay[k] ||= new Set()).add(who(m)); });
  const contactsOn = (k) => (byDay[k]?.size || 0) + (Number(sp.manual?.[k]) || 0);
  const contactedIds = new Set(inSprint.filter(firstTouch).map((m) => m.project_id).filter(Boolean));
  const replied = [...contactedIds].map(byId).filter((p) => p && !["prospect", "contacted", "declined"].includes(p.status) && !p.spam);
  // a client is "won" on their first successful payment, if that falls inside the sprint
  const firstPay = {};
  S.payments.filter((x) => x.status === "succeeded" && x.project_id).forEach((x) => { const t = paidAt(x); if (!firstPay[x.project_id] || t < firstPay[x.project_id]) firstPay[x.project_id] = t; });
  const won = Object.entries(firstPay).filter(([, t]) => localDate(new Date(t)) >= sp.start && localDate(new Date(t)) <= end).map(([id]) => byId(id)).filter(Boolean);
  const inWeek = (k) => k >= weekStart && k <= today;
  const week = {
    contacts: Object.keys({ ...byDay, ...(sp.manual || {}) }).filter(inWeek).reduce((a, k) => a + contactsOn(k), 0),
    followUps: inSprint.filter((m) => momentOf(m) === "follow_up" && inWeek(localDate(new Date(m.created_at)))).length,
    mockups: inSprint.filter((m) => momentOf(m) === "mockup" && inWeek(localDate(new Date(m.created_at)))).length,
    won: won.filter((p) => inWeek(localDate(new Date(firstPay[p.id])))).length,
  };
  let hitDays = 0; for (let k = sp.start; k <= today && k <= end; k = addDays(k, 1)) if (contactsOn(k) >= sp.daily) hitDays++;
  const where = {}; won.forEach((p) => { const k = SOURCES[sourceOf(p)] || sourceOf(p); where[k] = (where[k] || 0) + 1; });
  return { sp, day, end, over: today > end, today: contactsOn(today), total: Object.keys({ ...byDay, ...(sp.manual || {}) }).reduce((a, k) => a + contactsOn(k), 0), replied: replied.length, won, week, hitDays, where };
}
function sprintCard(st) {
  const { sp } = st, pct = Math.min(100, Math.round((st.won.length / Math.max(1, sp.target)) * 100)), leftToday = Math.max(0, sp.daily - st.today);
  const dots = Array.from({ length: sp.daily }, (_, i) => `<i class="${i < st.today ? "on" : ""}"></i>`).join("");
  const sunday = new Date().getDay() === 0;
  return `<section class="adm-card adm-sprint">
    <div class="adm-sprint__head"><div><span class="eyebrow">${st.over ? "Sprint finished" : `Sales sprint · day ${st.day} of ${sp.days}`}</span><h2>${st.won.length} of ${sp.target} new client${sp.target === 1 ? "" : "s"}${st.won.length >= sp.target ? " 🎉" : ""}</h2></div>
      <div class="adm-sprint__actions"><button type="button" class="btn btn--ghost btn--small" id="sprintEnd" title="Stop the sprint. Your counts stay; start a new one any time in Settings">${st.over ? "Close" : "End sprint"}</button><button type="button" class="btn btn--ghost btn--small" id="sprintWalkin" title="A walk-in, a call or a message you sent outside the panel">+1 walk-in or call</button><a class="btn btn--primary btn--small" href="#/outreach">Find people to contact</a></div></div>
    <div class="adm-sprint__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${sp.target}" aria-valuenow="${st.won.length}"><span style="width:${pct}%"></span></div>
    <div class="adm-sprint__grid">
      <div><span class="tiny muted">Today</span><b>${st.today} / ${sp.daily} contacted</b><span class="adm-sprint__dots">${dots}</span><span class="tiny ${leftToday ? "muted" : "ok"}">${leftToday ? `${leftToday} to go today` : "Today's quota done ✓"}</span></div>
      <div><span class="tiny muted">Last 7 days</span><b>${st.week.contacts} contacted</b><span class="tiny muted">${st.week.followUps} follow-up${st.week.followUps === 1 ? "" : "s"} · ${st.week.mockups} mockup${st.week.mockups === 1 ? "" : "s"} sent · ${st.week.won} won</span></div>
      <div><span class="tiny muted">Whole sprint</span><b>${st.total} contacted · ${st.replied} replied</b><span class="tiny muted">${st.total ? Math.round((st.replied / st.total) * 100) + "% reply rate · " : ""}quota hit on ${st.hitDays} day${st.hitDays === 1 ? "" : "s"}</span></div>
    </div>
    ${sunday || st.over ? `<p class="small adm-sprint__review"><b>${st.over ? "How did it go?" : "Sunday review:"}</b> ${st.won.length ? `Won from: ${Object.entries(st.where).map(([k, n]) => `${esc(k)} ${n}`).join(", ")}. ` : ""}Which message got the most replies, and which type of business said yes? Do more of that next week.${st.over ? ' <a class="inline-link" href="#/settings">Start the next sprint →</a>' : ""}</p>` : ""}
  </section>`;
}
// Before/after reel: prefilled from the lead (name, trade, area, Google rating before, days from yes to live)
const reelUrl = (p, c) => {
  const d = p?.details || {}, liveAt = d.standard?.at, startAt = p?.quote_accepted_at || p?.created_at;
  const days = liveAt && startAt ? Math.max(1, Math.round((Date.parse(liveAt) - Date.parse(startAt)) / 86400e3)) : "";
  const q = { name: p?.business || c?.name || p?.name || "", type: d.mkIndustry || d.finderType || "", area: (p?.location || "").split(",")[0].trim(), rating: p?.rating || "", reviews: p?.review_count ?? "", days };
  return "reel.html?" + new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== "" && v != null))).toString();
};
const reviewCardUrl = (name, link, head) => "review-card.html?" + new URLSearchParams({ ...(name ? { name } : {}), ...(link ? { link } : {}), ...(head ? { head } : {}) }).toString();
const balanceDue = (p) => p.quote_cents ? Math.max(0, p.quote_cents - paidFor(p)) : 0;
const reachBy = (p) => p.email ? "email" : isMobile(p.phone) ? "whatsapp" : p.phone ? "call" : null;
const sayFlag = (p, label, tpl, flag) => { const a = sayAct(p, label, tpl); return a.act.startsWith("send:") ? { ...a, act: `${a.act}:${flag}` } : a; };
const liveSite = (p) => { const c = clientById(p?.client_id || p?._client_id); return c?.site_label ? "https://" + c.site_label : (p && ownSite(p)) || p?.preview_url || ""; };
const shareCardUrl = (kind, p, extra = {}) => { const c = clientById(p?.client_id || p?._client_id); const q = new URLSearchParams({ kind, name: c?.name || p?.business || p?.name || "", site: (c?.site_label || liveSite(p)).replace(/^https?:\/\//, "").replace(/\/.*$/, ""), ...extra }); for (const [k, v] of [...q]) if (!v) q.delete(k); return "/admin/share-card.html?" + q; };
// A demo assistant for a prospect: the AI version of the free mockup (0024)
const demoUrl = (slug) => (slug ? "https://re-charge.co.za/demo?d=" + encodeURIComponent(slug) : "");
const demoSlugFor = (p) => slugify(p.business || p.name || "demo").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
const demoKnowledgeFor = (p) => [
  `${p.business || p.name || "The business"} is a ${(p.details?.finderType || "local business").replace(/,.*$/, "").toLowerCase()}${p.location ? " in " + p.location : ""}.`,
  ownSite(p) ? `Website: ${shortUrl(ownSite(p))}.` : "",
  p.phone ? `Phone: ${p.phone}.` : "",
  p.rating != null ? `Rated ${p.rating} on Google${p.review_count != null ? ` from ${p.review_count} reviews` : ""}.` : "",
  "",
  "WHAT THEY DO",
  "- [list their main services, one per line]",
  "",
  "PRICES",
  "- [only what is published publicly; leave out anything you can't confirm]",
  "",
  "HOURS",
  "- [e.g. Mon–Fri 8:00–17:00, Sat 8:00–13:00]",
  "",
  "WHERE",
  p.location ? `- ${p.location}` : "- [area they serve]",
  "",
  "COMMON QUESTIONS",
  "- [a question their customers ask] — [the answer]",
].filter((x) => x !== null).join("\n");

// ---------- the baseline ----------
// The number we wrote down BEFORE we changed anything. Without it, month three is
// "what am I actually paying you for?" and the Care plan gets cancelled; with it,
// the renewal is arithmetic. It's taken once, before the work starts, and it never
// changes afterwards — that's the whole point of a baseline.
// Phrased so they still read correctly inside the client's own report, where they
// follow "you told us…" and are followed by the unit. So: no "a week" in the label
// (the unit says that), and nothing written about the client in the third person.
const BASELINE_METRICS = [
  "Minutes to prepare each reply",
  "Minutes to prepare each quote",
  "Minutes to capture each document",
  "Minutes to find an answer",
  "Hours spent on data entry",
  "Hours spent sorting email",
  "Hours spent on reporting",
  "Enquiries that never got a reply",
  "Enquiries that come in after hours",
  "Hours spent answering the same questions",
  "Hours spent on admin, quotes and paperwork",
  "Enquiries through the website",
  "Bookings or jobs taken",
];
const BASELINE_UNITS = ["a day", "a week", "a month"];
const baselineOf = (p) => { const b = p?.details?.baseline; return b && b.metric ? b : null; };
const baselineLine = (b) => (b ? `${b.metric}: about ${b.value} ${b.unit}` : "");
// A guess the owner gave us is still worth having — as long as the report never
// pretends it was measured. How we know it is kept with the number and shown with it.
const BASELINE_HOW = ["They told us", "From their reviews or page", "We counted it"];

// ---------- ROI: the baseline, the same measure after, and what the change is worth ----------
// METHOD.md §4. "Minutes to …" metrics are per item, so they need a volume (items per
// unit); "Hours …" metrics are already time. Hours become Rands only when we know the
// loaded hourly cost (salary × 1.3 ÷ 173). The monthly report does the same sums.
const PER_MONTH = { "a day": 21.7, "a week": 4.33, "a month": 1 };
const metricKind = (m) => (/^minutes\b/i.test(m || "") ? "minutes" : /^hours\b/i.test(m || "") ? "hours" : "count");
const afterOf = (p) => { const a = p?.details?.after; return a && Number.isFinite(Number(a.value)) ? a : null; };
function roiOf(b, a) {
  if (!b || !a) return null;
  const before = Number(b.value), after = Number(a.value), change = before - after;
  const pct = before ? Math.round((change / before) * 100) : null, kind = metricKind(b.metric), per = PER_MONTH[b.unit] || 4.33;
  const hours = kind === "minutes" && Number(b.volume) ? (change * Number(b.volume) * per) / 60 : kind === "hours" ? change * per : null;
  const rands = hours != null && Number(b.hourly) ? hours * Number(b.hourly) : null;
  return { before, after, change, pct, kind, hours, rands };
}
const loadedHourly = (salary) => Math.round((Number(salary) * 1.3) / 173);

// ---------- The Re-Charge Method (METHOD.md §2–3) ----------
const PHASES = ["Discovery", "Opportunity mapping", "Proof of concept", "ROI validation", "Production", "Adoption", "Optimisation"];
// The same seven phases under the names clients are sold (method.html steps 01-07): Find, Prove, Build and run
const METHOD_STAGES = [["Find", 0, 2], ["Prove", 2, 4], ["Build and run", 4, 7]];
const PHASE_STAGE = (i) => (METHOD_STAGES.find(([, a, b]) => i >= a && i < b) || METHOD_STAGES[2])[0];
const MAP_FIELDS = [
  ["people", "People", "Who does the work, who decides, who would use the system"],
  ["processes", "Processes", "The steps, in order, as they really happen"],
  ["software", "Software", "Every system the work touches"],
  ["data", "Data", "Where the information lives, and how clean it is"],
  ["bottlenecks", "Bottlenecks", "Where work waits or piles up"],
  ["repetitive", "Repetitive work", "What gets done the same way, over and over"],
  ["decisions", "Decision points", "Where a person has to judge, approve or choose"],
];
const OPP_FACTORS = [["time", "Time saved", ""], ["revenue", "Revenue potential", ""], ["difficulty", "Implementation difficulty", "higher = harder"], ["data", "Data availability", ""], ["risk", "Risk if it's wrong", "higher = riskier"], ["adoption", "Employee adoption", ""]];
// Same formula and gates as the public Method page (script.js oppScore). Keep them in step.
function oppScore(o) {
  const n = (k) => Math.max(0, Math.min(10, Number(o[k]) || 0));
  return Math.round(2.5 * n("time") + 1.5 * (n("revenue") + n("data") + n("adoption") + (10 - n("difficulty")) + (10 - n("risk"))));
}
function oppVerdict(o) {
  const score = oppScore(o);
  const gate = Number(o.data) <= 3 ? "Fix the data first" : Number(o.risk) >= 8 ? "Human in the loop only" : "";
  const [band, label] = score >= 70 ? ["hi", "Build first"] : score >= 50 ? ["mid", "Next in line"] : ["lo", "Park it"];
  return { score, band, label, gate };
}
const discOf = (p) => p?.details?.discovery || {};
const phaseOf = (p) => Math.max(0, Math.min(7, Number(discOf(p).phase) || 0));   // phases completed
const usesMethod = (p) => isAiLead(p) || Boolean(p?.details?.discovery);
function methodSummary(p) {
  const d = discOf(p), map = d.map || {}, b = baselineOf(p), r = roiOf(b, afterOf(p));
  const opps = (d.opps || []).map((o) => ({ ...o, ...oppVerdict(o) })).sort((x, y) => y.score - x.score);
  const lines = [`${p.business || p.name || p.ref}: discovery summary`, ""];
  const mapped = MAP_FIELDS.filter(([k]) => map[k]);
  if (mapped.length) { lines.push("PROCESS MAP"); mapped.forEach(([k, l]) => lines.push(`${l}: ${map[k]}`)); lines.push(""); }
  if (b) { lines.push("BASELINE", `${b.metric}: about ${b.value}${metricKind(b.metric) === "minutes" ? " minutes each" + (b.volume ? `, about ${b.volume} ${b.unit}` : "") : " " + b.unit} (${(b.how || "recorded").toLowerCase()})`); if (r) lines.push(`After: about ${r.after}${r.pct != null ? ` (${r.pct}% less)` : ""}${r.hours != null ? `, about ${Math.round(r.hours)} hours a month back` : ""}${r.rands != null ? `, roughly R${Math.round(r.rands).toLocaleString("en-ZA")} a month` : ""}`); lines.push(""); }
  if (opps.length) { lines.push("OPPORTUNITIES, RANKED (score out of 100)"); opps.forEach((o, i) => lines.push(`${i + 1}. ${o.name}: ${o.score} (${o.label}${o.gate ? "; " + o.gate.toLowerCase() : ""})`)); lines.push(""); }
  lines.push(`Phase: ${phaseOf(p) >= 7 ? "all seven done" : `${phaseOf(p) + 1} of 7, ${PHASES[phaseOf(p)]}`}`);
  return lines.join("\n");
}

const sayAct = (p, label, tpl = "") => { const r = reachBy(p); return r === "call" ? { label: `Call ${p.phone}`, act: "call" } : r ? { label: `${label} (${r === "email" ? "email" : "WhatsApp"})`, act: `send:${r}:${tpl}` } : { label: "Add a phone or email", act: "details" }; };
// Our promises (terms §10): a reply by 17:00 the next business day. replyBy below is our own,
// stricter internal target (an hour in the day, 8am the next morning), and a website live within 3 weeks of
// the client approving the design, or their first month of Care is free.
const LIVE_DAYS = 21;
function replyBy(iso) {
  const t = new Date(iso), h = t.getHours() + t.getMinutes() / 60;
  if (h >= 7 && h < 21) return new Date(t.getTime() + 3600e3);
  const d = new Date(t); if (h >= 21) d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d;
}
const hhmm = (d) => d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
// The client's real deadline (terms §10, and the site's own rcReplyBy): 17:00 on the next weekday after they wrote.
// replyBy above stays as our own 1-hour goal; only this one is a promise, so only this one makes a lead late.
function promiseBy(iso) { const d = new Date(iso); do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); d.setHours(17, 0, 0, 0); return d; }
const replySub = (p) => {
  const now = Date.now(), by = replyBy(p.created_at), pr = promiseBy(p.created_at), day = (d, today = "") => (d.toDateString() === new Date().toDateString() ? today : " " + fmtD(d.toISOString()));
  if (now > pr.getTime()) return now - pr.getTime() < 5 * 864e5 ? `Late: we promised a reply by 17:00${day(pr, " today")}` : "";
  return `${by.getTime() < now ? "1-hour goal passed" : `Reply by ${hhmm(by)}${day(by)} (our 1-hour goal)`} · promised by 17:00${day(pr, " today")}`;
};
// Replied since they last wrote (their enquiry, or a message sorted onto the lead): the ball is in their court
const repliedSince = (p) => { const out = lastOutAt(p); return out && out > Math.max(Date.parse(p.created_at) || 0, Date.parse(p.ai_sort?.at || 0) || 0) ? out : 0; };
const liveBy = (p) => (p.details?.designOkAt ? new Date(Date.parse(p.details.designOkAt) + LIVE_DAYS * 86400e3) : null);
function nextStep(p) {
  const st = stageOf(p.status), now = Date.now(), d = p.details || {};
  const dueAt = p.next_action_at ? Date.parse(p.next_action_at) : null;
  const followUpDue = Boolean(dueAt && dueAt <= endOfToday().getTime());
  const S_ = (title, o = {}) => ({ title, due: false, urgency: 3, actions: [], ...o });
  if (p.spam) return S_("Marked as spam: hidden from your lists", { actions: [{ label: "Not spam", act: "unspam" }] });
  if (p.archived) return S_("Archived: hidden from your lists", { actions: [{ label: "Restore", act: "unarchive" }] });
  if (st === "declined") return S_(`Lost${p.declined_reason ? ": " + p.declined_reason : ""}`, { actions: [{ label: "Reopen", act: "reopen" }] });

  let step;
  const tr = trialOpen(p);
  if (tr) step = trialStep(p, tr, S_);
  else if (st === "new" && d.formType === "Free online check" && !p.quote_cents && !p.preview_url && !["queued", "building", "built"].includes(p.build_status)) {
    step = S_("Free online check: look them up, then WhatsApp them 3 quick fixes", { due: true, urgency: 1, actions: [{ ...sayAct(p, "Send their 3 fixes", "check_reply"), primary: true }, { label: "Look them up on Google", act: "lookup" }, { label: "Build a free mockup", act: "build:queue" }] });
  }
  else if (isGbp(p) && ["new", "in_development", "live"].includes(st)) {
    const bal = balanceDue(p);
    if (st === "new") step = S_("Google profile setup (R450): get their hours, services and photos", { due: true, urgency: 1, actions: [{ ...sayAct(p, "Message them", "gbp_start"), primary: true }, { ...sayAct(p, "Ask for Manager access", "gbp_access") }, { label: "Start the work", act: "gbp:start" }] });
    else if (st === "in_development") step = bal > 0
      ? S_(`Set up their Google profile (${(p.details?.gbpSteps || []).length}/${GBP_STEPS.length} done), then collect ${money(bal)}`, { actions: [{ ...sayAct(p, "Send verification steps", "gbp_verify") }, { label: "Make their review card", act: "gbp:card" }, { label: "Ask for payment", act: "balance:request", primary: true }, { label: "It's done", act: "gbp:done" }] })
      : S_("Paid: finish their Google profile and mark it done", { due: true, urgency: 2, actions: [{ label: "It's done", act: "gbp:done", primary: true }, { label: "Make their review card", act: "gbp:card" }] });
    else step = S_("Google profile done: offer them a website (the R450 comes off)", { actions: [{ ...sayAct(p, "Offer a website", "gbp_upsell"), primary: true }, { ...sayAct(p, "Ask for a review", "review") }, { label: "Make a before/after reel", act: "reel" }] });
  }
  else if (p.build_status === "built") step = S_("The free mockup is ready: check it, then send it", { due: true, urgency: 1, actions: [{ label: "Open mockup", act: "mockup:open" }, { ...sayAct(p, "Send the link", "mockup"), act: reachBy(p) === "call" ? "call" : `send:${reachBy(p)}:mockup:reviewed`, primary: true }] });
  else if (p.build_status === "failed") step = S_("The automatic mockup failed", { why: p.build_log, due: true, urgency: 1, actions: [{ label: "Try again", act: "build:queue", primary: true }] });
  else if (st === "prospect") {
    if (!reachBy(p)) step = S_("Find a phone number or email for them", { actions: [{ label: "Add contact details", act: "details", primary: true }] });
    else if (p.status === "contacted") step = S_(dueAt ? `Contacted: follow up ${fmtD(p.next_action_at)} if they don't reply` : "Contacted: waiting for a reply", { actions: [sayAct(p, "Follow up", aiPitch(p) ? "ai_follow" : "follow_up")] });
    else step = d.demoSlug
      ? S_("Their demo assistant is ready: send them the link", { due: true, urgency: 1, actions: [{ ...sayAct(p, "Send the demo", "ai_demo"), primary: true }, { label: "Open the demo", act: "demo:open" }, { label: "Edit what it knows", act: "demo:build" }] })
      : S_("Introduce yourself: build them a demo assistant, or send an intro", { actions: [{ label: "Build their demo assistant", act: "demo:build", primary: true }, { ...sayAct(p, "Offer a process review", "ai_intro") }, { ...sayAct(p, "Send website intro", "intro") }] });   // the R450 Google profile setup is no longer offered
  } else if (st === "new") {
    const cd = isCall(p) ? callDate(p) : null;
    if (cd && cd >= startOfToday() && !d.calledAt) step = S_(`Call them ${cd < endOfToday() ? "today" : fmtD(cd)}${d.callTime ? ", " + d.callTime : ""}`, { due: cd < endOfToday(), urgency: 0, actions: [p.phone ? { label: `Call ${p.phone}`, act: "call", primary: true } : sayAct(p, "Reply"), { label: "Add to calendar", act: "ics" }] });
    else if (["queued", "building"].includes(p.build_status)) step = S_("The free mockup is being built: it shows up here when it's done", { actions: [{ label: "Check now", act: "build:check" }] });
    else if (usesMethod(p) && !p.quote_cents && phaseOf(p) >= 2 && (discOf(p).opps || []).length && !d.mapSentAt) step = S_("Discovery's done: send them the opportunity map, then the proof-of-concept quote", { due: true, urgency: 1, actions: [{ ...sayFlag(p, "Send the map", "discovery", "mapsent"), primary: true }, { label: "Copy the summary", act: "mapcopy" }, { label: "Write the quote", act: "quote:write" }] });
    else if ((d.formType === "Process review" || (d.formType === "Problem enquiry" && usesMethod(p))) && !p.quote_cents && phaseOf(p) === 0) step = repliedSince(p)
      ? S_("Replied: waiting for them to pick a time for the process review", { sub: `You replied ${fmtDT(new Date(repliedSince(p)).toISOString())}. Set a reminder if they go quiet.`, actions: [{ ...sayAct(p, "Suggest a time again", "review_call") }, ...(p.phone ? [{ label: `Call ${p.phone}`, act: "call" }] : []), { label: "Map their process", act: "map", primary: true }] })
      : S_("Process review: book the 30-minute call", { sub: replySub(p), due: true, urgency: now > promiseBy(p.created_at).getTime() ? 0 : 1, actions: [{ ...sayAct(p, "Suggest a time", "review_call"), primary: true }, ...(p.phone ? [{ label: `Call ${p.phone}`, act: "call" }] : []), { label: "Map their process", act: "map" }] });
    else if (d.formType === "Free mockup request" && (!p.build_status || p.build_status === "none") && !p.preview_url) step = S_("Build their free mockup", { due: true, urgency: 1, actions: [{ label: "Build it automatically", act: "build:queue", primary: true }, { label: "Upload my own", act: "mockup:upload" }] });
    else if (p.quote_cents && !p.quote_token) step = S_("Send them the quote", { due: true, urgency: 1, actions: [{ label: "Send quote", act: "quote:send", primary: true }, { label: "Edit quote", act: "quote:write" }] });
    else if (!p.quote_cents && repliedSince(p)) step = S_("Replied: waiting for their answers. Next: write the quote", { sub: `You replied ${fmtDT(new Date(repliedSince(p)).toISOString())}`, actions: [{ label: "Write quote", act: "quote:write", primary: true }, { ...sayAct(p, "Reply again", isAiLead(p) || wantsInbox(p) ? "enquiry_ai" : "enquiry") }] });
    else if (!p.quote_cents) step = S_("Reply, then write their quote", { sub: sourceOf(p) !== "outreach" ? replySub(p) : "", due: !dueAt, urgency: sourceOf(p) !== "outreach" && now > promiseBy(p.created_at).getTime() ? 0 : 1, actions: [{ ...sayAct(p, "Reply", isAiLead(p) || wantsInbox(p) ? "enquiry_ai" : "enquiry"), primary: true }, { label: "Write quote", act: "quote:write" }] });
    else step = S_("Talk to them, then send the quote", { actions: [{ label: "Send quote", act: "quote:send", primary: true }] });
  } else if (st === "quote_sent") {
    const expired = p.quote_valid_until && p.quote_valid_until < localDate() && p.quote_status !== "accepted";
    if (p.quote_status === "accepted" && !p.deposit_paid) step = S_(`They accepted: waiting for ${depositLabel(p)}`, { due: now - Date.parse(p.quote_accepted_at || p.updated_at) > 86400e3, urgency: 1, actions: [{ ...sayAct(p, "Send a reminder", "deposit"), primary: true }, { label: "I received a payment", act: "pay:deposit" }] });
    else if (!p.quote_token) step = S_("Send them the quote", { due: true, urgency: 1, actions: [{ label: "Send quote", act: "quote:send", primary: true }] });
    else if (expired) step = S_("The quote has expired: send a fresh one", { due: true, urgency: 2, actions: [{ label: "Send new quote", act: "quote:send", primary: true }] });
    else if (p.quote_status === "viewed" && p.quote_viewed_at && now - Date.parse(p.quote_viewed_at) > 3 * 86400e3) step = S_(`They opened the quote ${rel(p.quote_viewed_at)} but haven't answered`, { due: true, urgency: 2, actions: [{ ...sayAct(p, "Follow up", "quote_follow"), primary: true }] });
    else if (p.quote_status === "sent" && p.quote_sent_at && now - Date.parse(p.quote_sent_at) > 2 * 86400e3) step = S_("They haven't opened the quote yet: give them a nudge", { due: true, urgency: 2, actions: [{ ...sayAct(p, "Nudge", "quote_follow"), primary: true }] });
    else step = S_(p.quote_status === "viewed" ? "They've seen the quote: waiting for their answer" : "Waiting for them to open the quote", { actions: [{ label: "Resend quote", act: "quote:send" }] });
  } else if (st === "in_development") {
    const bal = balanceDue(p), c = d.content || {}, gotContent = Boolean(["about", "services", "hours", "area", "extra"].some((k) => c[k]) || c.files?.length);
    // Before the work starts, because afterwards there is nothing left to compare to.
    if (!baselineOf(p) && !d.baselineSkipped) step = S_("Record the starting number, before anything changes", { sub: "How long one reply or quote takes now, or how many enquiries go unanswered. In three months it shows what the plan was worth.", due: true, urgency: 1, actions: [{ label: "Record the starting number", act: "baseline", primary: true }, { label: "Nothing to measure here", act: "flag:baselineSkipped" }] });
    else if (!gotContent && p.quote_token && String(p.quote_accepted_at || "") >= "2026-10-05" && !isGbp(p)) step = S_("Get their logo, photos and prices (they add them on their quote page)", { due: !p.next_action_at, urgency: 2, actions: [{ ...sayAct(p, "Ask for their content", "content_ask"), primary: true }, ...(bal > 0 ? [{ label: "Ask for the balance", act: "balance:request" }] : []), { label: "Site is live", act: "golive" }] });
    else step = bal > 0 ? S_(`Build it, then collect the balance (${money(bal)})`, { actions: [{ label: "Ask for the balance", act: "balance:request", primary: true }, { label: "I received a payment", act: "pay:balance" }, { label: "Site is live", act: "golive" }] })
      : S_(d.payMonthly?.cents ? "First month paid: build it, then put it live (monthly billing starts then)" : "Paid in full: put it live", { due: true, urgency: 2, actions: [{ label: "Site is live", act: "golive", primary: true }] });
    if (!isGbp(p)) {
      const by = liveBy(p);
      if (!by) step = { ...step, actions: [...step.actions, { label: "They approved the design", act: "design:ok" }] };
      else {
        const left = (by - now) / 86400e3;
        step = { ...step, sub: left < 0 ? `Late: it was promised live by ${fmtD(by.toISOString())}, so their first month of Care is free` : `3-week promise: live by ${fmtD(by.toISOString())} (${Math.ceil(left)} day${Math.ceil(left) === 1 ? "" : "s"} left)`, due: step.due || left <= 2, urgency: left < 0 ? 0 : left <= 2 ? Math.min(step.urgency, 1) : step.urgency };
      }
    }
  } else if (st === "live") {
    const liveDays = d.liveAt ? (now - Date.parse(d.liveAt)) / 86400e3 : null;
    const roiNow = roiOf(baselineOf(p), afterOf(p));
    if (usesMethod(p) && baselineOf(p) && !afterOf(p) && liveDays != null && liveDays >= 14) step = S_("Two weeks live: measure the same number again", { sub: `Baseline: ${baselineLine(baselineOf(p))}`, due: true, urgency: 1, actions: [{ label: "Measure it now", act: "after", primary: true }] });
    else if (usesMethod(p) && roiNow && !d.resultSentAt) step = S_("Share the result with them", { sub: resultLine(p), due: true, urgency: 2, actions: [{ ...sayFlag(p, "Send the result", "results", "shared"), primary: true }] });
    else if (usesMethod(p) && roiNow && roiNow.pct > 0 && !d.caseAskedAt && !d.caseStudy?.approved) step = S_("Ask if you can share it as a case study", { sub: "Every measured result is the best sales tool you have", due: true, urgency: 2, actions: [{ ...sayFlag(p, "Ask permission", "case_study", "permission"), primary: true }, { label: "Draft the case study", act: "case" }] });
    else if (p.client_id && liveDays != null && !d.launchSent && !usesMethod(p)) step = S_("It's live: send their launch pack", { sub: "A post for their socials, plus how to get customers to the site", due: true, urgency: 2, actions: [{ label: "Make their announcement post", act: "share:launch" }, { ...sayFlag(p, "Send the launch message", "launch", "launched"), primary: true }, { label: "Skip", act: "flag:launchSent" }] });
    else if (p.client_id && liveDays != null && !d.reviewAsked && liveDays >= 3 && liveDays < 60) step = S_("Ask for a Google review: they're happiest right now", { due: true, urgency: 2, actions: [{ ...sayFlag(p, "Ask for a review", "review", "asked"), primary: true }, { label: "Skip", act: "flag:reviewAsked" }] });
    else step = !p.client_id ? S_("Set up their hosting & care plan", { due: true, urgency: 2, actions: [{ label: "Set up care plan", act: "golive", primary: true }] })
      : S_("All done: ask for a Google review", { actions: [{ ...sayAct(p, "Ask for a review", "review") }, { label: "Make a before/after reel", act: "reel" }, { label: "Open client", act: "client" }] });
  }
  if (followUpDue && OPEN.has(p.status)) {
    const late = dueAt < startOfToday().getTime();
    return { ...step, title: `${late ? "Overdue: " : "Today: "}${p.next_action || "follow up"}`, sub: step.title, due: true, urgency: late ? 0 : 1 };
  }
  return step;
}
const tplByName = (kind, name) => { const n = String(name || "").toLowerCase().trim(); if (!n) return null; const ts = S.templates.filter((t) => t.kind === kind && !t.archived); return ts.find((t) => t.name.toLowerCase() === n) || ts.find((t) => t.name.toLowerCase().includes(n)) || null; };
const stepButtons = (p, step, onPage = true) => step.actions.map((a) => {
  const cls = `btn ${a.primary ? "btn--primary" : "btn--ghost"}`;
  if (a.act === "call") return `<a class="${cls}" href="${esc(telLink(p.phone))}">${esc(a.label)}</a>`;
  if (a.act === "mockup:open") { const u = p.preview_url || S.sites.find((x) => x.id === p.build_site_id)?.url; return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(a.label)}</a>` : ""; }
  return onPage ? `<button type="button" class="${cls}" data-do="${esc(a.act)}">${esc(a.label)}</button>` : `<a class="${cls}" href="#/p/${esc(p.id)}?do=${encodeURIComponent(a.act)}">${esc(a.label)}</a>`;
}).join("");

// ---------- project detail ----------
const keepOpen = new Set();   // cards to show open on the next render of the lead (e.g. the reminder you just set)
async function renderProject(id, q = new URLSearchParams()) {
  // keep unsaved typing across re-renders (note, quote lines, time, forms)
  const draft = {};
  if (view.querySelector("#noteForm")) {
    draft.note = $("noteForm")?.note?.value || "";
    draft.time = { m: $("timeForm")?.minutes?.value || "", n: $("timeForm")?.note?.value || "" };
    draft.quote = [...view.querySelectorAll("#quoteRows .qrow")].map((r) => ({ desc: r.querySelector("[name=desc]").value, cents: r.querySelector("[name=cents]").value }));
    draft.quoteDirty = view.querySelector("#quoteForm")?.dataset.dirty === "1";
  }
  let p = byId(id) || await api.projects.get(id);
  if (!p) { view.innerHTML = '<p class="adm-error">Lead not found.</p>'; return; }
  const [events, msgs] = await Promise.all([api.events.list(id), api.messages.list(id).catch(() => [])]);
  const msgById = Object.fromEntries(msgs.map((m) => [m.id, m]));
  const pays = S.payments.filter((x) => x.project_id === id);
  const reqs = S.requests.filter((r) => r.project_id === id && r.status !== "cancelled");
  const client = p.client_id ? clientById(p.client_id) : null;
  const rel_ = related(p);
  // a new website quote starts with the first year of Care in it (pricing page promise)
  const isSite = (p.category || []).some((c) => /website|mockup/i.test(c)) || /website|site\b/i.test(p.details?.projectType || "") || sourceOf(p) === "outreach";
  const items = Array.isArray(p.quote_items) && p.quote_items.length ? p.quote_items
    : p.quote_cents ? [{ desc: "", cents: p.quote_cents }]
    : isGbp(p) ? [{ desc: "Google profile setup (once-off)", cents: GBP_PRICE }]
    : trialOf(p) || (onOffer(p) && !(p.category || []).some((c) => /website|mockup/i.test(c))) ? inboxLines(p)
    : isSite ? [{ desc: "", cents: 0 }, { desc: CARE_LINE, cents: PLAN_PRICE.care }, ...referralLine(p)]
    : [{ desc: "", cents: 0 }];
  const mins = minutesFor(id);
  const d = p.details || {};
  const step = nextStep(p);
  const detailRows = Object.entries(d).filter(([k, v]) => !k.startsWith("_") && !HIDE_DETAIL.has(k) && v != null && String(v).trim() !== "")
    .map(([k, v]) => `<dt>${esc(DETAIL_LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()))}</dt><dd>${esc(typeof v === "string" ? v : JSON.stringify(v))}</dd>`).join("");
  const svg = { mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>', wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19.2Z"/><path d="M9 9.5c.3 2.4 2.1 4.2 4.5 4.5l1-1 2 1-.5 1.5c-3.5.5-8-4-7.5-7.5L10 8l1 2Z"/></svg>', tel: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>' };
  const camp = p.channel && S.campaigns.find((c) => c.code === p.channel);
  const paid = pays.filter((x) => x.status === "succeeded").reduce((a, x) => a + (x.amount_cents || 0), 0);
  const bal = balanceDue(p);
  const F = S.features;
  // Sections fold away; ones that don't fit this stage are hidden (still there for buttons that jump to them)
  const st = stageOf(p.status), ownSites = S.sites.filter((x) => x.project_id === p.id);
  const show = { quote: Boolean(p.quote_cents) || ["new", "quote_sent"].includes(st) || Boolean(trialOf(p)), pay: Boolean(p.quote_cents || pays.length || reqs.length || trialOf(p) || p.details?.inbox) || ["quote_sent", "in_development", "live"].includes(st), mock: isSite || Boolean(p.preview_url || ownSites.length) };
  const hid = (k) => (show[k] ? "" : " hidden");

  view.innerHTML = `
  <div class="adm-head">
    <div><span class="eyebrow"><a href="#/pipeline">Leads</a> · ${esc(p.ref)} · ${esc(SOURCES[sourceOf(p)] || "")} · ${esc(rel(p.created_at))}</span>
      <h1>${F.star && p.starred ? '<span class="star">★</span> ' : ""}${esc(p.business || p.name || "Untitled")}</h1>
      ${p.business && p.name ? `<p class="muted">${esc(p.name)}</p>` : ""}</div>
    <details class="adm-menu"><summary class="btn btn--ghost btn--small">More<span class="adm-chev" aria-hidden="true"></span></summary><div class="adm-menu__list">
      ${F.star ? `<button type="button" data-act="star">${p.starred ? "Remove star" : "Star it"}</button><button type="button" data-act="snooze">${isSnoozed(p) ? "Stop hiding from Today" : "Hide from Today for 3 days"}</button>` : ""}
      <button type="button" data-act="assistant">${p.details?.demoSlug ? "Their AI assistant…" : "Build them an AI assistant…"}</button>
      <button type="button" data-act="baseline">${baselineOf(p) ? "The number we're improving…" : "Write down the number…"}</button>
      ${usesMethod(p) ? "" : '<button type="button" data-act="method">Use the method (AI work)…</button>'}
      <button type="button" data-act="archive">${p.archived ? "Restore from archive" : "Archive (hide it)"}</button>
      ${p.spam ? '<button type="button" data-act="unspam">Not spam</button>' : '<button type="button" data-act="spam">Mark as spam</button>'}
      <button type="button" data-act="delete" class="is-danger">Delete for good…</button>
    </div></details>
  </div>

  <section class="adm-card adm-next" aria-label="Next step">
    <span class="eyebrow">Next step</span>
    <h2>${esc(step.title)}</h2>
    ${step.sub ? `<p class="muted small">${esc(step.sub)}</p>` : ""}${step.why ? `<p class="adm-error tiny" style="white-space:pre-wrap">${esc(step.why)}</p>` : ""}
    ${step.actions.length ? `<div class="adm-inline-actions">${stepButtons(p, step)}</div>` : ""}
    <div class="adm-contact">
      ${p.email ? `<button type="button" class="btn btn--ghost" data-compose="email">${svg.mail} Email</button>` : ""}
      ${isMobile(p.phone) ? `<button type="button" class="btn btn--ghost" data-compose="whatsapp">${svg.wa} WhatsApp</button>` : ""}
      ${p.phone ? `<a class="btn btn--ghost" href="${esc(telLink(p.phone))}">${svg.tel} Call</a>` : ""}
    </div>
  </section>

  ${stageBar(p)}
  ${aiLine(p)}
  <div id="callsBox"></div>
  <div class="pill-row adm-badges">${leadBadges(p, { client, bal, paid })}</div>
  <form class="adm-form adm-lost" id="lostForm" hidden><label>Why didn't it go ahead? <span class="muted" style="font-weight:400">(optional)</span><input name="reason" value="${esc(p.declined_reason || "")}" placeholder="e.g. budget, timing, went elsewhere" /></label><div class="btn-row"><button type="button" class="btn btn--ghost btn--small" data-lost-cancel>Cancel</button><button class="btn btn--primary btn--small" type="submit">Mark as lost</button></div></form>

  <div class="adm-detail">
    <div>
      <details class="adm-card adm-more-details" id="askCard"${p.status === "new" ? " open" : ""}>
        <summary><h2>What they asked for</h2><span class="muted small">${esc(d.formType || "Enquiry")}</span></summary><div class="adm-fold">
        ${p.goal ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:0.8rem">${esc(p.goal)}</p>` : ""}
        ${detailRows ? `<dl class="adm-kv">${detailRows}</dl>` : (!p.goal ? '<p class="muted small">Nothing written down yet.</p>' : "")}
        <dl class="adm-kv" style="margin-top:0.8rem">
          ${p.email ? `<dt>Email</dt><dd><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd>` : ""}
          ${p.phone ? `<dt>Phone</dt><dd>${esc(p.phone)}${p.phone && !isMobile(p.phone) ? ' <span class="muted tiny">(landline — call, not WhatsApp)</span>' : ""}</dd>` : ""}
          ${d.aiSignal || d.aiPotential || d.sizeHint ? `<dt>AI opportunity</dt><dd>${d.aiPotential ? `<span class="chip chip--pot" data-p="${esc(d.aiPotential)}">${esc(POTENTIAL[d.aiPotential] || d.aiPotential)}</span> ` : ""}${d.aiSignal ? esc(d.aiSignal) : ""}${d.sizeHint ? `<br><span class="tiny muted">Size: ${esc(d.sizeHint)}</span>` : ""}</dd>` : ""}
          ${p.review_count != null || p.rating != null || p.activity_note ? `<dt>On Google</dt><dd>${p.rating != null ? "★ " + esc(Number(p.rating).toFixed(1)) : ""}${p.review_count != null ? ` from ${esc(p.review_count)} review${p.review_count === 1 ? "" : "s"}` : ""}${p.activity_note ? `<br><span class="muted small">${esc(p.activity_note)}</span>` : ""}${p.activity_score != null ? `<br><span class="tiny muted">Established score ${esc(p.activity_score)}/100</span>` : ""}</dd>` : ""}
          ${p.details?.referredBy ? `<dt>Referred by</dt><dd><a href="#/c/${esc(p.details.referredBy.clientId)}">${esc(p.details.referredBy.name || "a client")}</a> <span class="tiny muted">${p.details.referralRewarded ? "free year of Care given" : "gets a free year of Care when this goes live"} · this lead gets R250 off their website (already on new quotes)</span></dd>` : sourceOf(p) === "credit" ? '<dt>Found you via</dt><dd>A "Website by Re-Charge" link on a client\'s site</dd>' : ""}
          ${p.location ? `<dt>Where</dt><dd>${esc(p.location)}</dd>` : ""}
          ${ownSite(p) ? `<dt>Their website</dt><dd><a href="${esc(ownSite(p))}" target="_blank" rel="noopener">${esc(shortUrl(ownSite(p)))} ↗</a></dd>` : isSocial(p.website) ? `<dt>Their website</dt><dd>None, only <a href="${esc(p.website)}" target="_blank" rel="noopener">${/instagram/i.test(p.website) ? "Instagram" : "Facebook"} ↗</a></dd>` : noWebsite(p) ? '<dt>Their website</dt><dd class="muted">None found</dd>' : ""}
          ${p.business || p.location ? `<dt>Google</dt><dd>${googleUrlOf(p) ? `<a href="${esc(googleUrlOf(p))}" target="_blank" rel="noopener">Their Google profile ↗</a>` : `<a href="${esc(googleSearchUrl(p))}" target="_blank" rel="noopener">Look them up on Google Maps ↗</a> <span class="tiny muted">no profile link saved</span>`}</dd>` : ""}
          ${p.details?.sourceUrl && !isGoogleUrl(p.details.sourceUrl) ? `<dt>Found on</dt><dd><a href="${esc(p.details.sourceUrl)}" target="_blank" rel="noopener">${esc(shortUrl(p.details.sourceUrl).split("/")[0])} ↗</a></dd>` : ""}
          ${p.budget ? `<dt>Budget</dt><dd>${esc(p.budget)}</dd>` : ""}
          ${p.deadline ? `<dt>Deadline</dt><dd>${esc(p.deadline)}</dd>` : ""}
          ${p.indicative_price ? `<dt>Our estimate</dt><dd>${esc(p.indicative_price)}</dd>` : ""}
          ${camp ? `<dt>Came from</dt><dd>${esc(camp.name)}</dd>` : ""}
        </dl>
        ${rel_.length ? `<div class="adm-return"><span class="badge-return">Been in touch before</span> Also appears as ${rel_.map((o) => `<a href="#/p/${esc(o.id)}">${esc(o.ref)}</a> <span class="muted">(${esc(STAGE[o.status]?.label || o.status)}, ${esc(rel(o.created_at))})</span>`).join(", ")}</div>` : ""}
      </div></details>

      ${(() => {
        const b = baselineOf(p), stg = stageOf(p.status);
        if (!b && !["in_development", "live"].includes(stg)) return "";
        if (!b) return `<section class="adm-card adm-base adm-base--empty" style="margin-top:1rem"><span class="eyebrow">The number we're improving</span><p class="small">Nothing written down yet. Take it before the work starts: afterwards there's nothing left to compare to.</p><div class="adm-inline-actions"><button type="button" class="btn btn--primary btn--small" data-do="baseline">Record the starting number</button></div></section>`;
        const af = afterOf(p), r = roiOf(b, af), mins = metricKind(b.metric) === "minutes";
        const unitTxt = mins ? `min each${b.volume ? ` · ${esc(b.volume)} ${esc(b.unit)}` : ""}` : esc(b.unit);
        return `<section class="adm-card adm-base" style="margin-top:1rem"><span class="eyebrow">The number we're improving</span>
          <div class="adm-roi">
            <p class="adm-base__num"><b>${esc(b.value)}</b> <span>${unitTxt}</span><small>before</small></p>
            ${af ? `<p class="adm-base__num adm-base__num--after"><b>${esc(af.value)}</b> <span>${mins ? "min each" : esc(b.unit)}</span><small>after${r.pct != null ? ` · ${r.pct > 0 ? "−" : "+"}${Math.abs(r.pct)}%` : ""}</small></p>` : ""}
          </div>
          <p class="small">${esc(b.metric)}</p>
          ${r && (r.hours != null || r.rands != null) ? `<p class="small adm-roi__val">${r.hours != null ? `<b>≈ ${Math.round(r.hours)} hours a month back</b>` : ""}${r.rands != null ? ` · ≈ ${money(Math.round(r.rands) * 100)} a month of staff time` : ""}${r.rands != null && p.quote_cents && r.rands > 0 ? (() => { const c = p.client_id ? clientById(p.client_id) : null, ops = c?.care_amount_cents && isMonthly(c) ? c.care_amount_cents / 100 : 0, net = r.rands - ops; return net > 0 ? ` · pays back the build in ≈ ${(p.quote_cents / 100 / net).toFixed(1)} months${ops ? " after operations" : ""}` : ""; })() : ""}</p>` : ""}
          ${r && r.hours == null && mins ? '<p class="tiny muted">Add how many there are per period on the baseline to turn minutes into hours.</p>' : ""}
          ${r && r.hours != null && r.rands == null ? '<p class="tiny muted">Add their loaded hourly cost on the baseline to put a Rand value on it.</p>' : ""}
          <p class="tiny muted">${esc(b.how || "Recorded")} · written down ${esc(fmtD(b.at))}${b.note ? " · " + esc(b.note) : ""}${af ? ` · after: ${esc((af.how || "recorded").toLowerCase())}, ${esc(fmtD(af.at))}${af.note ? " · " + esc(af.note) : ""}` : ""}</p>
          <div class="adm-inline-actions">${["in_development", "live"].includes(stg) ? `<button type="button" class="btn btn--${af ? "ghost" : "primary"} btn--small" data-do="after">${af ? "Update the after number" : "Measure it now"}</button>` : ""}${r && r.pct > 0 ? `<button type="button" class="btn btn--ghost btn--small" data-do="case">${p.details?.caseStudy?.approved ? "Case study ✓" : p.details?.caseStudy ? "Case study (draft)" : "Write the case study"}</button>` : ""}<button type="button" class="btn btn--ghost btn--small" data-do="baseline">Edit baseline</button></div></section>`;
      })()}
      ${usesMethod(p) ? (() => {
        const d = discOf(p), done = phaseOf(p), map = d.map || {}, filled = MAP_FIELDS.filter(([k]) => map[k]).length;
        const opps = (d.opps || []).map((o, i) => ({ ...o, i, ...oppVerdict(o) })).sort((x, y) => y.score - x.score);
        return `<details class="adm-card adm-more-details adm-method" style="margin-top:1rem" id="methodCard"${["new", "quote_sent", "in_development"].includes(stageOf(p.status)) ? " open" : ""}><summary><h2>The method</h2><span class="muted small">${done >= 7 ? "all 7 phases done" : `${esc(PHASE_STAGE(done))} · ${esc(PHASES[done])} (phase ${done + 1} of 7)`}</span></summary><div class="adm-fold">
          <div class="adm-phase-groups">${METHOD_STAGES.map(([name, from, to]) => `<div><span class="eyebrow">${esc(name)}</span><ol class="adm-phases">${PHASES.slice(from, to).map((n, j) => { const i = from + j; return `<li class="${i < done ? "is-done" : i === done ? "is-now" : ""}"><span>${i + 1}</span>${esc(n)}</li>`; }).join("")}</ol></div>`).join("")}</div>
          <div class="adm-inline-actions">${done < 7 ? `<button type="button" class="btn btn--primary btn--small" data-do="phase:${done + 1}">Mark ${esc(PHASES[done])} done</button>` : ""}${done > 0 ? `<button type="button" class="btn btn--ghost btn--small" data-do="phase:${done - 1}">Step back</button>` : ""}</div>
          <h3 class="adm-method__h">Process map <span class="muted small">${filled} of 7 filled</span></h3>
          ${filled ? `<dl class="adm-kv">${MAP_FIELDS.filter(([k]) => map[k]).map(([k, l]) => `<dt>${esc(l)}</dt><dd>${esc(map[k])}</dd>`).join("")}</dl>` : '<p class="small muted">Nothing mapped yet: people, processes, software, data, bottlenecks, repetitive work, decision points.</p>'}
          <div class="adm-inline-actions"><button type="button" class="btn btn--ghost btn--small" data-do="map">${filled ? "Edit the map" : "Map their process"}</button></div>
          <h3 class="adm-method__h">Opportunities <span class="muted small">${opps.length ? "ranked" : ""}</span></h3>
          ${opps.length ? `<ol class="adm-opps">${opps.map((o) => `<li><button type="button" data-do="opp:${o.i}"><span>${esc(o.name)}${o.gate ? ` <em class="adm-error">${esc(o.gate)}</em>` : ""}</span><b>${o.score}</b><i data-band="${o.band}">${esc(o.label)}</i></button></li>`).join("")}</ol>` : '<p class="small muted">None scored yet.</p>'}
          <div class="adm-inline-actions"><button type="button" class="btn btn--ghost btn--small" data-do="opp:new">Score an opportunity</button>${filled || opps.length || baselineOf(p) ? '<button type="button" class="btn btn--ghost btn--small" data-do="mapcopy">Copy the summary</button>' : ""}</div>
          <details class="adm-howscore"><summary class="tiny">How the score works</summary><p class="tiny muted">Each opportunity gets 0 to 10 on six things. Time saved counts most (two and a half times); revenue, data, adoption, ease (10 less the difficulty) and safety (10 less the risk) count one and a half times each, for a score out of 100. 70 or more: build it first. 50 to 69: next in line. Under 50: park it.</p></details>
        </div></details>`;
      })() : ""}
      ${(() => { const c = d.content; if (!c) return ""; const files = Array.isArray(c.files) ? c.files : [];
        const rows = [["about", "About"], ["services", "Services & prices"], ["hours", "Hours"], ["area", "Where"], ["extra", "Anything else"]].filter(([k]) => c[k]);
        return `<details class="adm-card adm-more-details" style="margin-top:1rem" id="contentCard"${stageOf(p.status) === "in_development" ? " open" : ""}><summary><h2>Their content</h2><span class="muted small">${rows.length ? "details" : ""}${rows.length && files.length ? " + " : ""}${files.length ? files.length + " file" + (files.length === 1 ? "" : "s") : ""}${c.at ? " · " + esc(rel(c.at)) : ""}</span></summary><div class="adm-fold">
          ${rows.length ? `<dl class="adm-kv">${rows.map(([k, l]) => `<dt>${l}</dt><dd style="white-space:pre-wrap">${esc(c[k])}</dd>`).join("")}</dl>` : '<p class="small muted">No details yet, only files.</p>'}
          ${files.length ? `<div class="adm-cfiles">${files.map((f) => `<a class="adm-file" data-cfile="${esc(f.path)}" href="#" target="_blank" rel="noopener" title="${esc(f.name)}">${/^image\//.test(f.type) ? `<img alt="${esc(f.name)}" loading="lazy" />` : '<span class="adm-file__pdf">PDF</span>'}<span>${esc(f.name)}</span></a>`).join("")}</div>` : ""}
          <p class="tiny muted" style="margin-top:0.6rem">They send these from their quote page. Rows and files are added there, never removed.</p></div></details>`; })()}
      ${isGbp(p) ? (() => { const done = new Set(p.details?.gbpSteps || []); return `<details class="adm-card adm-more-details" style="margin-top:1rem" id="gbpCard"${stageOf(p.status) === "in_development" ? " open" : ""}><summary><h2>Google profile checklist</h2><span class="muted small" id="gbpCount">${done.size}/${GBP_STEPS.length}</span></summary><div class="adm-fold">
        <div class="adm-gbp-steps">${GBP_STEPS.map(([k, t, d]) => `<label class="check"><input type="checkbox" data-gbp-step="${k}" ${done.has(k) ? "checked" : ""} /><span><b>${esc(t)}</b>${d ? `<br><span class="tiny muted">${esc(d)}</span>` : ""}</span></label>`).join("")}</div>
        <div class="adm-inline-actions" style="margin-top:0.7rem"><a class="btn btn--ghost btn--small" href="https://business.google.com/" target="_blank" rel="noopener">Open Google Business ↗</a>${p.details?.gbpLink ? `<a class="btn btn--ghost btn--small" href="${esc(p.details.gbpLink)}" target="_blank" rel="noopener">Their listing ↗</a>` : ""}</div>
        ${reviewRepliesHtml(p.business || p.name)}</div></details>`; })() : ""}
      <details class="adm-card adm-more-details" style="margin-top:1rem" id="liveDemoCard"${q.get("do") === "livedemo" ? " open" : ""}><summary><h2>Live demo</h2><span class="muted small" id="liveDemoSum"></span></summary><div class="adm-fold" id="liveDemoBody"><p class="small muted">Loading…</p></div></details>
      ${isAiLead(p) || p.details?.inbox || trialOf(p) || (p.category || []).some((c) => /inbox/i.test(c)) ? `<details class="adm-card adm-more-details" style="margin-top:1rem" id="inboxCard"${q.get("do") === "inbox" || trialOpen(p) ? " open" : ""}><summary><h2>Inbox Assistant</h2><span class="muted small" id="inboxSum"></span></summary><div class="adm-fold" id="inboxBody"><p class="small muted">Loading…</p></div></details>` : ""}
      <details class="adm-card adm-more-details" style="margin-top:1rem" id="quoteCard"${hid("quote")}>
        <summary><h2>Quote</h2><span class="muted small">${hasOptions(p) ? `${p.quote_options.length} options` + (p.quote_status && p.quote_status !== "none" ? " · " + esc(p.quote_status) : " · not sent") : p.quote_cents ? (p.details?.payMonthly ? moneyIn(p.quote_cents, qCur(p)) + "/month" : moneyIn(p.quote_cents, qCur(p))) + (p.quote_status && p.quote_status !== "none" ? " · " + esc(p.quote_status) : " · not sent") : "not written yet"}${p.quote_choice && p.quote_status === "accepted" ? " · they chose " + esc((p.quote_options || []).find((o) => o.key === p.quote_choice)?.name || p.quote_choice) : ""}</span></summary><div class="adm-fold">
        <form class="adm-form adm-quote" id="quoteForm">
          ${p.quote_status === "accepted" ? "" : `<div class="pill-row adm-qmode" role="radiogroup" aria-label="Quote style"><label class="check"><input type="radio" name="qmode" value="one"${hasOptions(p) ? "" : " checked"} /> One price</label><label class="check"><input type="radio" name="qmode" value="opts"${hasOptions(p) ? " checked" : ""} /> Up to 3 options <span class="muted">(they pick one; mark the one you recommend)</span></label></div>`}
          <label class="adm-qcur">Currency <select name="qcur"${p.quote_status === "accepted" ? " disabled" : ""}>${Object.keys(CUR_SIGN).map((k) => `<option value="${k}"${qCur(p) === k ? " selected" : ""}>${k === "ZAR" ? "Rand (ZAR)" : k}</option>`).join("")}</select><span class="tiny muted" style="font-weight:400">${qCur(p) === "ZAR" ? "Rand: the deposit is paid by card." : "Overseas: they pay by bank transfer to the account under Contracts → Your company details."}</span></label>
          <div id="qOne"${hasOptions(p) ? " hidden" : ""}>
          <div id="quoteRows">${items.map(quoteRow).join("")}</div>
          <div class="adm-inline-actions" style="margin-top:0"><button type="button" class="btn btn--ghost" id="quoteAdd">+ Line</button>${QUOTE_PRESETS.map(([k, label]) => `<button type="button" class="btn btn--ghost" data-preset="${k}">${esc(label)}</button>`).join("")}</div>
          <div class="qtotal"><span class="muted">Total</span><b id="quoteTotal">${moneyIn(p.quote_cents || 0, qCur(p))}</b></div>
          <div class="qtotal qdep"><span class="muted">Deposit they pay when they accept</span><b id="quoteDeposit"></b></div>
          ${paid && p.quote_status !== "accepted" ? `<p class="tiny muted" style="margin:0">Already paid on this lead: ${money(paid)}${trialOf(p) ? " (the Inbox Assistant deposit, which comes off the setup)" : ""}.${p.deposit_paid ? " It counts as their deposit, so the quote page asks for nothing more when they accept." : ""} The balance is the total less what's been paid.</p>` : ""}
          </div>
          <div id="qOpts"${hasOptions(p) ? "" : " hidden"}>${(hasOptions(p) ? p.quote_options : DEFAULT_OPTIONS(p)).slice(0, 3).map(optionEditor).join("")}
            <p class="tiny muted">Leave an option's name empty to drop it. Each option shows the deposit they'd pay when they accept it. The pay-monthly option has no deposit: they pay the first month to start, and the panel sets up the monthly billing when the site goes live.</p></div>
          <label>Timeline <span class="muted" style="font-weight:400">(the client sees this)</span><input name="quote_timeline" value="${esc(p.quote_timeline || "")}" placeholder="e.g. Live 5 working days after the deposit" /></label>
          <label>Notes for the client <span class="muted" style="font-weight:400">(what's included, what isn't)</span><textarea name="quote_notes" rows="2" placeholder="e.g. Includes 2 rounds of changes. Domain registration billed at cost.">${esc(p.quote_notes || "")}</textarea></label>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--ghost btn--small" type="submit">Save quote</button></div>
        </form>
        ${quoteLinkBox(p)}
      </div></details>

      <details class="adm-card adm-more-details" style="margin-top:1rem" id="payCard"${hid("pay")}>
        <summary><h2>Payments</h2><span class="muted small">${paid ? money(paid) + " received" : "nothing received yet"}${bal && paid ? " · " + money(bal) + " still to pay" : ""}</span></summary><div class="adm-fold">
        ${pays.length ? `<ul class="adm-timeline">${pays.map((x) => `<li data-kind="payment"><span class="tl-dot"></span><div><time>${esc(fmtDT(paidAt(x)))} · ${esc(PROVIDER_LABEL[x.provider] || x.provider)} · ${esc(KIND_LABEL[x.kind] || x.kind || "")}</time><p>${money(x.amount_cents)} ${esc(x.note || x.reference ? "— " + (x.note || x.reference) : "")}</p></div></li>`).join("")}</ul>` : ""}
        ${reqs.length ? `<h3 style="font-size:0.85rem;margin-top:0.8rem">Card payment links</h3>${reqs.map((r) => `<div class="adm-req"><span>${money(r.amount_cents)} · ${esc(KIND_LABEL[r.kind] || r.kind)}${r.description ? " · " + esc(r.description) : ""} <span class="status-pill" data-s="${esc(r.status)}">${esc(r.status === "open" ? "waiting" : r.status)}</span></span>${r.status === "open" && r.redirect_url ? `<span class="adm-inline-actions" style="margin:0"><button class="btn btn--ghost" data-copy="${esc(r.redirect_url)}">Copy link</button><button class="btn btn--ghost" data-emaillink="${esc(r.id)}">Send it</button><button class="btn btn--ghost" data-cancelreq="${esc(r.id)}">Cancel</button></span>` : ""}</div>`).join("")}` : ""}
        <div class="adm-inline-actions" style="margin-top:0.8rem"><button class="btn btn--ghost" data-toggle="eftForm">I received a payment</button><button class="btn btn--ghost" data-toggle="reqForm">Send a card payment link</button></div>
        <form class="adm-form" id="reqForm" hidden style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid var(--border)">
          <div class="row2"><label>Amount<span class="money"><input name="amount" inputmode="decimal" required placeholder="3000" /></span></label><label>For<select name="kind"><option value="balance">The balance</option><option value="deposit">The deposit</option><option value="care">Hosting & care</option><option value="other">Something else</option></select></label></div>
          <label>What it's for <span class="muted" style="font-weight:400">(they see this)</span><input name="description" placeholder="e.g. Final payment — ${esc(p.business || "website")}" /></label>
          <p class="tiny muted">Makes a Yoco card-payment link for ${esc(p.ref)}. When they pay, it shows up here by itself.</p>
          <p class="adm-error tiny" id="reqErr" hidden></p>
          <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn--ghost btn--small" data-toggle="reqForm">Cancel</button><button class="btn btn--primary btn--small" type="submit">Create link</button></div>
        </form>
        <form class="adm-form" id="eftForm" hidden style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid var(--border)">
          <div class="row2"><label>Amount received<span class="money"><input name="amount" inputmode="decimal" required placeholder="3000" /></span></label><label>For<select name="kind"><option value="deposit"${p.deposit_paid ? "" : " selected"}>The deposit</option><option value="balance"${p.deposit_paid ? " selected" : ""}>The balance</option><option value="care">Hosting & care</option><option value="other">Something else</option></select></label></div>
          <div class="row2"><label>Date<input type="date" name="date" value="${localDate()}" /></label><label>How<select name="provider"><option value="eft">EFT / bank transfer</option><option value="cash">Cash</option><option value="yoco">Card (Yoco machine)</option><option value="other">Other</option></select></label></div>
          <label>Note <span class="muted" style="font-weight:400">(optional)</span><input name="note" placeholder="e.g. FNB ref 12345" /></label>
          <p class="adm-error tiny" id="eftErr" hidden></p>
          <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn--ghost btn--small" data-toggle="eftForm">Cancel</button><button class="btn btn--primary btn--small" type="submit">Save payment</button></div>
        </form>
      </div></details>

      <details class="adm-card adm-more-details" style="margin-top:1rem" id="mockCard"${hid("mock")}>
        <summary><h2>Mockup &amp; website</h2><span class="muted small">${p.preview_url ? "mockup ready" : ownSites.length ? ownSites.length + " online" : "none yet"}</span></summary><div class="adm-fold">
        ${buildControls(p)}
        ${(() => { const ss = ownSites; return ss.length ? `<div class="adm-inline-actions" style="margin:0 0 0.6rem">${ss.map((x) => `<a class="btn btn--ghost" href="#/sites/${esc(x.id)}">${esc(x.name)}${x.status === "published" ? " ✓ online" : ""}</a>`).join("")}</div>` : ""; })()}
        <form class="adm-form" id="previewForm"><label>Mockup web address <span class="muted" style="font-weight:400">(filled in for you when a mockup is built or uploaded)</span><div class="adm-inline"><input type="url" name="preview_url" value="${esc(p.preview_url || "")}" placeholder="https://re-charge.co.za/previews/…" /><button class="btn btn--ghost btn--small" type="submit">Save</button></div></label></form>
        <p class="tiny muted" style="margin-top:0.5rem">Made one yourself? <a href="#/sites/new?project=${esc(p.id)}">Upload it</a> and it goes online at a private link.</p>
        ${client ? `<p class="small" style="margin-top:0.6rem">Client: <a href="#/c/${esc(client.id)}">${esc(client.name)}</a>${client.care_active ? ` · ${esc(PLAN_LABEL[client.care_plan] || "care plan")}${client.care_renews_at ? ", renews " + esc(fmtD(client.care_renews_at)) : ""}` : " · no care plan"}</p>` : ""}
      </div></details>
      ${Object.values(show).some((v) => !v) ? `<p style="margin-top:0.8rem"><button type="button" class="inline-link tiny" id="showAllCards">Show the other sections (${[!show.quote && "quote", !show.pay && "payments", !show.mock && "mockup"].filter(Boolean).join(", ")})</button></p>` : ""}
    </div>

    <div class="adm-detail__side">
      <details class="adm-card adm-more-details" id="fuCard"${keepOpen.delete("fuCard") ? " open" : ""}>
        <summary><h2>Reminder</h2><span class="muted small">${p.next_action_at ? esc(p.next_action || "Follow up") + " · " + esc(fmtD(p.next_action_at)) : "none set"}</span></summary><div class="adm-fold">
        <form class="adm-form" id="fuForm">
          <label>What to do<input name="next_action" value="${esc(p.next_action || "")}" placeholder="e.g. Follow up on the quote" /></label>
          <label>When<input type="datetime-local" name="next_action_at" value="${esc(datetimeLocal(p.next_action_at))}" /></label>
          <div class="adm-inline-actions" style="margin:0"><button type="button" class="btn btn--ghost" data-due="1">Next working day</button><button type="button" class="btn btn--ghost" data-due="3">In 3 working days</button><button type="button" class="btn btn--ghost" data-due="mon">Next Monday</button>${p.next_action_at ? '<button type="button" class="btn btn--ghost" data-due="0">Clear</button>' : ""}</div>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save reminder</button></div>
        </form>
        <p class="tiny muted" style="margin-top:0.4rem">It shows on Today when it's due. Reminders land on a working day (no weekends or public holidays), at 09:00.</p>
      </div></details>

      ${contractsCard(p)}
      <details class="adm-card adm-more-details" style="margin-top:1rem" id="notesCard"${draft.note ? " open" : ""}>
        <summary><h2>Notes &amp; history</h2><span class="muted small">${events.length}</span></summary><div class="adm-fold">
        <form class="adm-form adm-note" id="noteForm"><textarea name="note" placeholder="Add a note: what you talked about, what they decided…" aria-label="Add a note"></textarea><div class="btn-row"><button class="btn btn--primary btn--small" type="submit">Add note</button></div></form>
        <ul class="adm-timeline" id="timeline">${events.map((e) => eventLi(e, msgById[e.data?.message_id])).join("") || '<li class="adm-empty">Nothing yet.</li>'}</ul>
      </div></details>

      <details class="adm-card adm-more-details" style="margin-top:1rem" id="detailsCard"${q.get("do") === "details" ? " open" : ""}>
        <summary><h2>Details</h2><span class="muted small">contact, where they came from, how good a fit</span></summary>
        <form class="adm-form" id="pForm" style="margin-top:0.8rem">
          <div class="row2"><label>Business<input name="business" value="${esc(p.business || "")}" /></label><label>Contact name<input name="name" value="${esc(p.name || "")}" /></label></div>
          <div class="row2"><label>Email<input type="email" name="email" value="${esc(p.email || "")}" /></label><label>Phone / WhatsApp<input type="tel" name="phone" value="${esc(p.phone || "")}" /></label></div>
          <div class="row2"><label>Where they're based<input name="location" value="${esc(p.location || "")}" placeholder="e.g. Edenvale, Gauteng" /></label><label>Their current website<input inputmode="url" name="website" value="${esc(p.website || "")}" placeholder="None yet" /></label></div>
          ${S.offer?.active || onOffer(p) ? `<label class="check"><input type="checkbox" name="on_offer" ${onOffer(p) ? "checked" : ""} /> Founding client (Inbox Assistant setup ${offerNow().discount >= 100 ? "free" : esc(offerNow().discount) + "% off"}; takes a place when they pay the ${money(INBOX_DEPOSIT)} deposit)</label>` : ""}
          <label>Google profile link <span class="muted" style="font-weight:400">(optional: open them on Google Maps, tap Share, paste the link)</span><input inputmode="url" name="google_url" value="${esc(p.details?.googleUrl || "")}" placeholder="https://maps.app.goo.gl/…" /></label>
          <div class="row2"><label>How good a fit?<select name="potential">${potOptions(p.potential)}</select></label><label>Found them via<select name="source">${Object.entries(SOURCES).map(([v, l]) => `<option value="${v}"${v === sourceOf(p) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label></div>
          <div class="row2"><label>Google rating<input name="rating" inputmode="decimal" value="${esc(p.rating ?? "")}" placeholder="e.g. 4.6" /></label><label>Number of Google reviews<input name="review_count" inputmode="numeric" value="${esc(p.review_count ?? "")}" placeholder="e.g. 120" /></label></div>
          <label>Signs they're active<input name="activity_note" value="${esc(p.activity_note || "")}" placeholder="e.g. Posts on Facebook every week, reviews from this month" /></label>
          <label>What we could sell them<input name="potential_note" value="${esc(p.potential_note || "")}" placeholder="${noWebsite(p) ? "A website" : "e.g. A new site that works on phones"}" /></label>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save details</button></div>
        </form>
      </details>

      ${F.time ? `<div class="adm-card" style="margin-top:1rem">
        <h2>Time <span class="muted">${mins ? hours(mins) + " logged" : "none logged"}${mins && p.quote_cents ? " · " + money(Math.round(p.quote_cents / (mins / 60))) + "/h" : ""}</span></h2>
        <form class="adm-form" id="timeForm"><div class="row2"><label>Minutes<input name="minutes" inputmode="numeric" placeholder="45" required /></label><label>What<input name="note" placeholder="e.g. Build, call, revisions" /></label></div><div class="btn-row" style="justify-content:flex-end"><button class="btn btn--ghost btn--small" type="submit">Log time</button></div></form>
      </div>` : ""}
    </div>
  </div>`;

  // restore drafts
  if (draft.note) $("noteForm").note.value = draft.note;
  if ($("timeForm") && (draft.time?.m || draft.time?.n)) { $("timeForm").minutes.value = draft.time.m; $("timeForm").note.value = draft.time.n; }
  if (draft.quoteDirty && draft.quote?.length) { unfold($("quoteCard")); $("quoteRows").innerHTML = draft.quote.map((r) => quoteRow({ desc: r.desc, cents: randCents(r.cents) })).join(""); $("quoteForm").dataset.dirty = "1"; }

  // --- actions ---
  const rerender = () => renderProject(p.id);
  const patch = async (fields, msg) => {
    try { p = await api.projects.update(p.id, fields); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p; toast(msg || "Saved"); await rerender(); }
    catch (e) { toast(e.message, true); }
  };
  const qf = $("quoteForm");
  const compose = (kind, moment, after) => openCompose(p, kind, { moment, templateId: (MOMENTS[moment] ? tplFor(kind, moment) : tplByName(kind, moment))?.id || defaultTemplate(kind, p.status, p)?.id, onDone: async () => { if (after) await after(); else { S.loaded = 0; await loadAll(true); rerender(); } } });
  const createQuoteLink = async () => {
    const valid = new Date(); valid.setDate(valid.getDate() + 14);
    p = await api.projects.update(p.id, { quote_token: newToken(), quote_status: "sent", quote_sent_at: new Date().toISOString(), quote_viewed_at: null, quote_accepted_at: null, quote_accepted_name: null, quote_decline_reason: null, quote_valid_until: localDate(valid) });
    const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p;
  };
  const run = async (act) => {
    const [a, ...rest] = act.split(":");
    if (a === "send") {
      const [kind, tpl, flag] = rest, mark = (k) => () => patch({ details: { ...(p.details || {}), [k]: new Date().toISOString() } }, "Sent");
      const trialLog = (what) => async () => { await logTrialMessage(p, what); S.loaded = 0; await loadAll(true); rerender(); };
      return compose(kind, tpl, flag === "reviewed" ? () => patch({ build_status: "reviewed" }, "Sent") : flag === "launched" ? mark("launchSent") : flag === "asked" ? mark("reviewAsked") : flag === "mapsent" ? mark("mapSentAt") : flag === "shared" ? mark("resultSentAt") : flag === "permission" ? mark("caseAskedAt") : flag === "agreed" || flag === "result" ? trialLog(flag) : null);
    }
    if (a === "inbox") { const c = $("inboxCard"); if (c) { unfold(c); c.scrollIntoView({ behavior: "smooth", block: "start" }); } return; }
    if (a === "trial") { try { if (await recordTrialResult(p, rest[0])) { await loadAll(true); rerender(); } } catch (ex) { toast(ex.message, true); } return; }
    if (a === "lost") { const f = $("lostForm"); f.hidden = false; f.scrollIntoView({ behavior: "smooth", block: "center" }); return f.reason.focus({ preventScroll: true }); }
    // I received a payment: the lead's own form, set to the deposit or the balance with the amount filled in
    if (a === "pay") {
      unfold($("payCard")); const f = $("eftForm"); f.hidden = false; $("reqForm").hidden = true;
      const kind = rest[0] === "balance" || (!rest[0] && p.deposit_paid) ? "balance" : "deposit";
      f.kind.value = kind; f.amount.value = String(((kind === "deposit" ? depositOf(p) : bal) || 0) / 100 || "");
      f.scrollIntoView({ behavior: "smooth", block: "center" }); return f.amount.focus({ preventScroll: true });
    }
    if (a === "design" && rest[0] === "ok") { if (!confirm(`Start the ${LIVE_DAYS}-day clock? The site is then promised live by ${fmtD(new Date(Date.now() + LIVE_DAYS * 86400e3).toISOString())}.`)) return; return patch({ details: { ...(p.details || {}), designOkAt: new Date().toISOString() } }, `Design approved: live by ${fmtD(new Date(Date.now() + LIVE_DAYS * 86400e3).toISOString())}`); }
    if (a === "flag") return patch({ details: { ...(p.details || {}), [rest[0]]: "skipped" } }, "Done");
    if (a === "share") { window.open(shareCardUrl(rest[0], p), "_blank", "noopener"); return; }
    if (a === "demo" && rest[0] === "open") { const u = demoUrl(p.details?.demoSlug); if (u) window.open(u, "_blank", "noopener"); return; }
    if (a === "demo" && rest[0] === "build") return openDemoBuilder(p, rerender);
    if (a === "baseline") return openBaseline(p, rerender);
    if (a === "after") return openAfter(p, rerender);
    if (a === "case") return openCaseStudy(p, rerender);
    if (a === "map") return openMap(p, rerender);
    if (a === "opp") return openOpp(p, rest[0], rerender);
    if (a === "phase") {
      const n = Math.max(0, Math.min(7, Number(rest[0]) || 0));
      api.events.insert(p.id, "note", n > phaseOf(p) ? `Method: ${PHASES[n - 1]} done` : `Method: back to ${PHASES[n]}`).catch(() => {});
      return patch({ details: { ...(p.details || {}), discovery: { ...discOf(p), phase: n } } }, n > phaseOf(p) ? `${PHASES[n - 1]}: done` : "Stepped back");
    }
    if (a === "mapcopy") { const t = methodSummary(p); try { await navigator.clipboard.writeText(t); toast("Summary copied"); } catch { prompt("Copy the summary:", t); } return; }
    if (a === "ics") return download(`call-${p.ref}.ics`, icsFor(p), "text/calendar");
    if (a === "details") { const dc = $("detailsCard"); dc.open = true; dc.scrollIntoView({ behavior: "smooth", block: "center" }); return dc.querySelector("input[name=email]")?.focus(); }
    if (a === "build") return buildAct(rest[0]);
    if (a === "mockup" && rest[0] === "upload") { location.hash = "#/sites/new?project=" + p.id; return; }
    if (a === "quote" && rest[0] === "write") { unfold($("quoteCard")); $("quoteCard").scrollIntoView({ behavior: "smooth", block: "start" }); return qf.querySelector("[name=desc]")?.focus({ preventScroll: true }); }
    // after a trial that worked: the quote starts with the setup and the first month
    if (a === "quote" && rest[0] === "inbox") {
      const rows = [...$("quoteRows").querySelectorAll(".qrow")].filter((r) => r.querySelector("[name=desc]").value.trim() || randCents(r.querySelector("[name=cents]").value));
      if (!qf.quote_notes.value.trim() && depositsPaid(p)) qf.quote_notes.value = `Your ${money(depositsPaid(p))} deposit is already paid and comes off this total, so there's no deposit to pay when you accept. Then ${money(PLAN_MONTHLY.inbox)} a month (AI usage included), with a 3-month minimum, then month to month.`;
      if (!rows.length) { $("quoteRows").innerHTML = inboxLines(p).map(quoteRow).join(""); qf.dataset.dirty = "1"; const one = qf.querySelector("[name=qmode][value=one]"); if (one && !one.checked) { one.checked = true; $("qOne").hidden = false; $("qOpts").hidden = true; } recalc(); toast("The setup and first month are in: check them, then save the quote"); }
      return run("quote:write");
    }
    if (a === "quote" && rest[0] === "send") {
      if (!p.quote_cents) { toast("Write the quote first — add at least one priced line and save it.", true); return run("quote:write"); }
      if (qf.dataset.dirty === "1") { toast("Save the quote first, then send it.", true); return run("quote:write"); }
      const expired = p.quote_valid_until && p.quote_valid_until < localDate();
      try { if (!p.quote_token || expired || p.quote_status === "declined") await createQuoteLink(); } catch (e) { return toast(e.message, true); }
      const r = reachBy(p);
      if (r === "email" || r === "whatsapp") return compose(r, "quote");
      try { await navigator.clipboard.writeText(quoteUrl(p)); } catch {}
      toast("Quote page ready — link copied. They have no email or mobile number, so share it yourself."); return rerender();
    }
    if (a === "balance") { unfold($("payCard")); const f = $("reqForm"); f.hidden = false; $("eftForm").hidden = true; f.amount.value = String((bal || 0) / 100); f.kind.value = "balance"; f.scrollIntoView({ behavior: "smooth", block: "center" }); return f.description.focus(); }
    if (a === "golive") return openGoLive(p, rerender);
    if (a === "gbp" && rest[0] === "start") return patch({ status: "in_development", ...(p.quote_cents ? {} : { quote_cents: GBP_PRICE, quote_items: [{ desc: "Google profile setup (once-off)", cents: GBP_PRICE }] }) }, "Started: collect the R450 when it's done");
    if (a === "gbp" && rest[0] === "done") {
      const left = GBP_STEPS.length - (p.details?.gbpSteps || []).length;
      if (left > 0 && !confirm(`${left} step${left === 1 ? " isn't" : "s aren't"} ticked on the Google profile checklist. Mark it done anyway?`)) return;
      return patch({ status: "live" }, "Done! Next: offer them a website");
    }
    if (a === "reel") { window.open(reelUrl(p), "_blank", "noopener"); return; }
    if (a === "lookup") { window.open("https://www.google.com/search?q=" + encodeURIComponent([p.business || p.name, p.location].filter(Boolean).join(" ")), "_blank", "noopener"); return; }
    if (a === "gbp" && rest[0] === "card") { window.open(reviewCardUrl(p.business || p.name, p.details?.reviewLink || ""), "_blank", "noopener"); return; }
    if (a === "reopen") return patch({ status: "new", declined_reason: null, archived: false }, "Reopened");
    if (a === "unarchive") return patch({ archived: false }, "Restored");
    if (a === "unspam") return patch({ spam: false, archived: false }, "Restored");
    if (a === "client" && p.client_id) { location.hash = "#/c/" + p.client_id; return; }
  };
  const buildAct = async (act) => {
    if (act === "queue" || act === "retry") {
      if (!p.business && !p.name) return toast("Add a business name first so the mockup has something to say.", true);
      try {
        await api.projects.update(p.id, { build_status: "queued", build_log: null });
        const r = await api.buildSync({ action: "push", projectId: p.id });
        toast(r.pushed ? "Sent to the builder — it runs every hour from 06:00 to 20:00 and the mockup shows up here" : "Queued — it goes to the builder shortly" + (r.errors?.length ? ` (${r.errors[0]})` : ""), Boolean(r.errors?.length));
      } catch (e) { toast("Queued, but couldn't reach the builder yet: " + e.message, true); }
      await loadAll(true); return rerender();
    }
    if (act === "check") { const r = await maybeBuildSync(true); if (r && !r.pulled) toast(r.ok === false ? "Couldn't check: " + r.error : "Not finished yet — the builder runs every hour, 06:00–20:00"); return; }
    if (act === "cancel") return patch({ build_status: "none" }, "Removed from the builder's list");
    if (act === "reviewed") return patch({ build_status: "reviewed" }, "Marked as checked");
    if (act === "send") return run(`send:${reachBy(p) === "call" ? "email" : reachBy(p)}:mockup:reviewed`);
  };
  view.querySelectorAll("[data-do]").forEach((b) => b.addEventListener("click", () => run(b.dataset.do)));
  view.querySelectorAll("[data-gbp-step]").forEach((cb) => cb.addEventListener("change", async () => {
    const steps = [...view.querySelectorAll("[data-gbp-step]:checked")].map((x) => x.dataset.gbpStep);
    try { p = await api.projects.update(p.id, { details: { ...(p.details || {}), gbpSteps: steps } }); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p; const n = $("gbpCount"); if (n) n.textContent = `${steps.length}/${GBP_STEPS.length}`; }
    catch (e) { cb.checked = !cb.checked; toast(e.message, true); }
  }));
  wireReviewReplies(view);
  view.querySelectorAll("[data-build]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await buildAct(b.dataset.build); if (b.isConnected) b.disabled = false; }));
  view.querySelectorAll("[data-compose]").forEach((b) => b.addEventListener("click", () => compose(b.dataset.compose, "")));

  // stage bar
  view.querySelectorAll("[data-stage]").forEach((b) => b.addEventListener("click", () => {
    const st = b.dataset.stage; if (st === stageOf(p.status) && st !== "prospect") return;
    if (st === "declined") { $("lostForm").hidden = false; return $("lostForm").reason.focus(); }
    if (st === "prospect" && ["prospect", "contacted"].includes(p.status)) return;
    patch({ status: st, declined_reason: null }, `Moved to ${STAGE[st].label}`);
  }));
  $("lostForm").addEventListener("submit", (e) => { e.preventDefault(); patch({ status: "declined", declined_reason: e.target.reason.value.trim() || null }, "Marked as lost"); });
  view.querySelector("[data-lost-cancel]").addEventListener("click", () => { $("lostForm").hidden = true; });

  // more menu
  const act = (name, fn) => view.querySelector(`[data-act="${name}"]`)?.addEventListener("click", fn);
  act("star", () => patch({ starred: !p.starred }, p.starred ? "Star removed" : "Starred"));
  act("snooze", () => patch({ snoozed_until: isSnoozed(p) ? null : new Date(Date.now() + 3 * 86400e3).toISOString() }, isSnoozed(p) ? "Back on Today" : "Hidden from Today for 3 days"));
  act("assistant", () => openDemoBuilder(p, rerender));
  if ($("callsBox")) fillCalls(p);
  if ($("inboxCard")) fillInbox(p);
  if ($("liveDemoCard")) fillLiveDemo(p);
  act("baseline", () => openBaseline(p, rerender));
  act("method", () => patch({ details: { ...(p.details || {}), discovery: { ...discOf(p), phase: phaseOf(p) } } }, "The method card is on"));
  act("archive", () => patch({ archived: !p.archived }, p.archived ? "Restored" : "Archived — find it under Leads → Show: Archived"));
  act("spam", async () => {
    if (!confirm(`Mark ${p.ref} as spam? Future messages from ${p.email || "this sender"} will be flagged automatically.`)) return;
    try { if (p.email) await api.spam.add(p.email); } catch (e) { console.warn(e); }
    patch({ spam: true, archived: true }, "Marked as spam");
  });
  act("unspam", () => patch({ spam: false, archived: false }, "Restored"));
  act("delete", async () => {
    if (!confirm(`Delete ${p.ref} (${p.business || p.name || "this lead"}) for good?\n\nIts notes, history and messages go too. Choose Archive instead if you just want it out of the way.`)) return;
    try { await api.projects.remove(p.id); toast(`${p.ref} deleted`); await loadAll(true); location.hash = "#/pipeline"; } catch (e) { toast(e.message, true); }
  });

  // reminder
  const fu = $("fuForm");
  // quick dates: working days at 09:00; the card stays open afterwards so you can see what was saved
  const dueIn = (v) => (v === "mon" ? nextMonday() : workdaysFrom(Number(v) || 1));
  fu.querySelectorAll("[data-due]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.due; keepOpen.add("fuCard");
    if (v === "0") return patch({ next_action: null, next_action_at: null }, "Reminder cleared");
    const at = dueIn(v); fu.next_action_at.value = datetimeLocal(at.toISOString());
    patch({ next_action: fu.next_action.value.trim() || "Follow up", next_action_at: at.toISOString() }, `Reminder set for ${fmtD(at.toISOString())}, 09:00`);
  }));
  fu.addEventListener("submit", (e) => {
    e.preventDefault();
    const na = fu.next_action.value.trim(), at = fu.next_action_at.value ? new Date(fu.next_action_at.value).toISOString() : null;
    keepOpen.add("fuCard");
    patch({ next_action: na || (at ? "Follow up" : null), next_action_at: at || (na ? dueIn(1).toISOString() : null) }, "Reminder saved");
  });

  // details
  $("pForm").addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target;
    const rv = f.review_count.value.replace(/\D/g, ""), rt = f.rating.value.replace(",", ".").replace(/[^\d.]/g, "");
    const review_count = rv ? Number(rv) : null, rating = rt ? Math.min(5, Math.round(Number(rt) * 10) / 10) : null, activity_note = f.activity_note.value.trim() || null;
    patch({ review_count, rating, activity_note, activity_score: activityScore(review_count, rating, activity_note, false), business: f.business.value.trim() || null, name: f.name.value.trim() || null, email: f.email.value.trim().toLowerCase() || null, phone: f.phone.value.trim() || null, location: f.location.value.trim() || null, ...(() => { let web = cleanUrl(f.website.value), g = cleanUrl(f.google_url.value); if (isGoogleUrl(web)) { g = g || web; web = null; } const details = { ...(p.details || {}) }; if (g) details.googleUrl = g; else delete details.googleUrl; if (f.on_offer) { if (f.on_offer.checked) details.offer = S.offer?.code || "founding"; else delete details.offer; } return { website: web, details }; })(), potential: f.potential.value || null, potential_note: f.potential_note.value.trim() || null, source: f.source.value }, "Details saved");
  });
  $("previewForm").addEventListener("submit", (e) => { e.preventDefault(); patch({ preview_url: cleanUrl(e.target.preview_url.value) }, "Saved"); });

  // payments
  view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => { const f = $(b.dataset.toggle); const other = $(b.dataset.toggle === "reqForm" ? "eftForm" : "reqForm"); f.hidden = !f.hidden; if (!f.hidden) { other.hidden = true; f.querySelector("input")?.focus(); } }));
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  view.querySelectorAll("[data-cancelreq]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Cancel this payment link? If they already have it, it won't be expected any more.")) return; await api.requests.cancel(b.dataset.cancelreq); toast("Cancelled"); S.loaded = 0; await loadAll(true); rerender(); }));
  view.querySelectorAll("[data-emaillink]").forEach((b) => b.addEventListener("click", () => { const r = S.requests.find((x) => x.id === b.dataset.emaillink); const kind = p.email ? "email" : "whatsapp"; openCompose({ ...p, _payment_link: r.redirect_url }, kind, { templateId: tplFor(kind, r.kind === "care" ? "renewal" : r.kind === "deposit" ? "deposit" : "balance")?.id, onDone: rerender }); }));
  $("reqForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("reqErr"), btn = f.querySelector("[type=submit]");
    const cents = Math.round(Number(f.amount.value.replace(/[^\d.]/g, "")) * 100);
    if (!cents || cents < 100) { err.hidden = false; err.textContent = "Enter an amount in rand."; return; }
    btn.disabled = true; err.hidden = true;
    try {
      const r = await api.requestPayment({ projectId: p.id, amountCents: cents, kind: f.kind.value, description: f.description.value.trim() || `${KIND_LABEL[f.kind.value]} — ${p.business || p.ref}` });
      S.loaded = 0; await loadAll(true); await rerender();
      try { await navigator.clipboard.writeText(r.redirectUrl); toast("Payment link created and copied — press Send it to email or WhatsApp it"); } catch { toast("Payment link created — press Send it"); }
    } catch (ex) { err.hidden = false; err.textContent = ex.message + (/not configured/.test(ex.message) ? " — set YOCO_SECRET_KEY on Supabase (BACKEND.md)." : ""); btn.disabled = false; }
  });
  $("eftForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("eftErr");
    const cents = Math.round(Number(f.amount.value.replace(/[^\d.]/g, "")) * 100);
    if (!cents) { err.hidden = false; err.textContent = "Enter the amount you received."; return; }
    await busy(f.querySelector("[type=submit]"), async () => { try {
      await api.payments.insert({ project_id: p.id, client_id: p.client_id || null, provider: f.provider.value, amount_cents: cents, currency: "ZAR", kind: f.kind.value, note: f.note.value.trim() || null, status: "succeeded", matched: true, paid_at: f.date.value ? new Date(f.date.value + "T12:00:00").toISOString() : new Date().toISOString() });
      await api.events.insert(p.id, "payment", `${money(cents)} ${KIND_LABEL[f.kind.value].toLowerCase()} received (${PROVIDER_LABEL[f.provider.value] || f.provider.value})${f.note.value.trim() ? " — " + f.note.value.trim() : ""}`, { manual: true, kind: f.kind.value });
      if (f.kind.value === "deposit" && !p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true });   // the database moves it to Building
      toast("Payment saved"); await loadAll(true); rerender();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; } }, "Saving…");
  });

  // quote
  // The total and the deposit (the quote page's own rule, depositOn) update as you type, and once on opening
  const recalc = () => {
    recalcOpts(); const cur = qf.qcur?.value || "ZAR";
    const t = [...$("quoteRows").querySelectorAll(".qrow")].reduce((a, r) => a + (randCents(r.querySelector("[name=cents]").value)), 0);
    $("quoteTotal").textContent = moneyIn(t, cur);
    $("quoteDeposit").textContent = p.deposit_paid ? `none: their deposit is already paid (${money(depositsPaid(p))})` : p.details?.payMonthly?.cents ? `the first month (${moneyIn(p.details.payMonthly.cents, cur)})` : t > 0 ? `${moneyIn(depositOn(t, cur), cur)}${depositOn(t, cur) >= t ? " (the whole amount)" : ""}` : "—";
    return t;
  };
  const addRow = (desc = "", cents = 0, focus = true) => { const box = $("quoteRows"); const empty = [...box.querySelectorAll(".qrow")].find((r) => !r.querySelector("[name=desc]").value.trim() && !randCents(r.querySelector("[name=cents]").value)); if (empty && (desc || cents)) empty.remove(); box.insertAdjacentHTML("beforeend", quoteRow({ desc, cents })); if (focus) box.lastElementChild.querySelector("input").focus(); recalc(); };
  qf.addEventListener("input", () => { qf.dataset.dirty = "1"; recalc(); });
  qf.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) { const box = rm.closest("#quoteRows, .qrows"); rm.closest(".qrow").remove(); if (!box.querySelector(".qrow")) box.insertAdjacentHTML("beforeend", quoteRow({})); recalc(); qf.dataset.dirty = "1"; }
    const oa = e.target.closest("[data-oadd]");
    if (oa) { const box = oa.closest(".adm-qopt").querySelector(".qrows"); box.insertAdjacentHTML("beforeend", quoteRow({})); box.lastElementChild.querySelector("input").focus(); qf.dataset.dirty = "1"; }
  });
  qf.addEventListener("change", (e) => {
    if (e.target.name === "qmode") { $("qOne").hidden = e.target.value !== "one"; $("qOpts").hidden = e.target.value !== "opts"; qf.dataset.dirty = "1"; }
    if (e.target.name === "qcur") { qf.dataset.dirty = "1"; recalc(); e.target.nextElementSibling.textContent = e.target.value === "ZAR" ? "Rand: the deposit is paid by card." : "Overseas: they pay by bank transfer to the account under Contracts → Your company details."; }
    if (e.target.name === "omon") { e.target.closest(".adm-qopt").querySelector(".adm-qopt__mon").hidden = !e.target.checked; recalc(); }
  });
  $("quoteAdd").addEventListener("click", () => addRow());
  qf.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { const lines = presetLines(b.dataset.preset, p); lines.forEach((l, i) => addRow(l.desc, l.cents, i === lines.length - 1)); qf.dataset.dirty = "1"; }));
  recalc();
  qf.addEventListener("submit", (e) => {
    e.preventDefault();
    if (qf.qmode && [...qf.querySelectorAll("[name=qmode]")].find((r) => r.checked)?.value === "opts") {
      const opts = readOpts().filter((o) => o.name && (o.items.length || o.monthly));
      if (opts.length < 2) return toast("Give at least two options a name and a price (or switch to One price).", true);
      if (opts.some((o) => !optTotal(o))) return toast("Every option needs a price.", true);
      if (!opts.some((o) => o.recommended)) opts[Math.min(1, opts.length - 1)].recommended = true;
      const rec = opts.find((o) => o.recommended);
      qf.dataset.dirty = "0";
      return patch({ ...curPatch(), quote_options: opts, quote_items: rec.items, quote_cents: optTotal(rec), quote_timeline: qf.quote_timeline.value.trim() || null, quote_notes: qf.quote_notes.value.trim() || null }, `Quote saved: ${opts.length} options${p.quote_token ? " — the quote page shows the new version" : ""}`);
    }
    const rows = [...$("quoteRows").querySelectorAll(".qrow")].map((r) => ({ desc: r.querySelector("[name=desc]").value.trim(), cents: randCents(r.querySelector("[name=cents]").value) })).filter((r) => r.desc || r.cents);
    const total = rows.reduce((a, r) => a + r.cents, 0);
    qf.dataset.dirty = "0";
    patch({ ...curPatch(), quote_items: rows, quote_cents: total || null, ...(p.quote_status === "accepted" ? {} : { quote_options: null }), quote_timeline: qf.quote_timeline.value.trim() || null, quote_notes: qf.quote_notes.value.trim() || null }, total ? `Quote saved: ${moneyIn(total, qf.qcur?.value)}${p.quote_token ? " — the quote page shows the new version" : ""}` : "Quote cleared");
  });
  function curPatch() { const c = qf.qcur?.value || "ZAR"; return c === qCur(p) ? {} : { details: { ...(p.details || {}), currency: c === "ZAR" ? undefined : c } }; }
  function readOpts() {
    return [...qf.querySelectorAll(".adm-qopt")].map((fs) => {
      const v = (n) => fs.querySelector(`[name=${n}]`).value.trim(), rand = (n) => Math.round(Number(v(n).replace(/[^\d.]/g, "")) * 100) || 0;
      const items = [...fs.querySelectorAll(".qrow")].map((r) => ({ desc: r.querySelector("[name=desc]").value.trim(), cents: randCents(r.querySelector("[name=cents]").value) })).filter((r) => r.desc || r.cents);
      const mon = fs.querySelector("[name=omon]").checked;
      return { key: fs.dataset.k, name: v("oname"), note: v("onote"), recommended: fs.querySelector("[name=orec]").checked, items, monthly: mon ? { cents: rand("omcents"), months: Math.max(1, Math.round(Number(v("ommonths")) || 12)), afterCents: rand("omafter") } : null };
    });
  }
  function recalcOpts() {
    if (!$("qOpts")) return; const os = readOpts(), cur = qf.qcur?.value || "ZAR";
    qf.querySelectorAll(".adm-qopt").forEach((fs, i) => { const o = os[i], t = optTotal(o); fs.querySelector("[data-ototal]").textContent = optPrice(o, cur); const dep = fs.querySelector("[data-odep]"); if (dep) dep.textContent = o.monthly ? "they pay the first month to start" : t ? `deposit when they accept: ${moneyIn(depositOn(t, cur), cur)}` : ""; });
  }
  $("quoteSend")?.addEventListener("click", () => run("quote:send"));
  $("quoteLinkRevoke")?.addEventListener("click", () => { if (confirm("Take the quote page offline? Anyone with the link will see 'quote not found'. You can send a new one any time.")) patch({ quote_token: null, quote_status: "none" }, "Quote page taken offline"); });
  $("quoteResend")?.addEventListener("click", () => { const r = reachBy(p); if (r === "email" || r === "whatsapp") compose(r, "quote"); });

  $("timeForm")?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target; const m = Math.round(Number(f.minutes.value)); if (!m) return;
    busy(f.querySelector("[type=submit]"), async () => {
      try { await api.events.insert(p.id, "time", f.note.value.trim() || "Work", { minutes: m }); f.minutes.value = ""; f.note.value = ""; toast(`${m} min logged`); await loadAll(true); rerender(); } catch (ex) { toast(ex.message, true); }
    }, "Logging…");
  });
  $("noteForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const note = e.target.note.value.trim(); if (!note) return;
    busy(e.target.querySelector("[type=submit]"), async () => {
      try { await api.events.insert(p.id, "note", note); e.target.note.value = ""; toast("Note added"); await rerender(); }
      catch (err) { toast(err.message, true); }
    }, "Saving…");
  });

  view.querySelectorAll("[data-cfile]").forEach(async (a) => { try { const u = await api.content.url(a.dataset.cfile); a.href = u; const img = a.querySelector("img"); if (img) img.src = u; } catch { a.classList.add("is-broken"); } });
  $("showAllCards")?.addEventListener("click", (e) => { ["quoteCard", "payCard", "mockCard"].forEach((k) => { const el = $(k); if (el) el.hidden = false; }); e.target.closest("p").remove(); });
  // arrived with ?do=… (a button on Today): run it once, then drop it from the address
  const doAct = q.get("do");
  if (doAct) { history.replaceState(null, "", "#/p/" + p.id); if (doAct !== "details") run(doAct); }
}
function unfold(el) { if (!el) return; el.hidden = false; if (el.tagName === "DETAILS") el.open = true; }
const PROVIDER_LABEL = { eft: "EFT", cash: "Cash", yoco: "Card", other: "Other", payfast: "PayFast" };
function stageBar(p) {
  const cur = stageOf(p.status), idx = STAGES.findIndex(([k]) => k === cur);
  return `<nav class="adm-stagebar" aria-label="Stage — the stage moves by itself as things happen; click to change it yourself">
    <ol>${STAGES.filter(([k]) => k !== "declined").map(([k, l], i) => `<li><button type="button" data-stage="${k}" class="${cur === "declined" ? "" : i < idx ? "is-done" : i === idx ? "is-current" : ""}"${i === idx ? ' aria-current="step"' : ""} title="${esc(STAGE_HELP[k])}"><span>${["in_development", "live"].includes(k) ? `<small>Won ·</small> ` : ""}${esc(l)}</span></button></li>`).join("")}</ol>
    <button type="button" data-stage="declined" class="adm-stagebar__lost${cur === "declined" ? " is-current" : ""}" title="${esc(STAGE_HELP.declined)}">${cur === "declined" ? "Lost" : "Mark lost"}</button>
    <p class="tiny muted">${trialChip(p)}${esc(cur === "quote_sent" && p.quote_cents && p.quote_status !== "accepted" ? `Quote sent: waiting for them to accept and pay ${depositLabel(p)}` : STAGE_HELP[cur] || "")}</p>
  </nav>`;
}
function leadBadges(p, { client, bal, paid } = {}) {
  const b = [];
  if (p.status === "contacted") b.push('<span class="chip">Contacted — no reply yet</span>');
  if (p.quote_status === "accepted") b.push(`<span class="chip chip--ok">Quote accepted${p.quote_accepted_name ? " by " + esc(p.quote_accepted_name) : ""}</span>`);
  else if (p.quote_status === "viewed") b.push(`<span class="chip">Quote opened ${esc(rel(p.quote_viewed_at))}</span>`);
  if (p.deposit_paid) b.push('<span class="chip chip--ok">Deposit paid</span>');
  if (stageOf(p.status) === "in_development" && bal > 0 && paid) b.push(`<span class="chip chip--warn">${esc(money(bal))} still to pay</span>`);
  if (client?.care_active) b.push(`<span class="chip chip--ok">${esc(PLAN_LABEL[client.care_plan] || "Care plan")}</span>`);
  b.push(potChip(p));
  if (isSnoozed(p) && S.features.star) b.push(`<span class="chip">Hidden from Today until ${esc(fmtD(p.snoozed_until))}</span>`);
  return b.join("");
}
const buildControls = (p) => {
  const st = p.build_status || "none", site = p.build_site_id ? S.sites.find((x) => x.id === p.build_site_id) : null;
  const url = p.preview_url || site?.url || "";
  const row = (chip, actions, extra = "") => `<div class="adm-build"><div class="adm-row__meta" style="margin:0 0 0.5rem">${chip}</div>${extra}<div class="adm-inline-actions" style="margin:0 0 0.8rem">${actions}</div></div>`;
  const open = url ? `<a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">Open mockup</a>` : "";
  if (st === "queued") return row('<span class="chip" style="color:var(--accent-bright);border-color:var(--accent-line)">Waiting to go to the builder</span>', '<button class="btn btn--ghost" data-build="check">Send now</button><button class="btn btn--ghost" data-build="cancel">Cancel</button>');
  if (st === "building") return row(`<span class="chip chip--warn">Being built — sent ${esc(rel(p.build_started_at))}</span>`, '<button class="btn btn--ghost" data-build="check">Check now</button>', '<p class="tiny muted" style="margin:0 0 0.5rem">The builder runs every hour from 06:00 to 20:00. The finished mockup appears here by itself.</p>');
  if (st === "built") return row('<span class="chip chip--ok">Mockup ready — check it before you send it</span>', `${open}${reachBy(p) && reachBy(p) !== "call" ? '<button class="btn btn--primary" data-build="send">Send the link</button>' : ""}<button class="btn btn--ghost" data-build="reviewed">I've checked it</button><button class="btn btn--ghost" data-build="retry">Build again</button>`, p.build_log ? `<p class="tiny muted" style="margin:0 0 0.5rem;white-space:pre-wrap">Builder's notes: ${esc(p.build_log)}</p>` : "");
  if (st === "failed") return row('<span class="chip" style="color:var(--danger);border-color:rgba(255,107,107,.4)">The automatic mockup failed</span>', '<button class="btn btn--primary" data-build="retry">Try again</button><button class="btn btn--ghost" data-build="cancel">Dismiss</button>', p.build_log ? `<p class="adm-error tiny" style="margin:0 0 0.5rem;white-space:pre-wrap">${esc(p.build_log)}</p>` : "");
  if (st === "reviewed") return row('<span class="chip chip--ok">Mockup checked</span>', `${open}<button class="btn btn--ghost" data-build="retry">Build again</button>`);
  return row("", `${open}<button class="btn btn--ghost" data-build="queue" title="An AI builder makes a one-page mockup from what they told us. You check it before anything is sent.">${url ? "Build a new mockup automatically" : "Build a free mockup automatically"}</button>`);
};
const quoteUrl = (p) => p?.quote_token ? `https://re-charge.co.za/quote?t=${p.quote_token}` : "";
function newToken() { const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function quoteLinkBox(p) {
  const r = reachBy(p), via = r === "email" ? "email" : r === "whatsapp" ? "WhatsApp" : "";
  if (!p.quote_token) return `<div class="adm-quote-link"><h3>Send it</h3><p class="tiny muted">They get a private page with the quote, accept it by typing their name, and pay the deposit straight away (by card, or bank transfer for overseas clients). The lead moves along by itself.</p>
    <div class="adm-inline-actions"><button type="button" class="btn btn--primary" id="quoteSend"${p.quote_cents ? "" : " disabled"}>${via ? "Send quote by " + via : "Create quote page"}</button>${p.quote_cents ? "" : '<span class="tiny muted" style="align-self:center">Save a priced quote first</span>'}</div></div>`;
  const st = p.quote_status, url = quoteUrl(p);
  const expired = p.quote_valid_until && p.quote_valid_until < localDate() && st !== "accepted";
  const label = expired ? "Expired" : { sent: "Sent — not opened yet", viewed: `Opened ${p.quote_viewed_at ? rel(p.quote_viewed_at) : ""}`, accepted: `Accepted by ${p.quote_accepted_name || "the client"} ${p.quote_accepted_at ? rel(p.quote_accepted_at) : ""}`, declined: `Declined${p.quote_decline_reason ? ": " + p.quote_decline_reason : ""}` }[st] || st;
  return `<div class="adm-quote-link"><h3>Quote page <span class="status-pill" data-s="${esc(st === "accepted" ? "delivered" : st === "declined" || expired ? "bounced" : "sent")}">${esc(label)}</span></h3>
    <p class="tiny muted">${p.quote_valid_until && st !== "accepted" ? `Valid until ${esc(fmtD(p.quote_valid_until + "T12:00:00"))}. ` : ""}${st === "accepted" ? `${p.deposit_paid ? "" : "Deposit not paid yet. "}This link now shows them their progress (deposit, building, live), so share it whenever they ask where things are.` : "Change the price and save — the page always shows the latest version until it's accepted."}</p>
    <div class="adm-link"><span>${esc(url)}</span><button type="button" class="btn btn--ghost btn--small" data-copy="${esc(url)}">Copy</button></div>
    <div class="adm-inline-actions">${via && st !== "accepted" ? `<button type="button" class="btn btn--ghost" id="quoteResend">Send again by ${via}</button>` : ""}<a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">See what they see</a>${expired || st === "declined" ? '<button type="button" class="btn btn--primary" id="quoteSend">Send a fresh quote</button>' : ""}${st !== "accepted" ? '<button type="button" class="btn btn--ghost" id="quoteLinkRevoke">Take offline</button>' : ""}</div></div>`;
}
// Three-option quotes (0022): the client picks one on the quote page. Any option can still be set to pay monthly.
const PAY_MONTHLY = { cents: 24900, months: 12, afterCents: 15000 };
const CARE_LINE = "Care plan, first year (hosting, an hour of changes a month, updates, monthly report)";
const HOSTING_LINE = "Managed hosting, first year (secure, backed up, monitored)";
// AI is the main business now, so an AI lead gets AI options. A website lead still
// gets website ones — offering someone an AI build when they asked for a website
// is how you lose a sale you already had.
const isAiLead = (p) => (p?.category || []).some((c) => /\bai\b/i.test(String(c))) || /\bai\b/i.test(String(p?.details?.product || p?.details?.projectType || ""));
// Two-sided referrals: a business a client sent gets R1,250 off its project (and the client a free year of Care)
const REFERRAL_OFF = 125000;
const referralLine = (p) => (p?.details?.referredBy ? [{ desc: `Referral discount (thanks to ${p.details.referredBy.name || "a Re-Charge client"})`, cents: -REFERRAL_OFF }] : []);
// Two tiers (METHOD.md §5): focused fixed-scope builds at the starting prices, and staged
// process work. A lead that came in to improve a whole process (or through a process review)
// gets discovery recommended; a lead asking for one AI tool gets the fixed-scope tool first.
const ENTRY = { Automation: ["Automation", 1500000, "Automation: one repetitive task handled between two of your tools"], Dashboard: ["Dashboard", 1500000, "Dashboard: one view of your numbers from one data source, updated for you"], "Custom Software": ["Custom tool", 4500000, "Custom tool: a small calculator, tracker or form built around how you work"] };
const entryCat = (p) => (p?.category || []).find((c) => ENTRY[c]);
const wantsProcess = (p) => (p?.category || []).some((c) => /process/i.test(c)) || ["Process review"].includes(p?.details?.formType) || Boolean(p?.details?.discovery);
const INBOX_LINE = "Inbox Assistant setup: your private page, loaded with your prices and policies, ready within 3 business days";
const INBOX_MONTH_LINE = "First month of the Inbox Assistant (AI usage included)";
const wantsInbox = (p) => (p?.category || []).some((c) => /inbox/i.test(c)) || /\b(e-?mails?|inbox|enquir\w*|quotes? requests?)\b/i.test(String(p?.details?.goal || p?.goal || ""));
const INBOX_TERMS = `A refundable ${money(INBOX_DEPOSIT)} deposit starts a two-week trial on your real emails, and comes off the setup. The rest is paid only if it saves your team 5+ hours a week; if it doesn't, the deposit is refunded in full within 7 days. Then ${money(PLAN_MONTHLY.inbox)} a month (AI usage included up to 1,500 emails, 3-month minimum, then month to month).`;
const inboxLines = (p) => [{ desc: INBOX_LINE, cents: INBOX_SETUP }, ...(onOffer(p) ? [(() => { const o = offerNow(); return { desc: `Founding client: Inbox Assistant setup ${o.discount >= 100 ? "free" : o.discount + "% off"}`, cents: -o.setupOff }; })()] : []), { desc: INBOX_MONTH_LINE, cents: PLAN_MONTHLY.inbox }];
const inboxOption = (p) => ({ key: "a", name: "Inbox Assistant", recommended: !wantsProcess(p), note: INBOX_TERMS, items: [{ desc: INBOX_LINE, cents: INBOX_SETUP }, ...(onOffer(p) ? inboxLines(p).slice(1) : [])] });
// Quick-add lines on the quote, from the current prices (the pricing page), never typed in twice
const WEBSITE_LINE = "Business website: designed around your services, with enquiry capture, SEO foundations and analytics";
const QUOTE_PRESETS = [["inbox", `+ Inbox Assistant (${money(INBOX_SETUP)} + first month)`], ["website", `+ Website (${money(1250000)})`], ["care", `+ Care, first year (${money(PLAN_PRICE.care)})`], ["hosting", `+ Hosting, first year (${money(PLAN_PRICE.hosting)})`]];
const presetLines = (k, p) => (k === "inbox" ? inboxLines(p) : k === "website" ? [{ desc: WEBSITE_LINE, cents: 1250000 }] : k === "care" ? [{ desc: CARE_LINE, cents: PLAN_PRICE.care }] : k === "hosting" ? [{ desc: HOSTING_LINE, cents: PLAN_PRICE.hosting }] : []);
const DEFAULT_OPTIONS = (p) => (isAiLead(p) && (wantsInbox(p) || onOffer(p)) ? [
  inboxOption(p),
  ...DEFAULT_AI(p).slice(1),
] : isAiLead(p) ? DEFAULT_AI(p) : DEFAULT_OTHER(p));
const DEFAULT_AI = (p) => [
  { key: "a", name: "Focused AI tool", recommended: !wantsProcess(p), note: "The AI usage is billed at cost, never marked up.", items: [{ desc: "AI solution: one focused tool, e.g. answers from your own documents or replies prepared for your team", cents: 2500000 }, { desc: CARE_LINE, cents: PLAN_PRICE.care }] },
  { key: "b", name: "Discovery + proof of concept", recommended: wantsProcess(p), note: "For automating a whole process: measured before vs after on real work. Go, adjust or stop from there.", items: [{ desc: "Discovery & opportunity map (credited against implementation within 60 days)", cents: IMPL.discovery }, { desc: "Proof of concept: the smallest useful version, on real work, measured before vs after", cents: IMPL.poc }] },
  { key: "c", name: "Full implementation", note: `Then Operate from ${money(PLAN_MONTHLY.operate)} a month from go-live (3-month minimum): monitoring, AI usage allowance, maintenance, support and a monthly ROI report.`, items: [{ desc: "Discovery & opportunity map", cents: IMPL.discovery }, { desc: "Proof of concept, measured before vs after", cents: IMPL.poc }, { desc: `Production implementation: integration, documentation and training (${money(IMPL.production)} less the discovery credit)`, cents: IMPL.production - IMPL.discovery }] },
];
const DEFAULT_OTHER = (p) => (entryCat(p) ? [
  { key: "a", name: ENTRY[entryCat(p)][0], recommended: true, items: [{ desc: ENTRY[entryCat(p)][2], cents: ENTRY[entryCat(p)][1] }] },
] : [
  { key: "a", name: "Business website", recommended: true, items: [{ desc: "Business website: designed around your services, with enquiry capture, SEO foundations and analytics", cents: 1250000 }, { desc: HOSTING_LINE, cents: PLAN_PRICE.hosting }, ...referralLine(p)] },
  { key: "b", name: "Business website + Care", items: [{ desc: "Business website: designed around your services, with enquiry capture, SEO foundations and analytics", cents: 1250000 }, { desc: CARE_LINE, cents: PLAN_PRICE.care }, ...referralLine(p)] },
  { key: "c", name: "Platform", note: "For bookings, payments, client portals or e-commerce.", items: [{ desc: "Platform / web app: bookings, payments or a client portal, integrated with your tools", cents: 3500000 }, { desc: CARE_LINE, cents: PLAN_PRICE.care }, ...referralLine(p)] },
]);
const optTotal = (o) => (o.monthly ? o.monthly.cents : (o.items || []).reduce((a, i) => a + (i.cents || 0), 0));
const optPrice = (o, cur) => (o.monthly ? `${moneyIn(o.monthly.cents, cur)}/month × ${o.monthly.months}` : moneyIn(optTotal(o), cur));
const hasOptions = (p) => Array.isArray(p?.quote_options) && p.quote_options.length > 1 && p.quote_status !== "accepted";
const optionEditor = (o, i) => `<fieldset class="adm-qopt" data-k="${esc(o.key || "abc"[i])}">
  <div class="row2"><label>Option ${"ABC"[i]}<input name="oname" value="${esc(o.name || "")}" placeholder="${i === 2 ? "e.g. Pay monthly" : "e.g. Business website"}" /></label><label class="check adm-qopt__rec"><input type="radio" name="orec" value="${esc(o.key || "abc"[i])}"${o.recommended ? " checked" : ""} /> Recommended</label></div>
  <div class="qrows">${(o.items?.length ? o.items : [{ desc: "", cents: 0 }]).map(quoteRow).join("")}</div>
  <div class="adm-inline-actions" style="margin:0"><button type="button" class="btn btn--ghost" data-oadd>+ Line</button><label class="check" style="margin:0"><input type="checkbox" name="omon"${o.monthly ? " checked" : ""} /> Pay monthly</label></div>
  <div class="row2 adm-qopt__mon"${o.monthly ? "" : " hidden"}><label>Per month<span class="money"><input name="omcents" inputmode="decimal" value="${(o.monthly?.cents || PAY_MONTHLY.cents) / 100}" /></span></label><label>For how many months<input name="ommonths" inputmode="numeric" value="${o.monthly?.months || PAY_MONTHLY.months}" /></label><label>Then Care per month<span class="money"><input name="omafter" inputmode="decimal" value="${(o.monthly?.afterCents ?? PAY_MONTHLY.afterCents) / 100}" /></span></label></div>
  <label>Short note <span class="muted" style="font-weight:400">(optional, under the price)</span><input name="onote" value="${esc(o.note || "")}" /></label>
  <div class="qtotal"><span class="muted">Option ${"ABC"[i]}</span><b data-ototal>${optPrice(o)}</b></div>
  <p class="tiny muted qdep" data-odep></p>
</fieldset>`;
// "R1 000", "1000.50" or "-250" (a discount line) → cents
const randCents = (v) => Math.round(Number(String(v ?? "").replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "")) * 100) || 0;
const quoteRow = (i) => `<div class="qrow"><input name="desc" value="${esc(i.desc || "")}" placeholder="e.g. Business website (5 pages)" aria-label="Line item" /><span class="money"><input name="cents" inputmode="decimal" value="${i.cents ? i.cents / 100 : ""}" placeholder="0" aria-label="Amount" /></span><button type="button" data-rm aria-label="Remove line">&times;</button></div>`;
const potOptions = (cur) => `<option value="">Not rated</option>${Object.entries(POTENTIAL).map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}`;
const cleanUrl = (v) => { const t = String(v || "").trim(); return t ? (/^https?:\/\//i.test(t) ? t : "https://" + t) : null; };
const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client";
const KIND_TEXT = { created: "Created", status: "Stage", note: "Note", payment: "Payment", email: "Email", whatsapp: "WhatsApp", time: "Time logged" };
const eventText = (e) => e.kind === "time" ? `${Number(e.data?.minutes) || 0} min — ${e.note || "work"}` : (e.note || KIND_TEXT[e.kind] || e.kind);
const eventLi = (e, msg) => `<li data-kind="${esc(e.kind)}"><span class="tl-dot"></span><div><time>${esc(fmtDT(e.created_at))} · ${esc(KIND_TEXT[e.kind] || e.kind)}${msg ? ` · <span class="status-pill" data-s="${esc(msg.status)}">${esc(msg.status)}</span>` : ""}</time><p>${esc(eventText(e))}${e.data?.reason ? ` <span class="muted">(${esc(e.data.reason)})</span>` : ""}</p>${msg ? `<details class="adm-msg"><summary>Show message</summary><pre>${msg.subject ? "Subject: " + esc(msg.subject) + "\n\n" : ""}${esc(msg.body || "")}</pre></details>` : ""}</div></li>`;

// ---------- add lead ----------
function renderAdd(q) {
  const cats = ["Websites", "Dashboards", "Automation", "AI Integrations", "Custom Software"];
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Leads</span><h1>Add a lead</h1></div><div class="adm-head__actions"><a class="btn btn--ghost btn--small" href="#/outreach">Paste a whole list instead</a></div></div>
  <div class="adm-card" style="max-width:40rem">
    <form class="adm-form" id="addForm">
      <div class="row2"><label>Business<input name="business" placeholder="e.g. Botha Electrical" autofocus /></label><label>Contact name<input name="name" placeholder="e.g. Pieter Botha" /></label></div>
      <div class="row2"><label>Email<input type="email" name="email" placeholder="name@business.co.za" /></label><label>Phone / WhatsApp<input type="tel" name="phone" placeholder="082 000 0000" /></label></div>
      <label>Where they're based<input name="location" placeholder="e.g. Edenvale, Gauteng" /></label>
      <div class="row2">
        <label>How did you find them?<select name="source">${["outreach", "referral", "whatsapp", "phone", "website", "other"].map((v) => `<option value="${v}"${v === (q.get("source") || "outreach") ? " selected" : ""}>${SOURCES[v]}</option>`).join("")}</select></label>
        <label>Where are you with them?<select name="status"><option value="prospect">Haven't contacted them yet</option><option value="contacted">I've contacted them, no reply yet</option><option value="new">They got in touch / want something</option></select></label>
      </div>
      <div class="row2"><label>What could we build for them?<select name="category">${cats.map((c) => `<option>${c}</option>`).join("")}</select></label><label>How good a fit?<select name="potential">${potOptions("")}</select></label></div>
      <div class="row2"><label>Current website<input inputmode="url" name="website" placeholder="None yet" /></label><label>Google profile link<input inputmode="url" name="google_url" placeholder="Optional: Maps → Share → paste" /></label></div>
      <label>What we could sell them<input name="potential_note" placeholder="A website (if they don't have one)" /></label>
      <label>Notes<textarea name="goal" placeholder="What you noticed: no website, old site, manual bookings on WhatsApp, found via Google Maps…"></textarea></label>
      <p class="adm-error tiny" id="addErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end"><a class="btn btn--ghost btn--small" href="#/pipeline">Cancel</a><button class="btn btn--primary btn--small" type="submit">Add lead</button></div>
    </form>
  </div>`;
  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, err = $("addErr");
    const row = { business: f.business.value.trim() || null, name: f.name.value.trim() || null, email: f.email.value.trim().toLowerCase() || null, phone: f.phone.value.trim() || null, location: f.location.value.trim() || null, source: f.source.value, status: f.status.value, category: [f.category.value], goal: f.goal.value.trim() || null, potential: f.potential.value || null, potential_note: f.potential_note.value.trim() || (!cleanUrl(f.website.value) || isSocial(f.website.value) ? "A website" : null), website: cleanUrl(f.website.value), details: { ...(cleanUrl(f.google_url.value) ? { googleUrl: cleanUrl(f.google_url.value) } : {}), formType: "Added manually" } };
    if (!row.business && !row.name) { err.hidden = false; err.textContent = "Add at least a business or a contact name."; return; }
    if (!row.email && !row.phone && row.status !== "prospect") { err.hidden = false; err.textContent = "Add an email or a phone number so you can reach them."; return; }
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
  // clients (renewals and site health live there) and ready-made messages too
  const cHits = S.clients.filter((c) => s && [c.name, c.site_label, c.email, c.phone, c.notes, PLAN_LABEL[c.care_plan]].join(" ").toLowerCase().includes(s));
  const tHits = S.templates.filter((t) => s && !t.archived && [t.name, t.subject, t.body].join(" ").toLowerCase().includes(s)).slice(0, 8);
  const n = hits.length + cHits.length + tHits.length;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Search</span><h1>${n} ${n === 1 ? "result" : "results"} for “${esc(q)}”</h1></div></div>
  ${cHits.length ? `<section class="adm-section"><h2>Clients <span class="count">${cHits.length}</span></h2><ul class="adm-list">${cHits.map((c) => `<li><a class="adm-row" href="#/c/${esc(c.id)}"><div class="adm-row__main"><div class="adm-row__title">${esc(c.name)}${c.site_label ? `<span class="muted" style="font-weight:400">${esc(c.site_label)}</span>` : ""}</div><div class="adm-row__sub">${isOwn(c) ? "Our own business" : c.care_active ? `${esc(PLAN_LABEL[c.care_plan] || "Care")}${c.care_amount_cents ? " · " + esc(carePer(c)) : ""}${c.care_renews_at ? ` · ${isMonthly(c) ? "next payment" : "renews"} ${esc(fmtD(c.care_renews_at))}` : ""}` : "No plan"}</div></div></a></li>`).join("")}</ul></section>` : ""}
  <section class="adm-section"><h2>Leads <span class="count">${hits.length}</span></h2>
  <ul class="adm-list">${hits.length ? hits.map((p) => `<li>${projectRow(p, noteIds.has(p.id) ? `<span class="chip">in notes: ${esc((noteHits.find((n) => n.project_id === p.id)?.note || "").slice(0, 60))}</span>` : "")}</li>`).join("") : '<li class="adm-empty">No leads match.</li>'}</ul></section>
  ${tHits.length ? `<section class="adm-section"><h2>Message wording <span class="count">${tHits.length}</span></h2><ul class="adm-list">${tHits.map((t) => `<li><a class="adm-row" href="#/templates/${esc(t.id)}"><div class="adm-row__main"><div class="adm-row__title">${esc(t.name)} <span class="chip">${t.kind === "email" ? "Email" : "WhatsApp"}</span></div><div class="adm-row__sub">${esc((t.subject ? t.subject + ": " : "") + t.body.slice(0, 120))}</div></div></a></li>`).join("")}</ul></section>` : ""}`;
}


// ====================================================================
// Phase B — templates, compose (email / WhatsApp), outreach, settings
// ====================================================================
const VARS = [
  ["demo_link", "Their demo assistant link (build it on the lead)"], ["opportunities", "Their ranked opportunities"], ["result", "The measured before → after"], ["demos_link", "The AI demos page"], ["try_link", "Try it on your own email (sample replies, or they send you one)"], ["inbox_link", "The Inbox Assistant page"], ["method_link", "The method page"], ["first_name", "Their first name"], ["name", "Their full name"], ["business", "Their business"], ["opportunity", "What we could sell them"], ["noticed", "Something specific about them (Google reviews, website)"], ["offer_line", "The founding clients offer, while it runs"], ["referral_link", "Their referral link (clients)"], ["their_review_link", "Their own Google review link (clients)"],
  ["goal", "What they asked for"], ["quote", "Quote total"], ["quote_link", "Quote page (they accept & pay the deposit there)"],
  ["quote_items", "Quote lines"], ["payment_link", "Card payment link (latest)"], ["mockup_link", "Free-mockup page (no longer offered on the site)"],
  ["preview_link", "Their mockup"], ["review_link", "Your Google review link"], ["my_name", "Your name"], ["my_email", "Your email (for Manager access)"], ["my_whatsapp", "Your WhatsApp"], ["signature", "Your signature"],
  ["deposit", "The deposit they pay when they accept the quote"], ["call_link", "Book the free 30-minute call"], ["bank_details", "Your bank details for EFT (Settings → Contracts)"], ["ref", "Their RC reference (for EFT payments)"],
  ["renewal_amount", "Their plan price (clients)"], ["renews_on", "When their plan renews (clients)"],
  ["trial_link", "Inbox Assistant: their trial page"], ["trial_baseline", "Inbox trial: minutes to answer one by hand"], ["trial_check", "Inbox trial: minutes to check a draft"], ["trial_saving", "Inbox trial: minutes saved per reply sent as is"], ["trial_saving_half", "Inbox trial: minutes saved per reply sent after edits"], ["trial_target", "Inbox trial: the weekly target"], ["trial_replies", "Inbox trial: replies a week (sent as is) that make the target"], ["trial_replies_edited", "Inbox trial: replies a week (after edits) that make the target"],
  ["trial_drafted", "Inbox trial, measured week: replies written"], ["trial_as_is", "Inbox trial, measured week: sent as is"], ["trial_edited", "Inbox trial, measured week: sent after edits"], ["trial_unused", "Inbox trial, measured week: not used"], ["trial_hours", "Inbox trial, measured week: hours saved"],
]
// The free 30-minute call (config.js BOOKING_URL)
const CALL_LINK = String(CFG.BOOKING_URL || "https://calendar.app.google/58FYamh1ahXB4khM9");
// Bank details for EFT, from Settings → Contracts → Bank details (the overseas quote page shows the same ones)
const bankDetails = (pr = S.profile) => [pr.bank_account_name || pr.legal_name ? `Account name: ${pr.bank_account_name || pr.legal_name}` : "", pr.bank_name ? `Bank: ${pr.bank_name}` : "", pr.bank_account_no ? `Account number: ${pr.bank_account_no}` : "", pr.bank_branch ? `Branch: ${pr.bank_branch}` : ""].filter(Boolean).join("\n");
const fmtWa = (n) => { const d = normPhone(n); return d.startsWith("27") && d.length === 11 ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : n; };
function ctxFor(p) {
  const pr = S.profile;
  return {
    first_name: firstName(p?.name) || "there", name: p?.name || "", business: p?.business || "your business", ref: p?.ref || "",
    category: (p?.category || []).filter((c) => !/request$/i.test(c)).join(", "), goal: p?.goal || "", indicative_price: p?.indicative_price || "",
    quote: hasOptions(p) ? `${p.quote_options.length} options, from ${moneyIn(Math.min(...p.quote_options.map(optTotal)), qCur(p))}${p.quote_options.some((o) => o.monthly) ? " (or pay monthly)" : ""}` : p?.quote_cents != null ? moneyIn(p.quote_cents, qCur(p)) + (p.details?.payMonthly ? " a month" : "") : "", deposit_link: quoteUrl(p) || pr.deposit_link || "",
    payment_link: p?._payment_link || S.requests.find((r) => r.status === "open" && r.redirect_url && (p?.id ? r.project_id === p.id : p?._client_id && r.client_id === p._client_id))?.redirect_url || "",   // no fallback to the static Yoco link: it was a fixed R500 deposit, wrong for a balance or a renewal
    quote_link: quoteUrl(p),
    deposit: p?.deposit_paid && depositsPaid(p) ? `${money(depositsPaid(p))} (already paid)` : hasOptions(p) ? "40% of the option you choose" : p?.details?.payMonthly?.cents ? `${moneyIn(p.details.payMonthly.cents, qCur(p))} (your first month)` : p?.quote_cents ? moneyIn(depositOf(p), qCur(p)) : "",
    call_link: CALL_LINK, bank_details: bankDetails(pr).includes("Account number") ? bankDetails(pr) : "",
    ...(() => { const cl = clientById(p?.client_id || p?._client_id); return { renewal_amount: cl?.care_amount_cents ? money(cl.care_amount_cents) : "", renews_on: cl?.care_renews_at ? fmtD(cl.care_renews_at + "T12:00:00") : "" }; })(),
    ...trialVars(p),
    quote_items: hasOptions(p) ? p.quote_options.map((o) => `• ${o.name}: ${optPrice(o, qCur(p))}${o.recommended ? " (recommended)" : ""}`).join("\n") : (p?.quote_items || []).filter((i) => i.desc || i.cents).map((i) => `• ${i.desc || "Item"} — ${i.cents ? moneyIn(i.cents, qCur(p)) : "included"}`).join("\n"),
    start_link: "https://re-charge.co.za/start", mockup_link: "https://re-charge.co.za/free-mockup" + (p?.business ? "?b=" + encodeURIComponent(p.business) : ""), preview_link: p?.preview_url || "", review_link: pr.review_link || "",
    opportunity: p?.potential_note || (p && ownSite(p) ? "a new website that works properly on phones" : "a website"), their_website: p?.website || "",
    noticed: noticedLine(p),
    offer_line: (() => { const o = offerNow(); return o.live ? `We're taking on a few founding clients: our next ${o.left === 1 ? "AI client gets" : `${o.left} AI clients get`} ${o.deal}, in return for letting us share the measured results.` : ""; })(),
    referral_link: referralLink(clientById(p?.client_id || p?._client_id)),
    their_review_link: clientById(p?.client_id || p?._client_id)?.google_review_url || "",
    location: p?.location || "", in_area: p?.location ? " in " + p.location.split(",")[0].trim() : "", balance: p?.id ? money(balanceDue(p) || p.quote_cents || 0) : "",
    live_site: p?.id || p?._client_id ? liveSite(p) : "",
    demo_link: demoUrl(p?.details?.demoSlug),
    demos_link: "https://re-charge.co.za/ai-demos", try_link: "https://re-charge.co.za/ai-demos#try", inbox_link: "https://re-charge.co.za/inbox-assistant", method_link: "https://re-charge.co.za/method",
    opportunities: (() => { const o = (discOf(p).opps || []).map((x) => ({ ...x, ...oppVerdict(x) })).sort((x, y) => y.score - x.score); return o.length ? o.map((x, i) => `${i + 1}. ${x.name}: ${x.score}/100 (${x.label.toLowerCase()}${x.gate ? "; " + x.gate.toLowerCase() : ""})`).join("\n") : ""; })(),
    result: resultLine(p),
    my_email: pr.reply_to || "", my_name: pr.my_name || "", my_whatsapp: pr.whatsapp ? fmtWa(pr.whatsapp) : "", signature: pr.signature || "",
  };
}
// The measured change in one sentence, for messages and case studies (blank until there's an after number).
function resultLine(p) {
  const b = baselineOf(p), r = roiOf(b, afterOf(p));
  if (!r) return "";
  const mins = metricKind(b.metric) === "minutes", m = b.metric.replace(/^minutes\s*/i, "").replace(/^hours spent\s*/i, "time spent ");
  const what = mins ? `the time ${m} went from about ${r.before} to ${r.after} minutes` : `${b.metric.toLowerCase()} went from about ${r.before} to ${r.after} ${b.unit}`;
  return `${what[0].toUpperCase() + what.slice(1)}${r.pct ? ` (${Math.abs(r.pct)}% ${r.pct > 0 ? "less" : "more"})` : ""}${r.hours != null && r.hours > 0 ? `, about ${Math.round(r.hours)} hours a month back` : ""}${r.rands != null && r.rands > 0 ? `, roughly ${money(Math.round(r.rands) * 100)} a month of staff time` : ""}.`;
}
const OPTIONAL_VARS = new Set(["in_area", "noticed", "offer_line"]);   // blank reads fine ("…came across Bella Hair{{in_area}}.")
// One honest, specific line about the business from what we know (Google
// reviews, rating, website). Only says "no website" when the lead is marked as
// having none. Blank when there's nothing worth saying.
function noticedLine(p) {
  if (!p) return "";
  const n = Number(p.review_count) || 0, r = p.rating != null ? Number(p.rating) : null;
  const stars = r == null ? "" : Number.isInteger(r) ? String(r) : r.toFixed(1);
  const social = /facebook\.com|instagram\.com|fb\.com/i.test(p.website || "");
  const site = p.website && !social;
  const noSite = !site && (social || ["very_high", "high"].includes(p.potential));
  const fb = social || /facebook/i.test(p.goal || "");
  const praised = n >= 15 && r != null && r >= 4.3, busy = n >= 15;
  if (noSite) {
    if (praised) return `${stars} stars from ${n} reviews on Google is really good going, but I couldn't find a website for you.`;
    if (busy) return `You've clearly got plenty of customers (${n} reviews on Google), but I couldn't find a website for you.`;
    if (fb) return "I found your Facebook page, but couldn't find a website for you.";
    return "I couldn't find a website for you when I looked.";
  }
  if (site && p.potential === "medium") return "I had a look at your website on my phone and thought it could be doing more for you.";
  if (praised) return `${stars} stars from ${n} reviews on Google is really good going.`;
  return "";
}
function renderTpl(str, ctx) {
  const missing = new Set();
  const out = String(str || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => { const v = ctx[k]; if (v == null || v === "") { if (!OPTIONAL_VARS.has(k)) missing.add(k); return ""; } return v; });
  return { text: out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), missing: [...missing] };
}
const metaSummary = (m) => { if (!m || (!m.next_action && !m.set_status)) return ""; const parts = []; if (m.next_action) parts.push(`next: <b>${esc(m.next_action)}</b> in ${Number(m.next_days) || 0}d`); if (m.set_status) parts.push(`move to <b>${esc(STAGE[m.set_status]?.label || m.set_status)}</b>`); return parts.join(" · "); };
async function applyMeta(p, meta) {
  if (!meta) return;
  const patch = {};
  if (meta.next_action) { const d = new Date(); d.setDate(d.getDate() + (Number(meta.next_days) || 0)); d.setHours(9, 0, 0, 0); patch.next_action = meta.next_action; patch.next_action_at = rollToWorkday(d).toISOString(); }   // a Sunday follow-up waits for Monday
  if (meta.set_status && STAGE[meta.set_status] && stageRank(meta.set_status) > stageRank(p.status) && p.status !== "declined") patch.status = meta.set_status;
  if (Object.keys(patch).length) { const np = await api.projects.update(p.id, patch); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np; }
}

// ---------- compose dialog ----------
// Message menu grouped by moment, the lead's likely moments first.
function tplOptions(tpls, selId) {
  const groups = {};
  for (const t of tpls) (groups[t.meta?.moment && MOMENTS[t.meta.moment] ? t.meta.moment : "_own"] ||= []).push(t);
  const order = [...Object.keys(MOMENTS), "_own"].filter((k) => groups[k]);
  return order.map((k) => `<optgroup label="${esc(k === "_own" ? "Your own messages" : MOMENTS[k])}">${groups[k].map((t) => `<option value="${t.id}"${selId === t.id ? " selected" : ""}>${esc(t.name.includes(" · ") ? t.name.split(" · ").slice(1).join(" · ") : t.name)}</option>`).join("")}</optgroup>`).join("");
}
const BRACKETS = /\[[^\]\n]{3,}\]/;   // "[you don't have a website / …]" left in a template
const VAR_LABEL = { deposit: "the deposit (write the quote first)", bank_details: "your bank details (Settings → Contracts → Bank details)", renewal_amount: "their plan price (client page → Edit)", renews_on: "their renewal date (client page → Edit)", trial_link: "their trial page (set up their Inbox Assistant first)", trial_replies: "the trial numbers (the trial card)", trial_drafted: "the trial numbers (the trial card)", trial_hours: "the trial numbers (the trial card)", trial_baseline: "the trial numbers (the trial card)", first_name: "their first name", name: "their name", my_name: "your name (Settings)", my_whatsapp: "your WhatsApp number (Settings)", signature: "your signature (Settings)", quote: "the quote amount (write the quote first)", quote_link: "the quote page (send the quote first)", deposit_link: "the quote page (send the quote first)", preview_link: "the mockup link (build or upload a mockup first)", review_link: "your Google review link (Settings)", referral_link: "their referral link (clients only)", their_review_link: "their Google review link (client page → Edit)", payment_link: "a card payment link (create one first)", live_site: "their live website (set it when the site goes live)", demo_link: "their demo assistant (build it first)", opportunities: "their scored opportunities (score some on the method card first)", result: "the measured result (record the after number on the baseline first)", quote_items: "the quote lines", goal: "what they asked for", indicative_price: "our estimate" };
function openCompose(p, kind, opts = {}) {
  const dlg = $("composeDialog");
  let tpls = S.templates.filter((t) => t.kind === kind && !t.archived);
  const ctx = ctxFor(p);
  // the message for this moment (opts.moment), else the usual one for the lead's stage
  const pick = () => (opts.moment ? (MOMENTS[opts.moment] ? tplFor(kind, opts.moment) : tplByName(kind, opts.moment)) : null) || defaultTemplate(kind, p.status, p) || null;
  let tpl = opts.template || tpls.find((t) => t.id === opts.templateId) || pick();
  const to = kind === "email" ? p.email : p.phone;
  const render = () => {
    const subj = tpl ? renderTpl(tpl.subject, ctx) : { text: "", missing: [] };
    const body = tpl ? renderTpl(tpl.body, ctx) : { text: "", missing: [] };
    const missing = [...new Set([...subj.missing, ...body.missing])];
    dlg.innerHTML = `
    <div class="adm-dialog__inner">
      <div class="adm-dialog__head"><div><h2 id="composeTitle">${kind === "email" ? "Email" : "WhatsApp"} · ${esc(p.business || p.name || p.ref)}</h2><p>To ${esc(p.name || "")} ${esc(to || "")}${opts.queue ? ` · ${opts.queue.pos} of ${opts.queue.total}` : ""}</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
      ${opts.aiInfo ? `<div class="adm-ai-draft"><p class="small"><b>AI draft</b> · ${opts.aiInfo.engine === "local" ? "written by your AI hub" : "written by Claude"}. Read it, fix anything in [brackets], then send.</p>${opts.aiInfo.based?.length ? `<p class="tiny muted">Based on: ${esc(opts.aiInfo.based.join(" · "))}</p>` : ""}${opts.aiInfo.warn ? `<p class="small adm-error">${esc(opts.aiInfo.warn)}</p>` : ""}${opts.aiInfo.check?.length ? `<ul class="small">${opts.aiInfo.check.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}${opts.aiInfo.engine === "local" && opts.onRedo ? '<button type="button" class="inline-link small" data-redo>Try the cloud AI instead (small cost)</button>' : ""}</div>` : ""}
      ${!tpls.length && !opts.template ? `<div class="adm-setup adm-setup--inline"><p class="small">No ready-made messages yet, so this starts blank.</p><button type="button" class="btn btn--primary btn--small" data-seed>Add them now</button></div>` : ""}
      <form class="adm-form" id="composeForm">
        <label>Start from <span class="muted" style="font-weight:400">(ready-made wording)</span><select name="tpl"><option value="">Blank: write your own</option>${tplOptions(tpls, tpl?.id)}</select></label>
        ${kind === "email" ? `<label>Subject<input name="subject" value="${esc(subj.text)}" required /></label>` : ""}
        <label>Message<textarea name="body" required>${esc(body.text)}</textarea></label>
        ${missing.length ? `<p class="adm-missing">Left blank: ${missing.map((m) => esc(VAR_LABEL[m] || m)).join("; ")}. Check the message reads well, or add it and come back.</p>` : ""}
        <p class="adm-missing" id="bracketWarn"${BRACKETS.test(body.text + subj.text) ? "" : " hidden"}>Replace the text in [square brackets] with your own words before sending.</p>
        ${tpl && metaSummary(tpl.meta) ? `<label class="check"><input type="checkbox" name="applyMeta" checked /><span>After sending: ${metaSummary(tpl.meta)}</span></label>` : ""}
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
    dlg.querySelector("[data-redo]")?.addEventListener("click", () => opts.onRedo?.());
    // no library yet: add the ready-made messages here and pick the right one straight away
    dlg.querySelector("[data-seed]")?.addEventListener("click", (e) => busy(e.target, async () => {
      try { await seedTemplates(); _seedCount = null; S.templates = (await api.templates.list()) || []; tpls = S.templates.filter((t) => t.kind === kind && !t.archived); tpl = pick(); toast("Ready-made messages added"); render(); }
      catch (ex) { toast(ex.message, true); }
    }, "Adding…"));
    const form = $("composeForm");
    form.tpl.addEventListener("change", () => { tpl = tpls.find((t) => t.id === form.tpl.value) || null; render(); });
    form.body.addEventListener("input", () => { $("bracketWarn").hidden = !BRACKETS.test(form.body.value); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("composeErr"), btn = $("composeSend");
      const text = form.body.value.trim(); if (!text) return;
      if (BRACKETS.test(text) || (kind === "email" && BRACKETS.test(form.subject.value))) { $("bracketWarn").hidden = false; $("bracketWarn").scrollIntoView({ block: "nearest" }); form.body.focus(); return; }
      btn.disabled = true; btn.textContent = kind === "email" ? "Sending…" : "Opening…";
      try {
        if (kind === "email") {
          await api.sendEmail({ projectId: p.id || null, templateId: tpl?.id || null, to, subject: form.subject.value.trim(), text, copyMe: form.copyMe.checked });
        } else if (!p.id) {
          const w = window.open(waLink(to, text), "_blank"); if (w) w.opener = null;
          await api.messages.insert({ project_id: null, kind: "whatsapp", to_address: to, body: text, template_id: tpl?.id || null, status: "opened" });
        } else {
          const logWa = async () => { await api.messages.insert({ project_id: p.id, kind: "whatsapp", to_address: to, body: text, template_id: tpl?.id || null, status: "opened" }); await api.events.insert(p.id, "whatsapp", `WhatsApp opened: "${text.slice(0, 70)}${text.length > 70 ? "…" : ""}"`, { to }); };
          const w = window.open(waLink(to, text), "_blank");
          if (w) { w.opener = null; }
          else {
            const er = $("composeErr"); er.hidden = false; er.innerHTML = `Pop-up blocked — <a href="${esc(waLink(to, text))}" target="_blank" rel="noopener" id="waFallback">tap here to open WhatsApp</a>.`;
            btn.disabled = false; btn.textContent = "Open in WhatsApp";
            $("waFallback").addEventListener("click", async () => { try { await logWa(); if (p.id && form.applyMeta?.checked) await applyMeta(p, tpl?.meta); } catch {} toast("Logged"); dlg.close(); S.loaded = 0; opts.onDone?.(); }, { once: true });
            return;
          }
          await logWa();
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
  const row = (t) => `<li><div class="adm-row adm-tpl-row"><div class="adm-row__main"><div class="adm-row__title">${esc(t.name.includes(" · ") ? t.name.split(" · ").slice(1).join(" · ") : t.name)}</div><div class="adm-row__sub">${esc(t.subject ? t.subject + " — " : "")}${esc(t.body.slice(0, 140))}</div>${metaSummary(t.meta) ? `<div class="adm-row__meta"><span class="tiny muted">${metaSummary(t.meta)}</span></div>` : ""}</div>
        <div class="adm-inline-actions" style="margin:0"><a class="btn btn--ghost" href="#/templates/${esc(t.id)}">Edit</a><button class="btn btn--ghost" data-dup="${esc(t.id)}">Duplicate</button><button class="btn btn--ghost" data-arch="${esc(t.id)}">${t.archived ? "Restore" : "Archive"}</button></div></div></li>`;
  const kindTab = q.get("kind") === "whatsapp" ? "whatsapp" : "email";
  const items = list.filter((t) => t.kind === kindTab);
  const groups = {};
  for (const t of items) (groups[t.meta?.moment && MOMENTS[t.meta.moment] ? t.meta.moment : "_own"] ||= []).push(t);
  const body = [...Object.keys(MOMENTS), "_own"].filter((k) => groups[k]).map((k) => `<section class="adm-section" data-tpl-group><h2>${esc(k === "_own" ? "Your own messages" : MOMENTS[k])} <span class="count">${groups[k].length}</span></h2><ul class="adm-list">${groups[k].map(row).join("")}</ul></section>`).join("")
    || (!showArchived && !S.templates.some((t) => !t.archived) ? `<div class="adm-empty adm-empty--act" style="margin-top:1rem"><b>No ready-made messages yet</b><span class="small">Add the starter set once: replies to enquiries, quotes, follow-ups, the Inbox Assistant trial and more. You can change any of the wording afterwards.</span><button type="button" class="btn btn--primary btn--small" id="seedTpl2">Add the ready-made messages</button></div>` : '<p class="adm-empty" style="margin-top:1rem">No messages here yet.</p>');
  const oldOnes = S.templates.filter((t) => !t.archived && !t.meta?.moment && OLD_STARTERS.has(t.kind + ":" + t.name.toLowerCase()));
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/settings">Settings</a></span><h1>Message wording</h1><p class="muted small">${S.templates.filter((t) => !t.archived).length} ready-made messages. Words in {{curly brackets}} are filled in for each lead.</p></div>
    <div class="adm-head__actions"><a class="btn btn--ghost btn--small" href="#/templates?archived=${showArchived ? 0 : 1}">${showArchived ? "Back to active" : "Archived"}</a>${(() => { const n = seedCount(); return n ? `<button class="btn btn--ghost btn--small" id="seedTpl">${S.templates.length ? `Add ${n} missing starter${n === 1 ? "" : "s"}` : "Add starter set"}</button>` : ""; })()}<a class="btn btn--primary btn--small" href="#/templates/new">+ New template</a></div></div>
  ${oldOnes.length ? `<div class="adm-card adm-setup"><h2>New message library</h2><p class="small muted">${STARTERS.length} ready-made messages written to sound like a person, with several versions for each moment (first contact, follow-ups, quotes, building, going live, reviews…). The panel picks the right one for each lead, and rotates first-contact versions so prospects don't all get the same words.</p><p class="small muted">Your ${oldOnes.length} current starter messages are archived, not deleted: you can restore any of them.</p><div class="btn-row"><button class="btn btn--primary btn--small" id="switchLib">Switch to the new messages</button></div></div>` : ""}
  ${subTabs([["email", "Email"], ["whatsapp", "WhatsApp"]].map(([k, l]) => [k, `${l} <span class="count">${list.filter((t) => t.kind === k).length}</span>`, `#/templates?kind=${k}${showArchived ? "&archived=1" : ""}`]), kindTab, "Email or WhatsApp")}
  ${items.length ? `<input type="search" class="adm-tpl-find" id="tplFind" placeholder="Find a message: a word from its name or wording…" aria-label="Find a message" autocomplete="off" />` : ""}
  <p class="muted small" style="margin:0.6rem 0 0.2rem">Words in <code>{{curly brackets}}</code> are filled in from the lead when you send. Anything in [square brackets] has to be replaced before the panel lets you send it.</p>
  ${body}`;
  // filter as you type, in place
  $("tplFind")?.addEventListener("input", (e) => { const t = e.target.value.trim().toLowerCase(); view.querySelectorAll("[data-tpl-group]").forEach((sec) => { let n = 0; sec.querySelectorAll(".adm-list > li").forEach((li) => { const hit = !t || li.textContent.toLowerCase().includes(t); li.hidden = !hit; if (hit) n++; }); sec.hidden = !n; }); });
  $("seedTpl2")?.addEventListener("click", async (e) => { e.target.disabled = true; try { await seedTemplates(); _seedCount = null; toast("Ready-made messages added"); await loadAll(true); route(); } catch (ex) { toast(ex.message, true); e.target.disabled = false; } });
  $("switchLib")?.addEventListener("click", async (e) => {
    e.target.disabled = true; e.target.textContent = "Switching…";
    try { for (const t of oldOnes) await api.templates.update(t.id, { archived: true }); const n = await seedTemplates(); _seedCount = null; toast(`${n} new messages added; ${oldOnes.length} old ones archived`); await loadAll(true); route(); }
    catch (ex) { toast(ex.message, true); e.target.disabled = false; }
  });
  $("seedTpl")?.addEventListener("click", async () => { $("seedTpl").disabled = true; try { await seedTemplates(); _seedCount = null; toast("Starter templates added"); await loadAll(true); route(); } catch (e) { toast(e.message, true); } });
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
      <label>Used for<select name="moment"><option value="">— my own message —</option>${Object.entries(MOMENTS).map(([k2, l]) => `<option value="${k2}"${t.meta?.moment === k2 ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label>Move the lead to<select name="set_status"><option value="">— leave it where it is —</option>${[["contacted", "Contacted (still To contact)"], ...STAGES.filter(([k]) => !["prospect", "declined"].includes(k))].map(([k, l]) => `<option value="${k}"${t.meta?.set_status === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
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
    if (form.moment.value) row.meta.moment = form.moment.value;
    try { const saved = isNew ? await api.templates.insert(row) : await api.templates.update(t.id, row); toast("Template saved"); await loadAll(true); location.hash = "#/templates"; void saved; }
    catch (ex) { $("tplErr").hidden = false; $("tplErr").textContent = ex.message; }
  });
  $("tplDelete")?.addEventListener("click", async () => { if (!confirm(`Delete "${t.name}"? Sent messages keep their text.`)) return; await api.templates.remove(t.id); toast("Deleted"); await loadAll(true); location.hash = "#/templates"; });
}

// ---------- ready-made messages ----------
// Grouped by the moment they're for (meta.moment). The panel picks a message
// for the lead's next step by moment; where there are several (first contact,
// follow-ups) it rotates, so prospects don't all get the same words. The name
// before " · " is the group shown in Message wording and the compose menu.
const MOMENTS = {
  intro: "First contact", ai_intro: "AI: first contact", follow_up: "Follow-up (no reply)", enquiry: "Reply to an enquiry", call: "Calls",
  mockup: "Mockup", quote: "Sending the quote", quote_follow: "Quote follow-up", deposit: "Deposit",
  building: "While building", balance: "Balance", live: "Going live", review: "Reviews", referral: "Referrals",
  content_ask: "Building: ask for their content", launch: "Going live: launch pack", year: "Year in review", ai_demo: "AI: send their demo assistant",
  gbp_offer: "Google profile: offer", gbp_start: "Google profile: getting started", gbp_access: "Google profile: Manager access", gbp_verify: "Google profile: verification", check_reply: "Free online check", gbp_done: "Google profile: done", gbp_upsell: "Google profile → website",
  renewal: "Hosting & care", care: "Care plan extras", reactivate: "Check back later", thanks: "Thank you",
  review_call: "Process review", ai_follow: "AI: follow-up (no reply)", discovery: "Discovery: opportunity map", results: "Results: what we improved", case_study: "Case study: permission",
  enquiry_ai: "Reply to an AI or Inbox Assistant enquiry", site_down: "Website problem",
  trial_agree: "Inbox trial: how we'll measure it", trial: "Inbox trial: check in", trial_unused: "Inbox trial: not used yet", trial_mark: "Inbox trial: please mark the replies", trial_call: "Inbox trial: book the result call", trial_won: "Inbox trial: the result (it worked)", trial_missed: "Inbox trial: the result (below the target)",
};
const ROTATE = new Set(["intro", "follow_up", "ai_follow", "reactivate"]);
const STARTERS = (() => {
  const sig = "\n\n{{signature}}";
  const E = (moment, name, subject, body, meta = {}) => ({ kind: "email", name, subject, body: body + sig, meta: { moment, ...meta } });
  const W = (moment, name, body, meta = {}) => ({ kind: "whatsapp", name, body, meta: { moment, ...meta } });
  const intro = { set_status: "contacted", next_action: "Follow up (no reply yet)", next_days: 4 };
  // Written the way you'd write to one person: something specific about them
  // ({{noticed}}, from their Google listing), one easy question, and a no that
  // costs them nothing. The "no" line is also the opt-out the law asks for.
  return [
    // first contact
    // the hiring signal: they're advertising an admin / reception / customer-service job (the finder notes it)
    E("intro", "First contact · Before you hire", "Before {{business}} hires for the inbox", "Hi {{first_name}},\n\nI saw {{business}} is hiring a [role]. Before you do, this might be worth a look.\n\nIf a good part of that job is answering customer emails (quotes, bookings, \"where's my order\"), our Inbox Assistant writes every routine reply in seconds from your own prices and policies: paste the email in, check the reply, send it.\n\nWe set you up with your own private page first, ready within 3 business days, with a R1,500 deposit to start. You pay the rest only once it's saving your team at least 5 hours a week (R9,500 setup in total, then R2,950 a month), and if it doesn't, the deposit comes back.\n\nYou can see the replies it writes here, and if you send us one of your own customer emails from that page, we'll send back the draft it writes for it: {{try_link}}\n\nYou may still want to hire, and then the new person starts without a backlog. If it's not for you, no problem at all, I won't keep emailing.\n\nKind regards,", { autoAdd: true, next_action: "Follow up: did they try it?", next_days: 4 }),
    W("intro", "First contact · Before you hire", "Hi {{first_name}}, {{my_name}} here from Re-Charge. I saw {{business}} is hiring a [role]. Before you do: if a lot of that job is customer emails, our Inbox Assistant writes every routine reply for your team to check and send. We set it up for you first: a R1,500 deposit to start, and the rest only once it's saving 5 hours a week (then R2,950 a month). If it doesn't, the deposit comes back.\n\nSee the replies it writes here, or send us one of your own emails and we'll send back its draft: {{try_link}}", { autoAdd: true, next_action: "Follow up: did they try it?", next_days: 4 }),
    // the live "try it on your own email" demo (ai-demos#try): they see it on their own work, no call needed
    E("intro", "First contact · Try it on your own email", "Try this on one of {{business}}'s emails", "Hi {{first_name}},\n\nI came across {{business}}. {{noticed}}\n\nRather than tell you what AI can do, here's a quick way to see it on your own work. This page shows the replies it writes to customer emails, and if you send us one of yours from there, we'll send back the draft it writes for it:\n\n{{try_link}}\n\nIt won't know your prices or dates yet, so it leaves those as gaps for you to fill. That's how it works for real too: AI drafts, a person checks and sends.\n\nIf it looks useful, reply and we'll set up a free 30-minute call to look at your inbox properly. If not, no problem at all, I won't keep emailing.\n\nKind regards,", { autoAdd: true, next_action: "Follow up: did they try it?", next_days: 4 }),
    W("intro", "First contact · Try it on your own email", "Hi {{first_name}}, {{my_name}} here from Re-Charge. Quick one for {{business}}: this page shows the replies AI writes to customer emails, and if you send us one of yours, we'll send back its draft: {{try_link}}\n\nIt leaves prices and dates as gaps for you to fill, because a person always checks. If it's useful, we can do the same on your real inbox. No obligation.", { autoAdd: true, next_action: "Follow up: did they try it?", next_days: 4 }),
    E("ai_follow", "AI follow-up · Try it on one email", "One email, drafted for you", "Hi {{first_name}},\n\nFollowing up on my note about {{business}}. If you'd rather see it than read about it, this page shows the replies it writes, and you can send us one of your own customer emails for a draft too:\n\n{{try_link}}\n\nIf the draft is close to what you'd send, a free 30-minute call is worth it. If it isn't, that's useful to know too.\n\nThanks,", { autoAdd: true, next_action: "Last follow-up", next_days: 5 }),
    W("ai_follow", "AI follow-up · Try it on one email", "Hi {{first_name}}, one more thing: if you'd like to see it before talking, this page shows the replies it writes, and you can send us one of your own emails for a draft: {{try_link}}", { autoAdd: true, next_action: "Last follow-up", next_days: 5 }),
    E("intro", "First contact · Missing after-hours messages", "The enquiries {{business}} handles by hand", "Hi {{first_name}},\n\nI came across {{business}}. {{noticed}}\n\nA question I ask every business I work with: how much of your team's week goes on reading enquiries, looking up prices and writing the same replies? It's usually more than people think, and plenty of it arrives after hours when nobody's there.\n\nWe design and build AI systems that take the repetitive part off a team: the system reads each enquiry, pulls out what the person needs, checks your own information and prepares the reply for someone to approve. Then we measure the time it saves.\n\nWould a free 30-minute process review be useful? Bring one process that takes too long, and I'll tell you honestly whether AI is the answer. If it's a no, no problem at all, I won't keep emailing.", { next_action: "Follow up in 3 days", next_days: 3 }),
    E("intro", "First contact · The same questions all day", "The answers {{business}} already has", "Hi {{first_name}},\n\nQuick question about {{business}}: how often does someone on your team stop to find a price, a policy or a procedure, or interrupt the one person who knows?\n\nWe turn the documents a team searches by hand into one knowledge base they can just ask, with the source shown every time. It's one of the quickest wins we see, and we measure it before and after so you know what it's worth.\n\nWould a free 30-minute process review be useful? You bring the process; I'll tell you honestly whether it's worth automating. If it's a no, no problem at all, I won't keep emailing.", { next_action: "Follow up in 3 days", next_days: 3 }),
    E("intro", "First contact · A website for them", "A website for {{business}}?", `Hi {{first_name}},\n\nWe build websites for small businesses{{in_area}}, and I came across {{business}}. {{noticed}}\n\nA business website from us starts at ${money(1250000)}: designed around your services, quick on a phone, and one tap for customers to call or WhatsApp you. You get a fixed quote first, so you know exactly what it costs before you decide.\n\nWould it be worth a quick chat? If it's not for you, no problem at all, I won't keep emailing.`, { next_action: "Follow up in 3 days", next_days: 3 }),
    W("intro", "First contact · Missing after-hours messages", "Hi {{first_name}}, I came across {{business}}. {{noticed}}\n\nQuick question: how many hours a week does your team spend reading enquiries and writing the same replies? We build AI systems that prepare those replies for a person to approve, and we measure the time it saves.\n\nWould a free 30-minute process review be useful? No obligation.", { next_action: "Follow up in 3 days", next_days: 3 }),
    W("intro", "First contact · The same questions all day", "Hi {{first_name}}, quick one about {{business}}: how often does your team stop to look up a price, a policy or a procedure? We build AI systems that answer those from your own documents, with the source shown, and we measure the time it saves. Fancy a free 30-minute process review?", { next_action: "Follow up in 3 days", next_days: 3 }),
    W("intro", "First contact · A website for them", `Hi {{first_name}}, {{my_name}} here from Re-Charge. We do websites for local businesses{{in_area}}, and I came across {{business}}. Would a site that works properly on phones help? They start at ${money(1250000)}, with a fixed quote first. Happy to send a few examples. No obligation.`, { next_action: "Follow up in 3 days", next_days: 3 }),

    // follow-ups (no reply)
    E("follow_up", "Follow-up · Gentle nudge", "A website for {{business}}", "Hi {{first_name}},\n\nI sent you a note the other day about a website for {{business}}. I know how busy it gets, so I thought I'd check it didn't get buried.\n\nIf it's useful, I'm happy to send a few examples and a fixed quote. A quick yes or no is all I need.\n\nThanks,", { next_action: "Last follow-up", next_days: 7 }),
    E("follow_up", "Follow-up · Something useful", "Something I see a lot", "Hi {{first_name}},\n\nSomething I see a lot: a customer searches for a business on their phone, can't find prices or a quick way to get in touch, and phones the next one instead. It's usually not that the business isn't good. People just can't find it.\n\nThat's really all a good website fixes. If you'd like to see what one could do for {{business}}, I'm happy to send a few examples and a fixed quote.\n\nKind regards,", { next_action: "Last follow-up", next_days: 7 }),
    E("follow_up", "Follow-up · Last one", "Last one from me", "Hi {{first_name}},\n\nI don't want to keep filling your inbox, so this is the last one from me.\n\nIf a website ever moves up the list, just reply to this email, even if it's months from now. I'll still be happy to help.\n\nAll the best with {{business}},", { next_action: "No reply: park it", next_days: 30 }),
    W("follow_up", "Follow-up · Nudge", "Hi {{first_name}}, just checking my message about a website for {{business}} didn't get lost. No rush at all.", { next_action: "Last follow-up", next_days: 7 }),
    W("follow_up", "Follow-up · Last one", "Hi {{first_name}}, I'll leave it here so I don't keep bugging you. If you ever want a website for {{business}}, just send me a message. All the best!", { next_action: "No reply: park it", next_days: 30 }),

    // replying to an enquiry
    E("enquiry", "Enquiry · Thanks, here's what happens next", "Re: {{business}}", "Hi {{first_name}},\n\nThanks for getting in touch about {{business}}. I've read through what you sent.\n\nI'll come back to you by 17:00 the next business day, either with a couple of questions or with a plan, and then send you a fixed quote online. You don't pay anything until you've seen the quote and said yes.\n\nIf it's easier to talk, WhatsApp me on {{my_whatsapp}}.\n\nThanks,", { next_action: "Send the quote", next_days: 1 }),
    E("enquiry", "Enquiry · A few questions first", "A few quick questions about {{business}}", "Hi {{first_name}},\n\nThanks for your message. So I can give you an accurate quote, could you tell me:\n\n1. Do you already have a domain, like yourbusiness.co.za?\n2. Roughly what should be on the site? A few pages, or one long page is fine.\n3. Is there a website you like the look of?\n4. When would you like it live?\n\nRough answers are perfect, and so is a voice note on WhatsApp ({{my_whatsapp}}) if that's easier. Once I have them, I'll send your quote.\n\nThanks,", { next_action: "Send the quote", next_days: 2 }),
    E("enquiry", "Enquiry · Let's have a quick call", "Quick call about {{business}}?", "Hi {{first_name}},\n\nThanks for reaching out. I think a free 30-minute call will get us to a quote quicker than a long email thread. You can pick a time that suits you here: {{call_link}}\n\nOr WhatsApp me on {{my_whatsapp}} and we can sort it out there.\n\nThanks,", { next_action: "Book the call", next_days: 1 }),
    W("enquiry", "Enquiry · Quick hello", "Hi {{first_name}}, it's {{my_name}} from Re-Charge. Thanks for your message about {{business}}! Do you have a minute for a couple of quick questions? Then I can put a quote together for you."),
    // an enquiry about AI or the Inbox Assistant: the three things we need to set it up
    E("enquiry_ai", "Enquiry · Inbox Assistant", "Your customer emails at {{business}}", `Hi {{first_name}},\n\nThanks for getting in touch. A few quick questions so I can set the Inbox Assistant up properly for {{business}}:\n\n1. Roughly how many customer emails come in a day?\n2. Which inbox do they arrive in (Gmail, Outlook or something else)?\n3. Who answers them at the moment, and what do people ask most (prices, bookings, "where's my order")?\n\nRough answers are perfect. If it's easier to talk, book a free 30-minute call here: {{call_link}}\n\nHow it works: a ${money(INBOX_DEPOSIT)} deposit to start, and it's ready within 3 business days. It then runs on your real emails for two weeks. You pay the rest (${money(INBOX_SETUP)} setup in total, then ${money(PLAN_MONTHLY.inbox)} a month) only if it saves your team 5 hours a week; if it doesn't, the deposit comes back in full.\n\nThanks,`, { autoAdd: true, next_action: "Follow up: did they answer the questions?", next_days: 2 }),
    W("enquiry_ai", "Enquiry · Inbox Assistant", `Hi {{first_name}}, {{my_name}} here from Re-Charge. Thanks for your message! Three quick questions so I can set the Inbox Assistant up for {{business}}: about how many customer emails a day, which inbox they come into (Gmail, Outlook…), and who answers them now? Voice notes are fine. Or book a free 30-minute call: {{call_link}}`, { autoAdd: true, next_action: "Follow up: did they answer the questions?", next_days: 2 }),
    W("enquiry", "Enquiry · The questions", "Hi {{first_name}}, thanks for getting in touch! So I can quote you properly: do you have a domain already (like yourbusiness.co.za), and is there a website you like the look of? Voice notes are 100% fine 🙂"),

    // calls
    E("call", "Call · Confirmed", "Our call about {{business}}", "Hi {{first_name}},\n\nJust confirming our call. I'll phone you on the number you gave me. If the time doesn't work any more, reply with one that does.\n\nIf you have a minute beforehand, think about what's frustrating you most at the moment, who the site is for, and any websites you like the look of.\n\nSpeak soon,"),
    W("call", "Call · Reminder", "Hi {{first_name}}, just confirming our call today. Does the time still suit you?"),
    W("call", "Call · Missed you", "Hi {{first_name}}, I tried calling but couldn't get through. When's a good time to try again? Or we can chat here if that's easier."),

    // mockup
    E("mockup", "Mockup · It's ready", "Your mockup for {{business}}", "Hi {{first_name}},\n\nYour mockup is ready. It's best viewed on your phone:\n\n{{preview_link}}\n\nIt's a first draft based on what you told me, so please be honest. What do you like, and what would you change? If you like the direction, I'll send you a fixed quote to build the real thing.\n\nThanks,", { next_action: "Ask what they think of the mockup", next_days: 2 }),
    E("mockup", "Mockup · Updated version", "Updated mockup for {{business}}", "Hi {{first_name}},\n\nI've made the changes we spoke about. Here's the new version:\n\n{{preview_link}}\n\nHave another look and let me know what you think. Once you're happy with the direction, I'll send the quote.\n\nThanks,", { next_action: "Ask what they think of the mockup", next_days: 2 }),
    W("mockup", "Mockup · It's ready", "Hi {{first_name}}, your mockup for {{business}} is ready 🙂\n\n{{preview_link}}\n\nHave a look and tell me what you'd change.", { next_action: "Ask what they think of the mockup", next_days: 2 }),
    W("mockup", "Mockup · Did you see it?", "Hi {{first_name}}, did you get a chance to look at the mockup? {{preview_link}}\n\nEven a thumbs up or down helps."),

    // the quote
    E("quote", "Quote · Your fixed quote", "Your quote for {{business}} ({{ref}})", "Hi {{first_name}},\n\nThanks for the chat. Here's your fixed quote for {{business}}:\n\n{{quote_items}}\n\nTotal: {{quote}}\n\nYou can see the details and accept it here: {{quote_link}}\n\nWhen you accept, the deposit to start is {{deposit}}, paid on that page, and it comes off the total. The balance is due when the work is finished. Anything extra is always agreed with you first.\n\nAny questions, just reply.\n\nThanks,", { set_status: "quote_sent", next_action: "Follow up on the quote", next_days: 3 }),
    E("quote", "Quote · Short version", "Your quote for {{business}}", "Hi {{first_name}},\n\nHere's your quote for {{business}}: {{quote}}.\n\nEverything's on this page, and you can accept it there too: {{quote_link}}\n\nShout if anything needs changing.\n\nThanks,", { set_status: "quote_sent", next_action: "Follow up on the quote", next_days: 3 }),
    W("quote", "Quote · Here it is", "Hi {{first_name}}, here's your quote for {{business}} ({{quote}}): {{quote_link}}\n\nYou can accept it on that page; the deposit to start is {{deposit}}. Shout if anything's unclear, happy to adjust.", { set_status: "quote_sent", next_action: "Follow up on the quote", next_days: 3 }),

    // quote follow-up
    E("quote_follow", "Quote follow-up · Any questions?", "Your quote for {{business}}", "Hi {{first_name}},\n\nJust checking in on the quote for {{business}}. If anything's unclear, or the budget's tight, tell me. I can often change the scope to fit.\n\nHere it is again: {{quote_link}}\n\nThanks,", { next_action: "Last check on the quote", next_days: 5 }),
    W("quote_follow", "Quote follow-up · Nudge", "Hi {{first_name}}, did the quote make sense? Happy to change anything. {{quote_link}}", { next_action: "Last check on the quote", next_days: 5 }),

    // deposit
    E("deposit", "Deposit · Friendly reminder", "Ready when you are", "Hi {{first_name}},\n\nThanks for accepting the quote for {{business}}!\n\nWhenever you're ready, the deposit ({{deposit}}) gets us started. You can pay it by card here: {{quote_link}}\n\nPrefer EFT? Use these details, with {{ref}} as the reference:\n{{bank_details}}\n\nIf something's holding you back, I'd genuinely like to know.\n\nThanks,", { next_action: "Check in on the deposit", next_days: 3 }),
    W("deposit", "Deposit · Nudge", "Hi {{first_name}}, thanks for accepting the quote! Whenever you're ready, the deposit ({{deposit}}) gets us started: {{quote_link}}", { next_action: "Check in on the deposit", next_days: 3 }),

    // while building
    E("building", "Building · I've started", "I've started on {{business}}", "Hi {{first_name}},\n\nDeposit received, thank you! I've started on your site.\n\nWhen you get a moment, please send me:\n• your logo (any format is fine)\n• a few photos of your work, shop or team\n• your services and prices\n\nYou can see how it's going at any time here: {{quote_link}}\n\nThanks,", { next_action: "Send the first version for review", next_days: 4 }),
    E("building", "Building · Ready for your review", "Have a look: {{business}}", "Hi {{first_name}},\n\nThe first version of your site is ready to look at:\n\n{{preview_link}}\n\nHave a proper look on your phone, then send me a list of changes, big or small. Nothing goes live until you're happy.\n\nThanks,", { next_action: "Make their changes", next_days: 3 }),
    W("building", "Building · I've started", "Hi {{first_name}}, deposit received, thank you! I've started on your site. When you can, please send your logo, a few photos and your price list."),
    W("building", "Building · Ready for your review", "Hi {{first_name}}, the first version of your site is ready: {{preview_link}}\n\nHave a look on your phone and send me any changes."),

    // balance
    E("balance", "Balance · Final payment", "Nearly live: {{business}}", "Hi {{first_name}},\n\nYour site is ready to go live! The balance is {{balance}}.\n\nYou can pay it by card here: {{payment_link}}\n\nPrefer EFT? Use these details, with {{ref}} as the reference:\n{{bank_details}}\n\nAs soon as it's in, I'll switch your site on.\n\nThanks,", { next_action: "Check the balance is paid", next_days: 3 }),
    W("balance", "Balance · Payment link", "Hi {{first_name}}, your site's ready! Here's the link for the balance ({{balance}}): {{payment_link}}\n\nAs soon as it's paid, we go live 🙂"),

    // going live
    E("live", "Live · You're live", "{{business}} is live", "Hi {{first_name}},\n\n{{business}} is live. Congratulations!\n\nHave a look: {{preview_link}}\n\nIf anything looks odd in the first few weeks, just message me. That's covered. Thank you for trusting me with it.\n\nKind regards,", { set_status: "live", next_action: "Ask for a review", next_days: 7 }),
    W("live", "Live · You're live", "Hi {{first_name}}, {{business}} is live 🎉 {{preview_link}}\n\nThank you for trusting me with it. If anything looks odd, just message me.", { set_status: "live", next_action: "Ask for a review", next_days: 7 }),

    // reviews & referrals
    E("review", "Review · A quick favour", "A quick favour?", "Hi {{first_name}},\n\nNow that {{business}} has been live for a little while, would you mind leaving me a short Google review? It takes a minute and really helps a small business like mine:\n\n{{review_link}}\n\nOne or two honest lines is perfect. Thank you!\n\nKind regards,"),
    W("review", "Review · Quick favour", "Hi {{first_name}}, hope the site's working well for you! Would you mind leaving me a quick Google review? It really helps a small business like mine 🙏 {{review_link}}"),
    E("referral", "Referral · Know someone?", "Know someone who needs a website?", "Hi {{first_name}},\n\nI hope the new site is bringing {{business}} some new customers.\n\nIf you know another business owner who doesn't have a website yet, or has one that isn't doing much for them, I'd be grateful for an introduction. When their site goes live, your next year of Care is on me.\n\nThe easiest way is to send them your link: {{referral_link}}\n\nThanks,"),
    E("referral", "Referral · You both win", "R250 off for anyone you send my way", "Hi {{first_name}},\n\nI hope the new site is bringing {{business}} some new customers.\n\nIf you know another business owner who needs a website, send them your link: {{referral_link}}\n\nThey get R250 off their website, and when their site goes live, your next year of Care is on me. You both win.\n\nThanks,", { autoAdd: true }),
    W("referral", "Referral · You both win", "Hi {{first_name}}, quick one: know another business owner who needs a website? Send them your link 🙏 {{referral_link}}\n\nThey get R250 off their website, and when it goes live your next year of Care is free. You both win.", { autoAdd: true }),
    W("referral", "Referral · Know someone?", "Hi {{first_name}}, quick one: if you know another business owner who needs a website, send them your link 🙏 {{referral_link}}\n\nWhen their site goes live, your next year of Care is free."),

    // hosting & care
    E("renewal", "Hosting & care · Renewal coming up", "Hosting renewal for {{business}}", "Hi {{first_name}},\n\nJust a heads-up that hosting & care for {{business}} renews on {{renews_on}}. The renewal is {{renewal_amount}}, and everything carries on as it is: your site stays online, with backups and updates included.\n\nYou can pay the renewal by card here: {{payment_link}}\n\nIf you'd like to change your plan, or have any questions, just reply.\n\nThanks,", { next_action: "Check the renewal is paid", next_days: 7 }),
    E("renewal", "Hosting & care · Offer the upgrade", "Small changes to your site, done for you", `Hi {{first_name}},\n\nQuick one about {{business}}'s website. At the moment your plan covers hosting, which keeps the site online.\n\nThe Care plan (${money(PLAN_MONTHLY.care)} a month, or ${money(PLAN_PRICE.care)} a year) also looks after it for you:\n• up to an hour of small changes a month, done for you: new prices, photos, hours or contact details\n• updates and backups taken care of\n• a short monthly report on how your site is doing\n\nYou just send me a message and it's done. Would you like me to switch you over at your next renewal?\n\nThanks,`),
    W("renewal", "Hosting & care · Offer the upgrade", `Hi {{first_name}}, quick one: your plan for {{business}} covers hosting. The Care plan (${money(PLAN_MONTHLY.care)} a month, or ${money(PLAN_PRICE.care)} a year) also covers up to an hour of small changes a month, done for you, plus updates and a monthly report. Want me to switch you over at your next renewal?`),
    W("renewal", "Hosting & care · Renewal reminder", "Hi {{first_name}}, just a heads-up that hosting & care for {{business}} renews on {{renews_on}} ({{renewal_amount}}). Here's the card payment link: {{payment_link}} Thanks!"),

    // care plan extras
    W("care", "Care · Your Google review link", "Hi {{first_name}}, here's your Google review link: {{their_review_link}}\n\nSend it to happy customers right after a job, or put it on your invoices and WhatsApp status. More reviews means more people find {{business}} on Google."),
    E("care", "Care · Your Google review link", "Your Google review link", "Hi {{first_name}},\n\nAs part of your Care plan, here's the link your customers can tap to leave {{business}} a Google review:\n\n{{their_review_link}}\n\nThe best time to send it is straight after a job, while they're happy. It also works well at the bottom of invoices, in your WhatsApp status, or as a QR code at the counter (just ask and I'll make you one).\n\nMore reviews means more people find you on Google, and more of them pick you.\n\nThanks,"),

    // check back later (lost or went quiet)
    E("reactivate", "Check back · A few months later", "Website for {{business}}", "Hi {{first_name}},\n\nIt's {{my_name}} from Re-Charge. We chatted a while back about a website for {{business}}, and I wondered whether it's still on the cards.\n\nIf it is, I'm happy to pick up where we left off and send you a fixed quote. If the timing still isn't right, no problem at all.\n\nKind regards,"),
    W("reactivate", "Check back · A few months later", "Hi {{first_name}}, it's {{my_name}} from Re-Charge. We chatted a while ago about a website for {{business}}. Is it still something you'd like to do? Happy to send you a fixed quote if that helps."),

    // Google profile setup (R450, paid when done)
    // (the R450 Google profile setup is no longer offered: no "offer" message; the rest stay for leads already on it)
    W("gbp_start", "Google profile · Getting started", "Hi {{first_name}}, it's {{my_name}} from Re-Charge. Thanks for booking the Google profile setup for {{business}}! To get started, could you send me:\n\n1. Your opening hours\n2. Your main services or products (with prices, if you're happy to show them)\n3. 5 to 10 photos: your work, your space, you and your team, and your logo if you have one\n4. The area you serve\n\nIf you're already on Google Maps, send me the link too (open your business on Google Maps → Share). I'll take it from there.", { gbp: true, next_action: "Set up their Google profile", next_days: 2 }),
    E("gbp_start", "Google profile · Getting started", "Your Google profile: what I need", "Hi {{first_name}},\n\nThanks for booking the Google profile setup for {{business}}! To get started, could you reply with:\n\n1. Your opening hours\n2. Your main services or products (with prices, if you're happy to show them)\n3. 5 to 10 photos: your work, your space, you and your team, and your logo if you have one\n4. The area you serve\n\nIf you're already on Google Maps, send me the link too (open your business on Google Maps → Share).\n\nGoogle sometimes asks the owner to verify the business with a short video or a code. If that happens, I'll walk you through it: it takes about five minutes.", { gbp: true, next_action: "Set up their Google profile", next_days: 2 }),
    W("gbp_access", "Google profile · Manager access", "Hi {{first_name}}, to work on the Google profile for {{business}} I just need access to it, never your password. On your phone: search {{business}} on Google, tap your profile, then ⋮ → Business Profile settings → People and access → Add, and add {{my_email}} as a Manager.\n\nYou stay the owner, and you can remove me any time. No Google profile yet? Then we'll set one up together on a quick call, 15 minutes.", { gbp: true }),
    E("gbp_access", "Google profile · Manager access", "Access to the Google profile for {{business}}", "Hi {{first_name}},\n\nTo work on the Google profile for {{business}}, I just need access to it. Never send me your password.\n\nOn your phone:\n1. Search {{business}} on Google (signed in to the Google account that manages it) and tap your profile.\n2. Tap ⋮ → Business Profile settings → People and access → Add.\n3. Add {{my_email}} as a Manager.\n\nYou stay the owner, and you can remove me any time. No Google profile yet? Then we'll set one up together on a quick call, about 15 minutes.", { gbp: true }),
    W("gbp_verify", "Google profile · Verification steps", "Hi {{first_name}}, Google wants to check that {{business}} is real before the profile goes live. Usually it asks for a short video from the profile on your phone (Verify → Video). Film it in one go, about a minute, no cuts:\n\n1. Outside: your sign, or where you work (for a mobile business: your branded vehicle or your tools)\n2. Inside: your space, equipment or stock\n3. Proof it's yours: unlock the door or till, or show a document or invoice with the business name\n\nIf it offers a phone, SMS or email code instead, that's even easier. Any trouble, send me a message and we'll do it together.", { gbp: true }),
    E("gbp_verify", "Google profile · Verification steps", "One quick step from you: verifying {{business}}", "Hi {{first_name}},\n\nGoogle wants to check that {{business}} is real before the profile goes live. Usually it asks the owner for a short video, from the profile on your phone (Verify → Video).\n\nFilm it in one go, about a minute, no cuts:\n1. Outside: your sign, or where you work (for a mobile business: your branded vehicle or your tools).\n2. Inside: your space, equipment or stock.\n3. Proof it's yours: unlock the door or till, or show a document or invoice with the business name on it.\n\nIf Google offers a phone, SMS or email code instead, that's even easier. Google usually reviews it within a few days. If you get stuck, reply here and we'll do it together.", { gbp: true }),
    // the site's "before you go" free online check: 3 quick fixes, then a mockup
    W("ai_demo", "AI demo · I built you one", "Hi {{first_name}}, {{my_name}} here from Re-Charge. We built {{business}} an AI assistant and put it online so you can try it: {{demo_link}}\n\nAsk it the questions your customers ask you — hours, prices, what you do. It answers day and night, and it never gets tired of the same question.\n\nIt's free to try and there's nothing to sign. It only knows what's public about you at the moment; the real one knows your actual prices and answers on your WhatsApp. Worth a chat?", { autoAdd: true, next_action: "Follow up on their demo", next_days: 2 }),
    E("ai_demo", "AI demo · I built you one", "We built {{business}} an AI assistant — have a look", "Hi {{first_name}},\n\nMy name's {{my_name}} from Re-Charge. Rather than describe it, we built {{business}} a working AI assistant and put it online for you to try:\n\n{{demo_link}}\n\nAsk it what your customers ask you: your hours, your prices, what you do. Right now it only knows what's public about {{business}}; a real one works from your actual information, inside the tools you already use, and hands the genuine leads to your team.\n\nIf it looks useful, the next step is a free 30-minute process review, where we measure how many hours enquiries take today so you can see exactly what it would save.\n\nWorth a quick chat? And if it's a no, no problem, I won't keep emailing.\n\nKind regards,", { autoAdd: true, next_action: "Follow up on their demo", next_days: 2 }),
    W("ai_intro", "AI · Missing after-hours customers", "Hi {{first_name}}, {{my_name}} here from Re-Charge. Quick question: what's the work at {{business}} that your team shouldn't really be doing? Retyping, chasing, answering the same enquiries?\n\nWe design and build AI systems that take that repetitive part off a team, connect the software you already use, and measure the hours it gives back.\n\nIt starts with a free 30-minute process review: bring one process that takes too long, and we'll tell you honestly whether AI is the answer. Worth a chat?", { autoAdd: true, next_action: "Follow up on the AI intro", next_days: 3 }),
    E("ai_intro", "AI · Missing after-hours customers", "The work {{business}} shouldn’t be doing", "Hi {{first_name}},\n\nMy name's {{my_name}} from Re-Charge. One question: what's the work at {{business}} that your team shouldn't really be doing? For most businesses{{in_area}} it's the same few things: reading and answering enquiries, retyping data between systems, searching documents for answers, building the same report every month.\n\nWe design and implement AI systems that take that repetitive part off a team, connect the software you already use, and give people better access to information they already have. Every system starts with a measured baseline, so you see exactly what changed.\n\nThe first step is a free 30-minute process review. Bring one process that takes too long; we'll tell you honestly whether AI is the answer, and what it would take.\n\nYou can also try a few of the systems yourself: {{demos_link}}\n\nIf it's a no, no problem at all, I won't keep emailing.\n\nKind regards,", { autoAdd: true, next_action: "Follow up on the AI intro", next_days: 3 }),
    W("launch", "Launch · You're live (with your post)", "Hi {{first_name}}, {{business}} is live! 🎉 {{live_site}}\n\nI'm sending you a ready-made post. Three quick things that get customers to it:\n1. Put the post on your WhatsApp status and Facebook or Instagram.\n2. Add the link to your Google profile and Instagram bio.\n3. Send it to your regulars.\n\nAny changes, just message me.", { autoAdd: true }),
    E("launch", "Launch · You're live (with your post)", "{{business}} is live 🎉", "Hi {{first_name}},\n\n{{business}} is live: {{live_site}}\n\nI'm sending you a ready-made post announcing it on WhatsApp. Three quick things that get customers to the site:\n\n1. Share the post on your WhatsApp status and on Facebook or Instagram.\n2. Add the link to your Google profile and your Instagram bio.\n3. Send it to your regular customers.\n\nIf anything looks odd in the first few weeks, just message me. That's covered.\n\nThanks for trusting me with it,", { autoAdd: true }),
    W("year", "Year in review · Your year online", "Hi {{first_name}}, here's {{business}}'s year online 🎉 (image attached). Feel free to post it on your status or Facebook: customers love seeing a busy business. Thanks for a great year!", { autoAdd: true }),
    E("year", "Year in review · Your year online", "{{business}}: your year online", "Hi {{first_name}},\n\nHere's how {{business}}'s website did this year: I'm sending you the image on WhatsApp. Feel free to post it on Facebook, Instagram or your WhatsApp status: customers love seeing a busy business.\n\nThank you for a great year. If there's anything you'd like to add to the site for next year, just reply.\n\nKind regards,", { autoAdd: true }),
    W("content_ask", "Content · Photos and details", "Hi {{first_name}}, we've started on {{business}}! To get it live quickly, please send us your logo, a few photos of your work and your services and prices. You can add them straight on this page, from your phone: {{quote_link}}\n\nOr just WhatsApp them to me here, whatever's easier.", { autoAdd: true, next_action: "Check their content came in", next_days: 3 }),
    E("content_ask", "Content · Photos and details", "{{business}}: your photos and details", "Hi {{first_name}},\n\nWe've started on {{business}}!\n\nTo get you live quickly, we need a few things from you:\n• your logo (any format is fine)\n• a few photos of your work, shop or team (real photos beat stock photos)\n• your services and prices, and your hours\n\nYou can add them all on this page, straight from your phone: {{quote_link}}\n\nOr reply with them attached, whatever's easier.\n\nThanks,", { autoAdd: true, next_action: "Check their content came in", next_days: 3 }),
    W("check_reply", "Free online check · 3 quick fixes", "Hi, it's {{my_name}} from Re-Charge, thanks for asking for the free check of {{business}}! I had a look, and here are 3 quick things that would help:\n\n1. [first fix]\n2. [second fix]\n3. [third fix]\n\nHappy to help with any of them. And if a new website would help, I can send you a fixed quote.", { autoAdd: true, set_status: "new", next_action: "Follow up on their check", next_days: 3 }),
    E("check_reply", "Free online check · 3 quick fixes", "Your free online check: {{business}}", "Hi,\n\nThanks for asking for the free check of {{business}}. I had a look at how you show up on Google and on phones, and here are 3 quick things that would help:\n\n1. [first fix]\n2. [second fix]\n3. [third fix]\n\nHappy to help with any of them. And if a new website would help, I can send you a fixed quote, so you know exactly what it costs before you decide anything.", { autoAdd: true, next_action: "Follow up on their check", next_days: 3 }),
    W("gbp_done", "Google profile · Done", "Hi {{first_name}}, your Google profile for {{business}} is all set up! Search for {{business}} on Google Maps to have a look.\n\nI've attached your review card: print it for the counter, or send the picture to happy customers. More reviews means you show up higher.\n\nThe R450 can be paid here when you're happy: {{payment_link}}\n\nThank you!", { gbp: true }),
    E("gbp_done", "Google profile · Done", "{{business}} is all set up on Google", "Hi {{first_name}},\n\nYour Google profile for {{business}} is all set up. Search for {{business}} on Google Maps to have a look, and let me know if anything needs changing.\n\nI've attached your review card: print it for the counter, or send the picture to happy customers. More reviews means you show up higher in searches.\n\nWhen you're happy, the R450 can be paid here: {{payment_link}}\n\nThank you for the work!", { gbp: true }),
    W("gbp_upsell", "Google profile · Website next", "Hi {{first_name}}, hope the Google profile's bringing in some calls! Quick one: the next step that usually helps most is a simple website, so people who find you on Google can see your prices and book or WhatsApp you in one tap. The R450 you paid comes off the website if you go ahead within 90 days. Shall I send you a fixed quote?", { gbp: true }),
    E("gbp_upsell", "Google profile · Website next", "The next step for {{business}}", "Hi {{first_name}},\n\nI hope the Google profile's bringing in some calls.\n\nThe next step that usually helps most is a simple website, so people who find you on Google can see your prices and book or WhatsApp you in one tap. The R450 you paid for the Google setup comes off the website if you go ahead within 90 days, and you get a fixed quote first, so you know exactly what it costs.\n\nWould you like me to send one?", { gbp: true }),


    // the AI method: process review → discovery → results → case study (autoAdd: added once to existing libraries)
    E("review_call", "Process review · Pick a time", "Your process review: pick a time", "Hi {{first_name}},\n\nThanks for booking a process review for {{business}}. Two times that work this week:\n\n• [day, time]\n• [day, time]\n\nIt's 30 minutes, by video or phone. To get the most out of it, think of one process that takes too long, and roughly: how many people do it, how often it happens, and how long each one takes. A rough guess is fine; that's the number we'd set out to improve.\n\nIf AI isn't the right fix for what you describe, I'll tell you.\n\nThanks,", { autoAdd: true, next_action: "Hold the process review", next_days: 3 }),
    W("review_call", "Process review · Pick a time", "Hi {{first_name}}, {{my_name}} from Re-Charge here. Thanks for booking a process review for {{business}}! Does [day, time] or [day, time] suit you for 30 minutes?\n\nBeforehand, think of one process that takes too long: how many people do it, how often, and how long each one takes. Rough guesses are fine.", { autoAdd: true, next_action: "Hold the process review", next_days: 3 }),
    E("review_call", "Process review · Next step after the call", "{{business}}: what we heard, and the next step", "Hi {{first_name}},\n\nThanks for your time today. Here's what I heard, all in one place, so you can forward it to anyone else who decides.\n\nWhat's taking too long\n[the problem, in their own words]\n\nThe numbers you gave me\n• [people] people, about [hours] hours each a week\n• Roughly [R amount] a month of your team's time\n\nWhat I'd suggest\n[one or two lines: the simplest fix]\n\nThe next step\nFind: over 1–2 weeks we map the process, measure the real numbers and pick the first thing to build. It's R15,000, credited in full if you go ahead. You'll have the quote to accept online by [day, date].\n\nIf I've got anything wrong, just reply and correct me.\n\nThanks,", { autoAdd: true, next_action: "Send the Find quote", next_days: 1 }),
    W("review_call", "Process review · Recap after the call", "Hi {{first_name}}, thanks for the call! A quick recap so it's in one place:\n\n• Taking too long: [the problem, in their words]\n• Today: [people] people, about [hours] hours each a week (roughly [R amount] a month)\n• Simplest fix: [one line]\n\nNext step: Find, R15,000, credited in full if you go ahead. You'll have the quote by [day]. Shout if I got anything wrong.", { autoAdd: true, next_action: "Send the Find quote", next_days: 1 }),
    E("review_call", "Process review · Honest: not worth it yet", "{{business}}: my honest take", "Hi {{first_name}},\n\nThanks for your time today. Here's what I heard:\n• [the problem, in their own words]\n• Roughly [R amount] a month of your team's time\n\nMy honest take: at these numbers, AI isn't worth it yet. [why, in one line]\n\nWhat I'd do instead: [a simpler fix they can do themselves]\n\nIf things change, say more volume or more people on it, I'm happy to look again. There's nothing to pay for today's call.\n\nThanks,", { autoAdd: true, next_action: "Check in: has the volume grown?", next_days: 90 }),
    E("ai_follow", "AI follow-up · Gentle nudge", "The work {{business}} shouldn’t be doing", "Hi {{first_name}},\n\nI sent you a note the other day about the repetitive work at {{business}}. I know how busy it gets, so I thought I'd check it didn't get buried.\n\nIf it's useful, here's a two-minute way to see whether it's worth talking: {{demos_link}}\n\nOr just reply with the one process that takes your team too long.\n\nThanks,", { autoAdd: true, next_action: "Last follow-up", next_days: 5 }),
    E("ai_follow", "AI follow-up · Run the numbers", "What that work costs {{business}}", "Hi {{first_name}},\n\nOne thing I see a lot: three people spending five hours a week each on the same enquiries comes to about 65 hours a month. At a normal salary that's well over R10,000 a month of staff time, every month, on work a system could prepare for them.\n\nThere's a ten-second calculator here if you want to run your own numbers: https://re-charge.co.za/pricing#roi\n\nIf the number surprises you, a free 30-minute process review is the next step.\n\nThanks,", { autoAdd: true, next_action: "Last follow-up", next_days: 7 }),
    E("ai_follow", "AI follow-up · Last one", "Last one from me", "Hi {{first_name}},\n\nI don't want to keep filling your inbox, so this is the last one from me.\n\nIf the repetitive work at {{business}} ever moves up the list, just reply to this email, even if it's months from now.\n\nAll the best,", { autoAdd: true, next_action: "No reply: park it", next_days: 30 }),
    W("ai_follow", "AI follow-up · Nudge", "Hi {{first_name}}, just checking my message about the repetitive work at {{business}} didn't get lost. If you want to see what I mean first, there are a few demos here: {{demos_link}}", { autoAdd: true, next_action: "Last follow-up", next_days: 7 }),
    W("ai_follow", "AI follow-up · Last one", "Hi {{first_name}}, I'll leave it here so I don't keep bugging you. If you ever want to look at the work your team shouldn't be doing, just send me a message. All the best!", { autoAdd: true, next_action: "No reply: park it", next_days: 30 }),
    E("discovery", "Discovery · Your opportunity map", "{{business}}: your opportunity map", "Hi {{first_name}},\n\nDiscovery is done. Here are the opportunities we found at {{business}}, scored on time saved, revenue, difficulty, data, risk and adoption (out of 100):\n\n{{opportunities}}\n\nMy recommendation is to start with the first one as a proof of concept: the smallest useful version, on real work, measured against the baseline we took. If the number moves, we take it to production; if it doesn't, we stop and you've only paid for the proof.\n\nThe full map is attached. I'll send the proof-of-concept quote separately so you can accept it online.\n\nThanks,", { autoAdd: true, next_action: "Follow up on the proof-of-concept quote", next_days: 3 }),
    E("results", "Results · What we improved", "{{business}}: what changed", "Hi {{first_name}},\n\nWe measured it the same way as before we started. {{result}}\n\nThat's the number we set out to move, and it'll be in your monthly report from now on. If anything about the system isn't working the way your team needs, tell me; that's what Operations is for.\n\nThanks,", { autoAdd: true }),
    W("results", "Results · What we improved", "Hi {{first_name}}, the numbers are in for {{business}}: {{result}} Thank you for trusting us with it!", { autoAdd: true }),
    E("case_study", "Case study · May we share your result?", "May we share {{business}}’s result?", "Hi {{first_name}},\n\nA favour to ask. {{result}} I'd love to share that as a short case study on our site and LinkedIn: the problem, what we built, and the measured result.\n\nI'll send you the exact wording first, and nothing goes out without your yes. If you'd rather we didn't name {{business}}, we can describe you by industry instead (e.g. \"a 15-person law firm in Johannesburg\").\n\nWould that be OK?\n\nThanks,", { autoAdd: true }),
    W("case_study", "Case study · May we share your result?", "Hi {{first_name}}, a favour: may I share {{business}}'s result as a short case study ({{result}})? I'll send you the wording first, nothing goes out without your yes, and we can leave your name off if you prefer.", { autoAdd: true }),

    // a client's website is down (Today: Tell the client)
    W("site_down", "Website problem · We're on it", "Hi {{first_name}}, a quick heads-up: your website ({{live_site}}) isn't loading properly at the moment. We know about it, we're working on it, and I'll message you as soon as it's back.", { autoAdd: true }),
    E("site_down", "Website problem · We're on it", "Your website: we're on it", "Hi {{first_name}},\n\nA quick heads-up: your website ({{live_site}}) isn't loading properly at the moment. We know about it and we're working on it. I'll let you know as soon as it's back.\n\nNothing is lost, and there's nothing you need to do.\n\nThanks,", { autoAdd: true }),

    // the Inbox Assistant trial: the agreement on day one, check-ins, and the result on day 14
    E("trial_agree", "Inbox trial · How we'll measure it", "How we'll measure your Inbox Assistant trial", `Hi {{first_name}},\n\nThanks for timing those emails with me. So we both know exactly how the trial is judged, here's how we'll measure it:\n\n• Before: about {{trial_baseline}} to answer one customer email by hand.\n• With the Inbox Assistant: about {{trial_check}} to check each reply it writes.\n• So every reply you send as it is saves about {{trial_saving}}, and one you send after editing saves half that ({{trial_saving_half}}). A reply you don't use saves nothing.\n\nThe target is {{trial_target}} a week. That's about {{trial_replies}} replies a week sent as they are, or about {{trial_replies_edited}} sent after edits (or a mix of the two).\n\nWe measure it over the second week of the trial (days 8 to 14), from the taps under each reply on your page. So please ask the team to tap how every reply went, even the ones you didn't use.\n\nIf it saves 5 hours that week, we invoice the rest of the ${money(INBOX_SETUP)} setup (your ${money(INBOX_DEPOSIT)} deposit comes off it) and the ${money(PLAN_MONTHLY.inbox)} a month plan starts. If it doesn't, your ${money(INBOX_DEPOSIT)} deposit is refunded in full within 7 days.\n\nIf that all sounds right, please reply "Agreed".\n\nThanks,`, { autoAdd: true }),
    W("trial_agree", "Inbox trial · How we'll measure it", `Hi {{first_name}}, here's how we'll measure your Inbox Assistant trial: about {{trial_baseline}} to answer an email by hand, about {{trial_check}} to check a reply, so each reply sent as is saves {{trial_saving}} (half that after edits). The target is {{trial_target}} a week: about {{trial_replies}} replies sent as is, or {{trial_replies_edited}} after edits. It's measured on days 8 to 14 from the taps under each reply, so please mark every one. Hit it: we invoice the rest of the ${money(INBOX_SETUP)} setup (less your ${money(INBOX_DEPOSIT)}) and the ${money(PLAN_MONTHLY.inbox)} a month plan starts. Miss it: your ${money(INBOX_DEPOSIT)} comes back in full within 7 days. Please reply "Agreed" if that's right.`, { autoAdd: true }),
    W("trial", "Inbox trial · Check in", "Hi {{first_name}}, {{my_name}} here from Re-Charge. Quick check-in on your Inbox Assistant: are the replies close to what you'd send? If anything's off (a price, a policy, the tone), tell me and I'll fix it today. And please keep tapping how each reply went under it: that's how we count the time it saves. {{trial_link}}", { autoAdd: true }),
    E("trial", "Inbox trial · Check in", "How's the Inbox Assistant going?", "Hi {{first_name}},\n\nA quick check-in on your Inbox Assistant trial. Are the replies close to what you'd send? If anything's off, a price, a policy or the tone, tell me and I'll fix it today.\n\nPlease keep tapping how each reply went, under the reply on your page: that's how we count the time it saves.\n\n{{trial_link}}\n\nThanks,", { autoAdd: true }),
    W("trial_unused", "Inbox trial · Not used yet", "Hi {{first_name}}, {{my_name}} here. I see your Inbox Assistant hasn't had any emails yet. Is anything in the way? Paste the next customer email into your page and you'll have the reply in seconds: {{trial_link}}\n\nHappy to show you on a quick call if that's easier.", { autoAdd: true }),
    E("trial_unused", "Inbox trial · Not used yet", "Your Inbox Assistant is ready when you are", "Hi {{first_name}},\n\nI noticed your Inbox Assistant hasn't had any emails yet. Is anything in the way?\n\nThe next time a customer email comes in, paste it into your page and you'll have the reply in seconds:\n\n{{trial_link}}\n\nThe trial counts the time it saves, so the sooner your team starts, the fairer the result. Happy to show you on a quick call: {{call_link}}\n\nThanks,", { autoAdd: true }),
    W("trial_mark", "Inbox trial · Please mark the replies", "Hi {{first_name}}, a quick favour for the trial: under each reply on your page, please tap how it went (sent as is, sent after edits, or didn't use it). Only marked replies count towards the 5 hours, so unmarked ones are time saved that we can't count yet. {{trial_link}}", { autoAdd: true }),
    E("trial_mark", "Inbox trial · Please mark the replies", "One tap under each reply, please", "Hi {{first_name}},\n\nA quick favour for your Inbox Assistant trial. Under each reply on your page, please tap how it went: sent as is, sent after edits, or didn't use it.\n\nOnly marked replies count towards the 5 hours a week, so the unmarked ones are time you've saved that we can't count yet. The measured week is days 8 to 14 of the trial.\n\n{{trial_link}}\n\nThanks,", { autoAdd: true }),
    W("trial_call", "Inbox trial · Book the result call", "Hi {{first_name}}, your two-week Inbox Assistant trial ends tomorrow. Can we have a quick call to go through the time it saved? Pick a time that suits you here: {{call_link}}", { autoAdd: true }),
    E("trial_call", "Inbox trial · Book the result call", "Your trial ends tomorrow: a quick call?", "Hi {{first_name}},\n\nYour two-week Inbox Assistant trial ends tomorrow. Can we have a quick call to go through the time it saved and what happens next? Pick a time that suits you here:\n\n{{call_link}}\n\nThanks,", { autoAdd: true }),
    E("trial_won", "Inbox trial · The result: it worked", "Your Inbox Assistant trial: the result", `Hi {{first_name}},\n\nThe two-week trial is done. Here's the measured week (days 8 to 14), from the taps under each reply:\n\n• {{trial_drafted}} replies written\n• {{trial_as_is}} sent as they were, {{trial_edited}} sent after edits, {{trial_unused}} not used\n• About {{trial_hours}} hours saved, against the target of {{trial_target}}\n\nIt hit the target, so as agreed we'll now invoice the rest of the ${money(INBOX_SETUP)} setup (your ${money(INBOX_DEPOSIT)} deposit comes off it) and the ${money(PLAN_MONTHLY.inbox)} a month plan starts. The quote with the details follows, so you can accept it online.\n\nThank you for giving it a proper try.\n\nKind regards,`, { autoAdd: true }),
    W("trial_won", "Inbox trial · The result: it worked", `Hi {{first_name}}, the trial's done! In the measured week (days 8 to 14): {{trial_drafted}} replies, {{trial_as_is}} sent as they were and {{trial_edited}} after edits, about {{trial_hours}} hours saved against the target of {{trial_target}}. It hit the target, so as agreed we'll invoice the rest of the ${money(INBOX_SETUP)} setup (less your ${money(INBOX_DEPOSIT)}) and the ${money(PLAN_MONTHLY.inbox)} a month plan starts. The quote follows so you can accept it online. Thank you!`, { autoAdd: true }),
    E("trial_missed", "Inbox trial · The result: below the target", "Your Inbox Assistant trial: the result", `Hi {{first_name}},\n\nThe two-week trial is done. Here's the measured week (days 8 to 14), from the taps under each reply:\n\n• {{trial_drafted}} replies written\n• {{trial_as_is}} sent as they were, {{trial_edited}} sent after edits, {{trial_unused}} not used\n• About {{trial_hours}} hours saved, against the target of {{trial_target}}\n\nThat's below the target, so as agreed your ${money(INBOX_DEPOSIT)} deposit will be refunded in full within 7 days, and we'll switch your page off. If you'd rather we adjusted it and measured another week instead, just reply and say so.\n\nThanks for giving it a go.\n\nKind regards,`, { autoAdd: true }),
    W("trial_missed", "Inbox trial · The result: below the target", `Hi {{first_name}}, the trial's done. In the measured week (days 8 to 14): {{trial_drafted}} replies, about {{trial_hours}} hours saved against the target of {{trial_target}}. That's below the target, so as agreed your ${money(INBOX_DEPOSIT)} deposit comes back in full within 7 days and we'll switch your page off. If you'd rather we adjusted it and measured another week, just say so. Thanks for giving it a go.`, { autoAdd: true }),

    // thank you
    W("thanks", "Thank you · Payment received", "Hi {{first_name}}, payment received, thank you! 🙏"),
  ];
})();
// Fingerprints of earlier wordings (2026-09). A saved copy that still has
// that exact wording is upgraded to the new text on load; edited ones are left.
const RETIRED_STARTERS = new Set(["1xvuknx", "18fmqjy", "1yqs0fk", "1srgbsg", "y5qg5b", "1aulgc1", "12tw1fy", "qnthf2", "1lxm1kn", "aum6l6", "1jsusiv", "1rn9j4t", "jraanx", "edxy8r", "vk2tbf", "1obr9wc", "1ozh19w", "dbsjon", "1nfzww8", "wooizd", "kzelgm", "a2g6ye", "1b82ad", "1w08ert", "k9qgxj", "1gw9kot", "dl5d7r", "sb6i1p", "1ykj15v", "c3em5i", "1a270sn", "yuhs8h", "1o8pp6", "1ye5agw", "114qhca", "12a6kf9", "14gohg0", "18809of", "18yd46m", "1a1bho5", "1ahpxkr", "1ei78i0", "1f1rokc", "1fcjogi", "1fk6s5a", "1fy78ns", "1hil8jm", "1jm01xf", "1mbu2mi", "1mnhi3h", "1n8u5hr", "1nazj0j", "1nce1rc", "1rlo9f0", "1rqwc9p", "1s2qj2i", "1sx604i", "1txis43", "1vg6ok5", "1xpx3ox", "2lppoc", "2lz8sm", "2y4wjg", "3d3uqb", "4jz0i7", "7jpo7b", "897u33", "8m5z23", "8o7x7b", "angb4z", "be1qdm", "c3us8j", "eer5km", "gpqg6", "h61ecd", "h7cbg8", "i3cgfv", "iv2b77", "k9a8k0", "kb0fdd", "m3zpxq", "qcvy52", "qn6acj", "twyzvg", "v8zi5", "w2fa8c", "w44ao8", "x3g8n8",
  // 2026-10-18: current prices (Care R1,450/mo), the real deposit, the 30-minute call and reply time, renewal date and amount, EFT details, no free mockup
  "1x1bwh9", "1633nsh", "1lab13w", "1y2wl0", "8pxvqm", "1h4fs2e", "g0qili", "17lyc5c", "7l57bk", "1xj74fj", "bp5baq", "1lvqjx4", "1nsxikk", "1ls3yet", "q3ca51", "1e0syh0", "6th5yh", "r27xr8", "1f0j8i", "1wkzmmj", "1evhaze", "niyv4p", "1p5senv", "17blu22", "a4ti9e", "fnghlg", "qgsr5s"]);
// Renamed starters: an unedited copy under the old name is upgraded to the new one
const RENAMED_STARTERS = { "First contact · A free website mockup": "First contact · A website for them" };
// Offers we no longer make (the R450 Google profile setup): an unedited copy is archived, not deleted
const ARCHIVE_STARTERS = new Set(["1u2piqt", "1f8lkhk"]);
const tplPrint = (t) => { const str = [t.kind, t.subject || "", t.body].join("\u0001"); let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
let _upgraded = false;
async function upgradeStarters() {
  if (_upgraded) return 0; _upgraded = true;
  let n = 0;
  // new message sets (e.g. Google profile setup) are added once for people who already have a library
  const have = new Set(S.templates.map((t) => t.kind + ":" + t.name.toLowerCase()));
  for (const r of STARTERS.filter((x) => (x.meta?.gbp || x.meta?.autoAdd) && !have.has(x.kind + ":" + x.name.toLowerCase()))) {
    try { const t = await api.templates.insert({ ...r, subject: r.subject ?? null, meta: r.meta ?? {} }); if (t) S.templates.push(t); n++; } catch (e) { console.error(e); }
  }
  for (const t of S.templates) {
    if (ARCHIVE_STARTERS.has(tplPrint(t)) && !t.archived) { try { const u = await api.templates.update(t.id, { archived: true }); Object.assign(t, u); n++; } catch (e) { console.error("template archive", e); } continue; }
    if (!RETIRED_STARTERS.has(tplPrint(t))) continue;
    const name = RENAMED_STARTERS[t.name] || t.name;
    const next = STARTERS.find((x) => x.kind === t.kind && x.name === name);
    if (!next || (next.body === t.body && (next.subject ?? null) === (t.subject ?? null))) continue;
    if (name !== t.name && S.templates.some((x) => x.kind === t.kind && x.name === name)) continue;   // the new one is already there
    try { const u = await api.templates.update(t.id, { name, subject: next.subject ?? null, body: next.body, meta: { ...(t.meta || {}), ...next.meta } }); Object.assign(t, u); n++; } catch (e) { console.error("template upgrade", e); }
  }
  return n;
}
// Names of the first (2026) set, archived when you switch to the library above.
const OLD_STARTERS = new Set(["email:enquiry received", "email:call confirmed", "email:quote", "email:deposit reminder", "email:mockup ready", "email:project live", "email:ask for a review", "email:care renewal due", "email:cold outreach", "email:follow-up 1", "email:follow-up 2", "whatsapp:cold intro", "whatsapp:whatsapp follow-up", "whatsapp:quick hello", "whatsapp:call reminder", "whatsapp:quote sent", "whatsapp:mockup ready", "whatsapp:site is live"]);
// Pick a message for a moment: tagged templates first (rotating where there
// are several first-contact / follow-up versions), then older ones by name.
const LEGACY_NAMES = { intro: ["cold outreach", "cold intro"], follow_up: ["follow-up", "whatsapp follow-up"], enquiry: ["enquiry received", "quick hello"], call: ["call confirmed", "call reminder"], mockup: ["mockup ready"], quote: ["quote", "quote sent"], quote_follow: ["quote"], deposit: ["deposit reminder", "quote sent"], live: ["project live", "site is live"], review: ["ask for a review"], renewal: ["renewal"], balance: ["payment", "balance"] };
let _rot = 0;
function tplFor(kind, moment) {
  const ts = S.templates.filter((t) => t.kind === kind && !t.archived);
  let tagged = ts.filter((t) => t.meta?.moment === moment);
  // the site already sent an instant thank-you: go straight to the questions
  if (moment === "enquiry" && S.profile.autoreply !== false) tagged = [...tagged].sort((x, y) => /questions/i.test(y.name) - /questions/i.test(x.name));
  if (tagged.length) return ROTATE.has(moment) ? tagged[(_rot++) % tagged.length] : tagged[0];
  if (moment === "enquiry_ai") return tplFor(kind, "enquiry");
  for (const n of LEGACY_NAMES[moment] || []) { const hit = ts.find((t) => t.name.toLowerCase().includes(n)); if (hit) return hit; }
  return null;
}
const STAGE_MOMENT = { prospect: "intro", contacted: "follow_up", new: "enquiry", quote_sent: "quote_follow", in_development: "building", live: "review", declined: "reactivate" };
let _seedCount = null;
const seedCount = () => { if (_seedCount === null) seedTemplates(true).then((n) => { _seedCount = n; if (n && location.hash.startsWith("#/templates")) route(); }); return _seedCount || 0; };
async function seedTemplates(onlyCount = false) {
  const rows = STARTERS;
  const have = new Set(S.templates.map((t) => t.kind + ":" + t.name.toLowerCase()));
  const missing = rows.filter((r) => !have.has(r.kind + ":" + r.name.toLowerCase()));
  if (onlyCount) return missing.length;
  for (const r of missing) await api.templates.insert({ ...r, subject: r.subject ?? null, meta: r.meta ?? {} });
  return missing.length;
}

// ---------- outreach ----------
async function renderOutreach(q) {
  const outreach = S.projects.filter((p) => !p.spam && sourceOf(p) === "outreach");
  const prospects = outreach.filter((p) => p.status === "prospect" && !p.archived).sort((a, b) => priority(b) - priority(a));
  const due = outreach.filter((p) => !p.archived && p.next_action_at && Date.parse(p.next_action_at) <= endOfToday().getTime()).sort((a, b) => a.next_action_at.localeCompare(b.next_action_at));
  const queue = prospects.filter((p) => p.email);
  const waQueue = prospects.filter((p) => !p.email && isMobile(p.phone));
  const hasOutreachTpl = S.templates.some((t) => t.kind === "email" && !t.archived);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Leads</span><h1>To contact</h1><p class="muted small">Businesses that might need us, best fits first.</p></div>
    <div class="adm-head__actions">${waQueue.length ? `<button class="btn btn--ghost btn--small" id="startWa">WhatsApp (${waQueue.length})</button>` : ""}${queue.length ? `<button class="btn btn--primary btn--small" id="startQueue">Email (${queue.length})</button>` : ""}</div></div>
  ${!hasOutreachTpl ? '<div class="adm-empty adm-empty--act" style="margin-top:1rem"><b>No ready-made messages yet</b><span class="small">The Email and WhatsApp buttons use them to contact each business with first-contact wording and follow-ups. Add them once; you can change any of it afterwards.</span><button type="button" class="btn btn--primary btn--small" id="seedOut">Add the ready-made messages</button></div>' : ""}

  ${due.length ? `<section class="adm-section"><h2>Follow-ups due <span class="count">${due.length}</span></h2>
    <ul class="adm-list">${due.length ? due.map((p) => `<li><div class="adm-row"><div class="adm-row__main"><div class="adm-row__title"><span class="ref">${esc(p.ref)}</span>${esc(p.business || p.name || "—")}</div><div class="adm-row__sub">${esc(p.next_action || "Follow up")} · ${Date.parse(p.next_action_at) < startOfToday() ? '<span class="adm-error">overdue</span>' : "due today"} · ${esc(p.email || p.phone || "")}</div></div><div class="adm-inline-actions" style="margin:0">${p.email ? `<button class="btn btn--primary" data-followup="${esc(p.id)}">Send</button>` : ""}<a class="btn btn--ghost" href="#/p/${esc(p.id)}">Open</a></div></div></li>`).join("") : '<li class="adm-empty">Nothing due. Follow-ups are set automatically when you send a template that has an "after sending" rule.</li>'}</ul></section>` : ""}

  <section class="adm-section"><h2>Prospects <span class="count">${prospects.length}</span></h2>
    <ul class="adm-list">${prospects.length ? prospects.slice(0, 50).map((p) => `<li>${projectRow(p)}</li>`).join("") : '<li class="adm-empty">No prospects yet. The prospect finder adds some every Monday, or add your own below.</li>'}</ul></section>

  <details class="adm-section adm-recent"${prospects.length ? "" : " open"}><summary><h2>Add prospects yourself</h2></summary>
    <div class="adm-card adm-import"><form class="adm-form" id="importForm">
      <label>Paste a table straight from a spreadsheet or your research (columns like Business, Location, Website, Contact, Potential are detected), a CSV export, or one business per line — <code>Business, Contact name, Email, Phone, Notes</code><textarea name="raw" placeholder="Botha Electrical, Pieter Botha, pieter@bothaelectrical.co.za, 082 444 5555, No website, found on Google Maps"></textarea></label>
      <div class="btn-row" style="justify-content:space-between"><label class="btn btn--ghost btn--small" style="cursor:pointer">Upload CSV<input type="file" id="csvFile" accept=".csv,text/csv" hidden /></label><button class="btn btn--primary btn--small" type="submit">Preview</button></div>
      <div id="importPreview"></div>
    </form></div></details>`;

  const startAt = (ids) => {
    let i = 0;
    const next = () => { if (i >= ids.length) { toast("Queue finished"); return route(); } const p = byId(ids[i++]); if (!p) return next(); openCompose(p, "email", { queue: { pos: i, total: ids.length }, templateId: tplFor("email", "intro")?.id, onDone: next, onSkip: next }); };
    next();
  };
  $("startQueue")?.addEventListener("click", () => startAt(queue.map((p) => p.id)));
  $("seedOut")?.addEventListener("click", async (e) => { e.target.disabled = true; try { await seedTemplates(); _seedCount = null; toast("Ready-made messages added"); await loadAll(true); route(); } catch (ex) { toast(ex.message, true); e.target.disabled = false; } });
  $("startWa")?.addEventListener("click", () => {
    const ids = waQueue.map((p) => p.id); let i = 0;
    if (!tplFor("whatsapp", "intro")) toast("Tip: Settings → Message wording → add the ready-made messages to get WhatsApp intros.");
    const next = () => { if (i >= ids.length) { toast("WhatsApp list done"); return route(); } const p = byId(ids[i++]); if (!p) return next(); openCompose(p, "whatsapp", { queue: { pos: i, total: ids.length }, templateId: tplFor("whatsapp", "intro")?.id, onDone: next, onSkip: next }); };
    next();
  });
  view.querySelectorAll("[data-followup]").forEach((b) => b.addEventListener("click", () => {
    const p = byId(b.dataset.followup);
    const tpl = (p.status === "contacted" ? tplFor("email", aiPitch(p) && tplFor("email", "ai_follow") ? "ai_follow" : "follow_up") : null) || defaultTemplate("email", p.status, p);
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
    const bizKey = (b) => String(b || "").toLowerCase().replace(/\b(pty|ltd|cc|inc|incorporated)\b|[^a-z0-9]/g, "");
    const knownBiz = new Set(S.projects.filter((p) => !p.spam).map((p) => bizKey(p.business)).filter(Boolean));
    const seenE = new Set(), seenP = new Set(), seenB = new Set();
    rows.forEach((r) => {
      const e = (r.email || "").toLowerCase(), ph = normPhone(r.phone), b = bizKey(r.business);
      r.dup = (e && (known.has(e) || seenE.has(e))) || (ph && (knownPhones.has(ph) || seenP.has(ph))) || (b && (knownBiz.has(b) || seenB.has(b)));
      if (e) seenE.add(e); if (ph) seenP.add(ph); if (b) seenB.add(b);
    });
    const fresh = rows.filter((r) => !r.dup && (r.business || r.name));
    const noContact = fresh.filter((r) => !r.email && !r.phone).length;
    $("importPreview").innerHTML = rows.length ? `<div class="table-wrap" style="margin-top:0.6rem"><table class="adm-table adm-table--cards"><thead><tr><th>Business</th><th>Potential</th><th>Contact</th><th>Email</th><th>Phone</th><th>Where</th><th>Website</th><th>Notes</th></tr></thead><tbody>${rows.map((r) => `<tr>${[["business", "Business"], ["pot", "Potential"], ["name", "Contact"], ["email", "Email"], ["phone", "Phone"], ["location", "Where"], ["website", "Website"], ["notes", "Notes"]].map(([k, l]) => { const v = k === "pot" ? (r.potential ? POTENTIAL[r.potential] + (r.potential_note ? " · " + r.potential_note : "") : r.potential_note) : k === "website" ? (r.website || "").replace(/^https?:\/\//, "") : r[k]; return `<td class="${r.dup ? "dup" : ""}"${v ? ` data-l="${l}"` : ""}>${k === "pot" && r.potential ? `<span class="chip chip--pot" data-p="${r.potential}">${esc(v)}</span>` : esc(v || "")}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="btn-row" style="justify-content:flex-end;margin-top:0.7rem"><span class="tiny muted">${[rows.length - fresh.length ? `${rows.length - fresh.length} skipped (already in your pipeline)` : "", noContact ? `${noContact} without a phone or email yet` : ""].filter(Boolean).join(" · ")}</span><button class="btn btn--primary btn--small" type="button" id="importGo" ${fresh.length ? "" : "disabled"}>Add ${fresh.length} prospect${fresh.length === 1 ? "" : "s"}</button></div>` : '<p class="adm-error tiny" style="margin-top:0.5rem">Nothing recognised — one business per line, fields separated by commas.</p>';
    $("importGo")?.addEventListener("click", async () => {
      const btn = $("importGo"); btn.disabled = true; btn.textContent = `Adding ${fresh.length}…`;
      try {
        const rowsIn = fresh.map((r) => ({ business: r.business || null, name: r.name || null, email: r.email ? r.email.toLowerCase() : null, phone: r.phone || null, source: "outreach", status: "prospect", category: ["Websites"], goal: r.notes || null, location: r.location || null, review_count: r.review_count ?? null, rating: r.rating ?? null, activity_score: activityScore(r.review_count ?? null, r.rating ?? null, null, false), potential: r.potential, potential_note: !r.website || isSocial(r.website) ? "A website" : r.potential_note || null, website: r.website, details: { ...(r.google_url ? { googleUrl: r.google_url } : {}), formType: "Added manually" } }));
        const added = await api.projects.insertMany(rowsIn);
        if (!api.mock && added.length) await api.events.insertMany(added.map((p) => ({ project_id: p.id, kind: "created", note: "Added from outreach import", data: {} })));
        toast(`${added.length} prospect${added.length === 1 ? "" : "s"} added`); await loadAll(true); route();
      } catch (ex) { toast("Import failed: " + ex.message, true); btn.disabled = false; btn.textContent = "Retry"; }
    });
  });
}
// Paste from a spreadsheet, a CSV export or plain "Business, Name, Email, Phone, Notes" lines.
// Understands research tables too: a Website column ("Yes — site.co.za" / "No website found"),
// a mixed Contact column ("082 … / 011 … / name@biz.co.za") and a potential/opportunity column
// ("🟢 Very high — new website", "🟡 Redesign", "🔴 Low — …").
const EMAIL_RE = /[^\s@\/,;<>()]+@[^\s@\/,;<>()]+\.[a-z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s()-]{7,}\d/g;
const DOMAIN_RE = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:co\.za|org\.za|com|net|org|africa|biz|info|io|za|shop|store|online|site))(\/[^\s]*)?/i;
function parsePotential(t) {
  const v = String(t || "").trim(); if (!v) return { potential: null, note: "" };
  const potential = /very\s*high|excellent|top/i.test(v) ? "very_high" : /\bhigh\b/i.test(v) ? "high" : /\b(medium|med|moderate|mid)\b/i.test(v) ? "medium" : /\blow\b/i.test(v) ? "low"
    : /🟢/u.test(v) ? "high" : /🟡|🟠/u.test(v) ? "medium" : /🔴/u.test(v) ? "low" : null;
  const note = v.replace(/[🟢🟡🟠🔴⚪]/gu, "").replace(/^\s*(very\s*high|high|medium|moderate|low)\b\s*/i, "").replace(/^\s*[—–:-]+\s*/, "").trim();
  return { potential, note };
}
function parseWebsite(t) {
  const v = String(t || "").trim(); if (!v) return { website: null, note: "" };
  const m = v.match(DOMAIN_RE);
  const unsure = /unverified|apparently|not sure|\?/i.test(v);
  if (m && !/^no\b/i.test(v)) return { website: "https://" + m[1].toLowerCase() + (m[2] && m[2] !== "/" ? m[2] : ""), note: unsure ? "Website unconfirmed: " + v : "" };
  return { website: null, note: /^no\b|none|not found/i.test(v) ? "No website found" : "Website: " + v };
}
function parseProspects(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = (lines[0].match(/\t/g) || []).length ? "\t" : (lines[0].match(/\|/g) || []).length >= 2 ? "|" : (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (l) => { const out = []; let cur = "", inq = false; for (const ch of l) { if (ch === '"') inq = !inq; else if (ch === delim && !inq) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return delim === "|" ? out.filter((c, i, a) => c || (i > 0 && i < a.length - 1)) : out; };
  let rows = lines.map(split).filter((cells) => !cells.every((c) => /^[-:\s]*$/.test(c)));   // drop markdown |---| rules
  let cols = ["business", "name", "email", "phone", "notes"];
  const head = rows[0].map((h) => h.toLowerCase());
  if (head.some((h) => /email|phone|business|company|name|website|contact|opportunit|potential|google|maps/.test(h)) && !head.some((h) => /@/.test(h))) {
    cols = head.map((h) => /business|company|firm/.test(h) ? "business"
      : /review/.test(h) ? "reviews" : /rating|stars/.test(h) ? "rating"
      : /google|maps|\bgmb\b/.test(h) ? "google"
      : /opportunit|potential|priority|score|\bfit\b/.test(h) ? "potential"
      : /website|\burl\b|\bsite\b|\bweb\b/.test(h) ? "website"
      : /e-?mail/.test(h) ? "email" : /phone|tel|cell|mobile|whatsapp|number/.test(h) ? "phone"
      : /location|\btown\b|\bcity\b|suburb|\barea\b|province|region|address/.test(h) ? "location"
      : /contact\s*name|owner|person|\bname\b/.test(h) ? "name" : /contact/.test(h) ? "contact"
      : /note|comment|remark|source/.test(h) ? "notes" : null);
    rows = rows.slice(1);
  }
  return rows.map((cells) => {
    const r = { business: "", name: "", email: "", phone: "", notes: "", location: "", website: null, potential: null, potential_note: "" };
    const notes = [];
    cells.forEach((c, i) => {
      const k = cols[i]; if (!k || !c) return;
      if (k === "notes") notes.push(c);
      else if (k === "potential") { const x = parsePotential(c); r.potential = x.potential; r.potential_note = x.note; }
      else if (k === "reviews") { const n = c.replace(/[\s,]/g, "").match(/\d+/); if (n) r.review_count = Number(n[0]); }
      else if (k === "rating") { const n = c.replace(",", ".").match(/\d(\.\d)?/); if (n) r.rating = Math.min(5, Number(n[0])); }
      else if (k === "google") { const u = c.match(/https?:\/\/\S+/); if (u) r.google_url = u[0]; }
      else if (k === "website") { const x = parseWebsite(c); if (x.website && isGoogleUrl(x.website)) r.google_url = r.google_url || x.website; else { r.website = x.website; if (x.note) notes.push(x.note); } }
      else if (k === "contact" || k === "phone" || k === "email") {
        const emails = c.match(EMAIL_RE) || [], phones = c.replace(EMAIL_RE, " ").match(PHONE_RE) || [];
        if (!emails.length && !phones.length) { if (k === "contact" && !/^no\b|not found|unknown|n\/a|none/i.test(c)) { if (!r.name) r.name = c; else notes.push("Contact: " + c); } return; }
        emails.forEach((e) => { if (!r.email) r.email = e; else if (e.toLowerCase() !== r.email.toLowerCase()) notes.push("Also: " + e); });
        phones.forEach((ph) => { ph = ph.trim(); if (!r.phone) r.phone = ph; else if (normPhone(ph) !== normPhone(r.phone)) notes.push("Also: " + ph); });
      } else r[k] = c;
    });
    // heuristics for unlabelled lines: move an email/phone-looking value to the right field
    for (const k of ["business", "name"]) { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[k]) && !r.email) { r.email = r[k]; r[k] = ""; } else if (/^\+?[\d\s()-]{9,}$/.test(r[k]) && !r.phone) { r.phone = r[k]; r[k] = ""; } }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notes[0] || "") && !r.email) r.email = notes.shift();
    else if (/^\+?[\d\s()-]{9,}$/.test(notes[0] || "") && !r.phone) r.phone = notes.shift();
    r.notes = notes.join(" · ");
    return r;
  }).filter((r) => r.business || r.name || r.email || r.phone);
}

// ---------- settings ----------
// ---------- Facebook Page (0030): post straight to the Page ----------
async function fillFacebook() {
  const box = $("fbBox"), sum = $("fbSum"); if (!box) return;
  const hq = new URLSearchParams(location.hash.split("?")[1] || "");
  let st; try { st = await api.facebook("status"); } catch (e) { box.innerHTML = /facebook-post|404|not found/i.test(e.message) ? setupNote("Facebook posting isn't set up yet.", "Run database update 0030 and deploy the facebook-post function (ADMIN.md 8cp).") : `<p class="small adm-error">${esc(e.message)}</p>`; sum.textContent = "Not set up"; return; }
  sum.textContent = st.connected ? `Connected: ${st.page_name}` : st.ready ? "Not connected" : "Needs the Meta app (one-time setup)";
  box.innerHTML = `${hq.get("fb") === "connected" ? '<p class="small" style="color:#137333"><b>Connected.</b> Facebook posts can now go straight to your Page.</p>' : hq.get("fb") === "failed" ? `<p class="small adm-error">Couldn't connect: ${esc(hq.get("why") || "Facebook didn't allow it")}</p>` : ""}
    ${st.connected ? `<p class="small">Posting as <b>${esc(st.page_name)}</b> · connected ${esc(fmtD(st.connected_at))}</p>${st.last_error ? `<p class="small adm-error">Last problem: ${esc(st.last_error)}. Connect again to fix it.</p>` : ""}
      <div class="adm-inline-actions"><button type="button" class="btn btn--ghost btn--small" id="fbConnect">Connect again</button><button type="button" class="btn btn--ghost btn--small" id="fbDisconnect">Disconnect</button></div>`
    : st.ready ? `<div class="adm-inline-actions"><button type="button" class="btn btn--primary btn--small" id="fbConnect">Connect your Facebook Page</button></div><p class="tiny muted">Facebook asks you to log in, pick the Page and allow posting. You come straight back here.</p>`
    : setupNote("Facebook needs a one-time setup before you can connect the Page.", "Create the Meta app and add <b>FB_APP_ID</b> and <b>FB_APP_SECRET</b> as Supabase secrets. The steps are in ADMIN.md, section 8cp.", "small")}`;
  $("fbConnect")?.addEventListener("click", (e) => busy(e.target, async () => { try { const r = await api.facebook("connect"); location.href = r.url; } catch (ex) { toast(ex.message, true); } }, "Opening Facebook…"));
  $("fbDisconnect")?.addEventListener("click", async () => { if (!confirm("Disconnect the Facebook Page? Scheduled Facebook posts won't go out until you connect again.")) return; try { await api.facebook("disconnect"); toast("Disconnected"); fillFacebook(); } catch (ex) { toast(ex.message, true); } });
}
function renderSettings() {
  const pr = S.profile;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Settings</span><h1>Settings</h1></div></div>
  <div class="adm-set-list">
  <span class="eyebrow adm-set-group">You</span>
<details class="adm-card adm-more-details adm-set-row"><summary><h2>Your details</h2><span class="muted small">${esc(pr.my_name || "")} · email signature, review link</span></summary><div class="adm-fold"><p class="small muted">Used in the emails and WhatsApp messages you send.</p>
  <form class="adm-form" id="setForm" style="margin-top:0.7rem">
    <div class="row2"><label>Your name<input name="my_name" value="${esc(pr.my_name)}" /></label><label>Your WhatsApp number<input name="whatsapp" value="${esc(fmtWa(pr.whatsapp))}" /></label></div>
    <label>Where replies go <span class="muted" style="font-weight:400">(when someone answers an email you sent)</span><input type="email" name="reply_to" value="${esc(pr.reply_to)}" /></label>
    <label>Email signature<textarea name="signature" rows="4">${esc(pr.signature)}</textarea></label>
    <div class="adm-sigphoto">
      <div class="adm-sigphoto__img">${pr.signature_photo ? `<img src="${esc(pr.signature_photo)}" alt="Your signature photo" width="64" height="64" />` : '<span aria-hidden="true">🙂</span>'}</div>
      <div><b class="small">Photo next to your signature</b><p class="tiny muted">Shows in every email, beside the signature above. A clear head-and-shoulders photo works best; it's cropped to a circle.</p>
        <div class="adm-inline-actions" style="margin:0.4rem 0 0"><label class="btn btn--ghost" style="cursor:pointer">${pr.signature_photo ? "Change photo" : "Add a photo"}<input type="file" id="sigPhoto" accept="image/png,image/jpeg,image/webp" hidden /></label>${pr.signature_photo ? '<button type="button" class="btn btn--ghost" id="sigPhotoRemove">Remove</button>' : ""}</div></div>
    </div>
    <label>Google review link <span class="muted" style="font-weight:400">(for "ask for a review" messages)</span><input type="url" name="review_link" value="${esc(pr.review_link)}" placeholder="https://g.page/r/…/review" />${pr.review_link ? `<span class="tiny"><a class="inline-link" href="${esc(reviewCardUrl("Re-Charge", pr.review_link, "Happy with our work?"))}" target="_blank" rel="noopener">Make your own review card (QR) →</a></span>` : ""}</label>
    <label class="check"><input type="checkbox" name="autoreply" ${pr.autoreply !== false ? "checked" : ""} /> Send an instant thank-you email when someone fills in a form on the site</label>
    <label class="check"><input type="checkbox" name="bcc_me" ${pr.bcc_me ? "checked" : ""} /> Send me a copy of every email</label>
    <p class="adm-error tiny" id="setErr" hidden></p>
    <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save</button></div>
  </form></div></details>
<details class="adm-card adm-more-details adm-set-row"><summary><h2>Phone alerts</h2><span class="muted small">a buzz when a lead comes in</span></summary><div class="adm-fold" id="pushCard">
    <p class="small muted">A buzz on this phone or computer the moment a new lead comes in, a quote is accepted or a payment lands, even with the panel closed. Turn it on on each device you use.</p>
    <p class="small" id="pushState" style="margin-top:0.5rem">Checking this device…</p>
    <div class="adm-inline-actions" id="pushBtns" style="margin-top:0.5rem"></div>
    <p class="tiny muted" id="pushHint" style="margin-top:0.5rem" hidden></p>
  </div></details>
  <span class="eyebrow adm-set-group">AI</span>
<details class="adm-card adm-more-details adm-set-row" id="aiSet"><summary><h2>AI hub</h2><span class="muted small" id="aiSum">Checking…</span></summary><div class="adm-fold">
  <p class="small muted">The office PC sorts incoming emails, WhatsApps and website enquiries: what it is, how urgent, and the next step. If the PC is off, Claude does it instead.</p>
  <div id="aiBox" style="margin-top:0.7rem"><p class="small muted">Checking…</p></div></div></details>
  <span class="eyebrow adm-set-group">Social</span>
<details class="adm-card adm-more-details adm-set-row" id="fbSet"${/fb=/.test(location.hash) ? " open" : ""}><summary><h2>Facebook Page</h2><span class="muted small" id="fbSum">Checking…</span></summary><div class="adm-fold">
  <p class="small muted">Connect the Re-Charge Facebook Page once. Then any Facebook post in Social posts can go out with <b>Post to Facebook now</b>, or by itself at its planned time.</p>
  <div id="fbBox" style="margin-top:0.7rem"><p class="small muted">Checking…</p></div></div></details>
  <span class="eyebrow adm-set-group">Messages</span>
  <a class="adm-card adm-set-row adm-set-link" href="#/templates"><h2>Message wording</h2><span class="muted small">ready-made emails &amp; WhatsApps →</span></a>
  <a class="adm-card adm-set-row adm-set-link" href="#/contracts"><h2>Contracts</h2><span class="muted small">agreements to send and sign →</span></a>
<details class="adm-card adm-more-details adm-set-row"><summary><h2>Free mockups</h2><span class="muted small">${S.autobuild?.auto_queue ? "built as soon as a request comes in" : "you press build on each lead"}</span></summary><div class="adm-fold">
    <p class="muted small">An AI builder makes a one-page mockup for each free-mockup request and puts it online at a private link. Nothing goes to the client until you've checked it and pressed send.</p>
    <label class="check" style="margin-top:0.7rem"><input type="checkbox" id="autoQueue" ${S.autobuild?.auto_queue ? "checked" : ""} /> Start building as soon as a request comes in</label>
    <p class="tiny muted" style="margin-top:0.4rem">Off: you press "Build a free mockup automatically" on each lead. Spam is never built.</p></div></details>
  <span class="eyebrow adm-set-group">Finding clients</span>
  <details class="adm-card adm-more-details adm-set-row"><summary><h2>Prospect finder</h2><span class="muted small">new businesses every Monday</span></summary><div class="adm-fold" id="finderCard"><p class="small muted">Loading…</p></div></details>
  <span class="eyebrow adm-set-group">Extras</span>
<details class="adm-card adm-more-details adm-set-row"><summary><h2>Extra features</h2><span class="muted small">switch extras on or off</span></summary><div class="adm-fold"><p class="small muted">Off by default to keep things simple. Nothing is deleted when you switch one off.</p>
    ${Object.entries(FEATURE_TEXT).map(([k, [l, d]]) => `<label class="check" style="margin-top:0.7rem"><input type="checkbox" data-feature="${k}" ${S.features[k] ? "checked" : ""} /><span><b>${esc(l)}</b><br><span class="tiny muted">${esc(d)}</span></span></label>`).join("")}</div></details>
${S.features.sprint ? `<details class="adm-card adm-more-details adm-set-row"><summary><h2>Sales sprint</h2><span class="muted small">daily contact target</span></summary><div class="adm-fold" id="sprintCard">${(() => { const sp = sprintNow(); return `
    <p class="small muted">A fixed stretch (usually 30 days) with a daily quota of new businesses to contact and a target of new clients. Today shows your progress. It counts first-contact messages you send from the panel (intro and Google-setup offers), walk-ins and calls you log with <b>+1</b>, prospects who reply, and clients won (their first payment).</p>
    <form class="adm-form" id="sprintForm" style="margin-top:0.5rem">
      <div class="row2"><label>Starts on<input type="date" name="start" value="${esc(sp.active && sp.start ? sp.start : localDate())}" /></label><label>Days<input name="days" inputmode="numeric" value="${esc(sp.days)}" /></label></div>
      <div class="row2"><label>New clients to win<input name="target" inputmode="numeric" value="${esc(sp.target)}" /></label><label>Businesses to contact per day<input name="daily" inputmode="numeric" value="${esc(sp.daily)}" /></label></div>
      <div class="btn-row" style="justify-content:space-between"><label class="check" style="margin:0"><input type="checkbox" name="active" ${sp.active ? "checked" : ""} /> Sprint running</label><button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form>`; })()}</div></details>` : ""}
${`<details class="adm-card adm-more-details adm-set-row"><summary><h2>Founding clients</h2><span class="muted small">${offerNow().live ? "on" : "off"} · a setup discount for your first clients</span></summary><div class="adm-fold" id="offerCard">${(() => { const o = offerNow(); return `
    <p class="small muted">A setup discount for your first ${esc(o.total)} Inbox Assistant clients (set the % below): they get ${esc(o.deal)}, in return for letting you share their measured results. They still pay the refundable ${money(INBOX_DEPOSIT)} deposit to start the trial, and a place is taken when a founding client pays it. While it's on, the site shows a banner and a Founding clients section on Pricing with the real number of places left, new leads are tagged, and their quotes start with the discount line. It switches itself off when it's full or the date passes.</p>
    <p class="small" style="margin-top:0.4rem"><b>${o.live ? `${o.left} of ${o.total} places left` : o.active ? (o.left ? "Ended" : "Full") : "Off"}</b>${o.leads ? ` · ${o.leads} lead${o.leads === 1 ? "" : "s"} on the offer, ${o.taken} paid` : ""}${o.ends ? ` · ends ${esc(fmtD(o.ends + "T12:00:00"))}` : ""}</p>
    <form class="adm-form" id="offerForm" style="margin-top:0.5rem">
      <div class="row2"><label>Places<input name="total" inputmode="numeric" value="${esc(o.total)}" /></label><label>Ends on<input type="date" name="ends" value="${esc(o.ends || "")}" /></label></div>
      <label>Discount on the setup (%)<input name="discount" inputmode="numeric" value="${esc(o.discount)}" /><span class="tiny muted">100 means the ${money(INBOX_SETUP)} setup is free (the ${money(INBOX_DEPOSIT)} deposit then comes off the first month); 50 means ${money(INBOX_SETUP / 2)}</span></label>
      <div class="btn-row" style="justify-content:space-between"><label class="check" style="margin:0"><input type="checkbox" name="active" ${o.active ? "checked" : ""} /> Offer switched on</label><button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form>`; })()}</div></details>`}
<details class="adm-card adm-more-details adm-set-row"><summary><h2>Website monitoring</h2><span class="muted small">client sites checked every 10 minutes</span></summary><div class="adm-fold">
    <p class="muted small">Every client site with a website address (on their client page) and re-charge.co.za are checked every 10 minutes: does it load, how fast, is HTTPS working. If a site fails twice in a row you get an email, and another when it's back. Down sites show at the top of Today.</p>
    <p class="small" style="margin-top:0.5rem">${(() => { const last = S.monitors.reduce((a, m) => Math.max(a, Date.parse(m.last_checked || 0) || 0), 0); return last ? `Last check ${esc(rel(new Date(last).toISOString()))} · ${S.monitors.length} site${S.monitors.length === 1 ? "" : "s"} · ${S.monitors.filter((m) => m.status === "down").length} down` : "Not run yet."; })()}</p>
    <div class="btn-row" style="margin-top:0.6rem"><button class="btn btn--ghost btn--small" id="checkAllSet">Check all sites now</button></div></div></details>
  <p class="small muted adm-set-foot">Signed in as ${esc(me.email)} · <a href="#/help">How it works</a> · <button type="button" class="inline-link" id="setSignOut">Sign out</button></p>
  </div>`;
  fillFacebook(); fillAiHub();
  $("setForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    const value = { ...pr, signature_photo: S.profile.signature_photo || "", my_name: f.my_name.value.trim(), whatsapp: normPhone(f.whatsapp.value) || "", reply_to: f.reply_to.value.trim(), signature: f.signature.value.replace(/\r\n/g, "\n").trim(), review_link: f.review_link.value.trim(), bcc_me: f.bcc_me.checked, autoreply: f.autoreply.checked };
    try { await api.settings.set("profile", value); S.profile = { ...DEFAULT_PROFILE, ...value }; toast("Saved"); }
    catch (ex) { $("setErr").hidden = false; $("setErr").textContent = ex.message; }
  });
  $("setSignOut").addEventListener("click", async () => { await api.auth.signOut(); location.hash = "#/"; location.reload(); });
  const saveProfile = async (patch) => { const value = { ...S.profile, ...patch }; await api.settings.set("profile", value); S.profile = withDefaults(value); };
  $("sigPhoto").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      toast("Uploading…");
      const blob = await squarePhoto(file, 192);
      const url = await api.branding.upload(blob, "jpg");
      const old = S.profile.signature_photo;
      await saveProfile({ signature_photo: url });
      if (old && old !== url) api.branding.remove(old).catch(() => {});
      toast("Photo added to your signature"); renderSettings();
    } catch (ex) { toast("Couldn't upload the photo: " + ex.message + (/bucket/i.test(ex.message) ? " — run supabase db push (0013)" : ""), true); }
  });
  $("sigPhotoRemove")?.addEventListener("click", async () => { const old = S.profile.signature_photo; try { await saveProfile({ signature_photo: "" }); api.branding.remove(old).catch(() => {}); toast("Photo removed"); renderSettings(); } catch (ex) { toast(ex.message, true); } });
  $("sprintForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, sp = sprintNow();
    const num = (v, lo, hi, d) => Math.max(lo, Math.min(hi, parseInt(v, 10) || d));
    const start = f.start.value || localDate();
    const value = { ...sp, active: f.active.checked, start, days: num(f.days.value, 1, 365, 30), target: num(f.target.value, 1, 500, 5), daily: num(f.daily.value, 1, 100, 5), manual: start === sp.start ? sp.manual || {} : {} };
    try { await api.settings.set("sprint", value); S.sprint = value; toast(value.active ? "Sprint saved: it's on Today" : "Sprint switched off"); renderSettings(); }
    catch (ex) { toast(ex.message, true); }
  });
  $("offerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    const total = Math.max(1, Math.min(100, parseInt(f.total.value, 10) || 5));
    const discount = Math.max(5, Math.min(100, parseInt(f.discount.value, 10) || 100));
    const { area, ...rest } = S.offer; void area;
    const value = { ...rest, active: f.active.checked, total, ends: f.ends.value || "", discount };
    try { await api.settings.set("offer", value); S.offer = value; toast(value.active ? "Offer saved: the site banner updates within 5 minutes" : "Offer switched off"); renderSettings(); }
    catch (ex) { toast(ex.message, true); }
  });
  $("checkAllSet").addEventListener("click", (e) => checkSitesNow(e.target));
  fillFinder();
  fillPush();
  $("autoQueue").addEventListener("change", async (e) => { try { await api.settings.set("autobuild", { auto_queue: e.target.checked }); S.autobuild = { auto_queue: e.target.checked }; toast(e.target.checked ? "New mockup requests start building by themselves" : "You'll start each mockup yourself"); } catch (ex) { toast(ex.message, true); } });
  view.querySelectorAll("[data-feature]").forEach((el) => el.addEventListener("change", async () => {
    const next = { ...S.features, [el.dataset.feature]: el.checked };
    try { await api.settings.set("features", next); S.features = next; applyFeatures(); toast(`${FEATURE_TEXT[el.dataset.feature][0]} ${el.checked ? "on" : "off"}`); if (["sprint"].includes(el.dataset.feature)) { renderSettings(); const f = view.querySelector("[data-feature]")?.closest("details"); if (f) f.open = true; } } catch (ex) { toast(ex.message, true); el.checked = !el.checked; }
  }));
}

// Crop the middle square of a photo and shrink it (keeps emails light).
function squarePhoto(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      c.toBlob((b) => b ? resolve(b) : reject(new Error("could not read the image")), "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("that file isn't an image we can read")); };
    img.src = url;
  });
}

// ---------- prospect finder (0016 + finder function + weekly Routine) ----------
const FINDER_TYPES = [
  "Hair salons, barbers, beauty & nail salons", "Plumbers, electricians, builders, painters, pool services",
  "Restaurants, takeaways, cafés, bars, bakeries, butcheries", "Crèches, nursery schools, tutors, dance & music studios",
  "Mechanics, panel beaters, tyre shops", "Engineering, steel fabrication, welding",
  "Hardware stores, building supplies, locksmiths, pest control", "Gyms, dentists, physiotherapists",
  "Accountants, attorneys, printing & signage", "Cleaning services, laundromats, tailors, upholstery, furniture",
  "Pet grooming, couriers, wholesalers",
  // added 2026-10-01 so "All kinds of businesses" really covers most small businesses (max 20 types)
  "Guesthouses, B&Bs, lodges, event venues", "Photographers, florists, décor & party hire, caterers",
  "Vets, optometrists, doctors, pharmacies, spas", "Estate agents, insurance brokers, security companies",
  "Solar installers, landscapers, garden services, car washes", "Boutiques, gift shops, cellphone & computer repairs",
];
const FINDER_TYPES_V1 = FINDER_TYPES.slice(0, 11);   // a config with all of these was saved as "everything" before the dropdown
async function fillFinder() {
  const card = $("finderCard"); if (!card) return;
  let st;
  try { st = await api.finder("status"); } catch (e) { card.innerHTML = setupNote("The prospect finder isn't set up yet.", "Run <code>supabase db push</code> and deploy the <code>finder</code> function (ADMIN.md §8o)."); return; }
  const cfg = st.config || {}, types = cfg.types || FINDER_TYPES, extra = types.filter((t) => !FINDER_TYPES.includes(t));
  const allTypes = FINDER_TYPES_V1.every((t) => types.includes(t));
  card.innerHTML = `
    <p class="small muted">Every Monday morning a research assistant looks for ${allTypes ? "all kinds of small businesses" : "businesses of these types"} ${cfg.nationwide ? "across South Africa" : "in these areas"}${cfg.focus === "ai" ? ", weighing signs they're missing or slow to answer customers" : cfg.focus === "websites" ? ", weighing whether they have a decent website" : ""}, checks whether they have a proper website, notes their Google rating, number of reviews and how active they are, and adds the best ${esc(cfg.perRun || 20)} to Leads → To contact (skipping anyone you already have). Established businesses with no website come first.</p>
    ${!st.ready ? `<div class="btn-row" style="margin-top:0.7rem"><button class="btn btn--primary btn--small" id="finderSetup">Set up the prospect finder</button></div><p class="tiny muted" style="margin-top:0.4rem">One click: creates the encryption key it needs and saves the list below.</p>${setupNote("", "Then switch on the weekly Routine that runs it every Monday (ADMIN.md §8o).")}` : ""}
    <form class="adm-form" id="finderForm" style="margin-top:0.8rem"${st.ready ? "" : " hidden"}>
      <label class="check"><input type="checkbox" name="nationwide" ${cfg.nationwide ? "checked" : ""} /> <span>Search all of South Africa<span class="tiny muted" style="display:block">Adds 60 towns and cities across all nine provinces, mixed in with your own areas below. Everything happens online, so distance doesn't matter.</span></span></label>
      <label>${cfg.nationwide ? "Your own areas too" : "Areas"} <span class="muted" style="font-weight:400">(one per line${cfg.nationwide ? ", optional" : ""})</span><textarea name="areas" rows="4">${esc((cfg.areas || []).join("\n"))}</textarea></label>
      <label>What evidence to weigh first<select name="focus"><option value="both"${(cfg.focus || "both") === "both" ? " selected" : ""}>Both — AI and websites</option><option value="ai"${cfg.focus === "ai" ? " selected" : ""}>AI need (slow replies, busy, admin-heavy)</option><option value="websites"${cfg.focus === "websites" ? " selected" : ""}>Website need (no site, dated site)</option></select><span class="tiny muted">Website need is visible from outside; AI need has to be inferred from reviews about slow replies, "typically replies in a day" badges and busy, admin-heavy trades.</span></label>
      <label>What to look for<select name="typeMode"><option value="all"${allTypes ? " selected" : ""}>All kinds of businesses</option><option value="pick"${allTypes ? "" : " selected"}>Only the types I pick</option></select></label>
      <div id="finderPick"${allTypes ? " hidden" : ""}>
        <fieldset class="adm-checks"><legend>Types of business</legend>${FINDER_TYPES.map((t, i) => { const r = typeResults(t); return `<label class="check"><input type="checkbox" name="type" value="${esc(t)}"${allTypes || types.includes(t) ? " checked" : ""} id="ft${i}" /> <span>${esc(t)}${r ? `<span class="tiny muted" style="display:block">${r}</span>` : ""}</span></label>`; }).join("")}</fieldset>
        <label>Other types <span class="muted" style="font-weight:400">(one per line, e.g. "Driving schools")</span><textarea name="extra" rows="2">${esc(extra.join("\n"))}</textarea></label>
      </div>
      <div class="row2"><label>New prospects each week<input name="perRun" inputmode="numeric" value="${esc(cfg.perRun || 20)}" /></label><label class="check" style="align-self:end"><input type="checkbox" name="enabled" ${cfg.enabled === false ? "" : "checked"} /> Finder switched on</label></div>
      <div class="btn-row" style="justify-content:space-between"><span class="tiny muted">${st.last ? `Last batch ${esc(rel(st.last.at))}: ${esc(st.last.added)} added, ${esc(st.last.skipped)} already in your list` : "No finds yet."}</span><span class="adm-inline-actions" style="margin:0"><button type="button" class="btn btn--ghost btn--small" id="finderPull">Check for new finds</button><button class="btn btn--primary btn--small" type="submit">Save</button></span></div>
    </form>`;
  $("finderSetup")?.addEventListener("click", async (e) => { e.target.disabled = true; e.target.textContent = "Setting up…"; try { await api.finder("setup"); toast("Prospect finder ready"); fillFinder(); } catch (ex) { toast(ex.message, true); e.target.disabled = false; } });
  $("finderPull")?.addEventListener("click", async (e) => { e.target.disabled = true; const r = await maybeFinderPull(true); if (r && !r.added) toast(r.ok === false ? "Couldn't check: " + r.error : "No new finds right now"); e.target.disabled = false; });
  // This wiring runs after an await, so the visitor may already have routed away
  // and the form may be gone. Every other listener here is optional-chained; these
  // two were not, and threw whenever the render lost that race.
  const finderForm = $("finderForm");
  if (!finderForm) return;
  finderForm.typeMode.addEventListener("change", (e) => { $("finderPick").hidden = e.target.value === "all"; });
  finderForm.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    const types = f.typeMode.value === "all" ? FINDER_TYPES.slice() : [...f.querySelectorAll("[name=type]:checked")].map((x) => x.value).concat(f.extra.value.split(/\n+/).map((x) => x.trim()).filter(Boolean));
    const config = { areas: f.areas.value.split(/\n+/).map((x) => x.trim()).filter(Boolean), types, perRun: Number(f.perRun.value) || 20, enabled: f.enabled.checked, nationwide: f.nationwide.checked, focus: f.focus.value };
    if ((!config.areas.length && !config.nationwide) || !config.types.length) return toast("Add at least one area (or tick all of South Africa) and one type of business.", true);
    if (config.types.length > 20) return toast(`That's ${config.types.length} types; the finder takes up to 20. Untick a few, or choose All kinds of businesses.`, true);
    await busy(f.querySelector("[type=submit]"), async () => { try { const r = await api.finder("config", config); if (config.nationwide && !r?.config?.nationwide) return toast("Saved, but \"all of South Africa\" needs the updated finder function: deploy it, then save again.", true); toast("Saved — the next weekly search uses this"); fillFinder(); } catch (ex) { toast(ex.message, true); } }, "Saving…");
  });
}

// ---------- help ----------
function renderHelp() {
  const sec = (title, html) => `<section class="adm-help__sec" data-help><h2>${title}</h2>${html}</section>`;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Help</span><h1>How it works</h1></div></div>
  <div class="adm-card adm-help" style="max-width:46rem">
    <input type="search" class="adm-help__find" id="helpFind" placeholder="Find in the help: renewal, deposit, trial…" aria-label="Find in the help" autocomplete="off" />
    <p class="small muted" id="helpNone" hidden>Nothing in the help mentions that. Try another word.</p>
    ${sec("Every day: open Today", "<p>Today lists everything that needs you, most urgent first: new enquiries to answer, calls, follow-ups that are due, quotes nobody has answered, payments to sort out, trials and care plans about to renew. Each row has one button for the next thing to do. When the list is empty, you're done.</p>")}
    ${sec("Every lead has one next step", "<p>Open any lead and the box at the top says what to do next, with a button that does it (opens the right message, sends the quote, asks for the balance…). The Email, WhatsApp and Call buttons under it are for anything else. We promise clients a reply by 17:00 the next business day; the panel also shows our own goal of an hour.</p>")}
    ${sec("The stages", `<ol class="adm-help__stages">${STAGES.map(([k, l]) => `<li><b>${["in_development", "live"].includes(k) ? "Won · " : ""}${esc(l)}</b>: ${esc(STAGE_HELP[k])}</li>`).join("")}</ol>
    <p>The board shows four columns: To contact, Talking, Quoted and Won (Building and Live are a pill inside Won). Lost leads are under Leads → Every stage → Lost. You rarely need to change a stage yourself. It moves on its own: sending the quote → <b>Quoted</b>; the client accepts it online and pays the deposit shown on their quote (40% of the total, at least R500; the first month on a pay-monthly quote) → <b>Building</b>; they decline it online → <b>Lost</b>; you press "Site is live" → <b>Live</b>. On a phone, tap ⋯ on a card to move it.</p>`)}
    ${sec("Money", "<p>The deposit is paid by card on the quote page and shows up by itself. If someone pays by EFT or cash, press <b>I received a payment</b> (on Today, on Money, or on their lead). For the balance, press <b>Ask for the balance</b>: it makes a card payment link you can email or WhatsApp. A card payment the panel can't place shows on Today as <b>Which lead is this?</b>. Your bank details for EFT go under Settings → Contracts → Bank details, and into messages as {{bank_details}}.</p>")}
    ${sec("Clients, renewals and care plans", `<p>When a site goes live, press <b>Site is live</b> on the lead: it makes the client page with their plan, price and renewal date. Yearly plans show on Today 30 days before they renew: press <b>Send renewal</b>, or open the client, press <b>Create renewal payment link</b>, then <b>Email a renewal reminder</b> (it includes the amount, the date and the card link). Paid by EFT? Record it on Money and the date moves on a year by itself. Monthly plans bill themselves: they're emailed a card link 3 days before each payment, and Today only shows them if one is late. Prices: Hosting ${money(PLAN_MONTHLY.hosting)} a month, Care ${money(PLAN_MONTHLY.care)} a month (hosting plus an hour of changes).</p>`)}
    ${sec("Inbox Assistant trials", `<p>The Inbox Assistant starts with a refundable ${money(INBOX_DEPOSIT)} deposit: on the lead's Inbox Assistant card, press <b>Send a card payment link</b> (or record an EFT). It comes off the ${money(INBOX_SETUP)} setup. Then set up their page on the same card, and on the day-one call time 5 to 10 of their real emails answered by hand: the median becomes the minutes per email. Send the <b>measurement agreement</b> so they know how the 5 hours are counted.</p>
    <p>For two weeks they paste customer emails in and tap how each reply went; that measures the hours saved, judged on days 8 to 14. The lead's next step follows the trial: a check-in if they haven't used it, a nudge if most replies aren't marked or it's behind, the result call on day 13. On day 14: if it saved 5 hours, <b>send the result</b>, then the quote (the rest of the setup and the first month; the deposit already counts, so they pay no second deposit) and mark it kept. If not, talk to them: adjust and measure another week, or refund the ${money(INBOX_DEPOSIT)} in full within 7 days and switch the page off (no refund if they didn't give the agreed access or information).</p>`)}
    ${sec("The AI tools", "<p><b>Sort a message</b>: paste an email or WhatsApp; the AI says what it is, how urgent it is and the next step, and finds the lead it belongs to. <b>Read an invoice or payment</b>: a PDF, photo or pasted text becomes a client payment or a cost (always check the lead and the type before you save). <b>Add a call recording</b>: the office PC transcribes it and writes the notes, to-dos and next step; press <b>Make this the next step</b> to turn it into a reminder. <b>Draft a reply</b>: on a lead, the AI writes a reply from what we sell and the lead's history; you check it and send. The office PC does this work first; the cloud AI (Claude) is used when the PC is off or you ask for it, at a small cost each time.</p>")}
    ${sec("Mockups", "<p>The free mockup is no longer offered on the site, but leads who asked for one still have the builder: an AI makes a one-page preview (it runs every hour, 06:00 to 20:00) and it appears on the lead as <b>Mockup ready</b>. Open it, check it, then press <b>Send the link</b>. Nothing is ever sent to a client without you pressing send.</p>")}
    ${sec("Finding new clients", "<p><b>Leads → To contact</b> is for businesses you found yourself (or the prospect finder found for you). Paste a list from a spreadsheet, then press <b>Email</b> or <b>WhatsApp</b> to contact them one by one with a ready-made message you can change before sending. Landline numbers can't get WhatsApp, so call those.</p>")}
    ${sec("Social posts", "<p>Switch it on under Settings → Extra features. Write the post, pick the channel and a date. For most apps the panel copies the text and opens the app for you. Facebook posts can also go out by themselves once your Page is connected (Settings → Facebook Page): set the status to <b>Planned</b>, pick a time and tick <b>Post it to Facebook by itself</b>.</p>")}
    ${sec("Numbers", "<p>Money → Numbers shows where leads come from, where they drop off, and what each client is worth. The biggest drop is marked: that's the step to work on. A trial's refundable deposit only counts as a win once they keep it.</p>")}
    ${sec("Messages", "<p>Ready-made messages live under Settings → Message wording. Words in {{curly brackets}} are filled in for each lead. Anything in [square brackets] must be replaced before the panel lets you send it.</p>")}
  </div>`;
  $("helpFind").addEventListener("input", (e) => {
    const t = e.target.value.trim().toLowerCase(); let n = 0;
    view.querySelectorAll("[data-help]").forEach((x) => { const hit = !t || x.textContent.toLowerCase().includes(t); x.hidden = !hit; if (hit) n++; });
    $("helpNone").hidden = n > 0;
  });
}

// ---------- more (mobile) ----------
function renderMore() {
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">More</span><h1>Everything else</h1></div></div>
  <div class="adm-more-list">
    <a href="#/clients">Clients <span>Live sites, hosting & care, websites</span></a>
    ${S.features.social ? '<a href="#/marketing">Social posts <span>Plan and track your posts</span></a>' : ""}
    <a href="#/settings">Settings <span>Your details, messages, prospect finder</span></a>
    <a href="#/help">How it works <span>A two-minute guide to the panel</span></a>
    <a href="/" target="_blank" rel="noopener">Open the website <span>re-charge.co.za</span></a>
    <button type="button" id="moreSignOut">Sign out <span>${esc(me?.email || "")}</span></button>
  </div>`;
  $("moreSignOut").addEventListener("click", async () => { if (!confirm("Sign out? You'll need a new sign-in email to get back in.")) return; await api.auth.signOut(); location.hash = "#/"; location.reload(); });
}

// ====================================================================
// Phase C — money & clients
// ====================================================================
const PAGE = 150;
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
  const catOf = (x) => { const p = byId(x.project_id); return (p?.category || []).filter((c) => !/request$/i.test(c))[0] || (x.kind === "care" ? "Hosting & care" : "Uncategorised"); };
  const byCat = {}; for (const x of year) byCat[catOf(x)] = (byCat[catOf(x)] || 0) + (x.amount_cents || 0);
  // effective hourly rate by category (all time): revenue / hours, only where time is logged
  const rate = {}; for (const p of S.projects) { const m = minutesFor(p.id); if (!m) continue; const rev = sum(ok.filter((x) => x.project_id === p.id)); const c = (p.category || []).filter((x) => !/request$/i.test(x))[0] || "Other"; rate[c] = rate[c] || { rev: 0, min: 0 }; rate[c].rev += rev; rate[c].min += m; }
  const show = q.get("show") || "all";
  let rows = S.payments.slice();
  if (show === "unmatched") rows = rows.filter((x) => !x.project_id && !x.client_id);
  if (show === "manual") rows = rows.filter((x) => x.provider !== "yoco");
  if (show === "yoco") rows = rows.filter((x) => x.provider === "yoco");
  const recurring = S.clients.filter((c) => c.care_active && careMonth(c) > 0);
  const mrr = recurring.reduce((a, c) => a + careMonth(c), 0);
  const monthlyN = recurring.filter(isMonthly).length;
  const byPlan = {}; for (const c of recurring) { const k = PLAN_LABEL[c.care_plan] || "Care"; byPlan[k] = (byPlan[k] || 0) + careMonth(c); }
  const planBars = Object.entries(byPlan).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  // Inbox Assistant trials still running: what they add if they keep it (the plan, and the setup less what's paid)
  const coming = [...S.trials.values()].filter(({ a }) => { const p = byId(a.project_id); return p && trialOpen(p); }).reduce((c, { a }) => { const p = byId(a.project_id), off = onOffer(p) ? offerNow().setupOff : 0; c.n++; c.monthly += PLAN_MONTHLY.inbox; c.setup += Math.max(0, INBOX_SETUP - off - depositsPaid(p)); return c; }, { n: 0, monthly: 0, setup: 0 });
  const bars = (items, f = money) => { const mx = Math.max(1, ...items.map((i) => i.value)); return `<ul class="adm-bars">${items.map((i) => `<li><span class="lbl">${esc(i.label)}</span><span class="track"><span class="fill" style="width:${Math.round(i.value / mx * 100)}%"></span></span><b>${f(i.value)}</b></li>`).join("") || '<li class="muted small">Nothing yet.</li>'}</ul>`; };
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Money</span><h1>${money(sum(inRange(som)))} this month</h1></div>
    <div class="adm-head__actions"><button class="btn btn--ghost btn--small" id="payCsv">Export CSV</button><button class="btn btn--ghost btn--small" data-read-doc>Read an invoice or payment</button><button class="btn btn--primary btn--small" data-open-eft>I received a payment</button></div></div>

  <form class="adm-card adm-form" id="eftForm" hidden style="margin:0 0 1rem">
    <h2>Record a payment received outside Yoco</h2>
    <label>Lead${leadPicker("project", { selected: q.get("project") || "" })}</label>
    <div class="row2"><label>Amount<span class="money"><input name="amount" inputmode="decimal" required placeholder="3000" /></span></label><label>For<select name="kind"><option value="balance">Balance / final payment</option><option value="deposit">Deposit</option><option value="care">Care plan</option><option value="other">Other</option></select></label></div>
    <div class="row2"><label>Date<input type="date" name="date" value="${localDate()}" /></label><label>Method<select name="provider"><option value="eft">EFT</option><option value="cash">Cash</option><option value="yoco">Yoco (manual)</option><option value="other">Other</option></select></label></div>
    <label>Note<input name="note" placeholder="e.g. FNB ref 12345" /></label>
    <p class="adm-error tiny" id="eftErr" hidden></p>
    <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn--ghost btn--small" data-close-eft>Cancel</button><button class="btn btn--primary btn--small" type="submit">Record payment</button></div>
  </form>
  <div class="adm-tiles adm-tiles--4">
    <div class="adm-tile"><span>Last 30 days</span><b>${money(sum(inRange(d30)))}</b><small>${inRange(d30).length} payments</small></div>
    <div class="adm-tile"><span>This year</span><b>${money(sum(year))}</b><small>${year.length} payments</small></div>
    <div class="adm-tile"><span>Unpaid card links</span><b>${money(sum(openReqs))}</b><small>${openReqs.length} open link${openReqs.length === 1 ? "" : "s"}</small></div>
    <div class="adm-tile"><span>Recurring / month</span><b>${rands(mrr)}</b><small>${recurring.length} client${recurring.length === 1 ? "" : "s"} on a plan</small></div>
  </div>

  <div class="adm-card adm-mrr" style="margin-top:1rem">
    <div class="adm-mrr__head">
      <div><h2>Recurring revenue</h2><p class="small muted">What clients pay you every month for hosting, care and AI plans: the steady income the business runs on. Growing this is worth more than any one-off.</p></div>
      <div class="adm-mrr__big"><b>${rands(mrr)}</b><span>per month</span></div>
    </div>
    <div class="adm-tiles adm-tiles--${coming.n ? 4 : 3}" style="margin-top:0.8rem">
      <div class="adm-tile"><span>Annualised</span><b>${rands(mrr * 12)}</b><small>if nothing changes</small></div>
      <div class="adm-tile"><span>Paying clients</span><b>${recurring.length}</b><small>${monthlyN} monthly · ${recurring.length - monthlyN} yearly</small></div>
      <div class="adm-tile"><span>Average per client</span><b>${rands(recurring.length ? mrr / recurring.length : 0)}</b><small>per month</small></div>
      ${coming.n ? `<div class="adm-tile adm-tile--coming"><span>Coming in</span><b>+${rands(coming.monthly)}<i>/mo</i></b><small>if ${coming.n === 1 ? "the Inbox Assistant trial converts" : `all ${coming.n} Inbox Assistant trials convert`}, plus ${rands(coming.setup)} in setup</small></div>` : ""}
    </div>
    <p class="tiny muted" style="margin-top:0.5rem">Yearly plans are counted as a twelfth of the year each month, rounded to the rand.</p>
    ${planBars.length ? `<h3 style="font-size:0.9rem;margin:1rem 0 0.4rem">By plan <span class="muted" style="font-weight:400">per month</span></h3>${bars(planBars, rands)}` : '<p class="adm-empty" style="margin-top:0.8rem">No clients on a plan yet. Every website Care plan and AI maintenance plan adds to this.</p>'}
  </div>


  <div class="grid grid--2" style="margin-top:1.2rem;gap:1rem">
    <div class="adm-card"><h2>Revenue by month <span class="muted">last 12 months</span></h2>
      <div class="adm-chart" role="img" aria-label="Monthly revenue bar chart">${months.map((m) => `<div class="col" title="${esc(m.label)}: ${money(m.total)}">${["other", "care", "balance", "deposit"].map((k) => m.byKind[k] ? `<div class="bar" data-k="${k}" style="height:${Math.max(2, Math.round(m.byKind[k] / max * 100))}%;border-radius:0"></div>` : "").join("")}<div class="lbl">${esc(m.label)}</div></div>`).join("")}</div>
      <div class="adm-legend adm-legend--money"><span><i data-k="deposit"></i>Deposits</span><span><i data-k="balance"></i>Balances</span><span><i data-k="care"></i>Care</span><span><i data-k="other"></i>Other</span></div></div>
    <div class="adm-card"><h2>This year by type</h2>${bars(byKind)}<h2 style="margin-top:1rem">This year by category</h2>${bars(Object.entries(byCat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value))}</div>
  </div>

  <div class="grid grid--2" style="margin-top:1rem;gap:1rem">
    ${S.features.time ? `<div class="adm-card"><h2>Effective hourly rate <span class="muted">where time is logged</span></h2>${bars(Object.entries(rate).map(([label, r]) => ({ label: `${label} · ${hours(r.min)}`, value: r.min ? Math.round(r.rev / (r.min / 60)) : 0 })).sort((a, b) => b.value - a.value), (v) => money(v) + "/h")}<p class="tiny muted" style="margin-top:0.6rem">Log time on each project (Time card) and this tells you what you actually earn per hour by type of work — the best input for your pricing.</p></div>` : ""}
    <div class="adm-card"><h2>Open payment links <span class="muted">${openReqs.length}</span></h2>${openReqs.length ? openReqs.map((r) => { const p = byId(r.project_id), c = clientById(r.client_id); return `<div class="adm-req"><span>${money(r.amount_cents)} · ${esc(KIND_LABEL[r.kind] || r.kind)} · ${p ? `<a href="#/p/${esc(p.id)}">${esc(p.ref)} ${esc(p.business || p.name || "")}</a>` : c ? `<a href="#/c/${esc(c.id)}">${esc(c.name)}</a>` : "—"}<br><span class="tiny muted">${esc(r.description || "")} · ${esc(rel(r.created_at))}</span></span><span class="adm-inline-actions" style="margin:0"><button class="btn btn--ghost" data-copy="${esc(r.redirect_url || "")}">Copy</button><button class="btn btn--ghost" data-cancelreq="${esc(r.id)}">Cancel</button></span></div>`; }).join("") : '<p class="muted small">None. Create one from a project\'s Payments card ("Request payment") or a client page.</p>'}</div>
  </div>

  <section class="adm-section"><h2>All payments <span class="count">${rows.length}</span></h2>
    ${subTabs([["all", "All"], ["yoco", "Yoco"], ["manual", "Manual"], ["unmatched", "Unmatched"]].map(([v, l]) => [v, l, `#/money?show=${v}`]), show, "Which payments")}
    <div class="table-wrap"><table class="adm-table adm-table--cards"><thead><tr><th>Date</th><th>Amount</th><th>For</th><th>Project / client</th><th>Via</th><th>Note</th><th></th></tr></thead><tbody>
      ${rows.slice(0, PAGE).map((x) => { const p = byId(x.project_id), c = clientById(x.client_id); return `<tr><td class="nowrap" data-l="Date">${esc(fmtD(paidAt(x)))}</td><td class="mono nowrap" data-l="Amount">${money(x.amount_cents)}</td><td data-l="For">${esc(KIND_LABEL[x.kind] || x.kind || "")}</td><td data-l="Project / client">${p ? `<a href="#/p/${esc(p.id)}">${esc(p.ref)}</a> ${esc(p.business || p.name || "")}` : c ? `<a href="#/c/${esc(c.id)}">${esc(c.name)}</a>` : `<span class="muted">${esc(x.email || "unmatched")}</span>`}</td><td data-l="Via">${esc(x.provider)}${x.status !== "succeeded" ? ` <span class="status-pill" data-s="${esc(x.status)}">${esc(x.status)}</span>` : ""}</td><td${x.note || x.reference ? ' data-l="Note"' : ""}>${esc(x.note || x.reference || "")}</td><td class="nowrap span2">${!x.project_id && !x.client_id ? `<button class="btn btn--ghost btn--small" data-match="${esc(x.id)}">Match</button>` : ""}${x.provider !== "yoco" ? ` <button type="button" class="inline-link small adm-del" data-delpay="${esc(x.id)}" aria-label="Delete this manual payment">Delete</button>` : ""}</td></tr>`; }).join("") || '<tr><td colspan="7" class="muted">No payments yet.</td></tr>'}
    </tbody></table></div>${rows.length > PAGE ? `<p class="tiny muted" style="margin-top:0.6rem">Showing the latest ${PAGE} of ${rows.length}. Export CSV for the full list.</p>` : ""}</section>
  ${(() => { const ex = S.expenses || [], csum = (a) => a.reduce((t, x) => t + (x.amount_cents || 0), 0);
    const mon = ex.filter((x) => Date.parse(x.spent_on) >= som), yr = ex.filter((x) => Date.parse(x.spent_on) >= soy);
    return `<section class="adm-section" id="costs"><h2>Costs <span class="count">${ex.length}</span></h2>
    <p class="small muted">Bills the business pays. Use <b>Read an invoice or payment</b> to add one from a PDF or photo. The spreadsheet is ready for your accountant.</p>
    <div class="adm-tiles adm-tiles--4"><div class="adm-tile"><span>This month</span><b>${money(csum(mon))}</b><small>${mon.length} bill${mon.length === 1 ? "" : "s"}</small></div><div class="adm-tile"><span>This year</span><b>${money(csum(yr))}</b><small>VAT in it: ${money(yr.reduce((t, x) => t + (x.vat_cents || 0), 0))}</small></div><div class="adm-tile"><span>Kept this month</span><b>${money(sum(inRange(som)) - csum(mon))}</b><small>income less costs</small></div></div>
    <div class="adm-inline-actions" style="margin:.7rem 0"><button type="button" class="btn btn--primary btn--small" data-read-doc>Read an invoice or payment</button>${ex.length ? '<button type="button" class="btn btn--ghost btn--small" id="costCsv">Costs spreadsheet (CSV)</button>' : ""}</div>
    ${ex.length ? `<div class="table-wrap"><table class="adm-table adm-table--cards"><thead><tr><th>Date</th><th>Supplier</th><th>Amount</th><th>Category</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${ex.slice(0, 60).map((x) => `<tr><td class="nowrap" data-l="Date">${esc(fmtD(x.spent_on + "T12:00:00"))}</td><td data-l="Supplier">${esc(x.supplier)}${x.note ? `<br><span class="tiny muted">${esc(x.note)}</span>` : ""}</td><td class="mono nowrap" data-l="Amount">${money(x.amount_cents)}${x.vat_cents ? `<br><span class="tiny muted">VAT ${money(x.vat_cents)}</span>` : ""}</td><td data-l="Category">${esc(COST_CAT[x.category] || x.category)}</td><td data-l="Invoice">${esc(x.invoice_no || "")}${x.file_path ? ` <button type="button" class="inline-link small" data-costfile="${esc(x.file_path)}">file</button>` : ""}</td><td><button type="button" class="inline-link small" data-delcost="${esc(x.id)}">Delete</button></td></tr>`).join("")}
    </tbody></table></div>` : '<p class="small muted">No costs recorded yet.</p>'}</section>`; })()}`;
  // The header button only opens the form (next to it, at the top); Cancel closes it
  const openEft = () => { const f = $("eftForm"); f.hidden = false; f.project.focus({ preventScroll: true }); requestAnimationFrame(() => f.scrollIntoView({ block: "nearest" })); };
  view.querySelectorAll("[data-open-eft]").forEach((b) => b.addEventListener("click", openEft));
  view.querySelector("[data-close-eft]")?.addEventListener("click", () => { $("eftForm").hidden = true; });
  wireLeadPicker($("eftForm"));
  view.querySelectorAll("[data-read-doc]").forEach((b) => b.addEventListener("click", () => openReader()));
  view.querySelectorAll("[data-costfile]").forEach((b) => b.addEventListener("click", async () => { try { const u = await api.docs.url(b.dataset.costfile); const w = window.open(u, "_blank"); if (w) w.opener = null; } catch (ex) { toast(ex.message, true); } }));
  view.querySelectorAll("[data-delcost]").forEach((b) => b.addEventListener("click", async () => { const x = S.expenses.find((y) => y.id === b.dataset.delcost); if (!x || !confirm(`Delete the ${x.supplier} cost of ${money(x.amount_cents)}?`)) return; try { await api.expenses.remove(x.id); if (x.file_path) await api.docs.remove(x.file_path).catch(() => {}); toast("Deleted"); await loadAll(true); route(); } catch (ex) { toast(ex.message, true); } }));
  $("costCsv")?.addEventListener("click", () => {
    const lines = ["date,supplier,amount_zar,vat_zar,category,invoice_no,note"].concat(S.expenses.map((x) => [x.spent_on, x.supplier, (x.amount_cents || 0) / 100, x.vat_cents ? x.vat_cents / 100 : "", COST_CAT[x.category] || x.category, x.invoice_no || "", x.note || ""].map(csvCell).join(",")));
    download(`re-charge-costs-${new Date().toISOString().slice(0, 10)}.csv`, "\ufeff" + lines.join("\r\n"), "text/csv");
  });
  // ?pay=1 (Today's "I received a payment"): open the form and drop the flag, so saving doesn't reopen it
  if (q.get("pay") === "1" && $("eftForm")) { history.replaceState(null, "", location.pathname + location.search + "#/money"); openEft(); }
  view.querySelectorAll("[data-match]").forEach((b) => b.addEventListener("click", () => openMatch(b.dataset.match)));
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
    if (!p || !cents) { err.hidden = false; err.textContent = "Choose the lead and enter the amount."; return; }
    await busy(f.querySelector("[type=submit]"), async () => { try {
      await api.payments.insert({ project_id: p.id, client_id: p.client_id || null, provider: f.provider.value, amount_cents: cents, currency: "ZAR", kind: f.kind.value, note: f.note.value.trim() || null, status: "succeeded", matched: true, paid_at: f.date.value ? new Date(f.date.value + "T12:00:00").toISOString() : new Date().toISOString() });
      await api.events.insert(p.id, "payment", `${money(cents)} ${KIND_LABEL[f.kind.value].toLowerCase()} received (${f.provider.value.toUpperCase()})${f.note.value.trim() ? " — " + f.note.value.trim() : ""}`, { manual: true, kind: f.kind.value });
      if (f.kind.value === "deposit" && !p.deposit_paid) await api.projects.update(p.id, { deposit_paid: true, ...(["new", "prospect", "contacted"].includes(p.status) ? { status: "deposit_paid" } : {}) });
      toast("Payment recorded"); await loadAll(true); route();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; } }, "Saving…");
  });
}
const fmtDiso = (iso) => localDate(new Date(iso));

// ---------- clients ----------
// ---------- site monitoring (0015 + site-monitor function) ----------
async function fillUptime(c) {
  const card = $("uptimeCard"), m = monFor(c);
  if (!m) { card.innerHTML = `<h2>Website health</h2><p class="small muted">${c.monitor === false ? "Not being checked (switched off for this client)." : `Not checked yet. ${esc(c.site_label)} is checked every 10 minutes once site monitoring is running.`}</p><div class="adm-inline-actions" style="margin-top:0.6rem"><button class="btn btn--ghost" data-checknow>Check now</button>${monToggle(c)}</div>`; wireUptime(c); return; }
  const hist = await api.monitors.history(m.url, new Date(Date.now() - 7 * 864e5).toISOString()).catch(() => []);
  const pct = (since) => { const xs = hist.filter((h) => Date.parse(h.checked_at) >= since); return xs.length ? (100 * xs.filter((h) => h.ok).length / xs.length) : null; };
  const d1 = pct(Date.now() - 864e5), d7 = pct(0);
  const okMs = hist.filter((h) => h.ok && h.ms).map((h) => h.ms), avg = okMs.length ? okMs.reduce((a, x) => a + x, 0) / okMs.length : null;
  // incidents: runs of failed checks
  const inc = []; let cur = null;
  for (const h of hist) { if (!h.ok) { if (!cur) cur = { from: h.checked_at, to: h.checked_at, error: h.error }; else cur.to = h.checked_at; } else if (cur) { inc.push(cur); cur = null; } }
  if (cur) inc.push({ ...cur, ongoing: true, ...(m.status === "down" ? { from: m.since || cur.from, error: m.last_error || cur.error } : {}) });
  // 7-day strip: one bar per ~2 hours, red if any failure in it
  const buckets = 84, span = 7 * 864e5 / buckets, start = Date.now() - 7 * 864e5;
  const bars = Array.from({ length: buckets }, (_, i) => { const xs = hist.filter((h) => { const t = Date.parse(h.checked_at); return t >= start + i * span && t < start + (i + 1) * span; }); return !xs.length ? "none" : xs.some((h) => !h.ok) ? "bad" : xs.some((h) => h.ms > 6000) ? "slow" : "ok"; });
  const fmtPct = (x) => x == null ? "—" : (x >= 99.95 ? "100" : x.toFixed(x >= 99 ? 2 : 1)) + "%";
  card.innerHTML = `<h2>Website health ${monChip(m)}</h2>
    <p class="small muted"><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.url.replace(/^https:\/\//, "").replace(/\/$/, ""))}</a> · checked ${esc(rel(m.last_checked))}${m.status === "down" && m.last_error ? ` · <span class="adm-error">${esc(m.last_error)}</span>` : ""}</p>
    <div class="adm-uptime" role="img" aria-label="Last 7 days: ${fmtPct(d7)} up">${bars.map((b) => `<i data-b="${b}"></i>`).join("")}</div>
    <div class="adm-uptime__legend tiny muted"><span>7 days ago</span><span>now</span></div>
    <dl class="adm-kv" style="margin-top:0.6rem"><dt>Up, last 24 h</dt><dd>${fmtPct(d1)}</dd><dt>Up, last 7 days</dt><dd>${fmtPct(d7)}</dd><dt>Usually loads in</dt><dd>${avg ? (avg / 1000).toFixed(1) + " s" : "—"}</dd></dl>
    ${inc.length ? `<h3 style="font-size:0.85rem;margin-top:0.8rem">Problems this week</h3><ul class="adm-timeline">${inc.slice(-5).reverse().map((x) => `<li data-kind="note"><span class="tl-dot"></span><div><time>${esc(fmtDT(x.from))}${x.ongoing ? " · still going" : " · about " + Math.max(10, Math.round((Date.parse(x.to) - Date.parse(x.from)) / 6e4) + 10) + " min"}</time><p>${esc(x.error || "Down")}</p></div></li>`).join("")}</ul>` : '<p class="small muted" style="margin-top:0.6rem">No problems this week.</p>'}
    <div class="adm-inline-actions" style="margin-top:0.6rem"><button class="btn btn--ghost" data-checknow>Check now</button>${monToggle(c)}</div>`;
  wireUptime(c);
}
// What their assistant has actually done, against the number we wrote down before we
// started. This is the renewal conversation, and the owner should see it before the client
// does — a quiet month is something to fix, not something to discover in a reply.
async function fillImpact(c) {
  const card = $("impactCard");
  if (!card) return;
  const proj = S.projects.filter((p) => p.client_id === c.id)
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
    .find((p) => baselineOf(p)) || null;
  const base = proj ? baselineOf(proj) : null, af = proj ? afterOf(proj) : null, r = roiOf(base, af);
  let bots = [];
  try { bots = await api.demos.forClient(c.id); } catch { bots = []; }           // table not there yet
  const live = bots.filter((b) => b.kind === "live");
  if (!live.length && !base) return;

  let u = { convos: 0, questions: 0, afterHours: 0 };
  if (live.length) { try { u = await api.usage.since(live.map((b) => b.slug), new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10)); } catch { /* show zeros rather than nothing */ } }
  const share = u.questions ? Math.round((u.afterHours / u.questions) * 100) : 0;
  const ops = c.care_active && OPS_PLANS.includes(c.care_plan) && c.care_amount_cents ? (isMonthly(c) ? c.care_amount_cents : c.care_amount_cents / 12) / 100 : 0;

  card.hidden = false;
  card.innerHTML = `<h2>${r ? "What changed" : "Their assistant"} <span class="muted">${r ? "measured" : "last 30 days"}</span></h2>
    ${r ? `<div class="adm-impact__grid">
      <div class="adm-impact__tile"><b>${esc(r.before)} → ${esc(r.after)}</b><span>${esc(base.metric.toLowerCase())}${r.pct != null ? ` (${r.pct > 0 ? "−" : "+"}${Math.abs(r.pct)}%)` : ""}</span></div>
      ${r.hours != null ? `<div class="adm-impact__tile"><b>≈ ${Math.round(r.hours)} h</b><span>back a month</span></div>` : ""}
      ${r.rands != null ? `<div class="adm-impact__tile"><b>${money(Math.round(r.rands) * 100)}</b><span>a month of staff time${ops ? ` (${(r.rands / ops).toFixed(1)}× the operations fee)` : ""}</span></div>` : ""}
    </div>` : ""}
    ${live.length ? `<div class="adm-impact__grid">
      <div class="adm-impact__tile"><b>${esc(u.convos)}</b><span>chats</span></div>
      <div class="adm-impact__tile"><b>${esc(u.questions)}</b><span>questions</span></div>
      <div class="adm-impact__tile"><b>${esc(u.afterHours)}</b><span>after hours${share ? ` (${share}%)` : ""}</span></div>
    </div>` : ""}
    ${base && !r ? `<p class="small adm-impact__verdict">Baseline: <b>${esc(base.metric.toLowerCase())}</b>, about ${esc(base.value)}${metricKind(base.metric) === "minutes" ? " minutes each" : " " + esc(base.unit)} when we started <span class="tiny muted">(${esc((base.how || "recorded").toLowerCase())})</span>. <a class="inline-link" href="#/p/${esc(proj.id)}">Measure it now →</a></p>` : ""}
    ${!base ? `<p class="small adm-impact__verdict muted">No baseline was written down for this client, so there's nothing to compare these numbers to. Add one on the project and the report will use it.</p>` : ""}
    ${live.length && u.questions === 0 ? '<p class="small adm-error">Nobody used it this month. Check they know it\'s there — a quiet assistant is the most common reason a plan gets cancelled.</p>' : ""}
    ${live.length ? `<p class="tiny muted">${live.map((b) => esc(b.business)).join(", ")} · <a class="inline-link" href="${esc(demoUrl(live[0].slug))}" target="_blank" rel="noopener">open it ↗</a></p>` : ""}`;
}
const monToggle = (c) => `<button class="btn btn--ghost" data-montoggle>${c.monitor === false ? "Start checking this site" : "Stop checking this site"}</button>`;
function wireUptime(c) {
  const card = $("uptimeCard");
  card.querySelector("[data-checknow]")?.addEventListener("click", (e) => checkSitesNow(e.target, c));
  card.querySelector("[data-montoggle]")?.addEventListener("click", async () => { try { await api.clients.update(c.id, { monitor: c.monitor === false }); toast(c.monitor === false ? "Checking this site again" : "No longer checking this site"); await loadAll(true); route(); } catch (e) { toast(e.message, true); } });
}
const monFor = (c) => S.monitors.find((m) => m.client_id === c.id);
const MON_TEXT = { up: "Up", slow: "Slow", down: "Down", unknown: "Checking…" };
const monChip = (m) => m ? `<span class="chip chip--mon" data-m="${esc(m.status)}" title="${esc(m.last_error || (m.last_ms ? "Loaded in " + (m.last_ms / 1000).toFixed(1) + " s" : ""))}">${esc(MON_TEXT[m.status] || m.status)}${m.status === "down" ? " since " + esc(fmtDT(m.since)) : m.last_ms ? " · " + (m.last_ms / 1000).toFixed(1) + " s" : ""}</span>` : "";
const monStale = () => { const live = S.clients.some((c) => c.site_label && c.monitor !== false); if (!live) return false; const last = S.monitors.reduce((a, m) => Math.max(a, Date.parse(m.last_checked || 0) || 0), 0); return !last || Date.now() - last > 60 * 6e4; };
// c: from a client page, report that client's site by name (the check itself runs for every site)
async function checkSitesNow(btn, c = null) {
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  let r = null;
  try { r = await api.checkSites(); } catch (e) { toast("Couldn't run the check: " + e.message + (/404|not found/i.test(e.message) ? " (deploy the site-monitor function, ADMIN.md §8n)" : ""), true); }
  await loadAll(true);
  if (r) {
    const m = c ? monFor(c) : null;
    if (m) toast(m.status === "down" ? `${c.site_label}: still down${m.last_http ? ` (${m.last_http})` : ""}${m.last_error ? `: ${m.last_error}` : ""}` : `${c.site_label}: up${m.last_ms ? `, loaded in ${(m.last_ms / 1000).toFixed(1)} s` : ""}`, m.status === "down");
    else toast(r.down ? `${r.down} of ${r.checked} sites have a problem: ${S.monitors.filter((x) => x.status === "down").map((x) => shortUrl(x.url)).join(", ")}` : `All ${r.checked} sites are up`, Boolean(r.down));
  }
  route();
}

// ---------- numbers: where the business wins and leaks ----------
// Every lead is a unit through the same line: in the list → in touch →
// talking → quoted → won → live. Counting each step shows the weakest one;
// splitting by trade, area and source shows where to point the finder.
const TRADES = [
  ["Hair & beauty", /salon|barber|beauty|nail|hair|lash|brow|spa\b/i],
  ["Hardware & home", /hardware|locksmith|pest|supplies/i],
  ["Trades", /plumb|electric|builder|building|paint|pool|handyman|roof|tiling|construct/i],
  ["Food & drink", /restaurant|takeaway|caf[eé]|coffee|\bbar\b|bak(er|ing)|butcher|food|catering/i],
  ["Cars", /mechanic|panel|tyre|auto|motor|car wash|\bcars?\b/i],
  ["Engineering", /engineer|fabricat|weld|steel/i],
  ["Health & fitness", /gym|dentist|dental|physio|doctor|clinic|health|fitness/i],
  ["Kids & learning", /cr[eè]che|nursery|school|tutor|dance|music|kids/i],
  ["Professional", /account|attorney|lawyer|legal|print|sign(age|writ)/i],
  ["Cleaning", /clean|laundr|tailor|upholster|furniture/i],
  ["Pets & couriers", /\bpets?\b|groom|courier|wholesal/i],
];
function tradeOf(p) {
  const d = p.details || {};
  const text = [d.finderType, d.mkIndustry, d.projectType, p.business, p.goal].filter(Boolean).join(" ");
  const hit = TRADES.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  const cat = (p.category || []).filter((c) => !/request$/i.test(c) && c !== "Websites")[0];
  return cat || "Other";
}
const areaOf = (p) => (p.location || "").split(",")[0].trim() || "Not recorded";
// how far a lead got (declined leads keep what they reached)
function reached(p) {
  const r = stageRank(p.status), out = sourceOf(p) === "outreach", lost = stageOf(p.status) === "declined";
  const quoted = p.quote_cents != null || ["sent", "accepted", "declined"].includes(p.quote_status) || (!lost && r >= 2);
  const trialPending = Boolean(trialOf(p)) && p.details?.trialResult !== "kept";   // a refundable trial deposit isn't a win yet
  const won = (Boolean(p.deposit_paid) && !trialPending) || (!lost && r >= 3);
  const talking = won || quoted || (!lost && r >= 1) || (lost && !out) || Boolean(p.preview_url && !out);
  const touch = talking || !out || p.status === "contacted" || lost;
  return { touch, talking, quoted, won, live: stageOf(p.status) === "live", mockup: Boolean(p.preview_url) };
}
const median = (xs) => { const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const rands = (c) => (c == null ? "—" : money(Math.round(c / 100) * 100).replace(/\.00$/, ""));
const pctTxt = (a, b) => (b ? pct(a, b) + "%" : "—");
const days = (n) => (n == null ? "—" : n < 1 ? "same day" : Math.round(n) + " day" + (Math.round(n) === 1 ? "" : "s"));

// "12 found · 2 replied · 1 won": how a finder business type has done so far
function typeResults(label) {
  const first = String(label).split(",")[0];   // "Hardware stores, building supplies…" → hardware, not builders
  const trade = (TRADES.find(([, re]) => re.test(first)) || TRADES.find(([, re]) => re.test(label)) || [])[0];
  if (!trade) return "";
  const list = S.projects.filter((p) => !p.spam && tradeOf(p) === trade);
  if (!list.length) return "";
  const r = list.map(reached), talk = r.filter((x) => x.talking).length, won = r.filter((x) => x.won).length;
  return `${list.length} lead${list.length === 1 ? "" : "s"} · ${talk} talking · ${won} won`;
}
async function renderNumbers(q) {
  const range = ["90", "365", "all"].includes(q.get("range")) ? q.get("range") : "365";
  const since = range === "all" ? 0 : Date.now() - Number(range) * 86400e3;
  const leads = S.projects.filter((p) => !p.spam && Date.parse(p.created_at) >= since);
  const R = new Map(leads.map((p) => [p.id, reached(p)]));
  const count = (k, list = leads) => list.filter((p) => R.get(p.id)[k]).length;
  const ok = S.payments.filter((x) => x.status === "succeeded");
  const paidFor = (list) => { const ids = new Set(list.map((p) => p.id)); return ok.filter((x) => ids.has(x.project_id)).reduce((a, x) => a + (x.amount_cents || 0), 0); };
  const msgs = await api.messages.recent(new Date(since || Date.now() - 3650 * 86400e3).toISOString()).catch(() => []);

  // the line
  const steps = [
    ["In your list", leads.length, "every lead and prospect"],
    ["In touch", count("touch"), "you contacted them, or they contacted you"],
    ["Talking", count("talking"), "they replied or enquired"],
    ["Quoted", count("quoted"), "got a fixed quote"],
    ["Won", count("won"), "paid the deposit"],
    ["Live", count("live"), "site is live"],
  ];
  const conv = steps.map(([, n], i) => (i ? pct(n, steps[i - 1][1]) : null));
  let leak = -1; conv.forEach((c, i) => { if (i && steps[i - 1][1] >= 5 && c != null && (leak < 0 || c < conv[leak])) leak = i; });
  const funnel = `<ul class="adm-funnel">${steps.map(([label, n, help], i) => `<li title="${esc(`${label}: ${n} (${help})${i ? ` · ${pctTxt(n, steps[i - 1][1])} of the step before` : ""}`)}"${i === leak ? ' class="is-leak"' : ""}>
      <span class="lbl">${esc(label)}<small>${esc(help)}</small></span>
      <span class="track"><span class="fill" style="width:${Math.max(n ? 2 : 0, Math.round((n / Math.max(1, steps[0][1])) * 100))}%"></span></span>
      <b>${n}</b><span class="rate">${i ? pctTxt(n, steps[i - 1][1]) : ""}${i === leak ? ' <em>biggest drop</em>' : ""}</span></li>`).join("")}</ul>`;

  // unit numbers
  const won = leads.filter((p) => R.get(p.id).won);
  const wonOut = won.filter((p) => sourceOf(p) === "outreach");
  const touchedOut = leads.filter((p) => sourceOf(p) === "outreach" && R.get(p.id).touch).length;
  const avgJob = won.filter((p) => p.quote_cents).length ? won.filter((p) => p.quote_cents).reduce((a, p) => a + p.quote_cents, 0) / won.filter((p) => p.quote_cents).length : null;
  const firstPay = (p, kind) => ok.filter((x) => x.project_id === p.id && x.kind === kind).map((x) => Date.parse(paidAt(x))).sort((a, b) => a - b)[0];
  const toDeposit = median(won.map((p) => (firstPay(p, "deposit") - Date.parse(p.created_at)) / 86400e3));
  const toLive = median(won.map((p) => (firstPay(p, "balance") - firstPay(p, "deposit")) / 86400e3));
  const timed = won.map((p) => ({ p, m: minutesFor(p.id) })).filter((x) => x.m);
  const hrs = timed.length ? timed.reduce((a, x) => a + x.m, 0) / timed.length / 60 : null;
  const perHour = timed.length ? paidFor(timed.map((x) => x.p)) / (timed.reduce((a, x) => a + x.m, 0) / 60) : null;
  const sent = msgs.filter((m) => m.status !== "failed").length;
  const tile = (label, value, small = "") => `<div class="adm-tile"><span>${esc(label)}</span><b>${value}</b>${small ? `<small>${small}</small>` : ""}</div>`;

  // recurring
  const live = realClients();   // not Re-Charge's own row
  const care = live.filter((c) => c.care_active);
  const arr = care.reduce((a, c) => a + careYear(c), 0);
  const soon = care.filter((c) => !isMonthly(c) && c.care_renews_at && Date.parse(c.care_renews_at) - Date.now() < 60 * 86400e3);
  const monthlyN = care.filter(isMonthly).length;
  const noPlan = live.filter((c) => !c.care_active);
  const avgCare = care.filter((c) => c.care_amount_cents).length ? arr / care.filter((c) => c.care_amount_cents).length : null;

  // breakdowns
  const table = (title, keyFn, note) => {
    const g = {}; for (const p of leads) (g[keyFn(p)] ||= []).push(p);
    const rows = Object.entries(g).map(([k, list]) => ({ k, n: list.length, talk: count("talking", list), won: count("won", list), rev: paidFor(list) })).sort((a, b) => b.won - a.won || b.n - a.n).slice(0, 12);
    return `<div class="adm-card"><h2>${esc(title)}</h2>${note ? `<p class="tiny muted" style="margin:-0.2rem 0 0.4rem">${esc(note)}</p>` : ""}${rows.length ? `<div class="table-wrap"><table class="adm-table adm-table--num"><thead><tr><th></th><th>Leads</th><th>Won</th><th>Win rate</th><th>Paid</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="k" title="${esc(`${r.k}: ${r.n} leads, ${r.talk} talking, ${r.won} won`)}">${esc(r.k)}</td><td>${r.n}</td><td>${r.won}</td><td>${r.n >= 3 ? pctTxt(r.won, r.n) : '<span class="muted" title="Fewer than 3 leads">—</span>'}</td><td>${r.rev ? money(r.rev) : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted small">Nothing yet.</p>'}</div>`;
  };

  // what the numbers say
  const says = [];
  if (leads.length < 15) says.push(`Only ${leads.length} lead${leads.length === 1 ? "" : "s"} in this period, so treat these numbers as early signs. They get useful from about 20 leads.`);
  if (leak > 0) says.push(`The biggest drop is from <b>${esc(steps[leak - 1][0].toLowerCase())}</b> to <b>${esc(steps[leak][0].toLowerCase())}</b>: only ${conv[leak]}% make it. ${[, "Contact more of your list: it's already paid for in time.", "Try a different first message, or follow up once more.", "Quote sooner: a quote the same day as the chat keeps the momentum.", "Follow up on quotes after 2–3 days, and offer to adjust the scope.", "Chase the balance and finish builds faster."][leak] || ""}`);
  const byTrade = {}; for (const p of leads) (byTrade[tradeOf(p)] ||= []).push(p);
  const ranked = Object.entries(byTrade).filter(([, l]) => l.length >= 3).map(([k, l]) => ({ k, n: l.length, rate: count("won", l) / l.length, talk: count("talking", l) / l.length })).sort((a, b) => b.rate - a.rate || b.talk - a.talk);
  if (ranked.length >= 2 && (ranked[0].rate > 0 || ranked[0].talk > 0)) says.push(`<b>${esc(ranked[0].k)}</b> ${ranked[0].rate > 0 ? `wins ${Math.round(ranked[0].rate * 100)}% of leads` : `replies most (${Math.round(ranked[0].talk * 100)}%)`}, the best of any trade with 3 or more leads. Point the prospect finder at more of them (Settings → Prospect finder).`);
  if (noPlan.length) says.push(`${noPlan.length} live client${noPlan.length === 1 ? " has" : "s have"} no hosting & care plan. At ${rands(avgCare || PLAN_PRICE.care)} a year each, that's ${rands((avgCare || PLAN_PRICE.care) * noPlan.length)} a year you're not collecting.`);
  if (!S.features.time && !timed.length) says.push('Hours per build is blank because time tracking is off. Switch it on under Settings → Extra features and log time on builds only: it shows which jobs are worth taking.');
  if (wonOut.length && touchedOut) says.push(`Outreach: about ${Math.round(touchedOut / wonOut.length)} businesses contacted for every one that pays.`);

  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/money">Money</a></span><h1>Numbers</h1><p class="muted small">Where leads come from, where they drop off, and what each client is worth.</p></div>
  </div>
  ${subTabs([["90", "90 days"], ["365", "12 months"], ["all", "All time"]].map(([k, l]) => [k, l, `#/numbers?range=${k}`]), range, "Period")}
  ${says.length ? `<div class="adm-card adm-says"><h2>What the numbers say</h2><ul>${says.map((s) => `<li>${s}</li>`).join("")}</ul></div>` : ""}
  <div class="adm-card" style="margin-top:1rem"><h2>From first contact to live site</h2><p class="tiny muted" style="margin:-0.2rem 0 0.6rem">Leads added ${range === "all" ? "ever" : `in the last ${range === "90" ? "90 days" : "12 months"}`}. The % is how many made it from the step before.</p>${funnel}
    <p class="tiny muted" style="margin-top:0.7rem">Mockups made: ${count("mockup")}${count("mockup") ? ` · ${pctTxt(leads.filter((p) => R.get(p.id).mockup && R.get(p.id).won).length, count("mockup"))} of them became paying clients` : ""}${(() => { const ts = [...S.trials.values()].map(({ a }) => byId(a.project_id)).filter(Boolean); if (!ts.length) return ""; const kept = ts.filter((p) => p.details?.trialResult === "kept").length, refunded = ts.filter((p) => p.details?.trialResult === "refunded").length; return ` · Inbox Assistant trials: ${ts.length - kept - refunded} running, ${kept} kept${kept + refunded ? ` (${pctTxt(kept, kept + refunded)} of finished trials became paying clients)` : ""}, ${refunded} refunded`; })()}</p></div>
  <h2 class="adm-num-h">Each client</h2>
  <div class="adm-tiles adm-tiles--4">
    ${tile("Average job", avgJob ? rands(avgJob) : "—", `${won.length} won`)}
    ${tile("Enquiry to deposit", days(toDeposit), "typical time")}
    ${tile("Deposit to live", days(toLive), "typical build time")}
    ${tile("Hours per build", hrs ? hrs.toFixed(1) + "h" : "—", perHour ? rands(perHour) + " per hour" : S.features.time ? "log time on builds" : "time tracking is off")}
    ${tile("Messages per win", won.length ? Math.round(sent / won.length) : "—", `${sent} sent`)}
    ${tile("Contacts per win", wonOut.length ? Math.round(touchedOut / wonOut.length) : "—", `${touchedOut} contacted · ${wonOut.length} won from outreach`)}
    ${tile("Paid by these leads", money(paidFor(leads)), `${leads.length} leads`)}
    ${tile("Paid per lead", leads.length ? rands(paidFor(leads) / leads.length) : "—", "what each lead is worth")}
  </div>
  <h2 class="adm-num-h">Every year, without selling anything</h2>
  <div class="adm-tiles adm-tiles--4">
    ${tile("Hosting & care / yr", rands(arr), `${care.length} of ${live.length} clients${monthlyN ? `, ${monthlyN} paying monthly` : ""}`)}
    ${tile("Average plan", avgCare ? rands(avgCare) + "/yr" : "—")}
    ${tile("Renewals in 60 days", money(soon.reduce((a, c) => a + (c.care_amount_cents || 0), 0)), `${soon.length} yearly client${soon.length === 1 ? "" : "s"}`)}
    ${tile("Clients, no plan", noPlan.length, noPlan.length ? noPlan.slice(0, 3).map((c) => `<a href="#/c/${esc(c.id)}">${esc(c.name)}</a>`).join(", ") + (noPlan.length > 3 ? "…" : "") : "all covered")}
  </div>
  <div class="adm-num-grid">
    ${table("By trade", tradeOf, "Sorted by clients won.")}
    ${table("By area", areaOf)}
    ${table("By where they came from", (p) => SOURCES[sourceOf(p)] || sourceOf(p))}
  </div>`;
}

function renderClients() {
  const cs = S.clients.slice().sort((a, b) => (isOwn(a) - isOwn(b)) || (b.care_active - a.care_active) || a.name.localeCompare(b.name));   // our own row last
  const projByClient = {}; for (const p of S.projects) if (p.client_id) (projByClient[p.client_id] = projByClient[p.client_id] || []).push(p.id);
  const revByClient = {}; for (const x of S.payments) { if (x.status !== "succeeded") continue; const cid = x.client_id || byId(x.project_id)?.client_id; if (cid) revByClient[cid] = (revByClient[cid] || 0) + (x.amount_cents || 0); }
  const soon = (c) => c.care_renews_at && (Date.parse(c.care_renews_at) - Date.now()) < 30 * 86400e3;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Clients</span><h1>${cs.filter((c) => c.care_active).length} on a care plan</h1>${(() => { const ms = S.monitors.filter((m) => m.client_id); if (!ms.length) return ""; const bad = ms.filter((m) => m.status === "down"); return `<p class="small ${bad.length ? "adm-error" : "muted"}">${bad.length ? `${bad.length} site${bad.length === 1 ? " is" : "s are"} down` : `All ${ms.length} site${ms.length === 1 ? " is" : "s are"} up`} · checked every 10 minutes</p>`; })()}</div>
    <div class="adm-head__actions"><button class="btn btn--ghost btn--small" id="checkAll">Check all sites now</button><a class="btn btn--primary btn--small" href="#/clients/new">+ New client</a></div></div>
  <ul class="adm-list">${cs.length ? cs.map((c) => `<li><a class="adm-row" href="#/c/${esc(c.id)}">
    <div class="adm-row__main"><div class="adm-row__title">${esc(c.name)}${c.site_label ? `<span class="muted" style="font-weight:400">${esc(c.site_label)}</span>` : ""}</div>
      <div class="adm-row__meta">${monChip(monFor(c))}${isOwn(c) ? '<span class="chip">our own business</span>' : c.care_active ? `<span class="chip chip--stage" data-group="done">${esc(PLAN_LABEL[c.care_plan] || "Care active")}</span>` : '<span class="chip">no plan</span>'}${c.care_renews_at ? `<span class="chip${Date.parse(c.care_renews_at) < Date.now() - 864e5 ? " chip--bad" : soon(c) && !isMonthly(c) ? " chip--warn" : ""}">${isMonthly(c) ? "next payment" : "renews"} ${esc(fmtD(c.care_renews_at))}</span>` : ""}${c.care_amount_cents ? `<span class="chip">${carePer(c)}</span>` : ""}</div></div>
    <div class="adm-row__side"><span>${(projByClient[c.id] || []).length} project${(projByClient[c.id] || []).length === 1 ? "" : "s"}</span><span>${money(revByClient[c.id] || 0)}</span></div></a></li>`).join("") : '<li class="adm-empty">No clients yet. Open a live project and press "Convert to client", or add one here.</li>'}</ul>`;
  $("checkAll").addEventListener("click", (e) => checkSitesNow(e.target));
}
function clientProject(c) {
  // a pseudo-project so templates can be filled for a client without a project
  const p = S.projects.filter((x) => x.client_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return { id: null, _client_id: c.id, name: p?.name || c.name, business: c.name, email: c.email || p?.email || "", phone: c.phone || p?.phone || "", ref: p?.ref || "", category: p?.category || [], goal: "", quote_cents: c.care_amount_cents || null, preview_url: c.site_label ? "https://" + c.site_label : (p?.preview_url || ""), indicative_price: "" };
}
async function renderClient(id, q = new URLSearchParams()) {
  const c = clientById(id);
  if (!c) { view.innerHTML = '<p class="adm-error">Client not found.</p>'; return; }
  const projects = S.projects.filter((p) => p.client_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pays = S.payments.filter((x) => x.status === "succeeded" && (x.client_id === c.id || projects.some((p) => p.id === x.project_id))).sort((a, b) => paidAt(b).localeCompare(paidAt(a)));
  const reqs = S.requests.filter((r) => (r.client_id === c.id || projects.some((p) => p.id === r.project_id)) && r.status === "open");
  const days = c.care_renews_at ? Math.ceil((Date.parse(c.care_renews_at) - Date.now()) / 86400e3) : null;
  const pp = clientProject(c);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/clients">Clients</a> · since ${esc(fmtD(c.created_at))}</span><h1>${esc(c.name)}</h1>${c.site_label ? `<p class="muted"><a href="https://${esc(c.site_label)}" target="_blank" rel="noopener">${esc(c.site_label)}</a></p>` : ""}</div>
    <div class="adm-actions"><a class="btn btn--ghost" href="${esc(shareCardUrl("launch", { _client_id: c.id }))}" target="_blank" rel="noopener">Launch post</a><button type="button" class="btn btn--ghost" id="yearCard">Year in review</button><a class="btn btn--ghost" href="${esc(reelUrl(clientProject(c), c))}" target="_blank" rel="noopener">Before/after reel</a><a class="btn btn--ghost" href="#/c/${esc(c.id)}/edit">Edit</a></div></div>
  <div class="adm-detail">
    <div>
      <section class="adm-card" id="impactCard" hidden></section>
      <div class="adm-card">
        <dl class="adm-kv">
          ${c.email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}
          ${c.phone ? `<dt>Phone</dt><dd>${esc(c.phone)}</dd>` : ""}
          <dt>Care plan</dt><dd>${c.care_active ? `${esc(PLAN_LABEL[c.care_plan] || "Active")}${c.care_amount_cents ? " · " + carePer(c) : ""}${isMonthly(c) ? ' <span class="tiny muted">(link emailed automatically each month)</span>' : ""}${c.term_until ? `<br><span class="tiny muted">Pay-monthly website: paid off ${esc(new Date(c.term_until + "T12:00:00").toLocaleDateString("en-ZA", { month: "long", year: "numeric" }))}, then ${money(c.term_after_cents || PLAN_MONTHLY.care)}/month Care (switches by itself)</span>` : ""}` : "None"}</dd>
          ${c.care_renews_at ? `<dt>${isMonthly(c) ? "Next payment" : "Renews"}</dt><dd>${esc(fmtD(c.care_renews_at))} <span class="${days < 0 ? "adm-error" : !isMonthly(c) && days <= 30 ? "due" : "muted"}">(${days < 0 ? Math.abs(days) + ` day${days === -1 ? "" : "s"} overdue` : days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`})</span></dd>` : ""}
          <dt>Google review link</dt><dd>${c.google_review_url ? `<a href="${esc(c.google_review_url)}" target="_blank" rel="noopener">${esc(shortUrl(c.google_review_url))} ↗</a> <button type="button" class="btn btn--ghost btn--small" id="copyReview">Copy</button> <a class="btn btn--ghost btn--small" href="${esc(reviewCardUrl(c.name, c.google_review_url))}" target="_blank" rel="noopener">Review card</a>` : `<span class="muted">Not saved yet.</span> <a class="inline-link" href="#/c/${esc(c.id)}/edit">Add it</a> <span class="tiny muted">(part of the Care plan: the link their customers tap to review them)</span>`}</dd>
          <dt>Referral link</dt><dd><code class="adm-reflink">${esc(referralLink(c).replace("https://", ""))}</code> <button type="button" class="btn btn--ghost btn--small" id="copyRef">Copy</button><br><span class="tiny muted">The business they send gets R250 off its website, and when it goes live their own next year of Care is free. ${(() => { const n = S.projects.filter((x) => x.details?.referredBy?.clientId === c.id); return n.length ? `${n.length} referred so far, ${n.filter((x) => stageOf(x.status) === "live").length} live.` : "No referrals yet."; })()}</span></dd>
          <dt>Monthly report</dt><dd>${c.care_active && REPORT_PLANS.includes(c.care_plan) ? `Emailed on the 1st to ${esc(((c.report_emails || []).length ? c.report_emails : [c.email]).filter(Boolean).join(", ") || "nobody yet: add an email")}${c.last_report_at ? ` <span class="tiny muted">· last sent ${esc(fmtD(c.last_report_at))}</span>` : ""}<br><button type="button" class="btn btn--ghost btn--small" id="repPreview">Preview</button> <button type="button" class="btn btn--ghost btn--small" id="repSend">Send now</button>` : `<span class="muted">Not included on ${c.care_active ? esc(PLAN_LABEL[c.care_plan] || "this plan") : "no plan"}: it comes with Care and every operations plan.</span>`}</dd>
          ${c.care_active && AI_PLANS.includes(c.care_plan) ? `<dt>Weekly email</dt><dd id="winsRow"><span class="muted small">Loading…</span></dd>` : ""}
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
      <div class="adm-card"><h2>Hosting &amp; care renewal</h2>
        ${c.care_active ? `<p class="small muted">${isMonthly(c) ? `They pay ${carePer(c)}. Three days before each payment is due, they're emailed a card payment link automatically; when they pay (or you save an EFT or stop order payment on Money), the date moves on a month. You can also send a link yourself:` : `${days != null && days <= 30 ? `<b>${days < 0 ? `Renewal ${Math.abs(days)} day${days === -1 ? "" : "s"} overdue.` : days === 0 ? "Renews today." : `Renews in ${days} day${days === 1 ? "" : "s"} (${esc(fmtD(c.care_renews_at))}).`} Send them the card payment link now${c.care_amount_cents ? ` for ${money(c.care_amount_cents)}` : ""}.</b>` : `About a month before ${c.care_renews_at ? esc(fmtD(c.care_renews_at)) : "the renewal date"}, send them a card payment link for ${c.care_amount_cents ? money(c.care_amount_cents) : "the yearly price (set it under Edit)"}.`} When they pay (by card, or you save an EFT on Money), the renewal date moves on a year by itself.`}</p>
        <div class="adm-inline-actions" style="margin-top:0.6rem">${c.care_amount_cents ? '<button class="btn btn--primary" id="reqRenewal">Create renewal payment link</button>' : ""}<button class="btn btn--ghost" id="renewEmail">Email a renewal reminder</button></div>
        ${reqs.length ? `<div style="margin-top:0.8rem">${reqs.map((r) => `<div class="adm-req"><span>${money(r.amount_cents)} · ${esc(KIND_LABEL[r.kind] || r.kind)} <span class="status-pill" data-s="open">open</span></span><span class="adm-inline-actions" style="margin:0"><button class="btn btn--ghost" data-copy="${esc(r.redirect_url || "")}">Copy link</button></span></div>`).join("")}</div>` : ""}
        <p class="adm-error tiny" id="renewErr" hidden></p>${isMonthly(c) ? '<div class="adm-paystack" id="psCard"></div>' : ""}` : '<p class="small muted">No care plan. Set one under Edit to track renewals here.</p>'}
      </div>
      <div class="adm-card" style="margin-top:1rem" id="gbpClient"><h2>Google profile</h2>
        <dl class="adm-kv">
          <dt>Profile</dt><dd>${c.gbp_url ? `<a href="${esc(c.gbp_url)}" target="_blank" rel="noopener">${esc(shortUrl(c.gbp_url))} ↗</a>` : `<span class="muted">Not saved yet.</span> <a class="inline-link" href="#/c/${esc(c.id)}/edit">Add it</a>`}</dd>
          <dt>Your access</dt><dd><span class="chip${gbpHasAccess(c) ? " chip--ok" : ""}">${esc(GBP_ACCESS[c.gbp_access || "none"] || c.gbp_access)}</span>${gbpHasAccess(c) ? "" : ' <span class="tiny muted">They stay the owner; you\'re added as a Manager</span>'}</dd>
          ${gbpCares(c) ? `<dt>Monthly Google care</dt><dd>${c.gbp_care_at ? "Last done " + esc(fmtD(c.gbp_care_at)) : "Not done yet"}${gbpCareDue(c) ? ' <span class="adm-error">due</span>' : ""}</dd>` : ""}
        </dl>
        <div class="adm-inline-actions" style="margin-top:0.6rem">${gbpCares(c) ? '<button type="button" class="btn btn--primary btn--small" id="gbpCareDone">Google care done this month</button>' : ""}${!gbpHasAccess(c) && (pp?.phone || pp?.email) ? '<button type="button" class="btn btn--ghost btn--small" id="gbpAskAccess">Ask for Manager access</button>' : ""}<a class="btn btn--ghost btn--small" href="https://business.google.com/" target="_blank" rel="noopener">Open Google Business ↗</a></div>
        ${gbpCares(c) ? '<p class="tiny muted" style="margin:0.6rem 0 0">Each month: 1–2 posts, reply to new reviews, a few new photos, accept or reject Google\'s suggested edits, holiday hours. Put their Performance numbers (calls, directions, website clicks) in the report.</p>' : ""}
        ${reviewRepliesHtml(c.name)}
      </div>
      ${c.site_label ? `<div class="adm-card" style="margin-top:1rem" id="uptimeCard"><h2>Website health</h2><p class="small muted">Loading…</p></div>` : ""}
      <div class="adm-card" style="margin-top:1rem"><h2>Payments <span class="muted">${money(pays.reduce((a, x) => a + (x.amount_cents || 0), 0))} total</span></h2>
        ${pays.length ? `<ul class="adm-timeline">${pays.slice(0, 20).map((x) => `<li data-kind="payment"><span class="tl-dot"></span><div><time>${esc(fmtDT(paidAt(x)))} · ${esc(x.provider)} · ${esc(KIND_LABEL[x.kind] || x.kind || "")}</time><p>${money(x.amount_cents)}${x.note || x.reference ? " — " + esc(x.note || x.reference) : ""}</p></div></li>`).join("")}</ul>` : '<p class="muted small">No payments yet.</p>'}
      </div>
    </div>
  </div>`;
  $("repPreview")?.addEventListener("click", async (e) => {
    await busy(e.target, async () => { try {
      const r = (await api.report(c.id, true)).results?.[0];
      if (!r?.html) { toast(r?.status === "skipped:no-data" ? "Nothing to report yet: website monitoring has no checks for this site. Add their website address on the client page." : "No preview: " + (r?.status || "unknown"), true); return; }
      const dlg = $("composeDialog");
      dlg.innerHTML = `<div class="adm-dialog__inner"><div class="adm-dialog__head"><div><h2 id="composeTitle">Monthly report preview</h2><p>${esc(r.subject || "")}</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">×</button></div><iframe class="adm-report-frame" title="Report preview" sandbox=""></iframe></div>`;
      dlg.querySelector("iframe").srcdoc = r.html;
      dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
      if (!dlg.open) dlg.showModal();
    } catch (ex) { toast(ex.message, true); } }, "Loading…");
  });
  $("repSend")?.addEventListener("click", async (e) => {
    if (!confirm(`Email this month's website report to ${c.name} now?`)) return;
    await busy(e.target, async () => { try {
      const r = (await api.report(c.id, false)).results?.[0];
      if (r?.status === "sent") { toast("Report sent"); await loadAll(true); renderClient(c.id); }
      else toast(r?.status === "skipped:no-data" ? "Nothing to report yet: no monitoring checks for this site." : r?.status === "skipped:no-recipients" ? "Add an email for this client first." : "Not sent: " + (r?.status || "unknown"), true);
    } catch (ex) { toast(ex.message, true); } }, "Sending…");
  });
  $("copyReview")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(c.google_review_url); toast("Review link copied"); } catch { toast(c.google_review_url); } });
  $("yearCard")?.addEventListener("click", async () => {
    const w = window.open("about:blank", "_blank");   // open now (a click), fill in once the numbers are in
    const rows = await api.analytics.cached(c.id, "365d").catch(() => []);
    const ga4 = rows.find((r) => r.kind === "ga4")?.payload, gsc = rows.find((r) => r.kind === "gsc")?.payload;
    const taps = (ga4?.events || []).filter((e) => /whatsapp|call|phone|tel|contact/i.test(e.name || "")).reduce((a, e) => a + (e.count || 0), 0);
    const url = shareCardUrl("year", { _client_id: c.id }, { year: String(new Date().getMonth() < 6 ? new Date().getFullYear() - 1 : new Date().getFullYear()), visitors: String(ga4?.overview?.users || ""), searches: String(gsc?.totals?.impressions || ""), clicks: String(gsc?.totals?.clicks || ""), taps: taps ? String(taps) : "" });
    if (w) w.location.href = url; else window.open(url, "_blank");
    if (!ga4 && !gsc) toast("No analytics connected for them: type their numbers into the image page.");
  });
  $("copyRef")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(referralLink(c)); toast("Referral link copied"); } catch { toast(referralLink(c)); } });
  view.querySelectorAll("[data-ccompose]").forEach((b) => b.addEventListener("click", () => openCompose(pp, b.dataset.ccompose, { onDone: () => renderClient(c.id) })));
  wireReviewReplies(view);
  $("gbpCareDone")?.addEventListener("click", async (e) => {
    await busy(e.target, async () => { try { await api.clients.update(c.id, { gbp_care_at: new Date().toISOString() }); toast("Google care ticked off for this month"); await loadAll(true); renderClient(c.id); }
      catch (ex) { toast(/gbp_/.test(ex.message) ? "Run the database update first (supabase db push: migration 0020)" : ex.message, true); } }, "Saving…");
  });
  $("gbpAskAccess")?.addEventListener("click", () => { const kind = isMobile(pp?.phone) ? "whatsapp" : "email"; openCompose(pp, kind, { templateId: tplFor(kind, "gbp_access")?.id, onDone: async () => { try { if ((c.gbp_access || "none") === "none") await api.clients.update(c.id, { gbp_access: "asked" }); } catch { /* before 0020 */ } await loadAll(true); renderClient(c.id); } }); });
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch { prompt("Copy this link:", b.dataset.copy); } }));
  $("reqRenewal")?.addEventListener("click", async () => {
    const btn = $("reqRenewal"); btn.disabled = true;
    try { const r = await api.requestPayment({ clientId: c.id, projectId: projects[0]?.id || null, amountCents: c.care_amount_cents, kind: "care", description: `${PLAN_LABEL[c.care_plan] || "Care plan"} renewal — ${c.name}` }); toast("Renewal link created"); try { await navigator.clipboard.writeText(r.redirectUrl); } catch {} await loadAll(true); renderClient(c.id); }
    catch (ex) { $("renewErr").hidden = false; $("renewErr").textContent = ex.message; btn.disabled = false; }
  });
  if ($("uptimeCard")) fillUptime(c).then(() => { if (q.get("show") === "health") { const u = $("uptimeCard"); if (u) { history.replaceState(null, "", location.pathname + location.search + "#/c/" + c.id); u.scrollIntoView({ block: "start", behavior: "smooth" }); u.classList.add("is-flash"); } } });
  if ($("psCard")) fillPaystack(c, pp);
  if ($("winsRow")) fillWins(c);
  fillImpact(c);
  $("renewEmail")?.addEventListener("click", () => openCompose(pp, "email", { templateId: tplFor("email", "renewal")?.id, onDone: () => renderClient(c.id) }));

}
// Weekly "time saved" email and the one-off first-week email (weekly-wins).
// Real numbers only; nothing is sent in a week with nothing to report.
async function fillWins(c) {
  const box = $("winsRow"); if (!box) return;
  const key = `wins:${c.id}`, st = (await api.settings.get(key).catch(() => null)) || {};
  box.innerHTML = `${st.off ? "Off" : "On: Mondays, what their AI handled that week, plus a one-off note a week after go-live"}${st.weeklyAt ? ` <span class="tiny muted">· last sent ${esc(fmtD(st.weeklyAt))}</span>` : ""}<br>
    <button type="button" class="btn btn--ghost btn--small" id="winsPrev">Preview this week's</button> <button type="button" class="btn btn--ghost btn--small" id="winsToggle">${st.off ? "Turn on" : "Turn off"}</button>`;
  $("winsToggle").addEventListener("click", async () => { try { await api.settings.set(key, { ...st, off: !st.off }); toast(st.off ? "Weekly email on" : "Weekly email off"); fillWins(c); } catch (ex) { toast(ex.message, true); } });
  $("winsPrev").addEventListener("click", async (e) => {
    await busy(e.target, async () => { try {
      const r = (await api.wins(c.id, "weekly", true)).results?.[0];
      if (r?.status !== "preview") { toast(r?.status === "skipped:no-data" ? "Nothing to send this week: their AI has no activity and nothing has been measured yet." : "No preview: " + (r?.status || "unknown"), true); return; }
      alert(r.subject + "\n\n" + r.text);
    } catch (ex) { toast(/failed \(404\)/.test(ex.message) ? "Deploy weekly-wins first" : ex.message, true); } }, "Loading…");
  });
}
// Automatic card payments (Paystack): the card is saved on the first payment,
// then care-billing charges it on each due date and emails a receipt.
async function fillPaystack(c, pp) {
  const box = $("psCard"); if (!box) return;
  const key = `paystack:${c.id}`;
  const ps = (await api.settings.get(key).catch(() => null)) || {};
  const a = ps.auth;
  const state = !ps.auto ? "Off: they're emailed a Yoco link each month."
    : a ? `On: ${esc((a.brand || "card").trim())} ending ${esc(a.last4 || "····")}${a.exp ? ` (expires ${esc(a.exp)})` : ""} is charged on each due date, with a receipt by email.`
    : "On, waiting for the first payment: next month's email is a Paystack link that saves their card.";
  box.innerHTML = `<h3 class="small" style="margin:1rem 0 0.3rem">Automatic card payments</h3><p class="small muted" style="margin:0">${state}</p>
    <div class="adm-inline-actions" style="margin-top:0.5rem">${a && ps.auto ? "" : '<button type="button" class="btn btn--ghost btn--small" id="psLink">Send card set-up link</button>'}${ps.auto ? '<button type="button" class="btn btn--ghost btn--small" id="psOff">Turn off</button>' : ""}${!ps.auto && a ? '<button type="button" class="btn btn--ghost btn--small" id="psOn">Turn back on</button>' : ""}${a ? '<button type="button" class="btn btn--ghost btn--small" id="psForget">Remove saved card</button>' : ""}</div>
    <p class="tiny muted" style="margin:0.4rem 0 0">Rand only. Paystack keeps the card; we only keep a token and the last 4 digits.</p>`;
  const save = async (v, msg) => { try { await api.settings.set(key, v); toast(msg); fillPaystack(c, pp); } catch (ex) { toast(ex.message, true); } };
  $("psOff")?.addEventListener("click", () => save({ ...ps, auto: false }, "Automatic card payments off"));
  $("psOn")?.addEventListener("click", () => save({ ...ps, auto: true }, "Automatic card payments on"));
  $("psForget")?.addEventListener("click", () => { if (confirm("Remove the saved card? They'll get a payment link next month instead.")) save({ auto: false, auth: null }, "Saved card removed"); });
  $("psLink")?.addEventListener("click", async (e) => {
    await busy(e.target, async () => { try {
      const r = await api.paystackLink(c.id);
      try { await navigator.clipboard.writeText(r.url); } catch {}
      const amt = money(c.care_amount_cents);
      const template = { id: "paystack-setup", subject: `${c.name}: set up automatic monthly payments`, body: `Hi {{first_name}},\n\nTo stop you having to pay a link every month, here's a one-time card payment for this month's plan (${amt}):\n\n${r.url}\n\nYour card is then charged automatically each month, and you'll get a receipt by email every time. Reply any time to change the card or stop it.\n\nThanks` };
      if (pp?.email) openCompose(pp, "email", { template, onDone: () => fillPaystack(c, pp) });
      else toast("Link copied: send it to them");
      fillPaystack(c, pp);
    } catch (ex) { toast(/not configured/i.test(ex.message) ? "Paystack isn't set up yet: add PAYSTACK_SECRET_KEY and deploy paystack-link" : ex.message, true); } }, "Creating…");
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
    <label>Their Google review link <span class="muted" style="font-weight:400">(Care plan: the link their customers tap to leave a review. In their Google Business Profile: Ask for reviews → copy link)</span><input inputmode="url" name="google_review_url" value="${esc(c.google_review_url || "")}" placeholder="https://g.page/r/…/review" /></label>
    <div class="row2"><label>Their Google profile <span class="muted" style="font-weight:400">(Maps link)</span><input inputmode="url" name="gbp_url" value="${esc(c.gbp_url || "")}" placeholder="https://maps.app.goo.gl/…" /></label><label>Your access to it<select name="gbp_access">${Object.entries(GBP_ACCESS).map(([v, l]) => `<option value="${v}"${(c.gbp_access || "none") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <h3 style="font-size:0.9rem;margin-top:0.3rem">Hosting & care</h3>
    <label class="check"><input type="checkbox" name="care_active" ${c.care_active ? "checked" : ""} /> On a hosting &amp; care plan (you're reminded before it renews)</label>
    <div class="row2"><label>Plan<select name="care_plan">${Object.entries(PLAN_LABEL).map(([v, l]) => `<option value="${v}"${c.care_plan === v ? " selected" : ""}>${l}</option>`).join("")}</select></label><label>They pay<select name="billing"><option value="yearly"${!isMonthly(c) ? " selected" : ""}>Yearly</option><option value="monthly"${isMonthly(c) ? " selected" : ""}>Monthly</option></select></label></div>
    <div class="row2"><label>Price per year / month<span class="money"><input name="care_amount" inputmode="decimal" value="${c.care_amount_cents ? c.care_amount_cents / 100 : ""}" placeholder="1000 a year, or 100 a month" /></span></label>
    <label>Renews on / next payment<input type="date" name="care_renews_at" value="${esc(c.care_renews_at || "")}" /></label></div><input type="hidden" name="report_emails" value="${esc((c.report_emails || []).join(", "))}" />
    <label>Notes<textarea name="notes" rows="3">${esc(c.notes || "")}</textarea></label>
    <p class="adm-error tiny" id="clientErr" hidden></p>
    <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="clientDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="${isNew ? "#/clients" : "#/c/" + esc(c.id)}">Cancel</a><button class="btn btn--primary btn--small" type="submit">Save client</button></div>
  </form></div>`;
  $("clientForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $("clientErr");
    const amt = f.care_amount.value.replace(/[^\d.]/g, "");
    const row = { name: f.name.value.trim(), site_label: f.site_label.value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null, email: f.email.value.trim() || null, phone: f.phone.value.trim() || null, care_active: f.care_active.checked, care_plan: f.care_plan.value, care_amount_cents: amt ? Math.round(Number(amt) * 100) : null, care_renews_at: f.care_renews_at.value || null, report_emails: f.report_emails.value.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x)), notes: f.notes.value.trim() || null };
    if (!row.name) return;
    if (f.billing.value === "monthly" || c.billing) row.billing = f.billing.value;   // column arrives with 0019
    const rv = cleanUrl(f.google_review_url.value);
    if (rv || c.google_review_url) row.google_review_url = rv;   // column arrives with 0018; only sent once used
    const gu = cleanUrl(f.gbp_url.value);                         // these arrive with 0020; only sent once used
    if (gu || c.gbp_url) row.gbp_url = gu;
    if (f.gbp_access.value !== (c.gbp_access || "none")) row.gbp_access = f.gbp_access.value;
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
// The stored value stays "scheduled" (0006, and facebook-post picks those up); people see "Planned"
const PSTATUS = { idea: "Idea", drafted: "Drafted", scheduled: "Planned", posted: "Posted", archived: "Archived" };
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
  const body = renderTpl(post.body, { ...ctxFor(null), link, start_link: trackedLink("https://re-charge.co.za/start", camp), mockup_link: trackedLink("https://re-charge.co.za/free-mockup", camp) }).text;
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
  const camps = S.features.campaigns;
  const tab = (q.get("tab") === "campaigns" && !camps) ? "calendar" : (q.get("tab") || "calendar");
  const posts = S.posts.filter((p) => p.status !== "archived");
  const week = Date.now() + 7 * 86400e3;
  const scheduled = posts.filter((p) => p.status === "scheduled" && p.scheduled_at && Date.parse(p.scheduled_at) <= week);
  const active = S.campaigns.filter((c) => c.status === "active");
  const som = startOfMonth().getTime();
  const leadsMonth = S.projects.filter((p) => !p.spam && p.channel && S.campaigns.some((c) => c.code === p.channel) && Date.parse(p.created_at) >= som);
  const leadsAll = S.projects.filter((p) => !p.spam && p.channel && S.campaigns.some((c) => c.code === p.channel));
  const spendAll = S.campaigns.reduce((a, c) => a + (c.spend_cents || 0), 0);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow">Social posts</span><h1>${tab === "posts" ? posts.length + " posts" : tab === "campaigns" ? S.campaigns.length + " campaigns" : "Posting plan"}</h1></div>
    <div class="adm-head__actions">${camps ? '<a class="btn btn--ghost btn--small" href="#/marketing/campaign/new">+ Campaign</a>' : ""}<a class="btn btn--primary btn--small" href="#/marketing/post/new">+ New post</a></div></div>
  <p class="small muted" style="margin:-0.4rem 0 0.8rem">Plan posts here. For most apps the panel copies the text and opens the app; Facebook posts can also go out by themselves once your Page is connected (Settings → Facebook Page).</p>
  ${camps ? `<div class="adm-tiles adm-tiles--4">
    <div class="adm-tile"><span>Posting this week</span><b>${scheduled.length}</b><small>${posts.filter((p) => p.status === "idea" || p.status === "drafted").length} ideas and drafts</small></div>
    <div class="adm-tile"><span>Active campaigns</span><b>${active.length}</b><small>${money(spendAll)} spent · all time</small></div>
    <div class="adm-tile"><span>Campaign leads · month</span><b>${leadsMonth.length}</b><small>${leadsMonth.filter((p) => p.deposit_paid).length} paid deposit</small></div>
    <div class="adm-tile"><span>Cost per lead · all time</span><b>${leadsAll.length && spendAll ? money(Math.round(spendAll / leadsAll.length)) : "—"}</b><small>${leadsAll.length} campaign leads</small></div>
  </div>` : `<div class="adm-tiles adm-tiles--3"><div class="adm-tile"><span>Planned this week</span><b>${scheduled.length}</b></div><div class="adm-tile"><span>Ideas and drafts</span><b>${posts.filter((p) => p.status === "idea" || p.status === "drafted").length}</b></div><div class="adm-tile"><span>Posted this month</span><b>${posts.filter((p) => p.status === "posted" && p.posted_at && Date.parse(p.posted_at) >= som).length}</b></div></div>`}
  ${subTabs([["calendar", "Calendar"], ["posts", "All posts"], ...(camps ? [["campaigns", "Campaigns"]] : [])].map(([v, l]) => [v, l, `#/marketing?tab=${v}`]), tab, "Social posts view")}
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
  for (const p of S.posts) { if (p.status === "archived") continue; const w = p.status === "posted" ? p.posted_at : p.scheduled_at; if (w) add(new Date(w), { t: p.status === "posted" ? "posted" : "post", label: `${p.status === "posted" ? "✓ " : ""}${CHANNELS[p.channel] || p.channel}: ${p.title}`, href: `#/marketing/post/${p.id}` }); }
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
  <div class="adm-legend adm-legend--cal"><span><i data-t="post"></i>Planned post</span><span><i data-t="posted"></i>Posted ✓</span><span><i data-t="call"></i>Call</span><span><i data-t="followup"></i>Follow-up</span></div>
  <section class="adm-section adm-cal-list"><h2>Coming up</h2><ul class="adm-list">${upcoming.length ? upcoming.map(([k, its]) => `<li><div class="adm-row"><div class="adm-row__main"><div class="adm-row__title">${esc(fmtD(k + "T12:00:00"))}</div><div class="adm-row__meta">${its.map((it) => `<a class="chip" href="${esc(it.href)}" style="text-decoration:none">${esc(it.label)}</a>`).join("")}</div></div></div></li>`).join("") : '<li class="adm-empty">Nothing scheduled. Add a post and give it a date.</li>'}</ul></section>`;
}

async function renderPostEditor(id, q) {
  const isNew = !id || id === "new";
  let post = isNew ? { title: "", channel: q.get("channel") || "facebook", campaign_id: q.get("campaign") || null, body: "", hashtags: "", link: "https://re-charge.co.za/", image_path: null, status: "idea", scheduled_at: null, posted_at: null, post_url: "", results: {} } : S.posts.find((p) => p.id === id);
  if (!post) { view.innerHTML = '<p class="adm-error">Post not found.</p>'; return; }
  const imgUrl = post.image_path ? await api.storage.url(post.image_path).catch(() => "") : "";
  const camp = campById(post.campaign_id);
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/marketing?tab=posts">Social posts</a> · ${isNew ? "New" : PSTATUS[post.status]}</span><h1>${esc(post.title || "New post")}</h1></div>
    ${isNew ? "" : `<div class="adm-actions"><button class="btn btn--ghost" id="postDup">Duplicate for…</button><button class="btn btn--ghost" id="postArchive">${post.status === "archived" ? "Unarchive" : "Archive"}</button></div>`}</div>
  <div class="adm-detail">
    <div class="adm-card"><form class="adm-form" id="postForm">
      <label>Title <span class="muted" style="font-weight:400">(for you, not published)</span><input name="title" value="${esc(post.title)}" required placeholder="e.g. Before/after: salon mockup" /></label>
      <div class="row2"><label>Channel<select name="channel">${Object.entries(CHANNELS).map(([v, l]) => `<option value="${v}"${post.channel === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label data-feat="campaigns">Campaign<select name="campaign_id"><option value="">— none —</option>${S.campaigns.map((c) => `<option value="${esc(c.id)}"${post.campaign_id === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label></div>
      <label>Text<textarea name="body" rows="8" placeholder="Write it the way you'd say it. Use {{link}} where the link should go.">${esc(post.body)}</textarea></label>
      <div class="adm-vars"><button type="button" data-ins="{{link}}">{{link}}</button><button type="button" data-ins="{{start_link}}">{{start_link}}</button><button type="button" data-ins="{{my_whatsapp}}">{{my_whatsapp}}</button></div>
      <div class="row2"><label>Hashtags<input name="hashtags" value="${esc(post.hashtags || "")}" placeholder="#durban #smallbusiness" /></label><label>Link <span class="muted" style="font-weight:400" data-feat="campaigns">(campaign code is added automatically)</span><input type="url" name="link" value="${esc(post.link || "")}" /></label></div>
      <label>Image<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
      ${imgUrl ? `<div><img class="adm-post-img" src="${esc(imgUrl)}" alt="" /><div class="adm-inline-actions"><button type="button" class="btn btn--ghost" id="imgRemove">Remove image</button></div></div>` : ""}
      <div class="row2"><label>Status<select name="status">${Object.entries(PSTATUS).map(([v, l]) => `<option value="${v}"${post.status === v ? " selected" : ""}>${l}</option>`).join("")}</select></label><label>Planned for<input type="datetime-local" name="scheduled_at" value="${esc(datetimeLocal(post.scheduled_at))}" /></label></div>
      <label class="check" id="autoRow"${post.channel === "facebook" ? "" : " hidden"}><input type="checkbox" name="auto_publish"${post.auto_publish ? " checked" : ""} /><span><b>Post it to Facebook by itself at the planned time</b><br><span class="tiny muted">Ticking this sets the status to Planned: pick a date and time below. It goes out within 5 minutes of it.</span></span></label>
      ${post.publish_error ? `<p class="small adm-error">Facebook didn't take it last time: ${esc(post.publish_error)}</p>` : ""}
      <div id="postedRows"${post.status === "posted" ? "" : " hidden"}>
        <label>Post URL<input type="url" name="post_url" value="${esc(post.post_url || "")}" placeholder="https://www.facebook.com/…" /></label>
        <div class="row2" data-feat="campaigns" style="margin-top:0.7rem"><label>Reach<input name="r_reach" inputmode="numeric" value="${esc(post.results?.reach ?? "")}" /></label><label>Likes / reactions<input name="r_likes" inputmode="numeric" value="${esc(post.results?.likes ?? "")}" /></label></div>
        <div class="row2" data-feat="campaigns" style="margin-top:0.7rem"><label>Comments<input name="r_comments" inputmode="numeric" value="${esc(post.results?.comments ?? "")}" /></label><label>Link clicks<input name="r_clicks" inputmode="numeric" value="${esc(post.results?.clicks ?? "")}" /></label></div>
      </div>
      <p class="adm-error tiny" id="postErr" hidden></p>
      <div class="btn-row" style="justify-content:flex-end">${isNew ? "" : '<button type="button" class="btn btn--ghost btn--small" id="postDelete" style="margin-right:auto;color:var(--danger)">Delete</button>'}<a class="btn btn--ghost btn--small" href="#/marketing?tab=posts">Cancel</a><button class="btn btn--primary btn--small" type="submit">Save</button></div>
    </form></div>
    <div class="adm-detail__side">
      <div class="adm-card"><h2>Publish</h2>
        <div class="adm-final" id="finalText"></div>
        ${camp ? `<p class="tiny muted" style="margin-top:0.5rem">Tracked link for <b>${esc(camp.name)}</b>: <span class="mono">${esc(trackedLink(post.link, camp))}</span></p>` : '<p class="tiny muted" style="margin-top:0.5rem">Tip: attach a campaign and the link gets a ?src= code, so leads from this post are credited to it.</p>'}
        ${post.fb_post_id ? `<p class="small" style="color:#137333;margin-top:0.6rem"><b>Posted to Facebook</b> ${esc(fmtDT(post.posted_at))} · <a class="inline-link" href="${esc(post.post_url)}" target="_blank" rel="noopener">View it</a></p>` : !isNew ? `<div class="adm-inline-actions" id="fbNowRow" style="margin-top:0.8rem"${post.channel === "facebook" ? "" : " hidden"}><button type="button" class="btn btn--primary" id="fbNow">Post to Facebook now</button><span class="tiny muted" id="fbNowNote"></span></div>` : ""}
        <div class="adm-inline-actions" style="margin-top:0.8rem"><button type="button" class="btn ${post.channel === "facebook" && !isNew ? "btn--ghost" : "btn--primary"}" id="copyText">Copy text</button><a class="btn btn--ghost" id="openComposer" href="#" target="_blank" rel="noopener">Open composer</a>${imgUrl ? `<a class="btn btn--ghost" href="${esc(imgUrl)}" download>Download image</a>` : ""}${isNew ? "" : '<button type="button" class="btn btn--ghost" id="markPosted">Mark as posted</button>'}</div>
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
    $("autoRow").hidden = p.channel !== "facebook"; if ($("fbNowRow")) $("fbNowRow").hidden = p.channel !== "facebook";
  };
  form.addEventListener("input", refresh); form.addEventListener("change", refresh); refresh();
  // posting by itself only works for a planned post, so ticking the box plans it
  form.auto_publish?.addEventListener("change", () => { if (form.auto_publish.checked && ["idea", "drafted"].includes(form.status.value)) { form.status.value = "scheduled"; if (!form.scheduled_at.value) form.scheduled_at.focus(); } });
  view.querySelectorAll("[data-ins]").forEach((b) => b.addEventListener("click", () => { const ta = form.body, v = b.dataset.ins, s0 = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s0) + v + ta.value.slice(ta.selectionEnd ?? s0); ta.focus(); refresh(); }));
  $("copyText").addEventListener("click", async () => { const t = finalPostText(current()); try { await navigator.clipboard.writeText(t); toast("Text copied"); } catch { prompt("Copy this:", t); } });
  $("openComposer").addEventListener("click", async () => { const t = finalPostText(current()); try { await navigator.clipboard.writeText(t); toast("Text copied — paste it in the composer"); } catch {} });
  $("imgRemove")?.addEventListener("click", async () => { await api.storage.remove(post.image_path).catch(() => {}); post = await api.posts.update(post.id, { image_path: null }); await loadAll(true); renderPostEditor(post.id, q); });
  const collect = async () => {
    const f = form, row = { title: f.title.value.trim(), channel: f.channel.value, campaign_id: f.campaign_id.value || null, body: f.body.value.replace(/\r\n/g, "\n"), hashtags: f.hashtags.value.trim() || null, link: f.link.value.trim() || null, status: f.status.value, scheduled_at: f.scheduled_at.value ? new Date(f.scheduled_at.value).toISOString() : null, post_url: f.post_url.value.trim() || null, results: {} };
    for (const [k, n] of [["reach", "r_reach"], ["likes", "r_likes"], ["comments", "r_comments"], ["clicks", "r_clicks"]]) { const v = f[n].value.replace(/\D/g, ""); if (v) row.results[k] = Number(v); }
    if (row.status === "posted" && !post.posted_at) row.posted_at = new Date().toISOString();
    // what goes to Facebook is exactly what the panel shows under Publish
    const cur = current(); row.publish_text = finalPostText(cur); row.publish_link = trackedLink(cur.link, campById(cur.campaign_id)) || null;
    row.auto_publish = row.channel === "facebook" && f.auto_publish.checked;
    if (row.auto_publish && row.status !== "scheduled") throw new Error("To post it by itself, set the status to Planned and pick a date and time.");
    if (row.status === "scheduled" && !row.scheduled_at) throw new Error("Give a planned post a date and time.");
    if (f.image.files[0]) { const file = f.image.files[0]; if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB."); row.image_path = await api.storage.upload(file); }
    return row;
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("postErr"); err.hidden = true;
    try { const row = await collect(); const saved = isNew ? await api.posts.insert(row) : await api.posts.update(post.id, row); toast("Post saved"); await loadAll(true); location.hash = isNew ? "#/marketing/post/" + saved.id : "#/marketing?tab=posts"; if (!isNew) return; }
    catch (ex) { err.hidden = false; err.textContent = ex.message; }
  });
  if ($("fbNow")) api.facebook("status").then((st) => { if (!st.connected) { $("fbNow").disabled = true; $("fbNowNote").innerHTML = 'Connect your Page first: <a class="inline-link" href="#/settings?fb=setup">Settings → Facebook Page</a>'; } }).catch(() => { $("fbNow").disabled = true; $("fbNowNote").textContent = "Facebook posting isn't set up yet (ADMIN.md 8cp)."; });
  $("fbNow")?.addEventListener("click", (e) => busy(e.target, async () => {
    if (!confirm("Post this to your Facebook Page now?")) return;
    try {
      const row = await collect(); await api.posts.update(post.id, row);
      const r = await api.facebook("publish", { postId: post.id });
      toast("Posted to Facebook"); await loadAll(true); renderPostEditor(post.id, q);
      if (r.post_url) window.open(r.post_url, "_blank", "noopener");
    } catch (ex) { toast(ex.message, true); await loadAll(true); }
  }, "Posting…"));
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
  <div class="adm-head"><div><span class="eyebrow">Websites</span><h1>Websites &amp; mockups</h1><p class="muted small">Mockups, previews, demos and client sites we host at re-charge.co.za.</p></div>
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
      await loadScript(location.origin + "/admin/vendor/jszip-3.10.1.min.js"); const JSZip = window.JSZip;   // our own pinned copy, no CDN
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
  $("sitePreviewEmail")?.addEventListener("click", () => openCompose({ ...p, preview_url: site.url }, "email", { templateId: tplFor("email", "mockup")?.id, onDone: () => renderSiteEditor(site, q) }));
}
async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}


// ---------- quick actions (from any list row) ----------
function openQuickActions(p) {
  const dlg = $("composeDialog");
  const due = (v) => (v === "mon" ? nextMonday() : workdaysFrom(Number(v) || 1)).toISOString();   // working days, 09:00
  const step = nextStep(p);
  // Move to another column: the tap way to do what the board does by dragging (phones can't drag)
  const col = boardCol(p), canMove = isActive(p) && col && stageOf(p.status) !== "live";
  dlg.innerHTML = `
  <div class="adm-dialog__inner adm-quick">
    <div class="adm-dialog__head"><div><h2 id="composeTitle">${esc(p.business || p.name || "Lead")}</h2><p>${esc(STAGE[p.status]?.label || p.status)}${p.next_action_at ? ` · reminder ${esc(fmtD(p.next_action_at))}` : ""}</p></div><button type="button" class="adm-dialog__x" data-close aria-label="Close">&times;</button></div>
    <p class="small"><b>Next step:</b> ${esc(step.title)}</p>
    <div class="adm-inline-actions">${stepButtons(p, step, false)}</div>
    ${canMove ? `<div class="adm-inline-actions adm-quick__move" style="margin-top:0.6rem"><span class="tiny muted" style="align-self:center">Move to:</span>${BOARD.filter(([g]) => g !== col).map(([g, l]) => `<button type="button" class="btn btn--ghost" data-move="${g}">${esc(l)}</button>`).join("")}<a class="btn btn--ghost" href="#/p/${esc(p.id)}?do=lost">Mark lost…</a></div>` : ""}
    <div class="adm-inline-actions" style="margin-top:0.4rem">
      ${p.email ? '<button type="button" class="btn btn--ghost" data-qa="email">Email</button>' : ""}
      ${isMobile(p.phone) ? '<button type="button" class="btn btn--ghost" data-qa="whatsapp">WhatsApp</button>' : ""}
      ${p.phone ? `<a class="btn btn--ghost" href="${esc(telLink(p.phone))}">Call</a>` : ""}
    </div>
    <div class="adm-form" style="margin-top:0.6rem">
      <div class="adm-inline-actions" style="margin:0"><span class="tiny muted" style="align-self:center">Remind me:</span><button type="button" class="btn btn--ghost" data-due="1">Next working day</button><button type="button" class="btn btn--ghost" data-due="3">In 3 working days</button><button type="button" class="btn btn--ghost" data-due="mon">Next Monday</button>${p.next_action_at ? '<button type="button" class="btn btn--ghost" data-due="0">Clear</button>' : ""}</div>
      <div class="btn-row"><button type="button" class="btn btn--ghost btn--small" data-qa="archive">${p.archived ? "Restore" : "Archive"}</button><a class="btn btn--primary btn--small" href="#/p/${esc(p.id)}" data-close>Open lead</a></div>
    </div>
  </div>`;
  const save = async (fields, msg) => { try { const np = await api.projects.update(p.id, fields); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = np; toast(msg); await loadAll(true); dlg.close(); route(); } catch (e) { toast(e.message, true); } };
  dlg.querySelectorAll("[data-close], a[href^='#/p/']").forEach((b) => b.addEventListener("click", () => dlg.close()));
  dlg.querySelectorAll("[data-due]").forEach((b) => b.addEventListener("click", () => { const v = b.dataset.due; if (v === "0") return save({ next_action: null, next_action_at: null }, "Reminder cleared"); const at = due(v); save({ next_action: p.next_action || "Follow up", next_action_at: at }, `Reminder set for ${fmtD(at)}, 09:00`); }));
  dlg.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", async () => { dlg.close(); if ((await moveLead(p.id, b.dataset.move)) !== "opened") route(); }));
  dlg.querySelectorAll("[data-qa]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.qa;
    if (a === "archive") return save({ archived: !p.archived }, p.archived ? "Restored" : "Archived");
    if (a === "email" || a === "whatsapp") { dlg.close(); openCompose(p, a, { onDone: () => { S.loaded = 0; route(); } }); }
  }));
  if (!dlg.open) dlg.showModal();
}


/* ---------- Contracts (2026-10-13) ----------
   Templates live in /contracts.js (shared with the public agreement page). Each one is
   filled with your company details (Settings → Contracts) and the lead's details, which
   you can edit and save on the lead (details.contracts). Print or save as PDF to send;
   mark sent and signed, which is logged on the lead. Accepting a quote online also
   accepts the Client Services Agreement (quote page wording + /agreement). */
const CT = () => window.RC_CONTRACTS;
const PLAN_TERMS = {
  hosting: { min: "1 month", acc: "not included", allow: "not included", hours: "none", r: ["next business day", "next business day", "2 business days"] },
  care: { min: "1 month", acc: "not included", allow: "not included", hours: "1 hour", r: ["next business day", "next business day", "2 business days"] },
  inbox: { min: "3 months", acc: "every month", allow: 50000, hours: "1 hour (price and policy updates)", r: ["next business day", "2 business days", "3 business days"] },
  operate: { min: "3 months", acc: "every quarter", allow: 150000, hours: "2 hours", r: ["next business day", "2 business days", "3 business days"] },
  optimise: { min: "3 months", acc: "every month", allow: 400000, hours: "6 hours", r: ["same business day", "next business day", "2 business days"] },
  ai_partner: { min: "3 months", acc: "every month", allow: 1000000, hours: "15 hours (unused hours carry over one month)", r: ["4 business hours", "same business day", "next business day"] },
};
const ctDetails = (o) => [o.legal, o.reg && "registration " + o.reg, o.vat && "VAT " + o.vat, o.address].filter(Boolean).join(", ");
function ctDefaults(p, doc) {
  const pr = S.profile, c = p?.client_id ? clientById(p.client_id) : null;
  const total = p?.quote_cents || 0, dep = p?.deposit_paid && depositsPaid(p) ? depositsPaid(p) : total ? depositOf(p) : 0;   // the quote page's rule (depositOn), or what's already paid
  const items = (p?.quote_items || []).filter((i) => i.desc);
  const plan = c?.care_plan || (p?.details?.plan) || "operate", t = PLAN_TERMS[plan] || PLAN_TERMS.operate;
  const b = p ? baselineOf(p) : null;
  return {
    us: pr.legal_name || "Re-Charge", us_reg: pr.reg_no || "", us_vat: pr.vat_no || "", us_address: pr.address || "",
    us_email: pr.contract_email || pr.reply_to || "", us_signatory: pr.signatory || pr.my_name || "", us_title: pr.signatory_title || "",
    client: p ? (c?.name || p.business || p.name || "") : "", client_reg: "", client_vat: "", client_address: p?.location || "",
    client_contact: p?.name || "", client_email: p?.email || "", client_title: "",
    ref: p?.ref || "", date: new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
    scope: items.length ? items.map((i) => "- " + i.desc + (i.cents ? " (" + money(i.cents) + ")" : "")).join("\n") : "",
    not_included: "Third-party subscriptions and AI usage, charged at cost as listed in the quote",
    measure: b ? "- " + baselineLine(b) + " today, measured again the same way after launch" : "",
    dates: "", total: total ? money(total) : "", deposit: total ? money(dep) : "", balance: total ? money(total - dep) : "",
    balance_when: "due before launch", ongoing: "",
    your_part: "- Two or three one-hour sessions, and examples of the work\n- A weekly 30-minute check-in while we build, and someone to test it on real cases\n- Access to the systems it connects to, and someone to sign it off",
    human_check: "- Anything sent to your customers, or posted to your accounts, is approved by a person first",
    start_date: "", plan_name: PLAN_LABEL[plan] || plan, plan_fee: PLAN_MONTHLY[plan] ? money(PLAN_MONTHLY[plan]) + " a month" : "",
    systems: "as listed in the project order", min_term: t.min, accuracy: t.acc, allowance: typeof t.allow === "number" ? money(t.allow) : t.allow, hours: t.hours,
    resp_critical: t.r[0], resp_high: t.r[1], resp_normal: t.r[2], change_rate: money(RATES.change), emergency_rate: money(RATES.emergency),
    data_types: "Names, contact details and the content of messages and documents the system handles, about your customers, suppliers and staff",
    providers: "- GitHub: website hosting\n- Supabase: database, file storage and server functions\n- Resend: sending email\n- Anthropic: AI features\n- Yoco and Paystack: card payments",
  };
}
// Which fields each document asks for (beyond the parties).
const CT_FIELDS = {
  msa: [], nda: ["date"],
  order: ["ref", "date", "scope", "not_included", "measure", "dates", "total", "deposit", "balance", "balance_when", "ongoing", "your_part", "human_check"],
  plan: ["start_date", "plan_name", "plan_fee", "systems", "min_term", "accuracy", "allowance", "hours", "resp_critical", "resp_high", "resp_normal", "change_rate", "emergency_rate"],
  dpa: ["data_types", "providers"],
};
const CT_LABEL = { ref: "Reference", date: "Date", scope: "What we'll build (one per line, starting with -)", not_included: "Not included", measure: "What we'll measure", dates: "Dates and milestones", total: "Total", deposit: "Deposit", balance: "Balance", balance_when: "Balance due", ongoing: "Ongoing costs after launch", your_part: "Their part", human_check: "Where a person checks the result", start_date: "Start date", plan_name: "Plan", plan_fee: "Monthly fee", systems: "Systems covered", min_term: "Minimum term", accuracy: "Accuracy checks", allowance: "AI usage included", hours: "Improvement hours", resp_critical: "Response: critical", resp_high: "Response: high", resp_normal: "Response: normal", change_rate: "Change rate", emergency_rate: "Emergency rate", data_types: "Personal information handled", providers: "Providers (one per line, starting with -)" };
const CT_LONG = ["scope", "measure", "dates", "your_part", "human_check", "data_types", "providers", "ongoing"];
function ctValues(p, doc) {
  const v = { ...ctDefaults(p, doc), ...(p?.details?.contracts?.fields || {}) };
  v.us_details = ctDetails({ legal: "", reg: v.us_reg, vat: v.us_vat, address: v.us_address });
  v.client_details = ctDetails({ legal: "", reg: v.client_reg, vat: v.client_vat, address: v.client_address });
  return v;
}
function contractsCard(p) {
  if (!CT()) return "";
  const st = p.details?.contracts || {};
  const row = (d) => { const s = st[d.id] || {}; const tag = s.signedAt ? `<span class="status-pill" data-s="accepted">signed ${esc(fmtD(s.signedAt))}</span>` : s.sentAt ? `<span class="status-pill" data-s="sent">sent ${esc(fmtD(s.sentAt))}</span>` : ""; return `<li><a href="#/contracts?doc=${d.id}&p=${esc(p.id)}">${esc(d.title)}</a> ${tag}</li>`; };
  return `<details class="adm-card adm-more-details" style="margin-top:1rem" id="contractsCard"><summary><h2>Contracts</h2><span class="muted small">${Object.values(st).filter((x) => x && x.signedAt).length} signed</span></summary><div class="adm-fold">
    <ul class="adm-ct-list">${CT().DOCS.map(row).join("")}</ul>
    <p class="tiny muted">Accepting a quote online also accepts the Client Services Agreement. Use these when a client wants signed copies, and for the project order, monthly plan and data processing.</p></div></details>`;
}
function renderContracts(q) {
  const C = CT();
  if (!C) { view.innerHTML = '<p class="adm-error">Contract templates did not load.</p>'; return; }
  const docId = C.byId(q.get("doc")) ? q.get("doc") : "msa", d = C.byId(docId);
  const p = q.get("p") ? S.projects.find((x) => x.id === q.get("p")) : null;
  const v = ctValues(p, docId), st = p?.details?.contracts?.[docId] || {};
  const pr = S.profile;
  const fieldRow = (k) => CT_LONG.includes(k)
    ? `<label>${esc(CT_LABEL[k] || k)}<textarea name="${k}" rows="3">${esc(v[k] || "")}</textarea></label>`
    : `<label>${esc(CT_LABEL[k] || k)}<input name="${k}" value="${esc(v[k] || "")}" /></label>`;
  view.innerHTML = `
  <div class="adm-head"><div><span class="eyebrow"><a href="#/settings">Settings</a>${p ? ` · <a href="#/p/${esc(p.id)}">${esc(p.ref)}</a>` : ""}</span><h1>Contracts</h1>
    <p class="muted small">Templates written without an attorney: have them reviewed when you can, especially before your first client abroad. Gaps to fill show <mark class="ct-gap">[like this]</mark>.</p></div></div>
  <nav class="adm-pagetabs" aria-label="Documents">${C.DOCS.map((x) => `<a href="#/contracts?doc=${x.id}${p ? "&p=" + esc(p.id) : ""}"${x.id === docId ? ' aria-current="page"' : ""}>${esc(x.short)}</a>`).join("")}</nav>
  <div class="adm-ct">
    <div class="adm-ct__side">
      <p class="small"><b>When to use:</b> ${esc(d.when)}</p>
      ${p ? `<form class="adm-form" id="ctForm">
        <h2 class="small">Client</h2>
        <div class="row2"><label>Registered name<input name="client" value="${esc(v.client)}" /></label><label>Registration no.<input name="client_reg" value="${esc(v.client_reg)}" /></label></div>
        <div class="row2"><label>VAT no.<input name="client_vat" value="${esc(v.client_vat)}" /></label><label>Address<input name="client_address" value="${esc(v.client_address)}" /></label></div>
        <div class="row2"><label>Signs for them<input name="client_contact" value="${esc(v.client_contact)}" /></label><label>Their email<input name="client_email" value="${esc(v.client_email)}" /></label></div>
        ${CT_FIELDS[docId].length ? `<h2 class="small" style="margin-top:0.6rem">This document</h2>${CT_FIELDS[docId].map(fieldRow).join("")}` : ""}
        <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save</button></div>
      </form>
      <div class="adm-inline-actions" style="margin-top:0.8rem">
        <button type="button" class="btn btn--primary" id="ctPrint">Print or save as PDF</button>
        <button type="button" class="btn btn--ghost" id="ctSent">${st.sentAt ? "Sent " + esc(fmtD(st.sentAt)) : "Mark as sent"}</button>
        <button type="button" class="btn btn--ghost" id="ctSigned">${st.signedAt ? "Signed " + esc(fmtD(st.signedAt)) : "Mark as signed"}</button>
      </div>` : `<p class="small muted">Open a lead and use its Contracts card to fill one in for that client. Below is the blank template.</p>
      <div class="adm-inline-actions"><button type="button" class="btn btn--ghost" id="ctPrint">Print blank template</button></div>`}
      <details class="adm-card adm-more-details" style="margin-top:1rem"${pr.legal_name ? "" : " open"}><summary><h2>Your company details</h2><span class="muted small">${esc(pr.legal_name || "not set yet")}</span></summary><div class="adm-fold">
        <form class="adm-form" id="ctUs">
          <div class="row2"><label>Registered name<input name="legal_name" value="${esc(pr.legal_name || "")}" placeholder="e.g. Re-Charge (Pty) Ltd" /></label><label>Registration no.<input name="reg_no" value="${esc(pr.reg_no || "")}" /></label></div>
          <div class="row2"><label>VAT no. <span class="muted" style="font-weight:400">(if registered)</span><input name="vat_no" value="${esc(pr.vat_no || "")}" /></label><label>Email for notices<input name="contract_email" value="${esc(pr.contract_email || pr.reply_to || "")}" /></label></div>
          <label>Address<input name="address" value="${esc(pr.address || "")}" /></label>
          <h3 class="small" style="margin:0.6rem 0 0">Bank details (for EFT) <span class="muted" style="font-weight:400">(go into deposit and balance messages as {{bank_details}}, and show on an overseas client's quote once they accept)</span></h3>
          <div class="row2"><label>Account name<input name="bank_account_name" value="${esc(pr.bank_account_name || "")}" /></label><label>Bank<input name="bank_name" value="${esc(pr.bank_name || "")}" placeholder="e.g. FNB" /></label></div>
          <div class="row2"><label>Account number<input name="bank_account_no" value="${esc(pr.bank_account_no || "")}" /></label><label>SWIFT / BIC<input name="bank_swift" value="${esc(pr.bank_swift || "")}" placeholder="e.g. FIRNZAJJ" /></label></div>
          <label>Branch code and bank address<input name="bank_branch" value="${esc(pr.bank_branch || "")}" placeholder="e.g. 250655, 1 First Place, Johannesburg" /></label>
          <div class="row2"><label>Who signs<input name="signatory" value="${esc(pr.signatory || pr.my_name || "")}" /></label><label>Their role<input name="signatory_title" value="${esc(pr.signatory_title || "")}" placeholder="e.g. Director" /></label></div>
          <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary btn--small" type="submit">Save</button></div>
        </form></div></details>
    </div>
    <article class="adm-ct__doc ct-print">
      <div class="ct-doc"><h2>${esc(d.title)}</h2>${C.toHtml(C.fill(d.body, p ? v : { us: v.us, us_details: v.us_details, us_signatory: v.us_signatory, us_email: v.us_email }))}
      <div class="ct-sign">
        <div><b>For ${esc(v.us)}</b><span>Signature</span><span>Name: ${esc(v.us_signatory || "")}${v.us_title ? ", " + esc(v.us_title) : ""}</span><span>Date</span></div>
        <div><b>For ${esc(p ? v.client || "the client" : "the client")}</b><span>Signature</span><span>Name: ${esc(p ? v.client_contact || "" : "")}</span><span>Date</span></div>
      </div></div>
    </article>
  </div>`;
  $("ctPrint")?.addEventListener("click", () => window.print());
  $("ctUs")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target; const patch = {};
    ["legal_name", "reg_no", "vat_no", "contract_email", "address", "signatory", "signatory_title", "bank_account_name", "bank_name", "bank_account_no", "bank_swift", "bank_branch"].forEach((k) => { patch[k] = f[k].value.trim(); });
    try { const value = { ...S.profile, ...patch }; await api.settings.set("profile", value); S.profile = withDefaults(value); toast("Saved"); renderContracts(q); } catch (ex) { toast(ex.message, true); }
  });
  if (!p) return;
  const saveCt = async (patch) => {
    const cur = p.details?.contracts || {};
    const details = { ...(p.details || {}), contracts: { ...cur, ...patch } };
    await api.projects.update(p.id, { details }); p.details = details;
  };
  $("ctForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target; const fields = { ...(p.details?.contracts?.fields || {}) };
    [...f.elements].forEach((el) => { if (el.name) fields[el.name] = el.value; });
    try { await saveCt({ fields }); toast("Saved"); renderContracts(q); } catch (ex) { toast(ex.message, true); }
  });
  const mark = (what) => async () => {
    const at = new Date().toISOString(); const cur = p.details?.contracts?.[docId] || {};
    try {
      await saveCt({ [docId]: { ...cur, [what]: at } });
      await api.events.insert(p.id, "note", `${d.title} ${what === "sentAt" ? "sent to" : "signed by"} ${v.client || "the client"}`);
      toast(what === "sentAt" ? "Marked as sent" : "Marked as signed"); renderContracts(q);
    } catch (ex) { toast(ex.message, true); }
  };
  $("ctSent").addEventListener("click", mark("sentAt"));
  $("ctSigned").addEventListener("click", mark("signedAt"));
}
