// create-yoco-checkout — creates a Yoco hosted checkout that carries the
// project id in metadata, so yoco-webhook reconciles the payment exactly.
//
// Two callers:
//   1. The website (no token): { projectId } → the fixed R500 deposit.
//   2. The admin panel (staff JWT): { projectId | clientId, amountCents, kind,
//      description } → any amount ("Request payment"). Stored in
//      payment_requests so the link can be reused and its status tracked.
//
// Requires secret: YOCO_SECRET_KEY (Yoco dashboard → Sell online → API keys).
// Docs: https://developer.yoco.com/online/api-reference/checkout/create-checkout
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";

const DEPOSIT_CENTS = 50000; // R500.00
const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const KINDS = new Set(["deposit", "balance", "care", "other"]);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = Deno.env.get("YOCO_SECRET_KEY");
  if (!secret) return json({ ok: false, error: "payments not configured" }, 503);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const projectId = str(body.projectId);
  const clientId = str(body.clientId);
  const custom = body.amountCents != null;

  const db = serviceClient();
  let amount = DEPOSIT_CENTS;
  let kind = "deposit";
  let description = "R500 deposit";
  let staffId: string | null = null;

  if (custom) {
    const caller = await getCaller(req);
    if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
    staffId = caller.userId;
    amount = Math.round(Number(body.amountCents));
    if (!Number.isFinite(amount) || amount < 100 || amount > 50_000_000) return json({ ok: false, error: "amount out of range" }, 400);
    kind = KINDS.has(String(body.kind)) ? String(body.kind) : "balance";
    description = str(body.description) ?? `${kind} payment`;
    if (!projectId && !clientId) return json({ ok: false, error: "projectId or clientId required" }, 400);
  } else if (!projectId) {
    return json({ ok: false, error: "projectId required" }, 400);
  }

  let project: { id: string; ref: string; business: string | null } | null = null;
  if (projectId) {
    const { data, error } = await db.from("projects").select("id, ref, business").eq("id", projectId).single();
    if (error || !data) return json({ ok: false, error: "unknown project" }, 404);
    project = data;
  }
  let client: { id: string; name: string } | null = null;
  if (clientId) {
    const { data } = await db.from("clients").select("id, name").eq("id", clientId).maybeSingle();
    client = data ?? null;
  }

  // a request row first, so the checkout's metadata can point back at it
  let requestId: string | null = null;
  if (custom) {
    const { data: reqRow, error } = await db.from("payment_requests").insert({
      project_id: project?.id ?? null, client_id: client?.id ?? null, amount_cents: amount, kind, description,
    }).select("id").single();
    if (error) return json({ ok: false, error: "could not store request" }, 500);
    requestId = reqRow.id;
  }

  const back = `${SITE}/start?paid=`;
  try {
    const res = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount, currency: "ZAR",
        metadata: { projectId: project?.id ?? "", ref: project?.ref ?? "", clientId: client?.id ?? "", kind, requestId: requestId ?? "", description },
        successUrl: `${back}1&kind=${kind}`, cancelUrl: `${back}0`, failureUrl: `${back}0`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("yoco checkout error:", data);
      if (requestId) await db.from("payment_requests").update({ status: "cancelled" }).eq("id", requestId);
      return json({ ok: false, error: "checkout failed" }, 502);
    }
    if (requestId) await db.from("payment_requests").update({ checkout_id: data.id, redirect_url: data.redirectUrl }).eq("id", requestId);
    if (project) {
      await db.from("project_events").insert({
        project_id: project.id, kind: "payment",
        note: custom ? `Payment link created: ${fmt(amount)} (${kind}) — ${description}` : "Deposit checkout created",
        data: { checkoutId: data.id, requestId, amount, kind, by: staffId ?? "website" },
      });
    }
    return json({ ok: true, redirectUrl: data.redirectUrl, checkoutId: data.id, requestId });
  } catch (e) {
    console.error("checkout exception:", e);
    return json({ ok: false, error: "checkout failed" }, 502);
  }
});

function str(v: unknown): string | null { const s = (v ?? "").toString().trim(); return s.length ? s : null; }
function fmt(cents: number): string { return "R" + Math.round(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
