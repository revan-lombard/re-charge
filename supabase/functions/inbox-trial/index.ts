// inbox-trial — the client's private Inbox Assistant page (trial.html?t=<slug>). Public: the
// slug is the key (long and unguessable), and everything is capped per page and per person.
//
// POST { t, info: true }                       → { ok, business, week: { drafted, used, edited, hours } }
// POST { t, email, subject? }                  → { ok, id, draft: { gist, reply, check } }
// POST { t, id, outcome: "used"|"edited"|"unused" } → { ok }
//
// Every draft is recorded in inbox_drafts (no email text is kept: a one-line gist and the gaps
// only). The outcome click is the measurement: "used" counts the full time saved, "edited" half,
// "unused" nothing — the same rule as a connected inbox.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { writeReply } from "../_shared/draft_reply.ts";
import { inboxResult } from "../_shared/inbox_stats.ts";

const PER_PAGE_DAY = 250;      // drafts a page can make in a day
const PER_IP_HOUR = 40;        // and one person in an hour
const MAX_CHARS = 8000;
const OUTCOME: Record<string, { status: string; similarity: number | null }> = {
  used: { status: "sent", similarity: 0.95 }, edited: { status: "sent", similarity: 0.6 }, unused: { status: "discarded", similarity: null },
};

async function hash(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("re-charge-trial:" + s));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
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
  if (email.length > MAX_CHARS) return json({ ok: false, error: "That's a long one. Paste just the one email." }, 400);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const key = "t:" + await hash(ip);
  try {
    const [mine, page] = await Promise.all([
      db.from("assistant_hits").select("id", { count: "exact", head: true }).eq("ip_hash", key).gte("created_at", new Date(Date.now() - 3600e3).toISOString()),
      db.from("inbox_drafts").select("id", { count: "exact", head: true }).eq("account_id", acc.id).gte("created_at", new Date(Date.now() - 864e5).toISOString()),
    ]);
    if ((mine.count ?? 0) >= PER_IP_HOUR) return json({ ok: false, error: "That's a lot in one hour. Give it a few minutes and try again." }, 200);
    if ((page.count ?? 0) >= PER_PAGE_DAY) return json({ ok: false, error: "This page has reached today's limit. It resets tomorrow; message us if you need more." }, 200);
  } catch (e) { console.error("inbox-trial: limit check failed, allowing", e); }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ ok: false, error: "This isn't switched on yet." }, 503);
  let out;
  try {
    out = await writeReply(new Anthropic({ apiKey }), acc, { from: "a customer", subject: String(body.subject || "").slice(0, 200), text: email });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ ok: false, error: "Busy for a moment. Try again in a minute." }, 200);
    console.error("inbox-trial: draft failed", e);
    return json({ ok: false, error: "We couldn't draft that just now. Please try again." }, 502);
  }
  try { await db.from("assistant_hits").insert({ ip_hash: key }); } catch { /* best effort */ }
  if ("skip" in out) return json({ ok: true, skipped: out.skip, gist: out.gist || "" });
  const d = out.draft;
  const { data: row } = await db.from("inbox_drafts").insert({
    account_id: acc.id, message_id: "page:" + crypto.randomUUID(), status: "drafted", gist: (d.gist || "").slice(0, 300), checks: d.check,
  }).select("id").single();
  return json({ ok: true, id: row?.id, draft: { gist: d.gist, reply: d.reply, check: d.check } });
});
