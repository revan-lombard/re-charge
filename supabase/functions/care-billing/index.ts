// care-billing — monthly plan payments, without chasing anyone.
//
// Runs daily (pg_cron, 0019). For every client on a plan billed monthly whose
// next payment is due within 3 days (clients.care_renews_at), it creates a Yoco
// card payment link for that month and emails it to the client, signed by you.
// When they pay, yoco-webhook records it and the payments trigger moves the
// due date on a month. Also offers a bank stop order for those who prefer one.
//
// Pay-monthly websites (0022): until clients.term_until the monthly amount covers
// the website and Care; from the first payment due on or after term_until it drops
// to term_after_cents (Care only) by itself, and the term fields are cleared.
//
// Safe to call by anyone (verify_jwt = false): a client who already has a link
// for this period is skipped, so repeated calls send nothing new. Staff can
// pass { dryRun: true } from the panel to see who would be billed.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { loadProfile, wrapHtml } from "../_shared/mail.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const LEAD_DAYS = 3;
const PLAN = { hosting: "Hosting", care: "Care", business: "Business Care" } as Record<string, string>;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const caller = req.headers.get("Authorization") ? await getCaller(req).catch(() => null) : null;
  const dryRun = Boolean(caller?.isStaff && body?.dryRun);

  const secret = Deno.env.get("YOCO_SECRET_KEY");
  if (!secret) return json({ ok: false, error: "payments not configured" }, 503);
  const db = serviceClient();

  const horizon = new Date(Date.now() + LEAD_DAYS * 86400e3).toISOString().slice(0, 10);
  const { data: due, error } = await db.from("clients")
    .select("id, name, email, report_emails, care_plan, care_amount_cents, care_renews_at, term_until, term_after_cents")
    .eq("care_active", true).eq("billing", "monthly").lte("care_renews_at", horizon).gte("care_amount_cents", 100);
  if (error) return json({ ok: false, error: error.message }, 500);

  const inbox = Deno.env.get("NOTIFY_EMAIL") ?? "";
  const prof = await loadProfile(db, inbox);
  const out: Array<Record<string, unknown>> = [];
  for (const c of due ?? []) {
    // the website is paid off: from now on it's Care only
    if (c.term_until && c.care_renews_at >= c.term_until && c.term_after_cents) {
      if (!dryRun) await db.from("clients").update({ care_amount_cents: c.term_after_cents, term_until: null, term_after_cents: null }).eq("id", c.id);
      c.care_amount_cents = c.term_after_cents; c.term_until = null;
    }
    // already asked for this period?
    const periodStart = new Date(Date.parse(c.care_renews_at + "T00:00:00Z") - 20 * 86400e3).toISOString();
    const { data: prior } = await db.from("payment_requests").select("id").eq("client_id", c.id).eq("kind", "care").neq("status", "cancelled").gte("created_at", periodStart).limit(1);
    if (prior?.length) { out.push({ client: c.id, status: "skipped:already-sent" }); continue; }
    const to = (c.email || (Array.isArray(c.report_emails) ? c.report_emails[0] : "") || "").trim();
    if (!to) { out.push({ client: c.id, status: "skipped:no-email" }); continue; }

    const month = new Date(c.care_renews_at + "T12:00:00Z").toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
    const plan = PLAN[c.care_plan] ?? "Care";
    const description = `${c.term_until ? "Website + " : ""}${plan} plan, ${month} — ${c.name}`;
    if (dryRun) { out.push({ client: c.id, status: "would-send", to, amount: c.care_amount_cents, description }); continue; }

    const { data: project } = await db.from("projects").select("id, name").eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: reqRow, error: rErr } = await db.from("payment_requests").insert({ project_id: project?.id ?? null, client_id: c.id, amount_cents: c.care_amount_cents, kind: "care", description }).select("id").single();
    if (rErr) { out.push({ client: c.id, status: "error", error: rErr.message }); continue; }

    const res = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: c.care_amount_cents, currency: "ZAR",
        metadata: { projectId: project?.id ?? "", ref: "", clientId: c.id, kind: "care", requestId: reqRow.id, description },
        successUrl: `${SITE}/start?paid=1&kind=care`, cancelUrl: `${SITE}/start?paid=0`, failureUrl: `${SITE}/start?paid=0`,
      }),
    });
    const co = await res.json().catch(() => ({}));
    if (!res.ok || !co?.redirectUrl) {
      await db.from("payment_requests").update({ status: "cancelled" }).eq("id", reqRow.id);
      out.push({ client: c.id, status: "error", error: "checkout failed" }); continue;
    }
    await db.from("payment_requests").update({ checkout_id: co.id, redirect_url: co.redirectUrl }).eq("id", reqRow.id);

    const first = String(project?.name ?? "").trim().split(/\s+/)[0] || "there";
    const subject = `${c.name}: your ${plan} plan for ${month}`;
    const text = `Hi ${first},\n\nHere's the link for ${c.name}'s ${plan} plan for ${month} (${money(c.care_amount_cents)}):\n\n${co.redirectUrl}\n\nIt takes a minute by card. If you'd rather set up a monthly bank stop order, just reply and I'll send you the banking details.\n\nThanks,\n\n${prof.sig.text || prof.myName || "Re-Charge"}`;
    const sent = await sendEmail(to, subject, text, wrapHtml(text, prof.sig), prof.replyTo);
    await db.from("messages").insert({ project_id: project?.id ?? null, kind: "email", to_address: to, subject, body: text, status: sent ? "sent" : "failed", meta: { auto: "care-billing", client_id: c.id, request_id: reqRow.id } });
    if (project?.id) await db.from("project_events").insert({ project_id: project.id, kind: "payment", note: `${plan} payment link for ${month} emailed automatically (${money(c.care_amount_cents)})`, data: { requestId: reqRow.id, auto: true } });
    out.push({ client: c.id, status: sent ? "sent" : "send-failed", to });
  }

  const sent = out.filter((o) => o.status === "sent");
  if (sent.length && !dryRun) await notifyEmail(`Monthly plan links sent: ${sent.length}`, `Payment links went out to ${sent.length} monthly client${sent.length === 1 ? "" : "s"} today. You'll see each payment in Money when it's paid.`);
  return json({ ok: true, count: out.length, results: out });
});

async function sendEmail(to: string, subject: string, text: string, html: string, replyTo: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("care-billing: RESEND_API_KEY not set"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>", to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  }).catch((e) => { console.error("care-billing email failed:", e); return null; });
  return Boolean(res?.ok);
}
function money(cents: number): string {
  const whole = Math.trunc(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rem = Math.abs(cents % 100);
  return "R" + whole + (rem ? "." + String(rem).padStart(2, "0") : "");
}
