// Demo data layer (no network). Loaded only when the page is opened with
// ?mock=1 — used to develop and screenshot the panel. Never touches Supabase.
const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();
const ahead = (h) => new Date(now + h * 3600e3).toISOString();
// Seeded IDs: the same demo rows get the same IDs on every load, so the command centre's side panel
// (a second copy of the panel) can open them. New rows made in the demo get random ones.
let _seq = 0, _seeding = true;
const uid = () => _seeding ? "demo" + String(++_seq).padStart(6, "0") : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

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
  P({ name: "Pieter Botha", email: "pieter@bothaelectrical.co.za", phone: "082 444 5555", business: "Botha Electrical", location: "Edenvale, Gauteng", category: ["Websites"], status: "prospect", source: "outreach", potential: "very_high", potential_note: "A website", website: "https://facebook.com/bothaelectrical", review_count: 42, rating: 4.7, details: { aiSignal: 'Two Google reviews say "never got back to me"; Facebook shows "typically replies in a day"', aiPotential: "very_high", sizeHint: "4–6 staff",  googleUrl: "https://maps.app.goo.gl/example" }, created_at: ago(10), updated_at: ago(10) }),
  P({ name: null, email: "info@kemptonvets-example.co.za", phone: "011 970 1234", business: "Kempton Vet Clinic", location: "Kempton Park, Gauteng", category: ["Websites"], status: "prospect", source: "outreach", website: "https://kemptonvets-example.co.za", review_count: 210, rating: 4.6, details: { formType: "Prospect finder", finderType: "Vets", sizeHint: "10+ staff" }, created_at: ago(30) }),
  P({ name: null, email: null, phone: "082 555 0101", business: "Sunrise Nails", location: "Edenvale, Gauteng", category: ["Websites"], status: "prospect", source: "outreach", website: null, review_count: 9, rating: 4.9, details: { formType: "Prospect finder", finderType: "Nail salons" }, created_at: ago(20) }),
  P({ name: "Zanele Nkosi", email: "zanele@nkosibeauty.co.za", business: "Nkosi Beauty Bar", category: ["Websites"], potential: "medium", potential_note: "A new site that works on phones, with online booking", website: "https://nkosibeauty.co.za", status: "contacted", source: "outreach", next_action: "Follow-up 1", next_action_at: ahead(50), details: {}, created_at: ago(80), updated_at: ago(50) }),
  P({ name: "Sipho Dlamini", email: "sipho@bellahair.co.za", phone: "082 000 0000", business: "Bella Hair Studio", category: ["Call request"], source: "call", details: { formType: "Call request", callDay: callDay(1), callTime: "Morning (08:00–12:00)", submittedAt: ago(2) }, created_at: ago(2), updated_at: ago(2) }),
  P({ name: "Dumisani Zulu", email: "dumi@zuluevents.co.za", phone: "073 999 0000", business: "Zulu Events", category: ["Custom Software"], status: "declined", declined_reason: "Budget too small for scope", details: {}, created_at: ago(900), updated_at: ago(800) }),
  P({ name: "SEO Guru", email: "spam@seo-guru.biz", business: "SEO Guru Ltd", category: ["Websites"], goal: "We can rank your site #1!!!", spam: true, archived: true, details: {}, created_at: ago(9), updated_at: ago(9) }),
  P({ name: "Thandi Mokoena", email: "thandi@mokoena.co.za", phone: "082 444 1200", business: "Mokoena Inc", category: ["AI process automation"], status: "new", source: "website", goal: "Time goes on: Enquiries & email, Quotes & proposals. Roughly 15–40 hours a week. Team of 6–20. Two people spend most mornings answering quote requests.", details: { formType: "Process review", where: "Enquiries & email, Quotes & proposals", team: "6–20", hours: "15–40" }, created_at: ago(0.05), updated_at: ago(0.05) }),
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
const settings = { offer: { active: true, code: "founding", total: 10, ends: "2026-11-30", discount: 50 }, autobuild: { auto_queue: false }, profile: { my_name: "Alex", reply_to: "enquiry.re.charge@gmail.com", whatsapp: "27722375833", bcc_me: true, signature: "Alex\nRe-Charge · re-charge.co.za\nWhatsApp 072 237 5833", review_link: "", deposit_link: "https://pay.yoco.com/r/pvvar8" } };
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

