// The live demo builder (live-demo.html?d=<slug>), shared by the live-demo function (the panel's Build
// button) and the sales-desk function (which builds one for its strongest prospects, ADMIN.md 8dh).
// How it works, and why one item at a time: the top of live-demo/index.ts.
import { aiJSON, AiOffline } from "./ai.ts";

// deno-lint-ignore no-explicit-any
type DB = any;
export type Cfg = { per_day?: number; manual_minutes?: number; light_minutes?: number; types?: string; routing?: string; facts?: string; signoff?: string };
type Kind = { actions: string[]; brief: string };

// What each kind of work is, and what the AI may do with an item. The page has the labels.
export const KINDS: Record<string, Kind> = {
  email: {
    actions: ["draft", "forward", "file", "summarise", "human"],
    brief: `ITEMS: emails arriving in the business's shared inbox on a normal morning.
Include, where the inputs allow: routine questions it can answer, quote or booking requests, something for accounts or another team, something that only needs filing (an invoice, statement, newsletter, delivery note), at least one that genuinely needs a person (a complaint, a refund, anything sensitive), at least one urgent one, and exactly one long email thread (5 or more back-and-forth messages between several people, quoted one under the other in "body", newest first) that the reader has just been copied into late.
ACTIONS: "draft" (a reply the business can send; "output" is the full reply), "forward" (to the person or team in the routing who should deal with it; "route" is their name exactly as given), "file" (into a folder, nothing to answer; "route" is the folder), "summarise" (for the long thread: "output" is a short summary under these headings, each on its own line: "What it's about:", "Agreed so far:", "Still open:", "Why it matters to you:", "What you need to do:"; written for the person who was just copied in), "human" (a person must decide; "output" is a short holding reply a person could adapt).
"auto": true only for drafts that are routine, fully answered from the facts, with no [gaps], no money promised and no complaint.
"fields": [] for email.`,
  },
  invoices: {
    actions: ["capture", "flag", "human", "file"],
    brief: `ITEMS: supplier documents arriving by email: invoices mostly, plus a credit note, a statement and a delivery note. "body" is the document's text as it would read (supplier, invoice number, date, line items with quantities and prices, VAT at 15%, total, order reference, due date).
Include, where the inputs allow: several clean invoices that match, one where the price or quantity doesn't match the order or delivery (say which), one duplicate of an earlier invoice, one over the approval limit or from a new supplier, and one that only needs filing.
ACTIONS: "capture" (captured as a draft bill in the accounting system named in the routing; "route" is that system), "flag" (a mismatch or duplicate; "reason" says exactly what doesn't match), "human" (needs approval; "route" is who approves), "file" (statement or delivery note filed; "route" is the folder).
"fields": the captured data, in order: Supplier, Invoice no., Date, Order ref, Excl. VAT, VAT, Total, Due. Use "R" amounts. For a statement or delivery note give what applies.
"output": for capture, a one-line note of what was posted; for flag, a short draft email to the supplier querying it; otherwise "".
"auto": true only for clean captures that match their order, under any approval limit.`,
  },
  enquiries: {
    actions: ["answer", "book", "qualify", "human"],
    brief: `ITEMS: new enquiries from WhatsApp, the website form and Facebook, as the customer typed them (some short and informal). "from_detail" is the channel ("WhatsApp", "Website", "Facebook").
Include, where the inputs allow: simple questions it can answer from the facts, people ready to book, bigger leads worth a salesperson's call, a time-waster or price-shopper, and one that needs a person (unusual request, complaint).
ACTIONS: "answer" (answered from the facts; "output" is the reply), "book" (offers times or a booking link; "output" is the reply), "qualify" (a lead passed to the salesperson in the routing with a summary; "route" is who; "output" is the handover note), "human" (a person must decide; "output" is a short holding reply).
"priority": "urgent" for a hot lead or an urgent job, "today" for warm, "routine" for questions and cold leads.
"fields": for qualify and book: Name, Need, Size or budget, Area, When, Lead score (Hot/Warm/Cold). Otherwise [].
"auto": true for answers and booking replies fully covered by the facts with no [gaps].`,
  },
  reviews: {
    actions: ["reply", "alert", "thank", "theme"],
    brief: `ITEMS: new Google reviews and customer feedback from the past week, with a star rating at the start of the body ("★★★★★ " style) and the reviewer's words.
Include, where the inputs allow: several happy reviews, a mixed one, a negative one that needs the manager, and a recurring theme across reviews (the same praise or complaint more than once).
ACTIONS: "reply" (a public reply drafted; "output" is the reply), "alert" (a complaint flagged to the manager in the routing before anyone replies; "route" is who; "output" is a suggested calm public reply for them to approve), "thank" (a short thank-you reply to a 5-star review; "output" is it), "theme" (it adds to a recurring theme; "reason" names the theme; "output" is a one-line note for the owner).
"fields": Rating (1-5), Theme. 
"auto": true only for thank-you replies to clearly positive reviews.`,
  },
  questions: {
    actions: ["answer", "human"],
    brief: `ITEMS: questions staff ask during a normal week (on Teams/WhatsApp/email) about the business's own prices, policies and procedures, as people really ask them. "from_name" is a staff first name and role in "from_detail".
Use the FACTS as the business's documents. Include questions it can answer from the facts and at least two it can't (the answer isn't in the documents).
ACTIONS: "answer" (answered ONLY from the facts; "output" is the answer; "route" is the document and section it came from, e.g. "Leave policy, section 3"), "human" (not in the documents or needs judgement; "route" is who to ask from the routing; "output" says honestly that it isn't in the documents and who to ask).
"fields": [] .
"auto": true for answers fully covered by the facts.`,
  },
  calls: {
    actions: ["book", "job", "answer", "message", "human"],
    brief: `ITEMS: missed calls from a normal day and evening, followed up in writing. Nobody could pick up (busy, after hours, on a job), so each caller either left a voicemail or was pointed to WhatsApp by the business's missed-call message. Nothing is answered live on the phone: the assistant reads each voicemail or WhatsApp, turns it into a job card and drafts a WhatsApp or SMS reply for the business to check and send.
"from_name" is the caller's name, "from_detail" their number (South African format, made up) followed by " · Voicemail" or " · WhatsApp", "received" the time it came in, "title" what they need in a few words.
"body" is what they said in the voicemail (as a short transcript of one person talking) or what they typed on WhatsApp, in their own words, 1 to 4 sentences, as people really talk and type. No back-and-forth: there is only the caller's message.
Include, where the inputs allow: routine jobs to book, a genuinely urgent job after hours, a question the facts answer, a message for a specific person, a sales lead, and one that needs a person (an angry caller, an unusual request).
ACTIONS: "book" (a booking offered in writing; "output" is the WhatsApp/SMS reply offering times allowed by the facts and the call-out price from the facts), "job" (urgent: a job card created and the on-call person in the routing notified straight away; "route" is who; "output" is the WhatsApp/SMS reply telling the caller who will call them back and roughly when, with the call-out price from the facts), "answer" (a question answered from the facts; "output" is the WhatsApp/SMS reply), "message" (a message for a person in the routing; "route" is who; "output" is the message as they receive it), "human" (a person should call back; "route" is who; "output" is the note for them).
Never give safety or emergency instructions (what to switch off, what to do while waiting); an urgent job is passed to the on-call person and the reply only says who will call back and when. Times and prices come from the facts; anything not in the facts goes in [square brackets].
"fields": the job card: Name, Number, Address (if given), Need, Urgency, Times offered (if booking), Call-out fee (from the facts, or a [gap]).
"auto": true for routine booking replies and answers fully covered by the facts, with no [gaps].`,
  },
  meetings: {
    actions: ["decision", "action", "risk", "followup", "note"],
    brief: `ITEMS: ten moments from ONE real-sounding meeting at this business (a weekly team meeting, or a call with a client or supplier, whichever the inputs suggest), in time order. "received" is the time into the meeting ("04:12"), "from_name" the speaker's first name, "from_detail" their role, "title" the topic in a few words, "body" what was said (1 to 4 sentences, natural speech).
Include: at least two decisions, at least three tasks someone takes on (with a deadline said out loud where natural), a risk or concern raised, something that needs an email to an outside person afterwards, and some general discussion.
ACTIONS: "decision" (a decision made; "output" states it in one clear line), "action" (a task; "route" is the person who owns it; "output" is the task in one line; fields Due), "risk" (a concern to watch; "output" is it in one line), "followup" (an email to someone outside the meeting is needed; "route" is who it goes to; "output" is the drafted email), "note" (general discussion; "output" is the one-line summary that goes in the notes).
"fields": for action: Owner, Due. Otherwise [].
"priority": "urgent" for anything due today or tomorrow or a serious risk, "today" for this week, "routine" otherwise.
"auto": true for followup emails that are routine and fully covered by what was said.`,
  },
  followups: {
    actions: ["followup", "hot", "wait", "close", "human"],
    brief: `ITEMS: the business's open quotes and leads, the ones that might go quiet. "from_name" is the customer (company or person), "from_detail" the contact person and role, "title" what was quoted in a few words, "received" when they were last in touch ("3 days ago", "18 days ago"), "body" a short history: the quote amount, what was said last, any signals (asked about a start date, mentioned a competitor, the person who pays isn't involved).
Include, where the inputs allow: a hot one ready to buy, two or three gone quiet at different stages, one too fresh to chase, one that has gone cold for good, and one that needs the owner personally (big, sensitive or unhappy).
ACTIONS: "followup" (a follow-up message drafted; "output" is the message, short and specific to what was said; "reason" names the signal), "hot" (ready to buy: call today; "output" is a one-line note of what to say), "wait" (too soon to chase; "reason" says when to follow up), "close" (gone cold: a last friendly message; "output" is it), "human" (the owner should handle it; "route" is who; "output" is a note for them).
"fields": Value (R amount), Stage (New, Quote sent, Deciding), Quiet for (days).
"priority": "urgent" for hot or high-value deals going quiet, "today" for others to chase, "routine" for wait and close.
"auto": true only for routine follow-ups with nothing sensitive.`,
  },
  feedback: {
    actions: ["fix", "praise", "idea", "reply", "theme"],
    brief: `ITEMS: customer comments from the past month, from surveys, Google, WhatsApp and the website: what customers actually said, in their words. "from_name" is the customer (first name or "Anonymous"), "from_detail" the source ("Survey", "Google", "WhatsApp", "Website"), "title" the topic in a few words, "received" when.
Include: a complaint that keeps coming up (two or three comments on the same theme), praise worth quoting, a useful idea, someone who expects an answer, and mixed comments.
ACTIONS: "fix" (a problem to fix; "route" is who owns it from the routing; "output" is the suggested fix in one line), "praise" (worth quoting in marketing, with permission; "output" is the quote to use), "idea" (a customer suggestion; "output" is it as a one-line idea for the owner), "reply" (the customer expects a response; "output" is the reply), "theme" (adds to a recurring theme; "output" is a one-line note).
"fields": Theme (short), Sentiment (Positive, Negative or Mixed).
"auto": true only for short thank-you replies to positive comments.`,
  },
  posts: {
    actions: ["linkedin", "instagram", "facebook", "email"],
    brief: `ITEMS: a month of posts for the business, planned from what is happening there (new products or services, a customer story, a tip, an event, a team member, a seasonal offer). "from_name" is what the post is about in a few words, "from_detail" the source ("Owner's note", "Customer story", "Season", "News"), "title" the post's angle in a few words, "received" the planned date ("Mon 3 Nov"), "body" the owner's one-line direction, as they'd jot it down.
ACTIONS: the channel the post is written for: "linkedin", "instagram", "facebook" or "email" (a newsletter to customers). "output" is the finished post in the business's voice, the right length and style for that channel (Instagram short with a few hashtags; LinkedIn professional, under 1,300 characters; email with a "Subject:" line first). Use ONLY the facts given; anything not in the facts goes in [square brackets].
"reason": one line on why this post and why this channel. "route": "".
"fields": Channel, Goal (e.g. bookings, trust, awareness).
"priority": "routine" for all, or "today" for anything time-sensitive.
"auto": true for posts with no [gaps] that only need a quick approval.`,
  },
};

