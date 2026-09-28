// finder — prospect finder (see _shared/finder.ts).
// POST { action: "status" | "setup" | "config" | "pull", config? }
//   status/setup/config: staff only. pull: anyone (throttled) — it only imports
//   finds that were encrypted with our own public key.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { setup, writeConfig, pullFinds, DEFAULT_CONFIG } from "../_shared/finder.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const db = serviceClient();
  const action = String(body.action ?? "pull");
  try {
    if (action === "pull") {
      const caller = await getCaller(req);
      if (!caller?.isStaff) {
        const { data } = await db.from("settings").select("value").eq("key", "finder_pull").maybeSingle();
        const at = (data?.value as { at?: string } | null)?.at;
        if (at && Date.now() - Date.parse(at) < 5 * 60000) return json({ ok: true, skipped: "ran recently" });
      }
      await db.from("settings").upsert({ key: "finder_pull", value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
      return json({ ok: true, ...(await pullFinds(db)) });
    }
    const caller = await getCaller(req);
    if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
    if (action === "status") {
      const [{ data: key }, { data: cfg }, { data: last }] = await Promise.all([
        db.from("private_keys").select("created_at").eq("name", "finder").maybeSingle(),
        db.from("settings").select("value").eq("key", "finder").maybeSingle(),
        db.from("settings").select("value").eq("key", "finder_last").maybeSingle(),
      ]);
      return json({ ok: true, ready: Boolean(key), config: cfg?.value ?? { ...DEFAULT_CONFIG, enabled: true }, last: last?.value ?? null });
    }
    if (action === "setup") {
      const r = await setup(db);
      const { data: cfg } = await db.from("settings").select("value").eq("key", "finder").maybeSingle();
      const saved = await writeConfig((cfg?.value as typeof DEFAULT_CONFIG & { enabled: boolean }) ?? { ...DEFAULT_CONFIG, enabled: true });
      await db.from("settings").upsert({ key: "finder", value: saved, updated_at: new Date().toISOString() });
      return json({ ok: true, ...r, config: saved });
    }
    if (action === "config") {
      const c = (body.config ?? {}) as { areas?: unknown; types?: unknown; perRun?: unknown; enabled?: unknown };
      const saved = await writeConfig({ areas: Array.isArray(c.areas) ? c.areas as string[] : DEFAULT_CONFIG.areas, types: Array.isArray(c.types) ? c.types as string[] : DEFAULT_CONFIG.types, perRun: Number(c.perRun) || 20, enabled: c.enabled !== false });
      await db.from("settings").upsert({ key: "finder", value: saved, updated_at: new Date().toISOString() });
      return json({ ok: true, config: saved });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    console.error("finder:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