// The Today side panel is a second copy of the panel in an iframe, with its own copy of this module. So work done in
// one shows in the other, the demo data is kept in sessionStorage for this tab: the page starts it fresh on every
// load (a reload still resets the demo), the panel reads it, and each side picks up the other's changes before any call.
const STATE_KEY = "rc-mock-state", STATE_V = "rc-mock-v";
const EMBEDDED = new URLSearchParams(location.search).get("embed") === "1";
function shareState(api) {
  const store = (() => { try { const t = window.sessionStorage; t.getItem(STATE_V); return t; } catch { return null; } })();
  if (!store) return api;
  const arrays = () => ({ projects, events, payments, requests, clients, templates, messages, campaigns, posts, sites, monitors, mockPush, calls: api.calls._rows, expenses: api.expenses._rows, liveDemos: api.liveDemos._rows, inbox: api.inbox._rows, drafts: api.inbox._drafts, assistants: api.demos._rows });
  let mine = "", last = "";
  const snapshot = () => JSON.stringify({ a: arrays(), settings, fb: api._fb, jobs: api._aiJobs });
  const push = () => { try { const j = snapshot(); if (j === last) return; last = j; mine = Date.now().toString(36) + Math.random().toString(36).slice(2); store.setItem(STATE_KEY, j); store.setItem(STATE_V, mine); } catch (e) { /* full or blocked: the demo just isn't shared */ } };
  const pull = () => { try {
    const v = store.getItem(STATE_V); if (!v || v === mine) return;
    const st = JSON.parse(store.getItem(STATE_KEY) || "null"); if (!st) return;
    const now = arrays(); for (const [k, arr] of Object.entries(now)) if (Array.isArray(st.a[k])) arr.splice(0, arr.length, ...st.a[k]);
    for (const k of Object.keys(settings)) delete settings[k]; Object.assign(settings, st.settings || {});
    api._fb = st.fb || null; if (st.jobs) Object.assign(api._aiJobs, st.jobs);
    mine = v; last = snapshot();
  } catch (e) { console.warn("demo state", e); } };
  const wrap = (obj) => { for (const k of Object.keys(obj)) { const f = obj[k]; if (typeof f === "function") obj[k] = async function (...args) { pull(); try { return await f.apply(this, args); } finally { push(); } }; else if (f && typeof f === "object" && !Array.isArray(f) && !k.startsWith("_")) wrap(f); } };
  if (EMBEDDED) pull(); else { try { store.removeItem(STATE_KEY); store.removeItem(STATE_V); } catch {} }
  wrap(api); push();
  return api;
}

