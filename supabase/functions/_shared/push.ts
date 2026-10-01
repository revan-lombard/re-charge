// Web Push: instant alerts on Revan's phone / computer for new leads, accepted
// quotes and payments. Devices subscribe in the panel (Settings → Phone alerts);
// the payload is encrypted end to end (only that device can read it).
// The VAPID key pair is made on first use and kept in push_keys (service role only);
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets override it if set.
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function vapidKeys(db: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  const envPub = Deno.env.get("VAPID_PUBLIC_KEY"), envPriv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };
  const { data } = await db.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (data) return { publicKey: data.public_key, privateKey: data.private_key };
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  const privateKey = (await crypto.subtle.exportKey("jwk", kp.privateKey)).d!;
  // another call may have raced us: keep whichever row landed first
  await db.from("push_keys").upsert({ id: 1, public_key: publicKey, private_key: privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: row } = await db.from("push_keys").select("public_key, private_key").eq("id", 1).single();
  return { publicKey: row!.public_key, privateKey: row!.private_key };
}

export type Alert = { title: string; body: string; url?: string; tag?: string };

// Send to every subscribed device. Never throws: an alert must not break a form,
// a quote or a payment. Gone devices (404/410) are removed.
export async function sendPush(db: SupabaseClient, alert: Alert, onlyUser?: string): Promise<{ sent: number; failed: number; removed: number }> {
  const out = { sent: 0, failed: 0, removed: 0 };
  try {
    let q = db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (onlyUser) q = q.eq("user_id", onlyUser);
    const { data: subs } = await q;
    if (!subs?.length) return out;
    const { publicKey, privateKey } = await vapidKeys(db);
    webpush.setVapidDetails(`mailto:${Deno.env.get("NOTIFY_EMAIL") || "enquiry.re.charge@gmail.com"}`, publicKey, privateKey);
    const payload = JSON.stringify({ ...alert, title: alert.title.slice(0, 80), body: alert.body.slice(0, 180) });
    await Promise.all(subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        const r = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch(r.endpoint, { method: r.method, headers: r.headers as Record<string, string>, body: new Uint8Array(r.body as Uint8Array) as unknown as BodyInit, signal: ctl.signal }).finally(() => clearTimeout(timer));
        if (res.status === 404 || res.status === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); out.removed++; return; }
        if (res.ok) { out.sent++; await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), last_error: null }).eq("id", s.id); }
        else { out.failed++; await db.from("push_subscriptions").update({ last_error: `${res.status} ${(await res.text()).slice(0, 200)}` }).eq("id", s.id); }
      } catch (e) { out.failed++; await db.from("push_subscriptions").update({ last_error: String(e).slice(0, 200) }).eq("id", s.id); }
    }));
  } catch (e) { console.error("push failed:", e); }
  return out;
}
