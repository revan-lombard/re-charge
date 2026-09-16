// create-yoco-checkout — creates a Yoco checkout for the R500 deposit that
// carries the project id in metadata, so the webhook can reconcile the payment
// to the exact project automatically (no fuzzy reference matching).
//
// This is the ROBUST alternative to the static pay.yoco.com link. To use it,
// the website calls this with { projectId } after intake succeeds, then sends
// the visitor to the returned redirectUrl.
//
// Requires secret: YOCO_SECRET_KEY (Yoco dashboard → Sell online → API keys).
// Docs: https://developer.yoco.com/online/api-reference/checkout/create-checkout
// Untested against a live account — deploy and verify.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";

const DEPOSIT_CENTS = 50000; // R500.00
const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = Deno.env.get("YOCO_SECRET_KEY");
  if (!secret) return json({ ok: false, error: "payments not configured" }, 503);

  let projectId: string | undefined;
  try {
    ({ projectId } = await req.json());
  } catch { /* ignore */ }
  if (!projectId) return json({ ok: false, error: "projectId required" }, 400);

  // confirm the project exists (and grab its ref for the reference field)
  const db = serviceClient();
  const { data: project, error: pErr } = await db
    .from("projects").select("id, ref").eq("id", projectId).single();
  if (pErr || !project) return json({ ok: false, error: "unknown project" }, 404);

  try {
    const res = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: DEPOSIT_CENTS,
        currency: "ZAR",
        metadata: { projectId: project.id, ref: project.ref, kind: "deposit" },
        successUrl: `${SITE}/start.html?paid=1`,
        cancelUrl: `${SITE}/start.html?paid=0`,
        failureUrl: `${SITE}/start.html?paid=0`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("yoco checkout error:", data);
      return json({ ok: false, error: "checkout failed" }, 502);
    }
    await db.from("project_events").insert({
      project_id: project.id, kind: "payment", note: "Deposit checkout created",
      data: { checkoutId: data.id },
    });
    return json({ ok: true, redirectUrl: data.redirectUrl, checkoutId: data.id });
  } catch (e) {
    console.error("checkout exception:", e);
    return json({ ok: false, error: "checkout failed" }, 502);
  }
});
