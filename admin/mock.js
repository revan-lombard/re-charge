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
  build_status: "none", build_brief: null, build_log: null, build_site_id: null, build_started_at: null, quote_items: [],
  quote_token: null, quote_status: "none", quote_sent_at: null, quote_viewed_at: null, quote_accepted_at: null, quote_accepted_name: null, quote_decline_reason: null, quote_valid_until: null, quote_timeline: null, quote_notes: null,
  created_at: ago(30), updated_at: ago(30), ...o,
});

const projects = [
  P({ name: "Sipho Dlamini", email: "sipho@bellahair.co.za", phone: "082 000 0000", business: "Bella Hair Studio", location: "Morningside, Durban", category: ["Websites"], goal: "We take bookings on WhatsApp and lose track. Want a site where clients see prices and book a slot.", budget: "R2,000 – R4,000", deadline: "Within a month", indicative_price: "from R2,000", details: { formType: "Project enquiry", projectType: "Business website", features: "Online booking, Gallery, WhatsApp button", submittedAt: ago(30) }, created_at: ago(30), updated_at: ago(30) }),
  P({ name: "Thandi Mokoena", email: "thandi@gmail.com", phone: "071 555 1234", business: "Mokoena Plumbing", location: "Soweto, Johannesburg", category: ["Websites"], goal: "Need a simple site so people can find us on Google.", status: "in_development", deposit_paid: true, source: "website", quote_cents: 200000, next_action: "Send quote after call", next_action_at: ahead(-3), details: { formType: "Project enquiry", projectType: "One-page website" }, created_at: ago(72), updated_at: ago(20) }),
  P({ name: "Johan van der Merwe", email: "johan@vdmlogistics.co.za", phone: "083 222 9999", business: "VDM Logistics", category: ["Dashboards", "Automation"], goal: "Spreadsheets everywhere. Want a dashboard for deliveries per driver and automatic weekly report.", status: "quote_sent", quote_cents: 850000, next_action: "Follow up on quote", next_action_at: ahead(26), starred: true, details: { formType: "Project enquiry" }, created_at: ago(240), updated_at: ago(48) }),
  P({ name: "Naledi Khumalo", email: "naledi@studio.co.za", phone: "060 111 2222", business: "Naledi Photography", category: ["Websites"], status: "in_development", deposit_paid: true, quote_cents: 450000, details: { formType: "Project enquiry" }, created_at: ago(500), updated_at: ago(30) }),
  P({ name: "Mike Peters", email: "mike@mikesplumbing.co.za", phone: "082 333 4444", business: "Mike's Plumbing", category: ["Websites"], status: "live", deposit_paid: true, quote_cents: 200000, details: {}, created_at: ago(3000), updated_at: ago(700) }),
  P({ name: "Ayesha Patel", email: "ayesha@patelaccounting.co.za", phone: "084 777 8888", business: "Patel Accounting", category: ["Call request"], source: "call", details: { formType: "Call request", callDay: callDay(0), callTime: "Afternoon (12:00–16:00)", callNote: "Wants to discuss a client portal.", submittedAt: ago(20) }, created_at: ago(20), updated_at: ago(20) }),
  P({ name: "Lerato's Bakery", email: "hello@leratosbakery.co.za", phone: "079 123 4567", business: "Lerato's Bakery", category: ["Free mockup request"], source: "mockup", goal: "A bakery in Soweto — customers pre-order cakes for weekends.", details: { formType: "Free mockup request", mkAbout: "A bakery in Soweto — customers pre-order cakes for weekends.", mkInclude: "Menu, prices, WhatsApp orders, gallery", mkStyle: "Warm, friendly, lots of photos", submittedAt: ago(5) }, created_at: ago(5), updated_at: ago(5) }),
  P({ name: null, phone: "076 222 3434", business: "Thabo's Car Wash", category: ["Free online check"], source: "website", details: { formType: "Free online check", page: "/pricing", submittedAt: ago(0.2) }, created_at: ago(0.2), updated_at: ago(0.2) }),
  P({ name: "Sipho Ndlovu", phone: "073 555 1212", business: "Sipho's Barbershop", location: "Soweto, Gauteng", category: ["Google profile setup"], source: "website", indicative_price: "R450", details: { formType: "Google profile setup", gbpHas: "Not sure", submittedAt: ago(1) }, created_at: ago(1), updated_at: ago(1) }),
  P({ name: "Pieter Botha", email: "pieter@bothaelectrical.co.za", phone: "082 444 5555", business: "Botha Electrical", location: "Edenvale, Gauteng", category: ["Websites"], status: "prospect", source: "outreach", potential: "very_high", potential_note: "A website", website: null, review_count: 42, rating: 4.7, details: { aiSignal: 'Two Google reviews say "never got back to me"; Facebook shows "typically replies in a day"', aiPotential: "very_high", sizeHint: "4–6 staff",  googleUrl: "https://maps.app.goo.gl/example" }, created_at: ago(10), updated_at: ago(10) }),
  P({ name: "Zanele Nkosi", email: "zanele@nkosibeauty.co.za", business: "Nkosi Beauty Bar", category: ["Websites"], potential: "medium", potential_note: "A new site that works on phones, with online booking", website: "https://nkosibeauty.co.za", status: "contacted", source: "outreach", next_action: "Follow-up 1", next_action_at: ahead(50), details: {}, created_at: ago(80), updated_at: ago(50) }),
  P({ name: "Sipho Dlamini", email: "sipho@bellahair.co.za", phone: "082 000 0000", business: "Bella Hair Studio", category: ["Call request"], source: "call", details: { formType: "Call request", callDay: callDay(1), callTime: "Morning (08:00–12:00)", submittedAt: ago(2) }, created_at: ago(2), updated_at: ago(2) }),
  P({ name: "Dumisani Zulu", email: "dumi@zuluevents.co.za", phone: "073 999 0000", business: "Zulu Events", category: ["Custom Software"], status: "declined", declined_reason: "Budget too small for scope", details: {}, created_at: ago(900), updated_at: ago(800) }),
  P({ name: "SEO Guru", email: "spam@seo-guru.biz", business: "SEO Guru Ltd", category: ["Websites"], goal: "We can rank your site #1!!!", spam: true, archived: true, details: {}, created_at: ago(9), updated_at: ago(9) }),
  P({ name: "Lerato Dube", email: "lerato@dubeattorneys.co.za", phone: "083 222 7788", business: "Dube Attorneys", category: ["AI"], status: "new", source: "website", goal: "Main goal: We dig through documents or manuals to find answers. Suggested: Knowledge assistant.", details: { formType: "AI enquiry", product: "Knowledge assistant" }, created_at: ago(5), updated_at: ago(5) }),
  P({ name: "Zanele Mthembu", email: "zanele@zbeauty.co.za", phone: "072 333 4444", business: "Zee's Beauty Lounge", category: ["Websites"], status: "in_development", deposit_paid: true, quote_cents: 24900, quote_status: "accepted", quote_token: "demo-zee-0000000000000000000000", quote_accepted_at: ago(20), quote_accepted_name: "Zanele Mthembu", quote_choice: "c",
     quote_items: [{ desc: "Quick website: one page", cents: 0 }, { desc: "Care plan: hosting, small changes, Google profile", cents: 0 }, { desc: "Pay monthly: R249 a month for 12 months (the first month now), then Care at R100 a month", cents: 24900 }],
     details: { formType: "Free mockup request", payMonthly: { cents: 24900, months: 12, afterCents: 10000 }, content: { about: "Nails, lashes and brows in Umhlanga. Walk-ins welcome.", services: "Gel overlay, R250\nLash lift, R350\nBrow shape, R120", hours: "Tue–Sat 9:00–18:00", area: "Umhlanga Rocks", extra: "", at: ago(3), files: [{ path: "demo/logo.png", name: "logo.png", type: "image/png", size: 40000 }, { path: "demo/nails.jpg", name: "nails.jpg", type: "image/jpeg", size: 300000 }, { path: "demo/prices.pdf", name: "prices.pdf", type: "application/pdf", size: 90000 }] } }, created_at: ago(200), updated_at: ago(3) }),
];

