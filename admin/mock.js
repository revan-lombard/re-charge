// Demo data layer (no network). Loaded only when the page is opened with
// ?mock=1 — used to develop and screenshot the panel. Never touches Supabase.
const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();
const ahead = (h) => new Date(now + h * 3600e3).toISOString();
const uid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function callDay(offsetDays) { const d = new Date(now + offsetDays * 864e5); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }

let seq = 51;
const P = (o) => ({
  id: uid(), ref: "RC-000" + (seq++), client_id: null, name: null, email: null, phone: null, business: null,
  category: [], goal: null, details: {}, budget: null, deadline: null, indicative_price: null, channel: null,
  status: "new", deposit_paid: false, source: "website", quote_cents: null, next_action: null, next_action_at: null,
  declined_reason: null, starred: false, archived: false, spam: false, snoozed_until: null, preview_url: null,
  created_at: ago(30), updated_at: ago(30), ...o,
});

const projects = [
  P({ name: "Sipho Dlamini", email: "sipho@bellahair.co.za", phone: "082 000 0000", business: "Bella Hair Studio", category: ["Websites"], goal: "We take bookings on WhatsApp and lose track. Want a site where clients see prices and book a slot.", budget: "R2,000 – R4,000", deadline: "Within a month", indicative_price: "from R2,000", details: { formType: "Project enquiry", projectType: "Business website", features: "Online booking, Gallery, WhatsApp button", submittedAt: ago(30) }, created_at: ago(30), updated_at: ago(30) }),
  P({ name: "Thandi Mokoena", email: "thandi@gmail.com", phone: "071 555 1234", business: "Mokoena Plumbing", category: ["Websites"], goal: "Need a simple site so people can find us on Google.", status: "deposit_paid", deposit_paid: true, source: "website", quote_cents: 200000, next_action: "Send quote after call", next_action_at: ahead(-3), details: { formType: "Project enquiry", projectType: "One-page website" }, created_at: ago(72), updated_at: ago(20) }),
  P({ name: "Johan van der Merwe", email: "johan@vdmlogistics.co.za", phone: "083 222 9999", business: "VDM Logistics", category: ["Dashboards", "Automation"], goal: "Spreadsheets everywhere. Want a dashboard for deliveries per driver and automatic weekly report.", status: "quote_sent", quote_cents: 850000, next_action: "Follow up on quote", next_action_at: ahead(26), starred: true, details: { formType: "Project enquiry" }, created_at: ago(240), updated_at: ago(48) }),
  P({ name: "Naledi Khumalo", email: "naledi@studio.co.za", phone: "060 111 2222", business: "Naledi Photography", category: ["Websites"], status: "in_development", deposit_paid: true, quote_cents: 450000, details: { formType: "Project enquiry" }, created_at: ago(500), updated_at: ago(30) }),
  P({ name: "Mike Peters", email: "mike@mikesplumbing.co.za", phone: "082 333 4444", business: "Mike's Plumbing", category: ["Websites"], status: "care", deposit_paid: true, quote_cents: 200000, details: {}, created_at: ago(3000), updated_at: ago(700) }),
  P({ name: "Ayesha Patel", email: "ayesha@patelaccounting.co.za", phone: "084 777 8888", business: "Patel Accounting", category: ["Call request"], source: "call", details: { formType: "Call request", callDay: callDay(0), callTime: "Afternoon (12:00–16:00)", callNote: "Wants to discuss a client portal.", submittedAt: ago(20) }, created_at: ago(20), updated_at: ago(20) }),
  P({ name: "Lerato's Bakery", email: "hello@leratosbakery.co.za", phone: "079 123 4567", business: "Lerato's Bakery", category: ["Free mockup request"], source: "mockup", goal: "A bakery in Soweto — customers pre-order cakes for weekends.", details: { formType: "Free mockup request", mkAbout: "A bakery in Soweto — customers pre-order cakes for weekends.", mkInclude: "Menu, prices, WhatsApp orders, gallery", mkStyle: "Warm, friendly, lots of photos", submittedAt: ago(5) }, created_at: ago(5), updated_at: ago(5) }),
  P({ name: "Pieter Botha", email: "pieter@bothaelectrical.co.za", phone: "082 444 5555", business: "Botha Electrical", category: ["Websites"], status: "prospect", source: "outreach", details: {}, created_at: ago(10), updated_at: ago(10) }),
  P({ name: "Zanele Nkosi", email: "zanele@nkosibeauty.co.za", business: "Nkosi Beauty Bar", category: ["Websites"], status: "contacted", source: "outreach", next_action: "Follow-up 1", next_action_at: ahead(50), details: {}, created_at: ago(80), updated_at: ago(50) }),
  P({ name: "Sipho Dlamini", email: "sipho@bellahair.co.za", phone: "082 000 0000", business: "Bella Hair Studio", category: ["Call request"], source: "call", details: { formType: "Call request", callDay: callDay(1), callTime: "Morning (08:00–12:00)", submittedAt: ago(2) }, created_at: ago(2), updated_at: ago(2) }),
  P({ name: "Dumisani Zulu", email: "dumi@zuluevents.co.za", phone: "073 999 0000", business: "Zulu Events", category: ["Custom Software"], status: "declined", declined_reason: "Budget too small for scope", details: {}, created_at: ago(900), updated_at: ago(800) }),
  P({ name: "SEO Guru", email: "spam@seo-guru.biz", business: "SEO Guru Ltd", category: ["Websites"], goal: "We can rank your site #1!!!", spam: true, archived: true, details: {}, created_at: ago(9), updated_at: ago(9) }),
];

