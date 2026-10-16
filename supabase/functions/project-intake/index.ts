// project-intake — receives a submission from any website form and stores it as a project
// record, then tells you (email + phone alert), thanks the visitor, and sorts it with AI.
//
// The website posts the same JSON it used to send to Formspree (config.js ENQUIRY_ENDPOINT):
//   https://<project-ref>.supabase.co/functions/v1/project-intake
// Deploy public (no JWT): see supabase/config.toml.
//
// Public, so it's limited (counters in assistant_hits, _shared/limits.ts):
//   - bodies over 32 KB are refused; every field is capped; at most 40 extra fields are kept
//   - 5 submissions an hour from one connection and 5 a day per email address; beyond that the
//     request is answered "ok" and dropped (logged), so a script learns nothing
//   - 150 a day in total: past that, submissions are still stored (so a real lead in a flood
//     isn't lost) but marked spam, with no emails, phone alerts, AI sort or mockup queueing, and
//     you get one warning email that day; past 1,000 a day nothing more is stored
//   - the automatic thank-you goes to an address at most once a day, and only contains text we
//     wrote plus a first name, a business name and figures that pass strict checks: never a link
//     or free text from the form, so nobody can use it to send their own message from our domain.
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { loadProfile, wrapHtml } from "../_shared/mail.ts";
import { offerStatus } from "../_shared/offer.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { pushBriefs } from "../_shared/buildqueue.ts";
import { sortProject } from "../_shared/sort_project.ts";
import { claudeConfigured, hubOnline } from "../_shared/ai.ts";
import { sendPush } from "../_shared/push.ts";
import { clientIp, hashKey, countHits, claimHit, dropHit } from "../_shared/limits.ts";

const MAX_BODY = 32 * 1024;     // a real form is a few KB
const MAX_EXTRA_KEYS = 40;      // form-specific fields kept in details
const MAX_VALUE = 2000;         // per extra field (mockup brief, notes)
const PER_IP_HOUR = 5;
const PER_EMAIL_DAY = 5;
const DAY_NORMAL = 150;         // past this in 24 hours: stored as spam, nothing sent
const DAY_HARD = 1000;          // past this: not stored at all
const SALT = "re-charge-intake:";

// keys we store as first-class columns; everything else goes into details jsonb
const TOP = new Set([
  "name", "email", "phone", "business", "category", "goal", "budget",
  "deadline", "indicativePrice", "channel", "type", "page", "_subject",
  "submittedAt", "attachments", "_gotcha", "location",
]);

// set only by the server or the panel, never taken from what a form sends
const RESERVED = new Set(["offer", "referredBy", "referralRewarded", "standard", "googleUrl", "sourceUrl", "finderType", "formType", "flood"]);

