// live-demo — interactive examples of AI work, built for one prospect (live-demo.html?d=<slug>).
//
// POST { d }                         (public) → { ok, kind, business, config, items }  (counts a view)
// POST { build: { id, restart? } }   (staff)  → { ok, done, have, total } (and items when done): the
//        AI writes the next few of the ten items for the prospect from the inputs on the demo
//        (live_demos.config) and decides what happens to each, for that kind of work. The panel
//        calls it again until done (restart: true on its first call). Stored once, so every view
//        is free and instant.
//
// The writing is done by Re-Charge's own AI computer: the home PC's model (Ollama with Llama 3.1 8B),
// through the AI hub (_shared/ai.ts), so a demo costs nothing to build. That model sees about 8,000
// tokens at once and one answer is at most 1,500 tokens (room for about two items), and a function
// may run for 150 s at most. So each call writes two items (one, if that answer can't be used), told
// which are already written, and keeps them in data.wip until all ten are there. data.items stays
// as it was until then, so a demo already sent keeps working while it's rebuilt. With the PC off,
// it says so.
//
// One shape for every kind, so one page shows them all:
//   { from_name, from_detail, title, body, received, priority, action, route, reason, output,
//     fields: [{label, value}], auto }
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { AiOffline, hubConfigured } from "../_shared/ai.ts";
import { buildStep, type Cfg } from "../_shared/live_demo.ts";

const BUDGET_MS = 140_000;     // a whole call, inside Supabase's 150 s

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as { d?: string; build?: { id?: string; restart?: boolean; run?: string } };
  const db = serviceClient();

  if (body.build) {
    const started = Date.now();
    const caller = await getCaller(req);
    if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
    if (!hubConfigured()) return json({ ok: false, error: "The AI computer isn't set up yet (LOCAL_AI_TOKEN: ADMIN.md 8da)" }, 503);
    try {
      const r = await buildStep(db, String(body.build.id || ""), Boolean(body.build.restart), String(body.build.run || "").slice(0, 64), started + BUDGET_MS);
      if (r.missing) return json({ ok: false, error: "demo not found" }, 404);
      if (r.conflict) return json({ ok: false, error: "Another build of this demo has started. Wait for it to finish, or press Build again." }, 409);
      return json({ ok: true, ...r });
    } catch (e) {
      if (e instanceof AiOffline) return json({ ok: false, offline: true, error: "The AI computer is offline: switch it on (or wait for it to reconnect), then press Build again." }, 200);
      console.error("live-demo build failed", (e as Error).message);
      return json({ ok: false, error: "Couldn't build it just now: " + (e instanceof Error ? e.message.slice(0, 160) : "unknown error") }, 502);
    }
  }

  // ----- public: the page reading its demo -----
  const slug = String(body.d || "").trim().slice(0, 80);
  if (!/^[a-z0-9-]{8,80}$/.test(slug)) return json({ ok: false, error: "That link isn't complete." }, 404);
  const { data: demo } = await db.from("live_demos").select("id, kind, business, config, data, views").eq("slug", slug).maybeSingle();
  if (!demo || !demo.data?.items?.length) return json({ ok: false, error: "This demo isn't ready yet, or has been removed." }, 404);
  db.from("live_demos").update({ views: (Number(demo.views) || 0) + 1, last_viewed_at: new Date().toISOString() }).eq("id", demo.id).then(() => {}, () => {});
  // the kind, name and numbers the items were built for (older demos: the current ones)
  const c = (demo.data.config || demo.config || {}) as Cfg;
  return json({ ok: true, kind: demo.data.kind || demo.kind, business: demo.data.business || demo.business, config: { per_day: Number(c.per_day) || 40, manual_minutes: Number(c.manual_minutes) || 6, light_minutes: Number(c.light_minutes) || 1.5 }, items: demo.data.items });
});