const PREAMBLE = `You build a realistic example for a sales demonstration by Re-Charge, a South African company that builds AI systems for small businesses. You are given a real business and what comes in. The example is 10 items that this business would plausibly get, in the mix the inputs describe, each with what an AI assistant would do with it. The 10 are written a few at a time: write only the items asked for at the end, carrying on from the ones already written.

General rules:
- Realistic, South African context, names and Rand amounts. Use believable but obviously fictional people and companies; never real ones.
- "received" is a time like "07:42", in ascending order across the 10.
- "priority": "urgent", "today" or "routine": urgent means someone is waiting on something time-critical, money is at risk, or it's a complaint.
- "reason" is one short plain sentence explaining the decision, as the assistant would show it.
- Use ONLY the facts given for prices, policies and promises; anything not in the facts goes in square brackets, like [price for 3 units].
- Sign replies with the sign-off given.

`;

const TOTAL = 10;              // items in a demo
const BATCH = 1;               // one item per job: the PC answers one job at a time, so a demo never holds up a client for long
const ASK_MS = 100_000;        // how long to wait for one answer
const MIN_RETRY_MS = 45_000;   // with less time than this left, the one-item retry isn't started
const PRIORITY = ["urgent", "today", "routine"];
type Item = { from_name: string; from_detail: string; title: string; body: string; received: string; priority: string; action: string; route: string; reason: string; output: string; fields: { label: string; value: string }[]; auto: boolean };