const events = [];
function ev(project, kind, note, hoursAgo, data = {}) {
  events.push({ id: uid(), project_id: project.id, kind, note, data, created_at: ago(hoursAgo) });
}
for (const p of projects) ev(p, "created", `Submitted from website (${p.details.formType || "Project enquiry"})`, (now - Date.parse(p.created_at)) / 3600e3);
ev(projects[1], "payment", "R500 deposit received", 60, { amount: 50000 });
ev(projects[1], "status", "Talking → Building", 60, { from: "new", to: "in_development" });
ev(projects[1], "note", "Called — wants a one-pager with a services list and a map. Quote R2,000.", 20);
ev(projects[2], "note", "Long call. 12 drivers, Excel per driver. Wants weekly PDF report emailed to ops manager.", 100);
ev(projects[2], "status", "under review → quote sent", 48, { from: "under_review", to: "quote_sent" });
ev(projects[3], "status", "approved → in development", 30, { from: "approved", to: "in_development" });

const payments = [
  { id: uid(), project_id: projects.find((x) => x.business === "Zee's Beauty Lounge").id, client_id: null, provider: "yoco", provider_id: "p_zee", amount_cents: 24900, currency: "ZAR", kind: "deposit", note: "First month", reference: "", email: "zanele@zbeauty.co.za", status: "succeeded", matched: true, created_at: ago(19), paid_at: ago(19) },
  { id: uid(), project_id: projects[1].id, client_id: null, provider: "yoco", provider_id: "p_1", amount_cents: 50000, currency: "ZAR", kind: "deposit", note: null, reference: "RC-00052", email: "thandi@gmail.com", status: "succeeded", matched: true, created_at: ago(60), paid_at: ago(60) },
  { id: uid(), project_id: projects[3].id, client_id: null, provider: "yoco", provider_id: "p_2", amount_cents: 225000, currency: "ZAR", kind: "balance", note: "50% on approval", reference: "RC-00054", email: "naledi@studio.co.za", status: "succeeded", matched: true, created_at: ago(200), paid_at: ago(200) },
  { id: uid(), project_id: null, client_id: null, provider: "yoco", provider_id: "p_3", amount_cents: 50000, currency: "ZAR", kind: "deposit", note: null, reference: "deposit", email: "j.smith@example.com", status: "succeeded", matched: false, created_at: ago(15), paid_at: ago(15) },
  { id: uid(), project_id: projects[4].id, client_id: null, provider: "eft", provider_id: null, amount_cents: 60000, currency: "ZAR", kind: "care", note: "Annual care renewal", reference: null, email: null, status: "succeeded", matched: true, created_at: ago(900), paid_at: ago(900) },
  { id: uid(), project_id: projects[4].id, client_id: null, provider: "eft", provider_id: null, amount_cents: 200000, currency: "ZAR", kind: "balance", note: "Final payment", reference: null, email: null, status: "succeeded", matched: true, created_at: ago(2500), paid_at: ago(2500) },
];
const requests = [
  { id: uid(), project_id: projects[3].id, client_id: null, amount_cents: 225000, kind: "balance", description: "Final 50% on go-live", provider: "yoco", checkout_id: "ch_1", redirect_url: "https://c.yoco.com/checkout/ch_1", status: "open", created_at: ago(30), paid_at: null },
];
ev(projects[4], "time", "Build", 2600, { minutes: 300 });
ev(projects[4], "time", "Revisions", 2500, { minutes: 90 });
ev(projects[3], "time", "Design + build so far", 40, { minutes: 240 });
const clients = [
  { id: uid(), name: "Mike's Plumbing", slug: "mikes-plumbing", care_active: true, care_plan: "care", care_amount_cents: 60000, care_renews_at: new Date(now + 12 * 864e5).toISOString().slice(0, 10), site_label: "mikesplumbing.co.za", report_emails: ["mike@mikesplumbing.co.za"], email: "mike@mikesplumbing.co.za", phone: "082 333 4444", notes: "Prefers WhatsApp. Invoices to accounts@…", created_at: ago(3000) },
  { id: uid(), name: "Naledi Photography", slug: "naledi", care_active: true, care_plan: "hosting", care_amount_cents: 40000, care_renews_at: new Date(now + 300 * 864e5).toISOString().slice(0, 10), site_label: "naledi.co.za", report_emails: [], email: "naledi@studio.co.za", phone: "060 111 2222", notes: null, created_at: ago(500) },
  { id: uid(), name: "Re-Charge", slug: "re-charge", care_active: false, care_plan: null, care_amount_cents: null, care_renews_at: null, site_label: "re-charge.co.za", report_emails: [], email: null, phone: null, notes: null, created_at: ago(5000) },
  { id: uid(), name: "Dube Attorneys AI", slug: "dube-ai", care_active: true, care_plan: "business", care_amount_cents: 30000, billing: "monthly", care_renews_at: new Date(now + 20 * 864e5).toISOString().slice(0, 10), site_label: "", report_emails: [], email: "lerato@dubeattorneys.co.za", phone: "083 222 7788", notes: "AI maintenance & security (document assistant).", created_at: ago(120) },
];
// the limited offer: Botha Electrical (a prospect) is on it
projects.find((p) => p.business === "Botha Electrical").details.offer = "founding";
// a referral: Mike's Plumbing sent Mokoena Plumbing
Object.assign(projects[1], { source: "referral" }); projects[1].details.referredBy = { clientId: clients[0].id, name: clients[0].name };
// an AI client with a live assistant and a baseline, so the impact card has something to show
const dubeClient = clients.find((c) => c.slug === "dube-ai");
const dubeProject = projects.find((p) => p.business === "Dube Attorneys");
Object.assign(dubeProject, { client_id: dubeClient.id, status: "live" });
dubeProject.details.baseline = { metric: "Hours spent answering the same questions", value: 9, unit: "a week", how: "They told us", note: "two paralegals, most of the morning on the phone", at: new Date(now - 90 * 864e5).toISOString() };
dubeProject.details.baseline.hourly = 210;
dubeProject.details.after = { value: 3.5, how: "We counted it", note: "2 weeks after go-live", at: new Date(now - 10 * 864e5).toISOString() };
// a lead part-way through the method: map, scored opportunities, phase 2 done
const methodLead = projects.find((p) => p.business === "Dube Attorneys" && p.status === "new") || projects.find((p) => (p.category || []).includes("AI"));
if (methodLead) methodLead.details.discovery = { phase: 2,
  map: { people: "2 paralegals, 1 receptionist, 3 attorneys approve", processes: "Email in → paralegal reads → checks fee schedule → drafts reply → attorney approves", software: "Outlook, LexisNexis, Excel fee schedule", data: "Fee schedule is current; FICA checklist in Word", bottlenecks: "Replies wait for attorney approval, often a day", repetitive: "Same 6 questions on transfer fees and documents", decisions: "Attorney approves any quote over R50k" },
  opps: [{ name: "Prepare replies to transfer enquiries", time: 8, revenue: 6, difficulty: 4, data: 8, risk: 4, adoption: 8 }, { name: "Answer FICA document questions", time: 5, revenue: 2, difficulty: 2, data: 7, risk: 2, adoption: 7 }, { name: "Auto-draft engagement letters", time: 6, revenue: 3, difficulty: 6, data: 3, risk: 7, adoption: 5 }] };
