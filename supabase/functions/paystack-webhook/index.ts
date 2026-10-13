// paystack-webhook — Paystack tells us a card payment went through.
//
// Paste this function's URL into Paystack → Settings → API Keys & Webhooks
// (Test Webhook URL now, Live Webhook URL once the account is approved).
// Paystack signs every call with x-paystack-signature (HMAC-SHA512 of the body
// with PAYSTACK_SECRET_KEY), so no other secret is needed.
//
// On charge.success: records the payment (provider 'paystack'), closes the
// payment link it came from, and saves the card for automatic monthly charges.
// The payments trigger (0019) moves a monthly client's due date on a month.
import { serviceClient } from "../_shared/db.ts";
import { verifySignature, recordCharge } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  if (!Deno.env.get("PAYSTACK_SECRET_KEY")) { console.error("PAYSTACK_SECRET_KEY not set — refusing webhook"); return new Response("not configured", { status: 500 }); }
  if (!(await verifySignature(raw, req.headers.get("x-paystack-signature")))) return new Response("bad signature", { status: 401 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  if (evt?.event !== "charge.success" || evt?.data?.status !== "success") return new Response("ignored", { status: 200 });

  try {
    const fresh = await recordCharge(serviceClient(), evt.data, evt);
    return new Response(fresh ? "ok" : "duplicate", { status: 200 });
  } catch (e) {
    console.error("paystack payment insert failed:", e);
    return new Response("db error", { status: 500 });
  }
});
