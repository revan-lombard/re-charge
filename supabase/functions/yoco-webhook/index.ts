// yoco-webhook — receives Yoco payment events and reconciles them to projects.
//
// Register this URL in the Yoco dashboard (Sell online → Webhooks); Yoco returns
// a signing secret (whsec_...) → set it as YOCO_WEBHOOK_SECRET. Yoco signs with
// the Standard Webhooks scheme (webhook-id / webhook-timestamp / webhook-signature).
// Docs: https://developer.yoco.com/online/api-reference/webhooks
//
// Reconciliation:
//   * If the payment carries metadata.projectId (payments created via
//     create-yoco-checkout), it is matched to that exact project — reliable.
//   * Otherwise (a static pay-link payment) we store it and try to match the
//     typed reference against a project ref (RC-#####); unmatched payments wait
//     in the payments table for manual matching.
//
// Deploy public (no JWT) — the signature is the auth. Untested — deploy & verify.
import { serviceClient } from "../_shared/db.ts";

const TOLERANCE_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const secret = Deno.env.get("YOCO_WEBHOOK_SECRET");
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sig = req.headers.get("webhook-signature");

  if (secret) {
    if (!id || !ts || !sig) return new Response("missing signature headers", { status: 400 });
    if (Math.abs(Date.now() - Number(ts) * 1000) > TOLERANCE_MS) {
      return new Response("stale timestamp", { status: 400 });
    }
    const ok = await verify(secret, id, ts, raw, sig);
    if (!ok) return new Response("bad signature", { status: 401 });
  } else {
    console.warn("YOCO_WEBHOOK_SECRET not set — skipping signature check (dev only)");
  }

  let evt: Record<string, unknown>;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const type = String(evt.type ?? "");
  // Yoco nests the object under `payload` (Standard Webhooks) or `data`.
  const payload = (evt.payload ?? evt.data ?? {}) as Record<string, any>;
  const succeeded = type.includes("succeeded") || payload.status === "succeeded";
  if (!succeeded) return new Response("ignored", { status: 200 });

  const providerId = String(payload.id ?? evt.id ?? id ?? crypto.randomUUID());
  const amount = Number(payload.amount ?? payload.totalAmount ?? 0) || null;
  const currency = String(payload.currency ?? "ZAR");
  const metadata = (payload.metadata ?? {}) as Record<string, any>;
  const email = payload.customer?.email ?? payload.email ?? null;
  const reference = metadata.ref ?? payload.reference ?? payload.displayName ?? null;

  const db = serviceClient();

  // resolve the project: metadata first, then a ref found in the reference text
  let projectId: string | null = metadata.projectId ?? null;
  if (!projectId && typeof reference === "string") {
    const m = reference.match(/RC-\d{4,}/i);
    if (m) {
      const { data } = await db.from("projects").select("id").eq("ref", m[0].toUpperCase()).maybeSingle();
      projectId = data?.id ?? null;
    }
  }

  // idempotent insert (unique on provider + provider_id)
  const { error: payErr } = await db.from("payments").upsert({
    project_id: projectId,
    provider: "yoco",
    provider_id: providerId,
    amount_cents: amount,
    currency,
    reference: reference ?? null,
    email,
    status: "succeeded",
    matched: Boolean(projectId),
    raw: evt,
  }, { onConflict: "provider,provider_id", ignoreDuplicates: true });
  if (payErr) { console.error("payment insert failed:", payErr); return new Response("db error", { status: 500 }); }

  if (projectId) {
    await db.from("projects").update({ deposit_paid: true, status: "deposit_paid" })
      .eq("id", projectId).eq("status", "new"); // only advance a brand-new lead
    await db.from("projects").update({ deposit_paid: true }).eq("id", projectId);
    await db.from("project_events").insert({
      project_id: projectId, kind: "payment", note: "R500 deposit received",
      data: { providerId, amount, currency },
    });
  }

  return new Response("ok", { status: 200 });
});

// ---- Standard Webhooks signature verification ----
async function verify(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  const keyBytes = base64ToBytes(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = bytesToBase64(new Uint8Array(mac));
  // header is space-separated "v1,<sig>" pairs
  const provided = header.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  return provided.some((p) => timingSafeEqual(p, expected));
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToBase64(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