const liveAssistants = [{ id: uid(), slug: "dube-attorneys-7f2a", business: "Dube Attorneys", knowledge: "Office hours Mon-Fri 8:00-16:30.", kind: "live", client_id: dubeClient.id, project_id: dubeProject.id, views: 46, created_at: ago(2000), updated_at: ago(300) }];
const monitors = [
  { url: "https://re-charge.co.za/", label: "re-charge.co.za (our website)", client_id: null, status: "up", since: new Date(now - 9 * 864e5).toISOString(), fail_count: 0, last_checked: new Date(now - 4 * 6e4).toISOString(), last_ms: 420, last_http: 200, last_error: null },
  ...clients.filter((c) => c.site_label && c.site_label !== "re-charge.co.za").map((c, i) => ({ url: `https://${c.site_label}/`, label: `${c.site_label} (${c.name})`, client_id: c.id, status: i === 0 ? "down" : "up", since: new Date(now - (i === 0 ? 38 : 9 * 1440) * 6e4).toISOString(), fail_count: i === 0 ? 4 : 0, last_checked: new Date(now - 4 * 6e4).toISOString(), last_ms: i === 0 ? 20000 : 610, last_http: i === 0 ? null : 200, last_error: i === 0 ? "No answer within 20 seconds" : null })),
];