const events = [];
function ev(project, kind, note, hoursAgo, data = {}) {
  events.push({ id: uid(), project_id: project.id, kind, note, data, created_at: ago(hoursAgo) });
}
for (const p of projects) ev(p, "created", `Submitted from website (${p.details.formType || "Project enquiry"})`, (now - Date.parse(p.created_at)) / 3600e3);
ev(projects[1], "payment", "R500 deposit received", 60, { amount: 50000 });
ev(projects[1], "status", "new → deposit paid", 60, { from: "new", to: "deposit_paid" });
ev(projects[1], "note", "Called — wants a one-pager with a services list and a map. Quote R2,000.", 20);
ev(projects[2], "note", "Long call. 12 drivers, Excel per driver. Wants weekly PDF report emailed to ops manager.", 100);
ev(projects[2], "status", "under review → quote sent", 48, { from: "under_review", to: "quote_sent" });
ev(projects[3], "status", "approved → in development", 30, { from: "approved", to: "in_development" });

const payments = [
  { id: uid(), project_id: projects[1].id, provider: "yoco", provider_id: "p_1", amount_cents: 50000, currency: "ZAR", reference: "RC-00052", email: "thandi@gmail.com", status: "succeeded", matched: true, created_at: ago(60) },
  { id: uid(), project_id: projects[3].id, provider: "yoco", provider_id: "p_2", amount_cents: 225000, currency: "ZAR", reference: "RC-00054 deposit 50%", email: "naledi@studio.co.za", status: "succeeded", matched: true, created_at: ago(200) },
  { id: uid(), project_id: null, provider: "yoco", provider_id: "p_3", amount_cents: 50000, currency: "ZAR", reference: "deposit", email: "j.smith@example.com", status: "succeeded", matched: false, created_at: ago(15) },
];
const clients = [
  { id: uid(), name: "Mike's Plumbing", slug: "mikes-plumbing", care_active: true, care_plan: "care", care_renews_at: new Date(now + 12 * 864e5).toISOString().slice(0, 10), site_label: "mikesplumbing.co.za", report_emails: ["mike@mikesplumbing.co.za"], created_at: ago(3000) },
  { id: uid(), name: "Naledi Photography", slug: "naledi", care_active: true, care_plan: "hosting", care_renews_at: new Date(now + 300 * 864e5).toISOString().slice(0, 10), site_label: "naledi.co.za", report_emails: [], created_at: ago(500) },
  { id: uid(), name: "Re-Charge", slug: "re-charge", care_active: false, care_plan: null, care_renews_at: null, site_label: "re-charge.co.za", report_emails: [], created_at: ago(5000) },
];

const clone = (x) => JSON.parse(JSON.stringify(x));
let session = new URLSearchParams(location.search).get("out") === "1" ? null : { user: { id: "demo-user", email: "you@re-charge.co.za" }, access_token: "demo" };
const listeners = [];

export async function createApi() {
  return {
    mock: true,
    auth: {
      async getSession() { return session; },
      onChange(cb) { listeners.push(cb); },
      async signIn() { /* demo: pretend the email went out; any 6-digit code signs in */ },
      async verifyCode() { session = { user: { id: "demo-user", email: "you@re-charge.co.za" } }; listeners.forEach((f) => f(session)); },
      async signOut() { session = null; listeners.forEach((f) => f(null)); },
      async isStaff() { return true; },
    },
    projects: {
      async list() { return clone(projects).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); },
      async get(id) { return clone(projects.find((p) => p.id === id) || null); },
      async update(id, patch) {
        const p = projects.find((x) => x.id === id); if (!p) throw new Error("not found");
        if (patch.status && patch.status !== p.status) {
          ev(p, "status", `${p.status.replace(/_/g, " ")} → ${patch.status.replace(/_/g, " ")}`, 0, { from: p.status, to: patch.status, reason: patch.declined_reason ?? null });
        }
        Object.assign(p, patch, { updated_at: new Date().toISOString() });
        return clone(p);
      },
      async insert(row) { const p = P({ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); projects.unshift(p); ev(p, "created", "Added manually", 0); return clone(p); },
    },
    events: {
      async list(projectId) { return clone(events.filter((e) => e.project_id === projectId).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
      async insert(projectId, kind, note, data = {}) { const e = { id: uid(), project_id: projectId, kind, note, data, created_at: new Date().toISOString() }; events.push(e); return clone(e); },
      async recent(limit = 25) {
        return clone(events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
          .map((e) => { const p = projects.find((x) => x.id === e.project_id); return { ...e, projects: p ? { ref: p.ref, business: p.business, name: p.name } : null }; }));
      },
      async searchNotes(q) { const s = q.toLowerCase(); return clone(events.filter((e) => e.kind === "note" && (e.note || "").toLowerCase().includes(s)).map((e) => ({ project_id: e.project_id, note: e.note }))); },
    },
    payments: {
      async list() { return clone(payments); },
      async match(id, projectId) { const p = payments.find((x) => x.id === id); p.project_id = projectId; p.matched = true; return clone(p); },
    },
    clients: { async list() { return clone(clients); } },
    spam: { async add() { return []; } },
  };
}