// The form types the site sends; anything else is stored as a plain "Enquiry".
const FORM_TYPES = new Set([
  "Project enquiry", "Enquiry", "Problem enquiry", "Process review", "Call request", "Free mockup request",
  "Google profile setup", "Free online check", "ROI estimate", "Opportunity scores",
]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // ----- read and size-check the body -----
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return json({ ok: false, error: "too large" }, 413);
  let raw = "";
  try { raw = await req.text(); } catch { return json({ ok: false, error: "invalid body" }, 400); }
  if (raw.length > MAX_BODY) return json({ ok: false, error: "too large" }, 413);
  let body: Record<string, unknown>;
  try {
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("not an object");
    body = b as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  // honeypot — silently accept and discard bots
  if (body._gotcha) return json({ ok: true });

  // ----- normalise and cap every field -----
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (TOP.has(k) || RESERVED.has(k)) continue;
    if (Object.keys(details).length >= MAX_EXTRA_KEYS) break;
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(k)) continue;
    const cv = capValue(v);
    if (cv !== undefined) details[k] = cv;
  }
  // The site's call-request and free-mockup modals use their own field names
  // (callName/mkBusiness, callEmail/mkEmail, …). Normalise every form type to
  // the same columns so a project enquiry, a call request and a free-mockup
  // request all store — and notify — cleanly.
  const sentType = line(body.formType, 60);
  const formType = sentType ? (FORM_TYPES.has(sentType) ? sentType : "Enquiry")
    : (line(body.type, 60) === "project-enquiry" ? "Project enquiry" : "Enquiry");
  if (sentType) details.formType = formType;
  const name = line(body.name, 200) ?? line(body.callName, 200) ?? line(body.mkBusiness, 200);
  const email = line(body.email, 200) ?? line(body.callEmail, 200) ?? line(body.mkEmail, 200);
  const phone = line(body.phone, 60) ?? line(body.callPhone, 60) ?? line(body.mkPhone, 60);
  const business = line(body.business, 200) ?? line(body.mkBusiness, 200);
  const goal = text(body.goal, 4000) ?? text(body.mkAbout, 4000);
  const location = line(body.location, 120) ?? line(body.mkLocation, 120);
  let category = String(body.category ?? body.projectType ?? "").slice(0, 400)
    .split(",").map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 8);
  if (!category.length && formType !== "Project enquiry" && formType !== "Enquiry") {
    category = [formType];
  }
  const emailOk = email && EMAIL_RE.test(email) ? email.toLowerCase() : null;
  const attachments = line(body.attachments, 1000);
  const page = line(body.page, 300);

  const row: Record<string, unknown> = {
    name, email, phone, business, category, goal, details, location,
    budget: line(body.budget, 200),
    deadline: line(body.deadline, 200),
    indicative_price: line(body.indicativePrice, 200),
    channel: line(body.channel, 200),
    status: "new",
  };

  try {
    const db = serviceClient();

    // ----- rate limits -----
    const ipClaim = await claimHit(db, "i:" + await hashKey(SALT, clientIp(req)), 3600e3, PER_IP_HOUR);
    const mailClaim = emailOk ? await claimHit(db, "m:" + await hashKey(SALT, emailOk), 86400e3, PER_EMAIL_DAY) : null;
    if (ipClaim.state === "over" || mailClaim?.state === "over") {
      console.warn(`project-intake: dropped a ${formType} (${ipClaim.state === "over" ? "over the per-connection limit" : "over the per-address limit"})`);
      await dropHit(db, ipClaim.id); await dropHit(db, mailClaim?.id ?? null);
      return json({ ok: true });
    }
    const today = await countHits(db, { prefix: "i:" }, 86400e3);
    if (today !== null && today > DAY_HARD) {
      console.warn("project-intake: dropped a submission (over the hard daily limit)");
      await dropHit(db, ipClaim.id); await dropHit(db, mailClaim?.id ?? null);
      return json({ ok: true });
    }
    // Past the normal daily total: keep it, but as spam, and send nothing.
    const flood = today !== null && today > DAY_NORMAL;
    // If the limits couldn't be checked, still keep the lead and tell you, but don't email the visitor.
    const counted = ipClaim.state === "ok" && (!mailClaim || mailClaim.state === "ok") && today !== null;
    if (flood) {
      row.spam = true;
      details.flood = true;
      const alert = await claimHit(db, "f:flood-alert", 86400e3, 1);
      if (alert.state === "over") await dropHit(db, alert.id);
      if (alert.state === "ok") {
        await notifyEmail("Website forms: unusually many today",
          `More than ${DAY_NORMAL} website forms came in over the last 24 hours, which looks like a script rather than people. From now until it calms down, new submissions are stored but marked as spam, with no emails, phone alerts or AI sort.\n\nLook under Leads → Spam in the panel and use "Not spam" on any real ones.`);
      }
    }

    // Referrals: ?ref=<client slug> from a client's share link credits that
    // client (a free year of Care when this lead goes live); ?ref=credit is a
    // click on a "Website by Re-Charge" footer link.
    const refCode = String(body.ref ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || null;
    if (refCode === "credit") row.source = "credit";
    else if (refCode) {
      const { data: by } = await db.from("clients").select("id, name").eq("slug", refCode).maybeSingle();
      if (by) { row.source = "referral"; details.referredBy = { clientId: by.id, name: by.name }; }
    }
    // A running founding-clients offer (Settings → Founding clients): tag the lead so it
    // counts towards the spots once they pay the deposit.
    const offer = await offerStatus(db).catch(() => null);
    if (offer?.active) details.offer = offer.code;

    // A prospect we contacted (outreach) who now fills in a form on the site is
    // the same lead replying, not a new one: update that record instead of
    // creating a duplicate, so its history and notes stay together. The form only
    // fills gaps: what's already on the record is kept, and everything the form
    // sent is written to the timeline, so a form can't rewrite someone's record.
    const prospect = flood ? null : await findProspect(db, emailOk, phone);
    let data: { id: string; ref: string; build_status: string | null };
    if (prospect) {
      const patch: Record<string, unknown> = {
        status: "new", archived: false, next_action: null, next_action_at: null,
        name: fill(prospect.name, name), email: fill(prospect.email, email), phone: fill(prospect.phone, phone),
        business: fill(prospect.business, business), goal: fill(prospect.goal, goal), location: fill(prospect.location, location),
        category: Array.isArray(prospect.category) && prospect.category.length ? prospect.category : category,
        details: { ...details, ...(prospect.details ?? {}) },
        budget: fill(prospect.budget, row.budget), deadline: fill(prospect.deadline, row.deadline),
        indicative_price: fill(prospect.indicative_price, row.indicative_price), channel: fill(prospect.channel, row.channel),
      };
      if (formType === "Free mockup request" && ["none", "failed", null].includes(prospect.build_status) && await autoQueueOn(db)) patch.build_status = "queued";
      const { data: upd, error } = await db.from("projects").update(patch).eq("id", prospect.id).select("id, ref, build_status").single();
      if (error) throw error;
      data = upd;
      const sentLine = [name && `name ${name}`, business && `business ${business}`, email && `email ${email}`, phone && `phone ${phone}`, location && `location ${location}`].filter(Boolean).join(", ");
      const was = prospect.next_action ? ` Planned next step was: ${String(prospect.next_action).slice(0, 200)}${prospect.next_action_at ? ` (${String(prospect.next_action_at).slice(0, 10)})` : ""}.` : "";
      await db.from("project_events").insert({
        project_id: data.id, kind: "note",
        note: `Replied through the website (${formType}) — was a prospect. They sent: ${sentLine || "no contact details"}.${goal ? ` Message: ${goal.slice(0, 1200)}` : ""}${was} The record kept what it already had; the form only filled empty fields.`,
        data: { attachments, page, merged: true, submitted: { name, email, phone, business, location, goal, category } },
      });
    } else {
      const { data: ins, error } = await db.from("projects").insert(row).select("id, ref, build_status").single();
      if (error) throw error;
      data = ins;
      await db.from("project_events").insert({
        project_id: data.id, kind: "created",
        note: flood ? `Submitted from website (${formType}): held as spam, over ${DAY_NORMAL} forms in 24 hours` : `Submitted from website (${formType})`,
        data: { attachments, page },
      });
    }
    if (flood) return json({ ok: true, id: data.id, ref: data.ref });

    // Surface the form-specific extras (call day/time, mockup brief, chosen
    // features, …) in the email — anything already shown above is skipped.
    const shown = new Set([
      "formType", "callName", "callEmail", "callPhone",
      "mkBusiness", "mkEmail", "mkPhone", "mkAbout", "projectType",
    ]);
    const extra = Object.entries(details).filter(([k, v]) =>
      !shown.has(k) && !k.startsWith("_") && v != null && String(v).trim().length);
    const detailLines = extra.length
      ? ["", "Details:", ...extra.map(([k, v]) => `  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)]
      : [];
    const subj = line(body._subject, 150);
    const subject = subj ? `${data.ref}: ${subj}` : `New ${formType} ${data.ref}: ${name ?? ""}`;
    const subjectLine = prospect ? `${subject} (a prospect you contacted)` : subject;
    await notifyEmail(
      subjectLine,
      [
        `Type: ${formType}`,
        `Ref: ${data.ref}`,
        `Name: ${name ?? ""}`,
        `Email: ${email ?? ""}`,
        `Phone: ${phone ?? ""}`,
        `Business: ${business ?? ""}`,
        `Location: ${location ?? ""}`,
        `Category: ${category.join(", ")}`,
        `Budget: ${row.budget ?? ""}`,
        `Deadline: ${row.deadline ?? ""}`,
        "",
        `Goal / message:\n${goal ?? ""}`,
        ...detailLines,
        "",
        `Attachments: ${attachments ?? "none"}`,
        ...(counted ? [] : ["", "(The rate limits couldn't be checked for this one, so no automatic thank-you was sent.)"]),
      ].join("\n"),
      emailOk ?? undefined,
    );
    // Instant alert on Revan's phone (Settings → Phone alerts): speed wins these.
    const LABEL: Record<string, string> = { "Free mockup request": "Mockup request", "Call request": "Call request", "Google profile setup": "Google setup (R450)", "Free online check": "Free online check", "Project enquiry": "Project enquiry", "Problem enquiry": "Problem enquiry", "Process review": "Process review", "ROI estimate": "ROI estimate (emailed)", "Opportunity scores": "Opportunity scores (emailed)" };
    await sendPush(db, {
      title: `${prospect ? "A prospect replied" : "New lead"}: ${LABEL[formType] ?? formType}`,
      body: [business ?? name ?? "Someone", location, phone ? "WhatsApp/phone given" : email ? "email given" : ""].filter(Boolean).join(" · ").slice(0, 160),
      url: `/admin/#/p/${data.id}`, tag: `lead-${data.id}`,
    });
    // Instant thank-you to the person who enquired (Settings → Your details).
    // A fast, personal reply is the cheapest way to win more of these.
    if (emailOk && counted) {
      await thankYou(db, { projectId: data.id, ref: data.ref, email: emailOk, name, business, formType, details }).catch((e) => console.error("thank-you email failed:", e));
    }
    // Auto-queued mockup request (Settings → automatic mockups): hand the
    // brief to the GitHub-based builder now, so it's picked up on the next run.
    if (data.build_status === "queued") {
      const r = await pushBriefs(db, [data.id]).catch((e) => ({ pushed: 0, errors: [String(e)] }));
      if (r.errors.length) console.error("auto-queue push failed:", r.errors);
    }
    // Sort it with AI: kind, urgency, summary, next step. The office PC first; Claude (the cheap
    // default sort model) only if the PC can't and ANTHROPIC_API_KEY is set. One sort per accepted
    // form, none in a flood, so the limits above bound it. In the background, so the form never waits.
    // Skipped when neither can answer (the PC off and no Claude key), so nothing fails in the background.
    if (claudeConfigured() || await hubOnline()) {
      const sorting = sortProject(db, data.id).catch((e) => console.error("ai sort failed:", e));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(sorting); else await sorting;
    }
    return json({ ok: true, id: data.id, ref: data.ref });
  } catch (e) {
    console.error("intake failed:", e);
    return json({ ok: false, error: "could not store project" }, 500);
  }
});