const templates = [];
const messages = [];
const mockPush = [];
const settings = { offer: { active: true, code: "founding", total: 10, ends: "2026-11-30", discount: 50 }, autobuild: { auto_queue: false }, profile: { my_name: "Révan", reply_to: "enquiry.re.charge@gmail.com", whatsapp: "27722375833", bcc_me: true, signature: "Revan\nRe-Charge · re-charge.co.za\nWhatsApp 072 237 5833", review_link: "", deposit_link: "https://pay.yoco.com/r/pvvar8" } };
projects[4].client_id = clients[0].id; projects[3].client_id = clients[1].id;
projects[4].details = { ...projects[4].details, liveAt: ago(30) };   // launch pack is due
projects[3].details = { ...projects[3].details, liveAt: ago(24 * 5), launchSent: ago(24 * 4) };   // review is due
const campaigns = [
  { id: uid(), name: "Durban salons — September", code: "fb-durban-salons", goal: "10 mockup requests", audience: "Hair & beauty salons in Durban with no website", channels: ["facebook", "instagram"], status: "active", starts_on: new Date(now - 10 * 864e5).toISOString().slice(0, 10), ends_on: new Date(now + 20 * 864e5).toISOString().slice(0, 10), budget_cents: 150000, spend_cents: 42000, reach: 8400, clicks: 96, notes: null, created_at: ago(240), updated_at: ago(240) },
  { id: uid(), name: "Plumbers cold email", code: "outreach-plumbers", goal: "Book 5 calls", audience: "Plumbers on Google Maps, Gauteng", channels: ["email"], status: "planned", starts_on: null, ends_on: null, budget_cents: 0, spend_cents: 0, reach: null, clicks: null, notes: "List from Maps, 40 businesses", created_at: ago(20), updated_at: ago(20) },
];
projects[0].channel = "fb-durban-salons"; projects[9].channel = "fb-durban-salons"; projects[6].channel = "fb-durban-salons";
const posts = [
  { id: uid(), campaign_id: campaigns[0].id, title: "Before/after: Bella Hair mockup", channel: "facebook", body: "Salon owners: still taking bookings on WhatsApp and losing track?\n\nHere's a free mockup we built for a Durban salon in 2 days — prices, gallery, and a Book button that lands in their WhatsApp.\n\nWant one for your salon? It's free, no obligation: {{link}}", hashtags: "#durban #salon #smallbusiness", link: "https://re-charge.co.za/", image_path: null, status: "scheduled", scheduled_at: new Date(now + 2 * 864e5).toISOString(), posted_at: null, post_url: null, results: {}, created_at: ago(30), updated_at: ago(30) },
  { id: uid(), campaign_id: campaigns[0].id, title: "3 things every salon site needs", channel: "instagram", body: "1. Prices people can find in 5 seconds\n2. A gallery that loads fast on a phone\n3. One tap to book on WhatsApp\n\nFree mockup for your salon → link in bio", hashtags: "#salonlife #durbanbusiness", link: "https://re-charge.co.za/", image_path: null, status: "posted", scheduled_at: new Date(now - 5 * 864e5).toISOString(), posted_at: new Date(now - 5 * 864e5).toISOString(), post_url: "https://instagram.com/p/demo", results: { reach: 1200, likes: 43, clicks: 18 }, created_at: ago(200), updated_at: ago(120) },
  { id: uid(), campaign_id: null, title: "Why R500 deposit, refundable", channel: "linkedin", body: "Idea: explain the refundable deposit — why it protects both sides.", hashtags: null, link: null, image_path: null, status: "idea", scheduled_at: null, posted_at: null, post_url: null, results: {}, created_at: ago(50), updated_at: ago(50) },
];
const sites = [
  { id: uid(), name: "Booking demo", slug: "booking", kind: "demo", status: "published", listed: true, url: "https://re-charge.co.za/demos#booking", project_id: null, client_id: null, description: "Salon booking flow shown on the demos page.", notes: null, screenshot_path: null, files: ["index.html", "app.js"], bytes: 48211, commit_sha: "abc1234", published_at: ago(3000), created_at: ago(3000), updated_at: ago(3000) },
  { id: uid(), name: "Bella Hair Studio — mockup", slug: "bella-hair-7k2q", kind: "mockup", status: "published", listed: false, url: "https://re-charge.co.za/previews/bella-hair-7k2q/", project_id: projects[0].id, client_id: null, description: "Free mockup: services, gallery, WhatsApp booking.", notes: "Sent 2 days ago, waiting for feedback.", screenshot_path: null, files: ["index.html", "styles.css", "img/hero.jpg"], bytes: 512000, commit_sha: "def5678", published_at: ago(48), created_at: ago(60), updated_at: ago(48) },
  { id: uid(), name: "Mike's Plumbing", slug: "mikes-plumbing", kind: "client_site", status: "published", listed: false, url: "https://mikesplumbing.co.za", project_id: projects[4].id, client_id: clients[0].id, description: "Live client site, Hosting & Care plan.", notes: null, screenshot_path: null, files: [], bytes: 0, commit_sha: null, published_at: ago(2800), created_at: ago(2900), updated_at: ago(700) },
  { id: uid(), name: "VDM Logistics — dashboard preview", slug: "vdm-dash-x91p", kind: "preview", status: "draft", listed: false, url: null, project_id: projects[2].id, client_id: null, description: "Driver deliveries dashboard, sample data.", notes: null, screenshot_path: null, files: [], bytes: 0, commit_sha: null, published_at: null, created_at: ago(10), updated_at: ago(10) },
];
const clone = (x) => JSON.parse(JSON.stringify(x));
let session = new URLSearchParams(location.search).get("out") === "1" ? null : { user: { id: "demo-user", email: "you@re-charge.co.za" }, access_token: "demo" };
const listeners = [];

