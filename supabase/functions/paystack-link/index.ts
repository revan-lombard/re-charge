// paystack-link — the panel's "card set-up link" for a monthly client.
//
// Staff only (verify_jwt = true). { clientId } → a Paystack checkout for one
// month of their plan. When they pay it, paystack-webhook records the payment,
// moves their due date on a month and saves the card; from then on care-billing
// charges that card by itself on each due date.
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { initialize, loadSetting, saveSetting } from "../_shared/paystack.ts";

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req).catch(() => null);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!clientId) return json({ ok: false, error: "clientId required" }, 400);

  const db = serviceClient();
  const { data: c } = await db.from("clients").select("id, name, email, report_emails, care_plan, care_amount_cents").eq("id", clientId).maybeSingle();
  if (!c) return json({ ok: false, error: "client not found" }, 404);
  const email = (c.email || (Array.isArray(c.report_emails) ? c.report_emails[0] : "") || "").trim();
  if (!email) return json({ ok: false, error: "Add the client's email first" }, 400);
  if (!(c.care_amount_cents >= 100)) return json({ ok: false, error: "Set the monthly amount first" }, 400);

  const { data: project } = await db.from("projects").select("id").eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const description = `Monthly plan, card set-up — ${c.name}`;
  const { data: reqRow, error } = await db.from("payment_requests").insert({ project_id: project?.id ?? null, client_id: c.id, amount_cents: c.care_amount_cents, kind: "care", description, provider: "paystack" }).select("id").single();
  if (error) return json({ ok: false, error: error.message }, 500);
  try {
    const ck = await initialize({ email, amountCents: c.care_amount_cents, setup: true, metadata: { projectId: project?.id ?? "", clientId: c.id, kind: "care", requestId: reqRow.id, description } });
    await db.from("payment_requests").update({ checkout_id: ck.reference, redirect_url: ck.url }).eq("id", reqRow.id);
    const cur = await loadSetting(db, c.id);
    if (!cur.auto) await saveSetting(db, c.id, { ...cur, auto: true });
    return json({ ok: true, url: ck.url, email });
  } catch (e) {
    await db.from("payment_requests").update({ status: "cancelled" }).eq("id", reqRow.id);
    return json({ ok: false, error: (e as Error).message }, 502);
  }
});
