// inbox-trial — the client's private Inbox Assistant page (trial.html?t=<slug>). Public: the
// slug is the key (long and unguessable), and everything is capped per page and per person.
//
// POST { t, info: true }                       → { ok, business, online, week: { drafted, used, edited, hours } }
// POST { t, email, subject? }                  → { ok, id, draft: { gist, reply, check } }
// POST { t, email, summarise: true }          → { ok, id, summary: { what, agreed, open, why, todo } }
// POST { t, id, outcome: "used"|"edited"|"unused", reply? } → { ok }   (a summary: "used"|"unused")
//      reply: the draft, sent with "used", kept as an example of how they write (0037)
// POST { t, id, teach: "the reply they sent" } → { ok, learned }   (after "edited" or "unused")
// POST { t, email, redraft: id, note? }  → a new draft, with what they want changed; the old one
//      counts as not used
//
// Learning (0037, _shared/inbox_examples.ts): replies they approve or paste are kept encrypted, and
// the newest three go into each new draft as examples of their tone and length. It's how the page
// gets to sound like them, without ever taking facts from those replies.
//
// Every draft is recorded in inbox_drafts (no email text is kept: a one-line gist and the gaps
// only). The outcome click is the measurement: "used" counts the full time saved, "edited" half,
// "unused" nothing — the same rule as a connected inbox. A thread summary is recorded as status
// "summary" and its tap as summary_used / summary_unused: it saves reading, not writing a reply, so
// it never counts towards the hours (_shared/inbox_stats.ts).
//
// The drafts and summaries are written by Re-Charge's own AI computer (the home PC's model, through
// the AI hub: _shared/draft_reply.ts), so they cost nothing per email. While it's off, the page says
// so ("offline, try again in a few minutes"); info's online lets the page say it before they paste.
//
// Caps: PER_PAGE_DAY AI jobs a page a day (drafts, summaries and pasted text that turned out not
// to be a customer email all count: the one AI computer answers every client and the website, and a
// forwarded link can come from anywhere) and PER_IP_HOUR from one address an hour, high enough for a
// whole office behind one internet connection. Both can be changed with the secrets
// INBOX_TRIAL_PER_PAGE_DAY and INBOX_TRIAL_PER_IP_HOUR. If the caps can't be checked the page says
// "try again" rather than drafting uncounted.
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { writeReply, summariseThread, EMAIL_MAX, THREAD_MAX } from "../_shared/draft_reply.ts";
import { AiOffline, hubOnline } from "../_shared/ai.ts";
import { saveExample, loadExamples } from "../_shared/inbox_examples.ts";
import { stripQuoted } from "../_shared/gmail.ts";
import { inboxResult, isSummary } from "../_shared/inbox_stats.ts";
import { clientIp, hashKey, countHits, recordHits } from "../_shared/limits.ts";

