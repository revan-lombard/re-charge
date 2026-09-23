// resend-webhook — optional. Resend posts delivery events here so the admin
// timeline shows delivered / bounced / complained for emails you sent.
//
// Setup: Resend → Webhooks → Add endpoint → this function's URL → choose
// email.delivered, email.bounced, email.complained (and email.opened if you
// want it) → copy the signing secret (whsec_...) into RESEND_WEBHOOK_SECRET.
// Resend signs with the Standard Webhooks scheme (svix-id / svix-timestamp /
// svix-signature). Deploy public (no JWT) — the signature is the auth.
import { serviceClient } from "../_shared/db.ts";

const TOLERANCE_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id");
  const ts = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp");
  const sig = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
  if (!secret) return new Response("RESEND_WEBHOOK_SECRET not set", { status: 500 });
  if (!id || !ts || !sig) return new Response("missing signature headers", { status: 400 });
  if (Math.abs(Date.now() - Number(ts) * 1000) > TOLERANCE_MS) return new Response("stale timestamp", { status: 400 });
  if (!(await verify(secret, id, ts, raw, sig))) return new Response("bad signature", { status: 401 });

  let evt: { type?: string; data?: Record<string, unknown> };
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const type = String(evt.type ?? "");
  const emailId = String(evt.data?.email_id ?? "");
  if (!emailId || !type.startsWith("email.")) return new Response("ignored", { status: 200 });

  const map: Record<string, string> = {
    "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained",
    "email.opened": "opened", "email.delivery_delayed": "delayed", "email.failed": "failed",
  };
  const status = map[type];
  if (!status) return new Response("ignored", { status: 200 });

  const db = serviceClient();
  const { data: msg } = await db.from("messages").select("id, project_id, subject, status, meta").eq("provider_id", emailId).maybeSingle();
  if (!msg) return new Response("unknown message", { status: 200 });

  // don't let a late "delivered" overwrite a bounce; "opened" only after delivered
  const rank: Record<string, number> = { sent: 0, delayed: 1, delivered: 2, opened: 3, failed: 4, bounced: 4, complained: 4 };
  if ((rank[status] ?? 0) >= (rank[msg.status] ?? 0)) {
    await db.from("messages").update({ status, meta: { ...(msg.meta ?? {}), [type]: evt.data ?? true } }).eq("id", msg.id);
  }
  if (msg.project_id && (status === "bounced" || status === "complained" || status === "failed")) {
    await db.from("project_events").insert({
      project_id: msg.project_id, kind: "email",
      note: `Email ${status}: "${msg.subject ?? ""}" — check the address`,
      data: { message_id: msg.id, type },
    });
  }
  return new Response("ok", { status: 200 });
});

async function verify(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  const keyBytes = base64ToBytes(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = bytesToBase64(new Uint8Array(mac));
  const provided = header.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  return provided.some((p) => timingSafeEqual(p, expected));
}
function base64ToBytes(b64: string): Uint8Array { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function bytesToBase64(u: Uint8Array): string { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); }
function timingSafeEqual(a: string, b: string): boolean { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