// The shape of one answer, as a JSON schema the PC's model has to follow (Ollama structured outputs,
// passed on by hub/worker.py): 1 to n items, each with every key, action and priority from their lists.
function format(kind: Kind, n: number) {
  return {
    type: "object",
    properties: {
      items: {
        type: "array", minItems: 1, maxItems: n,
        items: {
          type: "object",
          properties: {
            from_name: { type: "string" }, from_detail: { type: "string" }, title: { type: "string" }, body: { type: "string" }, received: { type: "string" },
            priority: { type: "string", enum: PRIORITY },
            action: { type: "string", enum: kind.actions },
            route: { type: "string" }, reason: { type: "string" }, output: { type: "string" },
            fields: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } },
            auto: { type: "boolean" },
          },
          required: ["from_name", "from_detail", "title", "body", "received", "priority", "action", "route", "reason", "output", "fields", "auto"],
        },
      },
    },
    required: ["items"],
  };
}

// The same shape in words, for a model that doesn't get the schema (LM Studio, an older worker)
const JSON_RULES = (kind: Kind) => `

Answer with ONE JSON object and nothing else: {"items": [...]}, with exactly the number of items asked for, each with exactly these keys:
{"from_name": "...", "from_detail": "...", "title": "...", "body": "...", "received": "...", "priority": "urgent", "today" or "routine", "action": one of ${kind.actions.map((a) => `"${a}"`).join(", ")}, "route": "..." or "", "reason": "one short sentence", "output": "..." or "", "fields": [{"label": "...", "value": "..."}] or [], "auto": true or false}
Write line breaks inside the text as \\n.`;