export async function createApi() {
  _seeding = false;
  const api = {
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
        if (patch.details) { const det = { ...patch.details }; for (const k of ["trialResult", "trialResultAt", "trialTermsAt", "trialTermsBy", "trialPayMethod", "trialEftNotifiedAt", "refundRequestedAt", "refundReason", "keepRequestedAt", "keepPaidAt", "salesDesk"]) { if (p.details && k in p.details) det[k] = p.details[k]; else delete det[k]; } patch = { ...patch, details: det }; }   // as api.js: server keys stay as they are
        const next = normalizeStage({ ...p, ...patch }, p);   // same rules as the database trigger (0012)
        if (next.status !== p.status) ev(p, "status", `${STAGE_NAME[p.status] || p.status} → ${STAGE_NAME[next.status] || next.status}`, 0, { from: p.status, to: next.status, reason: next.declined_reason ?? null });
        Object.assign(p, next, { updated_at: new Date().toISOString() });
        return clone(p);
      },
      async mergeDetails(id, patch) {
        const p = projects.find((x) => x.id === id); if (!p) throw new Error("not found");
        const det = { ...(p.details || {}), ...patch }; for (const k of Object.keys(patch)) if (patch[k] === null) delete det[k];
        p.details = det; p.updated_at = new Date().toISOString(); return clone(p);
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
    calls: {
      _rows: [],
      async list(projectId) { return clone(this._rows.filter((c) => !projectId || c.project_id === projectId)); },
      async create(row) {
        const r = { id: uid(), status: "queued", created_at: new Date().toISOString(), ...row }; this._rows.unshift(r);
        // pretend the office PC picks it up and finishes it
        setTimeout(() => { r.status = "working"; }, 1500);
        setTimeout(() => { const p = projects.find((x) => x.id === r.project_id); Object.assign(r, { status: "done", seconds: 312, done_at: new Date().toISOString(), transcript: "Hi, thanks for calling back. So we've got about forty clients who keep emailing for the same documents...\nRight, and you'd want them to log in and download it themselves?\nExactly. Budget is around sixty thousand. Can you send a quote by Friday?\nYes, I'll have it to you by Friday.", summary: { summary: `${p?.business || "They"} want a client portal so about 40 clients can download their own documents.`, wants: "A client portal for document downloads", decisions: ["Quote to be sent by Friday"], actions: ["Write and send the quote", "Ask which accounting system they use"], next_step: "Send the quote by Friday", prices: ["Budget around R60,000"], follow_up: "Friday" } }); }, 5000);
        return clone(r);
      },
      async retry(id) { const r = this._rows.find((x) => x.id === id); r.status = "queued"; return clone(r); },
      async remove(id) { const i = this._rows.findIndex((x) => x.id === id); if (i >= 0) this._rows.splice(i, 1); return null; },
      async upload(blob, name) { return "demo/" + (name || "call.webm"); },
      async audioUrl() { return ""; }, async removeAudio() { return null; },
    },
    expenses: {
      _rows: [
        { id: uid(), spent_on: ago(24 * 3).slice(0, 10), supplier: "Supabase Inc", amount_cents: 46800, vat_cents: null, currency: "ZAR", category: "hosting", invoice_no: "INV-2291", note: "Pro plan", file_path: null, read_by: "local", created_at: ago(72) },
        { id: uid(), spent_on: ago(24 * 9).slice(0, 10), supplier: "Anthropic", amount_cents: 18350, vat_cents: null, currency: "ZAR", category: "ai", invoice_no: "AN-55102", note: "API usage", file_path: null, read_by: "local", created_at: ago(216) },
        { id: uid(), spent_on: ago(24 * 20).slice(0, 10), supplier: "Afrihost", amount_cents: 69900, vat_cents: 9117, currency: "ZAR", category: "hosting", invoice_no: "AF-88121", note: "Fibre", file_path: null, read_by: "manual", created_at: ago(480) },
      ],
      async list() { return clone(this._rows); },
      async insert(row) { const r = { id: uid(), created_at: new Date().toISOString(), currency: "ZAR", ...row }; this._rows.unshift(r); return clone(r); },
      async remove(id) { const i = this._rows.findIndex((x) => x.id === id); if (i >= 0) this._rows.splice(i, 1); return null; },
    },
    docs: { async upload(file) { return "demo/" + file.name; }, async url() { return "#"; }, async remove() { return null; } },
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
    liveDemos: {
      _rows: [],
      async forProject(projectId) { return clone(this._rows.filter((d) => d.project_id === projectId)); },
      async create(row) { const r = { id: uid(), kind: "email", config: {}, data: null, views: 0, last_viewed_at: null, created_at: new Date().toISOString(), ...row }; this._rows.unshift(r); return clone(r); },
      async update(id, patch) { const r = this._rows.find((d) => d.id === id); Object.assign(r, patch); return clone(r); },
      async remove(id) { this._rows = this._rows.filter((d) => d.id !== id); return null; },
    },
    inbox: {
      _rows: [], _drafts: [],
      async list() { return clone(this._rows); },
      async allDrafts(sinceIso) { return clone(this._drafts.filter((d) => d.created_at >= sinceIso)); },
      async forProject(projectId) { return clone(this._rows.find((a) => a.project_id === projectId) || null); },
      async create(row) { const r = { id: uid(), status: "pending", knowledge: "", signoff: "", baseline_minutes: 6, check_minutes: 1, target_hours: 5, email: null, trial_started_at: null, last_run_at: null, last_error: null, created_at: new Date().toISOString(), ...row }; this._rows.push(r); return clone(r); },
      async update(id, patch) { const r = this._rows.find((a) => a.id === id); Object.assign(r, patch); return clone(r); },
      async remove(id) { this._rows = this._rows.filter((a) => a.id !== id); this._drafts = this._drafts.filter((d) => d.account_id !== id); return null; },
      _examples: {},
      async examples(accountId) { return this._examples[accountId] ?? (this._rows.find((a) => a.id === accountId)?.provider === "page" ? 7 : 0); },
      async forgetExamples(accountId) { this._examples[accountId] = 0; return null; },
      async drafts(accountId) { return clone(this._drafts.filter((d) => d.account_id === accountId)); },
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
    async wins(clientId, kind, dryRun) { const c = clients.find((x) => x.id === clientId); return { ok: true, results: [{ client: clientId, kind, status: "preview", to: [c.email], subject: c.name + ": 63 questions answered by AI this week", text: "Hi there,\n\nYour week with AI:\n\n• 63 questions answered" }] }; },
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
    // the mock pretends the client connected straight away, so the live card can be seen
    async inboxConnect(accountId, provider) { setTimeout(() => { this.inbox._rows.find((x) => x.id === accountId).provider = provider; this.inboxRun(accountId); }, 50); return { ok: true, url: (provider === "outlook" ? "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?mock=" : "https://accounts.google.com/o/oauth2/v2/auth?mock=") + accountId.slice(0, 6) }; },
    // like the real one, a few at a time (five here, so the panel's loop runs twice), kept apart until all ten are there
    async salesDesk(projectId, action, channel, extra = {}) {
      await new Promise((r) => setTimeout(r, 400));
      const p = projects.find((x) => x.id === projectId); if (!p) return { ok: false, error: "lead not found" };
      const sd = p.details?.salesDesk || {};
      const msg = { subject: `Replies to ${p.business || "your"} customer emails`, email: `Good day,\n\nI saw that ${p.business || "you"} take bookings and quote requests by email. We set up an assistant that drafts those replies from your own prices, for your team to check and send.\n\nWould it be useful if I sent you a two-minute example?\n\nIf you'd rather not hear from me, just say so and I won't contact you again.\n\nKind regards\nAlex, Re-Charge`, whatsapp: `Hi, Alex from Re-Charge. We set up an assistant that drafts replies to your customer emails, for your team to check. Can I send a 2-minute example? If not, no problem, I won't message again.` };
      const reply = { subject: `Re: ${msg.subject}`, email: `Hi,\n\nThanks for getting back to me. Here's the example I put together for a business like yours: https://re-charge.co.za/live-demo?sample=email\n\nIf it looks useful, pick a time for a free 30-minute call here: https://calendar.app.google/58FYamh1ahXB4khM9\n\nKind regards\nAlex, Re-Charge`, whatsapp: `Thanks! Here's the example: https://re-charge.co.za/live-demo?sample=email\nPick a time for a free 30-min call: https://calendar.app.google/58FYamh1ahXB4khM9\nAlex`, at: new Date().toISOString() };
      if (action === "sent" && p.status === "prospect") p.status = "contacted";
      // the same rules as the real function: answers and call notes only after the first message is sent
      if (["reply", "call"].includes(action) && sd.outcome !== "sent") return { ok: false, error: "mark the first message as sent first" };
      if (action === "reply" && ["prospect", "contacted"].includes(p.status)) p.status = extra.reply === "interested" ? "new" : ["not_now", "no"].includes(extra.reply) ? "declined" : p.status;
      const next = action === "skip" || action === "sent" ? { ...sd, outcome: action, outcomeAt: new Date().toISOString(), channel, ...(extra.text ? { sentText: extra.text, sentSubject: extra.subject } : {}) }
        : action === "reply" ? { ...sd, reply: extra.reply, replyAt: new Date().toISOString(), ...(extra.said ? { said: extra.said } : {}), ...(extra.reply === "interested" ? { next: reply } : {}) }
        : action === "next" ? { ...sd, next: reply }
        : action === "nextSent" ? { ...sd, next: { ...sd.next, sentAt: new Date().toISOString(), channel } }
        : action === "call" ? { ...sd, call: { at: new Date().toISOString(), opener: "Hi, it's Alex from Re-Charge. I sent you a short message last week about your customer emails.", points: ["It drafts replies to quote requests from your own prices", "Your team checks each one before it goes"], ask: "Would a two-minute example be useful?", ifNo: "No problem at all, thanks for your time. I won't contact you again." } }
        : action === "message" ? { ...sd, message: msg } : { at: new Date().toISOString(), engine: "local", score: 78, fit: "strong", volume: "medium", reasons: ["Takes bookings and quotes by email", "Lists separate addresses for bookings and accounts", "Over 100 Google reviews: a busy front desk"], hook: "online booking requests for weekend appointments", signals: { site: true, contact_form: true, emails_listed: 2, quotes_or_bookings: true, hiring_admin: false, departments: true, social_only: false }, message: msg };
      p.details = { ...(p.details || {}), salesDesk: next };
      return { ok: true, salesDesk: next, status: p.status };
    },
    async liveDemoBuild(id, restart, run) {
      await new Promise((r) => setTimeout(r, 300));
      const d = this.liveDemos._rows.find((x) => x.id === id);
      const { wip, ...shown } = d.data || {};
      if (!restart && wip?.run && run !== wip.run) return { ok: false, error: "Another build of this demo has started. Wait for it to finish, or press Build again." };
      const items = [...(restart ? [] : wip?.items || []), ...Array.from({ length: 5 }, () => ({}))].map((x, i) => ({ title: `Example ${i + 1}`, ...x }));
      if (items.length < 10) { d.data = { ...shown, wip: { items, at: new Date().toISOString(), run } }; return { ok: true, done: false, have: items.length, total: 10 }; }
      d.data = { ...shown, items, built_at: new Date().toISOString() };
      return { ok: true, done: true, have: 10, total: 10, items };
    },
    async inboxRun(accountId) {
      // the mock "connects" on first run and drafts a few, so the card can be seen working
      const a = this.inbox._rows.find((x) => x.id === accountId); Object.assign(a, { status: "active", email: a.email || "info@example.co.za", trial_started_at: a.trial_started_at || ago(4 * 24), last_run_at: new Date().toISOString() });
      const mk = (status, sim, gist, mins, checks = []) => ({ id: uid(), account_id: accountId, status, similarity: sim, gist, checks, reason: status === "skipped" ? "mailing list" : null, created_at: ago(mins / 60) });
      if (!this.inbox._drafts.some((d) => d.account_id === accountId)) this.inbox._drafts.push(
        ...Array.from({ length: 34 }, (_, i) => mk("sent", 0.92, "A price for a service", 60 * (i + 1))),
        ...Array.from({ length: 9 }, (_, i) => mk("sent", 0.6, "A booking change", 70 * (i + 1))),
        mk("sent", 0.2, "A complaint about a late delivery", 300), mk("discarded", null, "A supplier asking for payment", 400),
        mk("drafted", null, "Can you quote for 3 aircons next week?", 8, ["Fill in the price for 3 units", "Fill in the first available day"]),
        mk("skipped", null, "", 20));
      return { ok: true, inboxes: [{ id: accountId, drafted: 1, skipped: 1, measured: 2, error: "" }] };
    },
    async paystackLink(clientId) { const k = "paystack:" + clientId; settings[k] = { ...(settings[k] || {}), auto: true }; return { ok: true, url: "https://checkout.paystack.com/test" + clientId.slice(0, 6), email: "x@y.z" }; },
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
    // The AI hub, pretend: a keyword sorter standing in for the model
    _aiJobs: { local: 0, claude: 0 },
    async aiHub(action, payload = {}) {
      const sortIt = (text) => {
        const t = String(text).toLowerCase();
        const kind = /unsubscribe|winner|crypto|seo services|rank #1/.test(t) ? "spam" : /invoice|paid|payment|proof of pay|refund/.test(t) ? "payment" : /not working|down|broken|error|help!/.test(t) ? "support" : /quote|price|how much|cost/.test(t) ? "quote" : /call|meet|book|appointment/.test(t) ? "booking" : /cv|vacancy|job/.test(t) ? "job" : /\?/.test(t) ? "question" : "other";
        const urgency = /urgent|asap|down|broken|today|angry/.test(t) ? "now" : ["spam", "job", "supplier"].includes(kind) ? "later" : "today";
        const email = (text.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i) || [""])[0], phone = (text.match(/(?:\+?27|0)[\d\s-]{8,12}/) || [""])[0].trim();
        const first = String(text).split(/[.!?\n]/).find((x) => x.trim().length > 12) || String(text).slice(0, 80);
        // what they asked (each question), why it was sorted this way, and a deadline if they gave one
        const asks = String(text).split(/(?<=\?)\s+|\n+/).map((x) => x.trim()).filter((x) => /\?$/.test(x) && x.length > 10).slice(0, 4);
        const by = (String(text).match(/\bby (monday|tuesday|wednesday|thursday|friday|tomorrow)\b/i) || [])[1];
        const due_at = by ? (() => { const d = new Date(); if (/tomorrow/i.test(by)) d.setDate(d.getDate() + 1); else { const n = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(by.toLowerCase()); do d.setDate(d.getDate() + 1); while (d.getDay() !== n); } return d.toISOString().slice(0, 10); })() : null;
        const why = { quote: "it asks what something costs", booking: "it asks for a call or a meeting", support: "something of theirs isn't working", payment: "it mentions an invoice or a payment", spam: "it reads like a mass mailing", job: "it's about a job", question: "it asks a question", other: "nothing more specific stood out" }[kind];
        return { kind, urgency, asks, due_at, why, summary: first.trim().slice(0, 120), next_step: { quote: "Reply with a rough price and offer a 30-minute call", booking: "Reply with two times that suit you", support: "Look at it now and reply with what you found", payment: "Check the payment and match it to the lead", spam: "Ignore it", job: "Reply politely: no openings right now", question: "Answer the question and offer a call", other: "Read it and decide" }[kind], is_lead: ["quote", "booking", "question"].includes(kind), who: { name: "", business: "", email, phone } };
      };
      if (action === "status") return { ok: true, hub: { configured: true, mode: "queue", online: true, models: ["llama3.1:latest (demo)"], error: "", last_seen: new Date().toISOString() }, claude: false, today: { ...this._aiJobs }, week: { local: this._aiJobs.local + 41, claude: this._aiJobs.claude + 3 }, avg_local_ms: 3400 };
      if (action === "sort") {
        await new Promise((r) => setTimeout(r, 600)); this._aiJobs.local++;
        const sorted = sortIt(payload.text || ""), w = sorted.who;
        const matches = projects.filter((p) => !p.spam && ((w.email && p.email && p.email.toLowerCase() === w.email.toLowerCase()) || (w.phone && p.phone && p.phone.replace(/\D/g, "").slice(-9) === w.phone.replace(/\D/g, "").slice(-9)))).slice(0, 3).map((p) => ({ id: p.id, ref: p.ref, business: p.business, name: p.name, status: p.status }));
        return { ok: true, sorted, engine: "local", ms: 3100, matches };
      }
      if (action === "read") {
        await new Promise((r) => setTimeout(r, 700)); payload.best ? this._aiJobs.claude++ : this._aiJobs.local++;
        const t = String(payload.text || ""), low = t.toLowerCase();
        const doc_type = /proof of payment|payment confirmation|beneficiary|eft notification/.test(low) ? "payment_proof" : /tax invoice|invoice|receipt|statement/.test(low) ? "supplier_invoice" : "other";
        const amt = (t.match(/(?:R|ZAR)\s?([\d\s,]+(?:\.\d{2})?)/i) || [])[1], amount = amt ? Number(amt.replace(/[\s,]/g, "")) : null;
        const vat = (t.match(/VAT[^\d]{0,20}([\d\s,]+\.\d{2})/i) || [])[1];
        const dm = t.match(/(20\d\d)[-/](\d\d)[-/](\d\d)/), date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : "";
        const party = ((t.match(/(?:from|payer|paid by|supplier)[:\s]+([^\n]+)/i) || [])[1] || t.split("\n")[0] || "").trim().slice(0, 60);
        const ref = (t.match(/RC-?\d{4,6}/i) || [""])[0], inv = (t.match(/invoice\s*(?:no\.?|number|#)[:\s]+([A-Z0-9-]{3,})/i) || [])[1] || "";
        const doc = { doc_type, party, amount, vat: vat ? Number(vat.replace(/[\s,]/g, "")) : null, currency: "ZAR", date, reference: ref, invoice_no: inv, description: doc_type === "payment_proof" ? "Payment received" : "Supplier invoice", category: /host|server|domain|supabase|afrihost/.test(low) ? "hosting" : /anthropic|openai|ai usage/.test(low) ? "ai" : /canva|adobe|software|subscription/.test(low) ? "software" : "other" };
        const cents = amount ? Math.round(amount * 100) : 0;
        const matches = doc_type === "payment_proof" ? projects.filter((p) => !p.spam && ((ref && p.ref.toLowerCase() === ref.toLowerCase().replace(/^rc(\d)/, "rc-$1")) || (party && (p.business || "").toLowerCase().includes(party.toLowerCase().split(" ")[0])) || (cents && p.quote_cents && [p.quote_cents, Math.round(p.quote_cents * 0.4)].includes(cents)))).sort((x, y) => (ref && y.ref.toLowerCase() === ref.toLowerCase() ? 1 : 0) - (ref && x.ref.toLowerCase() === ref.toLowerCase() ? 1 : 0)).slice(0, 4).map((p) => ({ id: p.id, ref: p.ref, business: p.business, name: p.name, quote_cents: p.quote_cents, deposit_paid: p.deposit_paid, status: p.status, client_id: p.client_id, why: "name" })) : [];
        return { ok: true, engine: payload.best ? "claude" : "local", ms: 2600, doc, matches };
      }
      if (action === "draft") {
        await new Promise((r) => setTimeout(r, 900)); payload.best ? this._aiJobs.claude++ : this._aiJobs.local++;
        const p = projects.find((x) => x.id === payload.projectId); if (!p) throw new Error("lead not found");
        const first = (p.name || "").split(/\s+/)[0] || "there", wa = payload.channel === "whatsapp";
        const body = wa ? `Hi ${first}, thanks for your message. Happy to help with this. Are you free for a quick 30-minute call [day and time]? You can also pick a time here: https://calendar.app.google/58FYamh1ahXB4khM9\nAlex`
          : `Hi ${first},\n\nThanks for getting in touch about ${p.business || "your business"}.\n\n${/web|site/i.test(p.goal || "") ? "A business website starts from R12,500, and we can show you a free mockup first so you see it before deciding anything." : "From what you describe, this is a good fit for what we build. The simplest start is the Inbox Assistant: R9,500 setup, ready in 3 business days, with a R1,500 deposit and the rest only if it saves your team 5 hours a week."}\n\nThe easiest next step is a free 30-minute call: https://calendar.app.google/58FYamh1ahXB4khM9\n\nI could also do [a time that suits you] if that's easier.\n\nAlex, Re-Charge`;
        return { ok: true, engine: payload.best ? "claude" : "local", ms: payload.best ? 2400 : 5200, draft: { subject: wa ? "" : `Re: ${p.business || "your enquiry"}`, body, check: ["Fill in a time that suits you, or delete that line"] } };
      }
      if (action === "resort") { const p = projects.find((x) => x.id === payload.projectId); if (!p) throw new Error("lead not found"); this._aiJobs.local++; p.ai_sort = { ...sortIt([p.goal, p.details?.formType].join(" ")), engine: "local", at: new Date().toISOString() }; return { ok: true, ai_sort: p.ai_sort }; }
      throw new Error("unknown action");
    },
    // Facebook Page posting, pretend: "Connect" connects at once; "Post now" marks the post posted
    _fb: null,
    async facebook(action, payload = {}) {
      if (action === "status") return { ok: true, ready: true, connected: Boolean(this._fb), page_name: this._fb?.page_name || "", connected_at: this._fb?.connected_at || null, last_error: null };
      if (action === "connect") { this._fb = { page_name: "Re-Charge", connected_at: new Date().toISOString() }; return { ok: true, url: location.pathname + location.search + "#/settings?fb=connected" }; }
      if (action === "disconnect") { this._fb = null; return { ok: true }; }
      if (action === "publish") {
        if (!this._fb) throw new Error("No Facebook Page connected (Settings → Facebook Page)");
        const p = posts.find((x) => x.id === payload.postId); if (!p) throw new Error("post not found");
        const id = "123_" + Date.now(); Object.assign(p, { status: "posted", posted_at: new Date().toISOString(), fb_post_id: id, post_url: "https://www.facebook.com/" + id, publish_error: null });
        return { ok: true, post_url: p.post_url };
      }
      throw new Error("unknown action");
    },
    async sendEmail(payload) {
      await new Promise((r) => setTimeout(r, 400));
      const m = { id: uid(), project_id: payload.projectId ?? null, kind: "email", to_address: payload.to, subject: payload.subject, body: payload.text, template_id: payload.templateId ?? null, provider_id: "demo_" + uid(), status: "sent", meta: {}, created_at: new Date().toISOString() };
      messages.push(m);
      if (payload.projectId) { const p = projects.find((x) => x.id === payload.projectId); if (p) ev(p, "email", `Email sent: "${payload.subject}"`, 0, { message_id: m.id, to: payload.to }); }
      return { ok: true, id: m.provider_id, messageId: m.id };
    },
  };
  // Three sample Inbox Assistant trials, so every step can be seen: day 15 and on target (send the result),
  // day 10 with most replies not marked (ask them to mark), day 4 just started (send the measurement agreement)
  const nd = P({ id: "demotrial0001", name: "Kagiso Ndlovu", email: "kagiso@ndlovuparts.co.za", phone: "072 888 1212", business: "Ndlovu Auto Parts", location: "Germiston, Gauteng", category: ["AI", "Inbox Assistant"], status: "new", deposit_paid: true, source: "website", goal: "Two of us answer about 40 customer emails a day: prices, stock and delivery times. Can it draft those?", details: { formType: "AI enquiry", product: "Inbox Assistant", inbox: true, inboxTimings: { mins: [5, 7, 6, 4.5, 8, 6, 5.5], median: 6, at: ago(15 * 24) }, trialAgreementAt: ago(14 * 24) }, created_at: ago(18 * 24), updated_at: ago(20) });
  projects.push(nd);
  ev(nd, "created", "Submitted from website (AI enquiry)", 18 * 24);
  payments.push({ id: "demotrialpay1", project_id: nd.id, client_id: null, provider: "yoco", provider_id: "p_nd", amount_cents: 150000, currency: "ZAR", kind: "deposit", note: "Inbox Assistant deposit", reference: nd.ref, email: nd.email, status: "succeeded", matched: true, created_at: ago(16 * 24), paid_at: ago(16 * 24) });
  ev(nd, "payment", "R1,500 deposit received (YOCO)", 16 * 24);
  ev(nd, "note", "Inbox Assistant day-one timings: 5, 7, 6, 4.5, 8, 6, 5.5 minutes (median 6, from 7 emails). Minutes to answer one by hand set to 6.", 15 * 24);
  // mix: [sent as is, sent after edits, not used, not marked] out of 10 replies
  const trialFor = (biz, startedH, perDay, mix = [6, 2, 1, 1]) => {
    const pr = projects.find((x) => x.business === biz); if (!pr) return;
    pr.details = { ...(pr.details || {}), inbox: true };
    const acc = { id: "demotrialacc-" + pr.id, project_id: pr.id, client_id: null, business: biz, slug: biz.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-demo", status: "active", provider: "page", baseline_minutes: 6, check_minutes: 1, target_hours: 5, email: null, page_views: 12, trial_started_at: ago(startedH), last_run_at: ago(1), last_error: null, created_at: ago(startedH) };
    api.inbox._rows.push(acc);
    const [a, e, u] = mix;
    for (let d = 0; d < Math.min(16, startedH / 24); d++) for (let i = 0; i < perDay; i++) {
      const r = (i * 7 + d * 3) % 10;
      api.inbox._drafts.push({ id: `${acc.id}-${d}-${i}`, account_id: acc.id, status: r < a ? "sent" : r < a + e ? "sent" : r < a + e + u ? "discarded" : "drafted", similarity: r < a ? 0.9 : r < a + e ? 0.6 : null, created_at: ago(d * 24 + i + 0.5), gist: ["A price for brake pads", "Is this in stock?", "When will my order arrive?", "Customer email"][(i + d) % 4] });
      // a thread summary every other day: shown on the card, never counted as a reply
      if (i === 0 && d % 2 === 0) api.inbox._drafts.push({ id: `${acc.id}-${d}-sum`, account_id: acc.id, status: d % 4 ? "summary" : "summary_used", similarity: null, created_at: ago(d * 24 + 3.2), gist: "Thread: The fleet service contract renewal" });
    }
  };
  // the Sales desk has researched the first two prospects (ADMIN.md 8dh)
  projects.filter((x) => x.status === "prospect" && x.business !== "Sunrise Nails").slice(0, 2).forEach((pr, i) => { pr.details = { ...(pr.details || {}), salesDesk: { at: ago(2 + i), engine: "local", score: i ? 54 : 81, fit: i ? "maybe" : "strong", volume: i ? "unknown" : "medium", reasons: i ? ["Only a contact form on the site", "Few reviews, so a smaller team"] : ["Takes bookings and quote requests by email", "Separate addresses for bookings and accounts"], hook: i ? "" : "quote requests for weekend call-outs", signals: { site: Boolean(pr.website), contact_form: Boolean(pr.website), emails_listed: pr.website ? (i ? 1 : 2) : 0, quotes_or_bookings: !i, hiring_admin: false, departments: false, social_only: false }, message: { subject: "Replies to your customer emails", email: "Good day,\n\nI saw you take quote requests for weekend call-outs by email. We set up an assistant that drafts those replies from your own prices, for your team to check and send.\n\nWould it be useful if I sent you a two-minute example?\n\nIf you'd rather not hear from me, just say so and I won't contact you again.\n\nKind regards\nAlex, Re-Charge", whatsapp: "Hi, Alex from Re-Charge. We set up an assistant that drafts replies to your customer emails, for your team to check. Can I send a 2-minute example? If not, no problem, I won't message again." } } }; });
  // the strongest one's demo is being built in the background; one sent six days ago with no reply has a call note
  { const pr = projects.find((x) => x.details?.salesDesk?.score === 81); if (pr) pr.details.salesDesk.demo = { id: "mock-demo", slug: "botha-electrical-1a2b3c4d", state: "building", have: 4 }; }
  { const pr = projects.find((x) => x.business === "Sunrise Nails"); if (pr) { pr.status = "contacted"; pr.details = { ...(pr.details || {}), salesDesk: { at: ago(7), engine: "local", score: 58, fit: "maybe", volume: "low", reasons: ["Bookings by WhatsApp", "Small team"], hook: "gel nail bookings on Saturdays", signals: { site: false, contact_form: false, emails_listed: 0, quotes_or_bookings: false, hiring_admin: false, departments: false, social_only: false }, message: { subject: "Your bookings", email: "Hi", whatsapp: "Hi" }, outcome: "sent", outcomeAt: ago(6), channel: "whatsapp", sentText: "Hi, Alex from Re-Charge here. I saw Sunrise Nails takes gel bookings on Saturdays. We set up an assistant that drafts replies to booking questions for you to check. Can I send a 2-minute example? If not, no problem, I won't message again.", call: { at: ago(1), opener: "Hi, it's Alex from Re-Charge. I sent you a WhatsApp last week about your booking messages.", points: ["It drafts replies to booking questions from your own prices", "You check each one before it goes"], ask: "Would a two-minute example be useful?", ifNo: "No problem, thanks for your time. I won't contact you again." } } }; } }
  const sortedAs = (biz, ai) => { const pr = projects.find((x) => x.business === biz); if (pr) pr.ai_sort = { engine: "local", at: ago(1), is_lead: true, who: {}, ...ai }; };
  sortedAs("Bella Hair Studio", { kind: "quote", urgency: "today", summary: "Wants a website where clients see prices and book a slot", next_step: "Reply with the salon website price and offer the free mockup" });
  sortedAs("Patel Accounting", { kind: "booking", urgency: "now", summary: "Booked a call about a client portal, this afternoon", next_step: "Call them this afternoon" });
  sortedAs("Thabo's Car Wash", { kind: "question", urgency: "today", summary: "Asked for the free online check of their business", next_step: "Look them up and WhatsApp three quick fixes" });
  trialFor("Ndlovu Auto Parts", 14.4 * 24, 14);
  trialFor("VDM Logistics", 9.4 * 24, 9, [3, 1, 0, 6]);
  trialFor("Mokoena Inc", 3.4 * 24, 4);
  return shareState(api);
}
