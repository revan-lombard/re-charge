// Rate-limit plumbing for the public endpoints (assistant, inbox-trial, project-intake).
//
// Hits live in assistant_hits (0023): one row per counted request, keyed by a hash of who asked
// (never the IP or email itself). Each feature has its own key prefix and its own ceiling, so one
// busy feature can't switch another off:
//   (no prefix) website chat questions     d: "try it on your own email"     t: client trial pages (per IP)
//   p: client trial pages (per page)
//   i: website form submissions (per IP)   m: form submissions (per email)   e: automatic thank-you emails (per address)
//   f: the one "unusually many forms today" warning a day
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Who is asking. cf-connecting-ip is set by Cloudflare to the address that really connected (and
// replaces any value a client sends), so it's preferred when the platform passes it on. Otherwise
// the first x-forwarded-for entry, which a script can choose freely: per-person caps are a courtesy
// limit, and the per-feature daily totals are what actually bound the cost.
export function clientIp(req: Request): string {
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf.slice(0, 64);
  return ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown").slice(0, 64);
}

// A short, salted SHA-256 of a value: enough to count by, nothing personal stored.
export async function hashKey(salt: string, value: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + value));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// How many hits in the last `ms`: for one key, for every key with a prefix, or (unprefixed) for the
// chat's own rows only. null when the count couldn't be read, so callers can decide to fail closed.
export async function countHits(db: SupabaseClient, sel: { key?: string; prefix?: string; unprefixed?: boolean }, ms: number): Promise<number | null> {
  try {
    let q = db.from("assistant_hits").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - ms).toISOString());
    if (sel.key) q = q.eq("ip_hash", sel.key);
    else if (sel.prefix) q = q.like("ip_hash", sel.prefix + "%");
    else if (sel.unprefixed) q = q.not("ip_hash", "like", "%:%");
    const { count, error } = await q;
    if (error || typeof count !== "number") { if (error) console.error("rate limit count failed:", error.message); return null; }
    return count;
  } catch (e) {
    console.error("rate limit count failed:", e);
    return null;
  }
}

// Record hits (best effort), and now and then clear rows older than two days so the table stays tiny.
export async function recordHits(db: SupabaseClient, keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await db.from("assistant_hits").insert(keys.map((ip_hash) => ({ ip_hash })));
    if (Math.random() < 0.02) await db.from("assistant_hits").delete().lt("created_at", new Date(Date.now() - 2 * 86400e3).toISOString());
  } catch (e) { console.error("could not record the hit:", e); }
}

// Insert-first claim, for caps that must hold even when many requests arrive at once (a script
// sending 50 in parallel would otherwise all pass a count-then-insert check): record this hit,
// then count the hits for the same key that came before it.
//   "ok": fewer than `max` earlier hits in the window   "over": already at the cap
//   "error": the count couldn't be read (callers fail closed where it matters)
export type Claim = { state: "ok" | "over" | "error"; id: number | null };
export async function claimHit(db: SupabaseClient, key: string, ms: number, max: number): Promise<Claim> {
  try {
    const { data, error } = await db.from("assistant_hits").insert({ ip_hash: key }).select("id").single();
    if (error || !data) { if (error) console.error("rate limit claim failed:", error.message); return { state: "error", id: null }; }
    const id = Number(data.id);
    const { count, error: e2 } = await db.from("assistant_hits").select("id", { count: "exact", head: true })
      .eq("ip_hash", key).lt("id", id).gte("created_at", new Date(Date.now() - ms).toISOString());
    if (e2 || typeof count !== "number") return { state: "error", id };
    return { state: count < max ? "ok" : "over", id };
  } catch (e) {
    console.error("rate limit claim failed:", e);
    return { state: "error", id: null };
  }
}
// Take back a claim that didn't go ahead, so a refused request doesn't count towards the totals.
export async function dropHit(db: SupabaseClient, id: number | null): Promise<void> {
  if (id === null) return;
  try { await db.from("assistant_hits").delete().eq("id", id); } catch { /* best effort */ }
}