// ---------- field helpers ----------
function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}
// one line, at most n characters
function line(v: unknown, n: number): string | null {
  if (v != null && typeof v === "object") return null;
  const s = str(v)?.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return s ? s.slice(0, n) : null;
}
// free text (keeps line breaks), at most n characters
function text(v: unknown, n: number): string | null {
  if (v != null && typeof v === "object") return null;
  const s = str(v)?.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ");
  return s ? s.slice(0, n) : null;
}
// an extra form field for details: short strings, numbers, booleans, and small objects (ROI figures)
function capValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string") return v.slice(0, MAX_VALUE);
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  try { const j = JSON.stringify(v); return j.length <= MAX_VALUE ? JSON.parse(j) : undefined; } catch { return undefined; }
}
// keep what the record already has; fill only what's empty
function fill<T>(cur: T, v: T): T {
  return cur == null || (typeof cur === "string" && !cur.trim()) ? v : cur;
}

// Digits only, with a South African leading 0 turned into 27 (082… → 2782…). Same as norm_phone() in 0034.
function normPhone(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "27" + d.slice(1);
  if (d.startsWith("270") && d.length === 12) d = "27" + d.slice(3);
  return d;
}

const PROSPECT_COLS = "id, ref, name, email, phone, business, goal, location, category, details, budget, deadline, indicative_price, channel, build_status, next_action, next_action_at";