// Mirrors of the database triggers in 0012, so demo mode behaves like the real thing.
const STAGE_NAME = { prospect: "To contact", contacted: "Contacted", new: "Talking", quote_sent: "Quoted", in_development: "Building", live: "Live", declined: "Lost" };
function normalizeStage(n, o) {
  const m = { under_review: "new", clarification: "new", client_review: "in_development", final_payment: "in_development", care: "live" };
  if (m[n.status]) n.status = m[n.status];
  if (n.status === "approved") n.status = n.deposit_paid ? "in_development" : "quote_sent";
  if (n.status === "deposit_paid") n.status = n.quote_cents != null ? "in_development" : "new";
  if (o) {
    if (n.quote_status === "sent" && o.quote_status !== "sent" && ["prospect", "contacted", "new"].includes(n.status)) n.status = "quote_sent";
    if (n.quote_status === "declined" && o.quote_status !== "declined" && ["prospect", "contacted", "new", "quote_sent"].includes(n.status)) { n.status = "declined"; n.declined_reason = n.declined_reason || n.quote_decline_reason || "Declined the quote online"; }
  }
  if (n.deposit_paid && !(o && o.deposit_paid) && (n.status === "quote_sent" || (["prospect", "contacted", "new"].includes(n.status) && n.quote_cents != null))) n.status = "in_development";
  return n;
}
function paymentEffects(r) {
  if (r.status !== "succeeded") return;
  const proj = r.project_id && projects.find((x) => x.id === r.project_id);
  const cid = r.client_id || proj?.client_id;
  if (r.kind === "deposit" && proj && !proj.deposit_paid) { const next = normalizeStage({ ...proj, deposit_paid: true }, proj); if (next.status !== proj.status) ev(proj, "status", `${STAGE_NAME[proj.status]} → ${STAGE_NAME[next.status]}`, 0, {}); Object.assign(proj, next); }
  if (r.provider !== "yoco") { const q = requests.find((x) => x.status === "open" && x.kind === r.kind && x.amount_cents === r.amount_cents && ((r.project_id && x.project_id === r.project_id) || (cid && x.client_id === cid))); if (q) { q.status = "paid"; q.paid_at = r.paid_at; } }
  const c = cid && clients.find((x) => x.id === cid);
  if (r.kind === "care" && c && (!c.care_renews_at || Date.parse(c.care_renews_at) <= Date.now() + 90 * 86400e3)) {
    const base = !c.care_renews_at || Date.parse(c.care_renews_at) < Date.now() - 60 * 86400e3 ? new Date() : new Date(c.care_renews_at);
    base.setFullYear(base.getFullYear() + 1); c.care_renews_at = base.toISOString().slice(0, 10); c.care_active = true;
  }
}

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
        const next = normalizeStage({ ...p, ...patch }, p);   // same rules as the database trigger (0012)
        if (next.status !== p.status) ev(p, "status", `${STAGE_NAME[p.status] || p.status} → ${STAGE_NAME[next.status] || next.status}`, 0, { from: p.status, to: next.status, reason: next.declined_reason ?? null });
        Object.assign(p, next, { updated_at: new Date().toISOString() });
        return clone(p);
      },
      async insert(row) { const p = P({ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); projects.unshift(p); ev(p, "created", "Added manually", 0); return clone(p); },
      async remove(id) { const i = projects.findIndex((x) => x.id === id); if (i >= 0) projects.splice(i, 1); return null; },
      async insertMany(rows) { return rows.map((row) => { const p = P({ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); projects.unshift(p); ev(p, "created", "Added from outreach import", 0); return clone(p); }); },
    },
    events: {
      async list(projectId) { return clone(events.filter((e) => e.project_id === projectId).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
      async insert(projectId, kind, note, data = {}) { const e = { id: uid(), project_id: projectId, kind, note, data, created_at: new Date().toISOString() }; events.push(e); return clone(e); },
      async recent(limit = 25) {
        return clone(events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
          .map((e) => { const p = projects.find((x) => x.id === e.project_id); return { ...e, projects: p ? { ref: p.ref, business: p.business, name: p.name } : null }; }));
      },
      async insertMany(rows) { return rows.map((r) => ({ id: uid() })); },
      async byKind(kind) { return clone(events.filter((e) => e.kind === kind).map((e) => ({ project_id: e.project_id, note: e.note, data: e.data, created_at: e.created_at }))); },
      async searchNotes(q) { const s = q.toLowerCase(); return clone(events.filter((e) => e.kind === "note" && (e.note || "").toLowerCase().includes(s)).map((e) => ({ project_id: e.project_id, note: e.note }))); },
    },
    payments: {
      async list() { return clone(payments).sort((a, b) => b.paid_at.localeCompare(a.paid_at)); },
      async match(id, projectId, clientId = null) { const p = payments.find((x) => x.id === id); p.project_id = projectId || null; p.client_id = clientId || p.client_id || null; p.matched = true; paymentEffects(p); return clone(p); },
      async insert(row) { const r = { id: uid(), provider: "eft", provider_id: null, currency: "ZAR", status: "succeeded", matched: true, created_at: new Date().toISOString(), paid_at: new Date().toISOString(), ...row }; payments.unshift(r); paymentEffects(r); return clone(r); },
      async setKind(id, kind) { const p = payments.find((x) => x.id === id); p.kind = kind; return clone(p); },
      async remove(id) { const i = payments.findIndex((x) => x.id === id); if (i >= 0) payments.splice(i, 1); return null; },
    },
    requests: {
      async list() { return clone(requests); },
      async cancel(id) { const r = requests.find((x) => x.id === id); r.status = "cancelled"; return clone(r); },
    },
    clients: {
      async list() { return clone(clients); },
      async insert(row) { const c = { id: uid(), care_active: false, care_plan: null, care_amount_cents: null, care_renews_at: null, report_emails: [], site_label: null, email: null, phone: null, notes: null, created_at: new Date().toISOString(), ...row }; clients.push(c); return clone(c); },
      async update(id, patch) { const c = clients.find((x) => x.id === id); Object.assign(c, patch); return clone(c); },
      async remove(id) { const i = clients.findIndex((x) => x.id === id); if (i >= 0) clients.splice(i, 1); return null; },
    },
    spam: { async add() { return []; } },
    templates: {
      async list() { return clone(templates); },
      async insert(row) { const t = { id: uid(), archived: false, meta: {}, subject: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }; templates.push(t); return clone(t); },
      async update(id, patch) { const t = templates.find((x) => x.id === id); Object.assign(t, patch, { updated_at: new Date().toISOString() }); return clone(t); },
      async remove(id) { const i = templates.findIndex((x) => x.id === id); if (i >= 0) templates.splice(i, 1); return null; },
    },
    messages: {
      async list(projectId) { return clone(messages.filter((m) => m.project_id === projectId).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
      async recent(sinceIso) { return clone(messages.filter((m) => m.created_at >= sinceIso)); },
      async insert(row) { const m = { id: uid(), status: "sent", provider_id: null, meta: {}, created_at: new Date().toISOString(), ...row }; messages.push(m); return clone(m); },
    },
    campaigns: {
      async list() { return clone(campaigns); },
      async insert(row) { const c = { id: uid(), spend_cents: 0, status: "planned", channels: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }; campaigns.unshift(c); return clone(c); },
      async update(id, patch) { const c = campaigns.find((x) => x.id === id); Object.assign(c, patch, { updated_at: new Date().toISOString() }); return clone(c); },
      async remove(id) { const i = campaigns.findIndex((x) => x.id === id); if (i >= 0) campaigns.splice(i, 1); return null; },
    },
    posts: {
      async list() { return clone(posts); },
      async insert(row) { const p = { id: uid(), status: "idea", results: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }; posts.unshift(p); return clone(p); },
      async update(id, patch) { const p = posts.find((x) => x.id === id); Object.assign(p, patch, { updated_at: new Date().toISOString() }); return clone(p); },
      async remove(id) { const i = posts.findIndex((x) => x.id === id); if (i >= 0) posts.splice(i, 1); return null; },
    },
    sites: {
      async list() { return clone(sites); },
      async insert(row) { const x = { id: uid(), status: "draft", listed: false, files: [], bytes: 0, commit_sha: null, published_at: null, url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }; sites.unshift(x); return clone(x); },
      async update(id, patch) { const x = sites.find((s) => s.id === id); Object.assign(x, patch, { updated_at: new Date().toISOString() }); return clone(x); },
      async remove(id) { const i = sites.findIndex((s) => s.id === id); if (i >= 0) sites.splice(i, 1); return null; },
    },
    async publishSite(payload) {
      await new Promise((r) => setTimeout(r, 500));
      const x = sites.find((s) => s.id === payload.siteId); if (!x) throw new Error("unknown site");
      if (payload.action === "publish") { Object.assign(x, { status: "published", url: `https://re-charge.co.za/previews/${x.slug}/`, files: payload.files.map((f) => f.path), bytes: payload.files.reduce((a, f) => a + Math.floor(f.content.length * 3 / 4), 0), commit_sha: "demo" + uid().slice(0, 5), published_at: new Date().toISOString() }); const p = projects.find((q) => q.id === x.project_id); if (p) { p.preview_url = x.url; ev(p, "note", `Preview published: ${x.url}`, 0); } return { ok: true, url: x.url, commit: x.commit_sha, files: x.files.length, removed: 0 }; }
      Object.assign(x, { status: "unpublished", files: [], bytes: 0 }); return { ok: true, url: null, removed: 1 };
    },
    branding: {
      async upload(blob) { return URL.createObjectURL(blob); },
      async remove() {},
    },
    demos: {
      _rows: liveAssistants,
      async forProject(projectId) { return clone(this._rows.find((d) => d.project_id === projectId) || null); },
      async forClient(clientId) { return clone(this._rows.filter((d) => d.client_id === clientId)); },
      async upsert(row) {
        const i = this._rows.findIndex((d) => d.id === row.id);
        if (i >= 0) { Object.assign(this._rows[i], row); return clone(this._rows[i]); }
        const r = { id: uid(), views: 0, kind: "demo", client_id: null, created_at: new Date().toISOString(), ...row };
        this._rows.push(r); return clone(r);
      },
    },
    usage: {
      async since(scopes) { return scopes.length ? { convos: 14, questions: 38, afterHours: 22, days: 19 } : { convos: 0, questions: 0, afterHours: 0, days: 0 }; },
    },
    analytics: {
      async cached(clientId, range) { const c = clients.find((x) => x.id === clientId); return c && c.site_label === "mikesplumbing.co.za" && range === "365d" ? [{ kind: "ga4", payload: { overview: { users: 12400 }, events: [{ name: "contact-whatsapp", count: 300 }, { name: "click-call", count: 112 }] } }, { kind: "gsc", payload: { totals: { clicks: 3120, impressions: 86300 } } }] : []; },
    },
    content: {
      async url(path) { const hue = path.length * 37 % 360; return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="hsl(${hue},55%,55%)"/><text x="150" y="110" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${path.split("/").pop()}</text></svg>`); },
    },
    storage: {
      _urls: {},
      async upload(file, folder = "posts") { const path = folder + "/demo-" + uid() + ".png"; this._urls[path] = URL.createObjectURL(file); return path; },
      async url(path) { return this._urls[path] || ""; },
      async copy(path) { const to = "posts/copy-" + uid() + ".png"; this._urls[to] = this._urls[path]; return to; },
      async remove(path) { delete this._urls[path]; return null; },
    },
    settings: {
      async get(key) { return clone(settings[key] ?? null); },
      async set(key, value) { settings[key] = clone(value); return { value: clone(value) }; },
    },
    async finder(action, config) {
      await new Promise((r) => setTimeout(r, 250));
      if (action === "status") return { ok: true, ready: Boolean(settings.finder), config: settings.finder || { areas: ["Illiondale", "Edenvale", "Eastleigh, Edenvale", "Eden Glen", "Sebenza", "De Klerkshof", "Isando", "Spartan, Kempton Park", "Greenstone Hill", "Dowerglen", "Bedfordview"], types: ["Hair salons, barbers, beauty & nail salons", "Plumbers, electricians, builders, painters, pool services", "Mechanics, panel beaters, tyre shops", "Engineering, steel fabrication, welding"], perRun: 20, enabled: true }, last: settings.finder_last || null };
      if (action === "setup" || action === "config") { const base = settings.finder || { areas: ["Illiondale", "Edenvale", "Eastleigh, Edenvale", "Eden Glen", "Sebenza", "De Klerkshof", "Isando", "Spartan, Kempton Park", "Greenstone Hill", "Dowerglen", "Bedfordview"], types: ["Hair salons, barbers, beauty & nail salons", "Plumbers, electricians, builders, painters, pool services", "Mechanics, panel beaters, tyre shops", "Engineering, steel fabrication, welding"], perRun: 20, enabled: true }; settings.finder = { ...base, ...(config || {}), v: 1, updatedAt: new Date().toISOString() }; return { ok: true, created: action === "setup", config: settings.finder }; }
      return { ok: true, added: 0, skipped: 0, files: 0, errors: [] };
    },
    async report(clientId, dryRun) { await new Promise((r) => setTimeout(r, 300)); const c = clients.find((x) => x.id === clientId); if (!dryRun) { c.last_report_at = new Date().toISOString(); return { ok: true, results: [{ client: clientId, status: "sent", to: c.report_emails.length ? c.report_emails : [c.email] }] }; }
      return { ok: true, results: [{ client: clientId, status: "preview", subject: `${c.site_label}: your monthly website report`, html: `<div style="font:14px Arial;padding:20px"><b>RE-CHARGE</b><h1 style="font-size:20px">${c.site_label}</h1><p>Your site was online the whole time and loaded in 0.6 s on average. We check it every 10 minutes.</p><p>Online: 100% · Average load time: 0.6 s · Outages: None</p><p style="color:#888">Demo preview</p></div>` }] }; },
    async checkSites() { await new Promise((r) => setTimeout(r, 400)); for (const m of monitors) m.last_checked = new Date().toISOString(); return { ok: true, checked: monitors.length, down: monitors.filter((m) => m.status === "down").length }; },
    monitors: {
      async list() { return clone(monitors); },
      async history(url) {   // a week of 10-minute checks with one outage
        const out = [], end = Date.now(), m = monitors.find((x) => x.url === url);
        for (let t = end - 7 * 864e5; t <= end; t += 6e5) { const outage = (end - t) > 2 * 864e5 && (end - t) < 2 * 864e5 + 3 * 36e5; const down = m?.status === "down" && end - t < 40 * 6e4; out.push({ checked_at: new Date(t).toISOString(), ok: !(outage || down), ms: 400 + Math.round(Math.random() * 500), http: outage || down ? 503 : 200, error: outage || down ? "The site answered with error 503" : null }); }
        return out;
      },
    },
    async buildSync(payload) {
      await new Promise((r) => setTimeout(r, 200));
      let pushed = 0; for (const p of projects) if (p.build_status === "queued" && (!payload.projectId || p.id === payload.projectId)) { p.build_status = "building"; p.build_started_at = new Date().toISOString(); pushed++; }
      return { ok: true, pushed, pulled: 0, errors: [] };
    },
    async requestPayment(payload) {
      await new Promise((r) => setTimeout(r, 300));
      const r = { id: uid(), project_id: payload.projectId ?? null, client_id: payload.clientId ?? null, amount_cents: payload.amountCents, kind: payload.kind || "balance", description: payload.description || null, provider: "yoco", checkout_id: "ch_" + uid().slice(0, 6), redirect_url: "https://c.yoco.com/checkout/demo-" + uid().slice(0, 8), status: "open", created_at: new Date().toISOString(), paid_at: null };
      requests.unshift(r);
      const p = projects.find((x) => x.id === payload.projectId); if (p) ev(p, "payment", `Payment link created: R${Math.round(payload.amountCents / 100)} (${r.kind}) — ${r.description || ""}`, 0, { requestId: r.id });
      return { ok: true, redirectUrl: r.redirect_url, checkoutId: r.checkout_id, requestId: r.id };
    },
    async push(action, payload = {}) {
      // demo: a real-looking P-256 public key so the browser can subscribe; nothing is sent
      if (action === "key") return { ok: true, publicKey: "BPkBqa2d05FneREdC4ME-T4nwvCN-0BJNyBMTIF643FRzZ30vgqUk2OkJlpZyGZUkC0Rh695lQ0-dMGoAGq7zXw" };
      if (action === "list") return { ok: true, devices: mockPush.slice() };
      if (action === "subscribe") { mockPush.push({ endpoint: payload.subscription?.endpoint, label: payload.label, created_at: new Date().toISOString() }); return { ok: true }; }
      if (action === "unsubscribe") { const i = mockPush.findIndex((d) => d.endpoint === payload.endpoint); if (i >= 0) mockPush.splice(i, 1); return { ok: true }; }
      if (action === "test") return { ok: true, sent: mockPush.length, failed: 0, removed: 0 };
      return { ok: false };
    },
    async sendEmail(payload) {
      await new Promise((r) => setTimeout(r, 400));
      const m = { id: uid(), project_id: payload.projectId ?? null, kind: "email", to_address: payload.to, subject: payload.subject, body: payload.text, template_id: payload.templateId ?? null, provider_id: "demo_" + uid(), status: "sent", meta: {}, created_at: new Date().toISOString() };
      messages.push(m);
      if (payload.projectId) { const p = projects.find((x) => x.id === payload.projectId); if (p) ev(p, "email", `Email sent: "${payload.subject}"`, 0, { message_id: m.id, to: payload.to }); }
      return { ok: true, id: m.provider_id, messageId: m.id };
    },
  };
}