// What this answer writes: items a to b of the ten, after a short line for each one already written,
// so the ten keep to the brief's mix without repeats and the times carry on.
function batchTask(kind: Kind, done: Item[], n: number): string {
  const a = done.length + 1, b = done.length + n;
  const unused = kind.actions.filter((k) => !done.some((x) => x.action === k));
  return `NOW WRITE ${n === 1 ? `ITEM ${a}` : `ITEMS ${a} TO ${b}`} OF ${TOTAL}: ${n} item${n === 1 ? "" : "s"}, no more.
${done.length ? `
ALREADY WRITTEN (don't repeat any of them; between them and yours, the ${TOTAL} follow the mix above):
${done.map((x, i) => `${i + 1}. ${x.received || "-"} · ${x.from_name} · ${x.action} · ${x.priority} · ${x.title.slice(0, 80)}`).join("\n")}
${unused.length ? `Not used yet: ${unused.map((k) => `"${k}"`).join(", ")}.\n` : ""}"received" carries on in order after "${done[done.length - 1].received}".`
    : "Nothing is written yet: these are the first, and the rest of the mix comes in later answers."}${b >= TOTAL ? `
These are the last: between them, the ${TOTAL} must cover whatever the mix above still needs.` : ""}`;
}

// The inputs, cut to fit the model's 8,000 tokens beside the instructions and a 1,500-token answer
const cut = (t: string | undefined, n: number) => (t && t.length > n ? t.slice(0, n) + "\n[…cut to fit]" : t);
const fit = (c: Cfg): Cfg => ({ ...c, types: cut(c.types, 2000), routing: cut(c.routing, 2000), facts: cut(c.facts, 8000), signoff: cut(c.signoff, 300) });

// Text from the answer, also when a model that wasn't held to the schema gave a number, list or object
const text = (v: unknown): string => typeof v === "string" ? v.trim()
  : Array.isArray(v) ? v.map(text).filter(Boolean).join("\n")
  : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}: ${text(x)}`).join("\n")
  : v == null ? "" : String(v);

// The answer's items, ready to store. Light problems are mended (capitals, "high" for urgent, a missing
// key, fields as {label: value}, "auto" on a reply with a [gap]); an item without a sender, title, body
// or one of this kind's actions, or with the title of one already written, is left out.
function clean(kind: Kind, raw: unknown, done: Item[], n: number): Item[] {
  const list = (raw as { items?: unknown } | null)?.items;
  const seen = new Set(done.map((x) => x.title.toLowerCase()));
  const out: Item[] = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>, f = x.fields, p = text(x.priority).toLowerCase();
    const it: Item = {
      from_name: text(x.from_name), from_detail: text(x.from_detail), title: text(x.title), body: text(x.body), received: text(x.received),
      priority: PRIORITY.includes(p) ? p : ({ high: "urgent", medium: "today", normal: "routine", low: "routine" } as Record<string, string>)[p] || "routine",
      action: text(x.action).toLowerCase(), route: text(x.route), reason: text(x.reason), output: text(x.output),
      fields: (Array.isArray(f) ? f.map((y) => ({ label: text((y as { label?: unknown })?.label), value: text((y as { value?: unknown })?.value) }))
        : f && typeof f === "object" ? Object.entries(f).map(([label, value]) => ({ label, value: text(value) })) : []).filter((y) => y.label),
      auto: false,
    };
    it.auto = (x.auto === true || x.auto === "true") && !/\[[^\]\n]+\]/.test(it.output);
    if (!kind.actions.includes(it.action) || !it.from_name || !it.title || !it.body || seen.has(it.title.toLowerCase())) continue;
    seen.add(it.title.toLowerCase()); out.push(it);
  }
  return out.slice(0, n);
}

// The next items for a demo: two (or the one left), or one if that answer can't be used and there's
// still time in this call to ask. Throws AiOffline when the PC is off, and an Error when nothing usable came.
async function nextBatch(demo: { business: string; kind: string; config: Cfg | null }, kind: Kind, done: Item[], deadline: number): Promise<Item[]> {
  const system = PREAMBLE + kind.brief + JSON_RULES(kind);
  const ask = async (n: number, timeoutMs: number) => {
    const user = `${inputs(demo.business, fit(demo.config || {}), demo.kind)}\n\n${batchTask(kind, done, n)}`;
    const { data } = await aiJSON<unknown>("live-demo", system, user, { maxTokens: 1500, timeoutMs, format: format(kind, n), claude: false, check: (x) => clean(kind, x, done, n).length > 0 });
    return clean(kind, data, done, n);
  };
  try { return await ask(Math.min(BATCH, TOTAL - done.length), Math.min(ASK_MS, deadline - Date.now() - 5_000)); }
  catch (e) {
    const left = deadline - Date.now();
    if (e instanceof AiOffline || left < MIN_RETRY_MS) throw e;
    console.warn(`live-demo: item ${done.length + 1}, answer unusable, asking again`, (e as Error).message);
    return await ask(1, Math.min(ASK_MS, left));
  }
}

export function inputs(business: string, c: Cfg, kind = "email"): string {
  return `THE BUSINESS: ${business}