// The prospect (outreach) record this form belongs to, by email or phone. The database finds it
// (find_prospect, 0034); before that migration has run, the old way: look through recent prospects.
// deno-lint-ignore no-explicit-any
async function findProspect(db: any, email: string | null, phone: string | null) {
  if (!email && !phone) return null;
  const { data: id, error: rpcErr } = await db.rpc("find_prospect", { p_email: email ?? "", p_phone: phone ?? "" });
  if (!rpcErr) {
    if (!id) return null;
    const { data } = await db.from("projects").select(PROSPECT_COLS).eq("id", id).maybeSingle();
    return data ?? null;
  }
  const { data, error } = await db.from("projects").select(PROSPECT_COLS)
    .in("status", ["prospect", "contacted"]).eq("spam", false)
    .order("updated_at", { ascending: false }).limit(2000);
  if (error || !data) return null;
  const e = email?.toLowerCase(), ph = normPhone(phone);
  // deno-lint-ignore no-explicit-any
  return data.find((p: any) => e && p.email && p.email.toLowerCase() === e)
    // deno-lint-ignore no-explicit-any
    ?? data.find((p: any) => ph.length >= 9 && normPhone(p.phone) === ph) ?? null;
}

// deno-lint-ignore no-explicit-any
async function autoQueueOn(db: any): Promise<boolean> {
  const { data } = await db.from("settings").select("value").eq("key", "autobuild").maybeSingle();
  return Boolean(data?.value?.auto_queue);
}

