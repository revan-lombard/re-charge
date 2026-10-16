// inbox-trial — the client's private Inbox Assistant page (trial.html?t=<slug>). Public: the
// slug is the key (long and unguessable), and everything is capped per page and per person.
//
// POST { t, info: true }                       → { ok, business, week: { drafted, used, edited, hours } }
// POST { t, email, subject? }                  → { ok, id, draft: { gist, reply, check } }
// POST { t, email, summarise: true }          → { ok, id, summary: { what, agreed, open, why, todo } }
// POST { t, id, outcome: "used"|"edited"|"unused" } → { ok }
//
// Every draft is recorded in inbox_drafts (no email text is kept: a one-line gist and the gaps
// only). The outcome click is the measurement: "used" counts the full time saved, "edited" half,
// "unused" nothing — the same rule as a connected inbox.
//
// Caps: PER_PAGE_DAY AI calls a page a day (drafts, summaries and pasted text that turned out not
// to be a customer email all count: each one is paid; it's the real cost bound, since a forwarded
// link can come from anywhere) and PER_IP_HOUR from one address an hour, high enough for a whole office behind
// one internet connection. Both can be changed with the secrets INBOX_TRIAL_PER_PAGE_DAY and
// INBOX_TRIAL_PER_IP_HOUR. Every draft is a paid AI call, so if the caps can't be checked the
// page says "try again" rather than drafting uncounted.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { writeReply, summariseThread } from "../_shared/draft_reply.ts";
import { inboxResult } from "../_shared/inbox_stats.ts";
import { clientIp, hashKey, countHits, recordHits } from "../_shared/limits.ts";

const envInt = (k: string, d: number) => { const n = Number(Deno.env.get(k)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
const PER_PAGE_DAY = envInt("INBOX_TRIAL_PER_PAGE_DAY", 250);   // drafts a page can make in a day
const PER_IP_HOUR = envInt("INBOX_TRIAL_PER_IP_HOUR", 150);     // and one office connection in an hour
const MAX_CHARS = 8000;
const MAX_THREAD = 30000;   // a long thread can be long
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
    return json({ ok: true, business: acc.business, paused: acc.status === "paused", week: { drafted: r?.drafted ?? 0, used: sent.filter((x: { similarity: number | null }) => Number(x.similarity) >= 0.75).length, edited: sent.filter((x: { similarity: number | null }) => Number(x.similarity) < 0.75).length, hours: r?.hours ?? 0 } });
  }

  // ----- an outcome click -----
  if (body.id && body.outcome) {
    const o = OUTCOME[String(body.outcome)];
    if (!o) return json({ ok: false, error: "unknown outcome" }, 400);
    const { data: row } = await db.from("inbox_drafts").select("id, status").eq("id", String(body.id)).eq("account_id", acc.id).maybeSingle();
    if (!row) return json({ ok: false, error: "not found" }, 404);
    await db.from("inbox_drafts").update({ status: o.status, similarity: o.similarity, resolved_at: new Date().toISOString() }).eq("id", row.id);
    return json({ ok: true });
  }

  // ----- a draft -----
  if (acc.status === "paused") return json({ ok: false, error: "This page is paused at the moment. Message us and we'll switch it back on." }, 200);
  const email = String(body.email || "").trim();
  if (email.length < 10) return json({ ok: false, error: "Paste a customer email first." }, 400);
  const summarise = body.summarise === true;
  if (email.length > (summarise ? MAX_THREAD : MAX_CHARS)) return json({ ok: false, error: summarise ? "That thread is very long. Paste the most recent part (up to about 30,000 characters)." : "That's a long one. Paste just the one email." }, 400);
  const key = "t:" + await hashKey("re-charge-trial:", clientIp(req));
  const pageKey = "p:" + acc.id;   // every AI call this page makes
  const [mine, page] = await Promise.all([countHits(db, { key }, 3600e3), countHits(db, { key: pageKey }, 864e5)]);
  // fail closed: every draft is a paid AI call, so don't make one we can't count
  if (mine === null || page === null) return json({ ok: false, error: "Busy for a moment. Try again in a minute." }, 200);
  if (mine >= PER_IP_HOUR) return json({ ok: false, error: "Lots of drafts from your office this hour. Message us on WhatsApp and we'll raise the limit." }, 200);
  if (page >= PER_PAGE_DAY) return json({ ok: false, error: "This page has reached today's limit. It resets tomorrow; message us if you need more." }, 200);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ ok: false, error: "This isn't switched on yet." }, 503);
  if (summarise) {
    let sm;
    try { sm = await summariseThread(new Anthropic({ apiKey }), acc, email); }
    catch (e) { console.error("inbox-trial: summary failed", e); return json({ ok: false, error: "We couldn't summarise that just now. Please try again." }, 502); }
    await recordHits(db, [key, pageKey]);
    if (!sm) return json({ ok: false, error: "It couldn't summarise that one. Try pasting the thread again." }, 200);
    const { data: row } = await db.from("inbox_drafts").insert({ account_id: acc.id, message_id: "page:" + crypto.randomUUID(), status: "drafted", gist: ("Thread: " + (sm.what || "")).slice(0, 300), checks: [] }).select("id").single();
    return json({ ok: true, id: row?.id, summary: sm });
  }
  let out;
  try {
    out = await writeReply(new Anthropic({ apiKey }), acc, { from: "a customer", subject: String(body.subject || "").slice(0, 200), text: email });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ ok: false, error: "Busy for a moment. Try again in a minute." }, 200);
    console.error("inbox-trial: draft failed", e);
    return json({ ok: false, error: "We couldn't draft that just now. Please try again." }, 502);
  }
  await recordHits(db, [key, pageKey]);
  if ("skip" in out) return json({ ok: true, skipped: out.skip, gist: out.gist || "" });
  const d = out.draft;
  const { data: row } = await db.from("inbox_drafts").insert({
    account_id: acc.id, message_id: "page:" + crypto.randomUUID(), status: "drafted", gist: (d.gist || "").slice(0, 300), checks: d.check,
  }).select("id").single();
  return json({ ok: true, id: row?.id, draft: { gist: d.gist, reply: d.reply, check: d.check } });
});