${kind === "meetings" ? "Meetings a day" : kind === "calls" ? "Missed calls and WhatsApps a day" : kind === "followups" ? "Open quotes and leads at any time" : kind === "posts" ? "Posts a week" : kind === "feedback" ? "Customer comments a week" : "How many come in a day"}: about ${Number(c.per_day) || 40}

WHAT COMES IN
${c.types || "(not given: use a typical mix for this kind of business)"}

WHO HANDLES WHAT (people, teams, systems and folders)
${c.routing || "(not given: use sensible names: Accounts, the owner, a Sales person, folders like Invoices and Newsletters)"}

FACTS (prices, policies, documents)
${c.facts || "(none: leave every specific as a [gap])"}

SIGN-OFF
${c.signoff || `Kind regards\n${business}`}`;
}

// One step of a build: writes the next item(s) and stores them, so the caller calls again until done.
// Each build has its own run id: a step from an older run stops (conflict), so two builds never mix.
// deadline: when the AI must be done (the caller's 150 s). Throws AiOffline when the PC is off.
export type Step = { done: boolean; have: number; total: number; items?: Item[]; conflict?: boolean; missing?: boolean };
export async function buildStep(db: DB, id: string, restart: boolean, run: string, deadline: number): Promise<Step> {
  const { data: demo } = await db.from("live_demos").select("id, kind, business, config, data").eq("id", id).maybeSingle();
  if (!demo) return { done: false, have: 0, total: TOTAL, missing: true };
  const kind = KINDS[demo.kind] || KINDS.email;
  // what's being written (wip) is kept apart from what the page shows (items, built_at)
  const { wip, ...shown } = (demo.data || {}) as { items?: Item[]; built_at?: string; wip?: { items?: Item[]; at?: string; run?: string } };
  if (!restart && wip?.run && run !== wip.run) return { done: false, have: wip.items?.length || 0, total: TOTAL, conflict: true };
  const save = async (data: Record<string, unknown>) => {
    const { error } = await db.from("live_demos").update({ data, updated_at: new Date().toISOString() }).eq("id", demo.id);
    if (error) throw new Error(`couldn't save the items (${error.message})`);
  };
  if (restart) await save({ ...shown, wip: { items: [], at: new Date().toISOString(), run } });
  let items = restart ? [] : (wip?.items || []).slice(0, TOTAL);
  if (items.length < TOTAL) items = [...items, ...await nextBatch(demo, kind, items, deadline)];
  // another build started while the AI was writing (Build pressed in the panel, or the Sales desk): it wins
  const { data: now } = await db.from("live_demos").select("data").eq("id", demo.id).maybeSingle();
  if (!now) return { done: false, have: 0, total: TOTAL, missing: true };   // deleted meanwhile
  const nowWip = (now.data as { wip?: { run?: string } } | null)?.wip;
  if (nowWip ? nowWip.run !== run : (restart || wip)) return { done: false, have: items.length, total: TOTAL, conflict: true };
  if (items.length < TOTAL) {
    await save({ ...shown, wip: { items, at: new Date().toISOString(), run } });
    return { done: false, have: items.length, total: TOTAL };
  }
  // what the items were built for goes with them: a changed kind or name shows only with the new items
  await save({ ...shown, items, kind: demo.kind, business: demo.business, config: demo.config, built_at: new Date().toISOString() });
  return { done: true, have: TOTAL, total: TOTAL, items };
}