// ---------- what may go into an email to the visitor ----------
// Anything that could be a link or an address: never copied from a form into an email we send.
const LINKISH = /(https?:|www\.|\/\/|@|\b[a-z0-9-]+\.[a-z]{2,}\b)/i;
// "Hi Thandi": a first name of letters only, else "there"
function firstName(n: string | null): string {
  const w = (n ?? "").trim().split(/\s+/)[0] || "";
  return /^\p{L}[\p{L}'’-]{0,29}$/u.test(w) ? w : "there";
}
// a business name: one line, 80 characters, no link, address or phone number
function bizName(b: string | null): string | null {
  const s = (b ?? "").replace(/\s+/g, " ").trim();
  if (!s || s.length > 80 || LINKISH.test(s) || /\d[\d\s-]{5,}\d/.test(s) || /[<>{}[\]\\|]/.test(s)) return null;
  return s;
}
// a figure from the ROI calculator as the page showed it: "R25,000", "$4,500", "60%", "12"
function figure(v: unknown): string {
  const s = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  return s.length <= 20 && /^(?:R|\$|€|£)?\d{1,3}(?:[,  ]\d{3})*(?:\.\d{1,2})?%?$/.test(s) ? s : "?";
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 1e9 ? n : 0; };
// the call day and time, only as the form offers them ("Tue 21 Oct", "Morning (08:00–12:00)")
function callWhen(day: unknown, time: unknown): string {
  const d = typeof day === "string" && /^(Mon|Tue|Wed|Thu|Fri) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(day.trim()) ? day.trim() : "";
  const t = typeof time === "string" && /^(Morning|Afternoon|Evening)(?: \(\d{2}:\d{2}[–-]\d{2}:\d{2}\))?$/.test(time.trim()) ? time.trim() : "";
  return [d, t].filter(Boolean).join(", ");
}
// the opportunity scores, rebuilt line by line from the format the method page sends:
// "  72/100  Quote follow-ups (build this first)"; at most 10, names of 60 characters, no links
function oppLines(v: unknown): string {
  const out: string[] = [];
  for (const l of String(typeof v === "string" ? v : "").split(/\r?\n/)) {
    const m = l.match(/^\s*(\d{1,3})\/100\s+(.+?)\s+\((build this first|next in line|park it for now)\)\s*$/);
    if (!m || Number(m[1]) > 100) continue;
    let nm = m[2].replace(/\s+/g, " ").trim().slice(0, 60);
    if (LINKISH.test(nm) || /[<>]/.test(nm)) nm = "Your opportunity";
    out.push(`  ${Number(m[1])}/100  ${nm} (${m[3]})`);
    if (out.length >= 10) break;
  }
  return out.join("\n");
}

// What fixing it would cost, for the ROI email: the starting prices the visitor saw
// (in their currency) and an honest payback, including when it isn't worth it yet.
function roiCosting(d: Record<string, unknown>): string {
  const raw = (d.roiCost && typeof d.roiCost === "object" ? d.roiCost : {}) as Record<string, unknown>;
  const n = (d.roiCostN && typeof d.roiCostN === "object" ? d.roiCostN : {}) as Record<string, unknown>;
  const c = { inbox: figure(raw.inbox), inboxMo: figure(raw.inboxMo), auto: figure(raw.auto), ai: figure(raw.ai), staged: figure(raw.staged), operate: figure(raw.operate) };
  if (c.auto === "?" || c.ai === "?" || c.staged === "?" || c.operate === "?") return "";
  const m = num(d.roiMonthN), auto = num(n.auto), op = num(n.operate);
  const hasInbox = c.inbox !== "?" && c.inboxMo !== "?";
  let s = `What fixing it would cost (starting prices; your quote fixes the exact price):\n\n${hasInbox ? `  Inbox Assistant (customer emails drafted for you): ${c.inbox} setup, then ${c.inboxMo} a month. A R1,500 deposit to start; the rest only once it's saving your team 5 hours a week (deposit refunded if it isn't).\n` : ""}  One task automated: from ${c.auto}, once\n  AI that reads and replies: from ${c.ai}, plus a monthly plan from ${c.operate}\n  A bigger process, in stages: about ${c.staged} in total, and you can stop after any stage\n\n`;
  const ib = num(n.inbox), ibMo = num(n.inboxMo);
  if (hasInbox && m > 0 && ib > 0 && ibMo > 0 && m > ibMo * 1.5) {
    const months = Math.ceil(ib / (m - ibMo));
    s += `If customer email is a big part of that work, the Inbox Assistant would pay back its setup in about ${months} month${months === 1 ? "" : "s"} at your figure, after its monthly fee.\n\n`;
  }
  if (m > 0 && auto > 0) {
    const months = Math.ceil(auto / m);
    s += months > 24
      ? `Honestly, at your figure a one-off automation would take over two years to earn back its cost, so it may not be worth doing yet. We'd tell you the same on a call.\n\n`
      : `At your figure, a ${c.auto} automation would earn back its cost in about ${months} month${months === 1 ? "" : "s"}.${op ? (m >= 2 * op ? ` Your saving also covers an AI system's monthly plan comfortably.` : ` An AI system's monthly plan (from ${c.operate}) would ${m < op ? "cost more than it saves you" : "take most of your saving"}, so a simpler automation is probably the better start.`) : ""}\n\n`;
  }
  return s;
}