const envInt = (k: string, d: number) => { const n = Number(Deno.env.get(k)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
const PER_PAGE_DAY = envInt("INBOX_TRIAL_PER_PAGE_DAY", 250);   // drafts a page can make in a day
const PER_IP_HOUR = envInt("INBOX_TRIAL_PER_IP_HOUR", 150);     // and one office connection in an hour
const MAX_CHARS = EMAIL_MAX;     // what fits in the model's context with the business's facts
const MAX_THREAD = THREAD_MAX;
const OFFLINE = "Our AI computer is offline right now. Please try again a little later, or message us on WhatsApp.";
const OUTCOME: Record<string, { status: string; similarity: number | null }> = {
  used: { status: "sent", similarity: 0.95 }, edited: { status: "sent", similarity: 0.6 }, unused: { status: "discarded", similarity: null },
};

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const slug = String(body.t || "").trim().slice(0, 80);
  if (!/^[a-z0-9-]{8,80}$/.test(slug)) return json({ ok: false, error: "That link isn't complete. Check it, or ask us for a new one." }, 404);
  const db = serviceClient();
  const { data: acc } = await db.from("inbox_accounts").select("id, business, knowledge, signoff, status, baseline_minutes, check_minutes, page_views").eq("slug", slug).maybeSingle();
  if (!acc || acc.status === "disconnected") return json({ ok: false, error: "This page isn't available any more. Ask us if you'd like it back." }, 404);

  // ----- the page loading: who it's for, and this week's numbers -----
  if (body.info === true) {
    db.from("inbox_accounts").update({ page_views: (Number(acc.page_views) || 0) + 1 }).eq("id", acc.id).then(() => {}, () => {});
    const { data: rows } = await db.from("inbox_drafts").select("status, similarity, account_id").eq("account_id", acc.id).gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(2000);
    const r = inboxResult(rows || [], [acc]);
    const sent = (rows || []).filter((x: { status: string; similarity: number | null }) => x.status === "sent");
    const { count: learned } = await db.from("inbox_examples").select("id", { count: "exact", head: true }).eq("account_id", acc.id).then((x: { count: number | null }) => x, () => ({ count: 0 }));
    return json({ ok: true, business: acc.business, paused: acc.status === "paused", online: await hubOnline(), learned: learned ?? 0, week: { drafted: r?.drafted ?? 0, used: sent.filter((x: { similarity: number | null }) => Number(x.similarity) >= 0.75).length, edited: sent.filter((x: { similarity: number | null }) => Number(x.similarity) < 0.75).length, hours: r?.hours ?? 0 } });
  }

  // ----- teaching it: the reply they actually sent -----
  if (body.id && typeof body.teach === "string") {
    const { data: row } = await db.from("inbox_drafts").select("id, gist, status").eq("id", String(body.id)).eq("account_id", acc.id).maybeSingle();
    if (!row || isSummary(row.status)) return json({ ok: false, error: "not found" }, 404);
    // only their reply: a copy from the Sent folder often quotes the customer's email under it, and that isn't kept
    const own = stripQuoted(body.teach).trim();
    if (own.length < 20) return json({ ok: false, error: "Paste the whole reply you sent." }, 400);
    await saveExample(db, acc.id, { reply: own, gist: row.gist, source: "own", draftId: row.id });
    return json({ ok: true });
  }

  // ----- an outcome click -----
  if (body.id && body.outcome) {
    const o = OUTCOME[String(body.outcome)];
    if (!o) return json({ ok: false, error: "unknown outcome" }, 400);
    const { data: row } = await db.from("inbox_drafts").select("id, status, gist").eq("id", String(body.id)).eq("account_id", acc.id).maybeSingle();
    if (!row) return json({ ok: false, error: "not found" }, 404);
    // sent as written: that reply is how they'd answer, so it's kept as an example
    if (body.outcome === "used" && !isSummary(row.status) && typeof body.reply === "string") await saveExample(db, acc.id, { reply: body.reply, gist: row.gist, source: "approved", draftId: row.id });
    const patch = isSummary(row.status)
      ? { status: body.outcome === "unused" ? "summary_unused" : "summary_used", similarity: null }
      : { status: o.status, similarity: o.similarity };
    await db.from("inbox_drafts").update({ ...patch, resolved_at: new Date().toISOString() }).eq("id", row.id);
    return json({ ok: true });
  }

  // ----- a draft -----
  if (acc.status === "paused") return json({ ok: false, error: "This page is paused at the moment. Message us and we'll switch it back on." }, 200);
  const email = String(body.email || "").trim();
  if (email.length < 10) return json({ ok: false, error: "Paste a customer email first." }, 400);
  const summarise = body.summarise === true;
  if (email.length > (summarise ? MAX_THREAD : MAX_CHARS)) return json({ ok: false, error: summarise ? "That thread is very long. Paste the most recent part (up to about 15,000 characters)." : "That's a long one. Paste just the one email." }, 400);
  const key = "t:" + await hashKey("re-charge-trial:", clientIp(req));
  const pageKey = "p:" + acc.id;   // every AI call this page makes
  const [mine, page] = await Promise.all([countHits(db, { key }, 3600e3), countHits(db, { key: pageKey }, 864e5)]);
  // fail closed: every draft is a paid AI call, so don't make one we can't count
  if (mine === null || page === null) return json({ ok: false, error: "Busy for a moment. Try again in a minute." }, 200);
  if (mine >= PER_IP_HOUR) return json({ ok: false, error: "Lots of drafts from your office this hour. Message us on WhatsApp and we'll raise the limit." }, 200);
  if (page >= PER_PAGE_DAY) return json({ ok: false, error: "This page has reached today's limit. It resets tomorrow; message us if you need more." }, 200);

  if (summarise) {
    let sm;
    try { sm = await summariseThread(acc, email); }
    catch (e) {
      if (e instanceof AiOffline) return json({ ok: false, offline: true, error: OFFLINE }, 200);
      console.error("inbox-trial: summary failed", (e as Error).message);
      await recordHits(db, [key, pageKey]);   // the AI computer did the work, even if the answer was unusable
      return json({ ok: false, error: "We couldn't summarise that one just now. Please try again." }, 200);
    }
    await recordHits(db, [key, pageKey]);
    const { data: row } = await db.from("inbox_drafts").insert({ account_id: acc.id, message_id: "page:" + crypto.randomUUID(), status: "summary", gist: ("Thread: " + (sm.what || "")).slice(0, 300), checks: [] }).select("id").single();
    return json({ ok: true, id: row?.id, summary: sm });
  }
  // A re-draft replaces a draft nobody has marked yet: that one is set aside as "redrafted" (it counts as
  // neither used nor unused, so one email is never counted twice). Once it's been marked, there's nothing to replace.
  let note = "";
  if (body.redraft) {
    const { data: was } = await db.from("inbox_drafts").update({ status: "redrafted", similarity: null, resolved_at: new Date().toISOString() }).eq("id", String(body.redraft)).eq("account_id", acc.id).eq("status", "drafted").select("id");
    if (!was?.length) return json({ ok: false, error: "That reply is already marked. Paste the email again for a fresh draft." }, 200);
    note = typeof body.note === "string" ? body.note : "";
  }
  let out;
  try {
    out = await writeReply(acc, { from: "a customer", subject: String(body.subject || "").slice(0, 200), text: email }, "inbox-draft", 60_000, { examples: await loadExamples(db, acc.id), note });
  } catch (e) {
    if (e instanceof AiOffline) return json({ ok: false, offline: true, error: OFFLINE }, 200);
    console.error("inbox-trial: draft failed", (e as Error).message);
    await recordHits(db, [key, pageKey]);
    return json({ ok: false, error: "We couldn't draft that one just now. Please try again." }, 200);
  }
  await recordHits(db, [key, pageKey]);
  if ("skip" in out) return json({ ok: true, skipped: out.skip, gist: out.gist || "" });
  const d = out.draft;
  const { data: row } = await db.from("inbox_drafts").insert({
    account_id: acc.id, message_id: "page:" + crypto.randomUUID(), status: "drafted", gist: (d.gist || "").slice(0, 300), checks: d.check,
  }).select("id").single();
  return json({ ok: true, id: row?.id, draft: { gist: d.gist, reply: d.reply, check: d.check } });
});
