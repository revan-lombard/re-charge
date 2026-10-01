// notify-push — the panel's side of phone alerts (Settings → Phone alerts).
// Staff only (verify_jwt = true, plus a staff check):
//   { action: "key" }                         → { publicKey } to subscribe with
//   { action: "subscribe", subscription, label } → saves this device
//   { action: "unsubscribe", endpoint }       → removes it
//   { action: "list" }                        → this user's devices
//   { action: "test" }                        → sends a test alert to this user's devices
import { preflight, json } from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/db.ts";
import { vapidKeys, sendPush } from "../_shared/push.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "not allowed" }, 403);
  const db = serviceClient();
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === "key") return json({ ok: true, publicKey: (await vapidKeys(db)).publicKey });
    if (body.action === "subscribe") {
      const s = body.subscription ?? {};
      const endpoint = String(s.endpoint ?? ""), p256dh = String(s.keys?.p256dh ?? ""), auth = String(s.keys?.auth ?? "");
      if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return json({ ok: false, error: "bad subscription" }, 400);
      const { error } = await db.from("push_subscriptions").upsert({ endpoint, p256dh, auth, user_id: caller.userId, label: String(body.label ?? "").slice(0, 80) || null, last_error: null }, { onConflict: "endpoint" });
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action === "unsubscribe") {
      await db.from("push_subscriptions").delete().eq("endpoint", String(body.endpoint ?? "")).eq("user_id", caller.userId);
      return json({ ok: true });
    }
    if (body.action === "list") {
      const { data } = await db.from("push_subscriptions").select("endpoint, label, created_at, last_ok_at, last_error").eq("user_id", caller.userId).order("created_at");
      return json({ ok: true, devices: data ?? [] });
    }
    if (body.action === "test") {
      const r = await sendPush(db, { title: "Re-Charge alerts are on ✓", body: "You'll get a buzz like this for every new lead, accepted quote and payment.", url: "/admin/#/", tag: "test" }, caller.userId);
      return json({ ok: true, ...r });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    console.error("notify-push:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