// Our reply promise as a date, in South African time: "by 17:00 on Thursday 16 October" (next business day).
function replyBy(): string {
  const d = new Date(Date.now() + 2 * 3600e3);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return `by 17:00 on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()]} ${d.getUTCDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]}`;
}

// ---------- the instant thank-you ----------
async function thankYou(db: ReturnType<typeof serviceClient>, p: { projectId: string; ref: string; email: string; name: string | null; business: string | null; formType: string; details: Record<string, unknown> }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const { data: spam } = await db.from("spam_senders").select("email").eq("email", p.email.toLowerCase()).maybeSingle();
  if (spam) return;
  const inbox = Deno.env.get("NOTIFY_EMAIL") ?? "";
  const prof = await loadProfile(db, inbox);
  // Results someone asked to be emailed always go out; the other thank-yous follow Settings.
  const results = p.formType === "ROI estimate" || p.formType === "Opportunity scores";
  if (!prof.autoreply && !results) return;
  // At most one automatic email to an address a day, however many forms name it.
  const once = await claimHit(db, "e:" + await hashKey(SALT, p.email.toLowerCase()), 86400e3, 1);
  if (once.state !== "ok") {
    if (once.state === "over") await dropHit(db, once.id);
    console.warn(`thank-you skipped: ${once.state === "over" ? "this address already had one today" : "couldn't check the limit"}`);
    return;
  }
  const first = firstName(p.name);
  const business = bizName(p.business);
  const biz = business || "your business";
  const wa = prof.whatsapp ? prof.whatsapp.replace(/^27/, "0").replace(/^(\d{3})(\d{3})(\d+)$/, "$1 $2 $3") : "";
  const me = prof.myName || "Re-Charge";
  const d = p.details;
  let subject: string, body: string;
  if (p.formType === "ROI estimate") {
    const month = figure(d.roiMonth), year = figure(d.roiYear), back = figure(d.roiBack);
    subject = month !== "?" ? `About ${month} a month is going on work a system could do` : "Your estimate: what that work is costing you";
    body = `Hi ${first},\n\n${month !== "?" ? `From the numbers you put in, about ${month} a month (${year} a year) is going on work a system could take over. That's ${back} hours of your team's time every month.\n\n` : ""}Here's how you worked it out on our pricing page:\n\n  People doing the work: ${figure(d.roiPeople)}\n  Hours each, per week: ${figure(d.roiHours)}\n  Monthly salary: ${figure(d.roiSalary)}\n  Share a system could take over: ${figure(d.roiShare)}\n\nThat's the cost of the time (hours x salary x 1.3 / 173). It's an estimate: before anything is built we measure the real figure, and we measure it the same way afterwards.\n\n${roiCosting(d)}If you'd like to talk it through, reply to this email or book a free 30-minute call: https://calendar.app.google/58FYamh1ahXB4khM9${wa ? ` Or WhatsApp us on ${wa}.` : ""}`;
  } else if (p.formType === "Opportunity scores") {
    subject = "Your opportunity scores";
    body = `Hi ${first},\n\nHere are the opportunities you scored on our method page, highest first:\n\n${oppLines(d.oppList) || "(none)"}\n\n70 or more: build this first. 50 to 69: next in line. Under 50: park it for now. If the information a system needs isn't available or clean, fix that first; if a mistake would be costly, a person approves every output.\n\nIf you'd like a second opinion on the top one, reply to this email and we'll set up a free 30-minute process review.${wa ? ` Or WhatsApp us on ${wa}.` : ""}`;
  } else if (p.formType === "Free mockup request") {
    subject = `Got your details${business ? `: ${business}` : ""}`;
    body = `Hi ${first},\n\nThanks for sending the details about ${biz}. I've got everything you sent, and I'll come back to you ${replyBy()}. If you think of anything else, like photos, prices or a site you like the look of, just reply to this email.\n\nIf it's easier to talk it through, book a free 30-minute call: https://calendar.app.google/58FYamh1ahXB4khM9\n\nYou don't pay anything until you've seen a fixed quote and said yes.${wa ? `\n\nOr WhatsApp me on ${wa}.` : ""}`;
  } else if (p.formType === "Google profile setup") {
    subject = `Your Google profile setup for ${biz}`;
    body = `Hi ${first},\n\nThanks for booking the Google profile setup for ${biz}. I'll be in touch ${replyBy()}${wa ? ` (on WhatsApp, from ${wa})` : ""} to get the details: your hours, services and prices, and a few photos.\n\nIt's R450 once-off, and you only pay once it's done and you've checked it. If you build a website with us within 90 days, the R450 comes off it.`;
  } else if (p.formType === "Process review") {
    subject = `Your process review${business ? ` for ${business}` : ""}`;
    body = `Hi ${first},\n\nThanks for booking a process review. I'll come back to you ${replyBy()} to set up a 30-minute call. If you'd rather pick a time now, book it here: https://calendar.app.google/58FYamh1ahXB4khM9\n\nTo get the most out of it, think of one process that takes your team too long, and roughly: how many people do it, how often it happens, and how long each one takes. A rough guess is fine. That's the number we'd set out to improve.\n\nThe call is free. If AI isn't the right fix for what you describe, I'll tell you.${wa ? `\n\nIf it's easier to talk, WhatsApp me on ${wa}.` : ""}`;
  } else if (p.formType === "Call request") {
    const when = callWhen(d.callDay, d.callTime);
    subject = "Your call with Re-Charge";
    body = `Hi ${first},\n\nThanks for booking a call. I'll phone you${when ? ` on ${when}` : ""}.\n\nIf the time stops suiting you, just reply to this email with a better one${wa ? `, or WhatsApp me on ${wa}` : ""}.`;
  } else {
    subject = `Got your message${business ? `: ${business}` : ""}`;
    body = `Hi ${first},\n\nThanks for getting in touch${business ? ` about ${business}` : ""}. I've got your message and I'll come back to you ${replyBy()} with a couple of questions or a plan. If it's easier to talk it through, book a free 30-minute call: https://calendar.app.google/58FYamh1ahXB4khM9\n\nAfter that you'll get a fixed quote online. You don't pay anything until you've seen it and said yes.${wa ? `\n\nIf it's easier to talk, WhatsApp me on ${wa}.` : ""}`;
  }
  const text = `${body}\n\nThanks,\n\n${prof.sig.text || me}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>", to: p.email, subject, text, html: wrapHtml(text, prof.sig), ...(prof.replyTo ? { reply_to: prof.replyTo } : {}), tags: [{ name: "project", value: p.projectId.replace(/[^a-zA-Z0-9_-]/g, "") }] }),
  });
  const j = await res.json().catch(() => ({}));
  await db.from("messages").insert({ project_id: p.projectId, kind: "email", to_address: p.email, subject, body: text, provider_id: j?.id ?? null, status: res.ok ? "sent" : "failed", meta: { auto: "thank-you", ...(res.ok ? {} : { error: `Resend ${res.status}` }) } });
  await db.from("project_events").insert({ project_id: p.projectId, kind: "email", note: res.ok ? `Automatic thank-you email sent: "${subject}"` : `Automatic thank-you email FAILED: "${subject}"`, data: { auto: true } });
}
