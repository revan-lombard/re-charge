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
// Paystack (automatic card charges): clients switched to it in the panel have
// their saved card charged on the due date and get a receipt instead of a link.
// No saved card yet, or the bank declined: they're emailed a Paystack link,
// and paying it saves the card for next month (paystack-webhook).
//
// Who may run it (verify_jwt = false, checked here): the daily pg_cron job, which sends
// x-billing-secret with the value kept in Supabase Vault as care_billing_secret (0034), or a
// signed-in staff user. Anyone else gets 403. Staff can pass { dryRun: true } to see who would
// be billed.
//
// Each client is billed at most once per due date, even if two runs overlap: the payment
// request is claimed first (a unique index on client + period, 0034) and only the run that
// claimed it goes on to charge or email. The saved-card charge also carries a fixed Paystack
// reference (care-<client>-<due date>), so Paystack itself refuses a second charge.
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { loadProfile, wrapHtml } from "../_shared/mail.ts";
import { loadSetting, initialize, chargeSaved, recordCharge, type PaystackSetting } from "../_shared/paystack.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const LEAD_DAYS = 3;
const PLAN = { hosting: "Hosting", care: "Care", business: "Business Care", inbox: "Inbox Assistant", operate: "Operate", optimise: "Optimise", ai_partner: "Partner", partner: "Partner" } as Record<string, string>;

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  const byCron = await cronSecretOk(db, req.headers.get("x-billing-secret") ?? "");
  const caller = !byCron && req.headers.get("Authorization") ? await getCaller(req).catch(() => null) : null;
  if (!byCron && !caller?.isStaff) return json({ ok: false, error: "forbidden" }, 403);
  const dryRun = Boolean(caller?.isStaff && body?.dryRun);

  const secret = Deno.env.get("YOCO_SECRET_KEY");
  const hasPaystack = Boolean(Deno.env.get("PAYSTACK_SECRET_KEY"));
  if (!secret && !hasPaystack) return json({ ok: false, error: "payments not configured" }, 503);

  const horizon = new Date(Date.now() + LEAD_DAYS * 86400e3).toISOString().slice(0, 10);
  const { data: due, error } = await db.from("clients")
    .select("id, name, email, report_emails, care_plan, care_amount_cents, care_renews_at, term_until, term_after_cents")
    .eq("care_active", true).eq("billing", "monthly").lte("care_renews_at", horizon).gte("care_amount_cents", 100);
  if (error) return json({ ok: false, error: error.message }, 500);

  const inbox = Deno.env.get("NOTIFY_EMAIL") ?? "";
  const prof = await loadProfile(db, inbox);
  const out: Array<Record<string, unknown>> = [];
  const name = new Map<string, string>();
  for (const c of due ?? []) {
    name.set(c.id, c.name);
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
    const ps: PaystackSetting = hasPaystack ? await loadSetting(db, c.id) : {};
    const via = ps.auto ? (ps.auth ? "card" : "paystack") : "yoco";
    if (dryRun) { out.push({ client: c.id, status: via === "card" ? "would-charge" : "would-send", via, to, amount: c.care_amount_cents, description }); continue; }
    if (via === "yoco" && !secret) { out.push({ client: c.id, status: "skipped:no-yoco" }); continue; }

    const { data: project } = await db.from("projects").select("id, name").eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    // Claim this client's payment for this due date first. The unique index (0034) lets only one
    // run have it: a second, overlapping run gets 23505 and stops here, before any charge or email.
    const { data: reqRow, error: rErr } = await db.from("payment_requests").insert({ project_id: project?.id ?? null, client_id: c.id, amount_cents: c.care_amount_cents, kind: "care", description, provider: via === "yoco" ? "yoco" : "paystack", period: c.care_renews_at }).select("id").single();
    if (rErr?.code === "23505") { out.push({ client: c.id, status: "skipped:already-sent" }); continue; }
    if (rErr) { out.push({ client: c.id, status: "error", error: /period/.test(rErr.message) ? "run migration 0034 first" : rErr.message }); continue; }
    const first = String(project?.name ?? "").trim().split(/\s+/)[0] || "there";
    const sign = prof.sig.text || prof.myName || "Re-Charge";
    const meta = { projectId: project?.id ?? "", clientId: c.id, kind: "care", requestId: reqRow.id, description };
    const mail = async (subject: string, text: string, note: string) => {
      const sent = await sendEmail(to, subject, text, wrapHtml(text, prof.sig), prof.replyTo);
      await db.from("messages").insert({ project_id: project?.id ?? null, kind: "email", to_address: to, subject, body: text, status: sent ? "sent" : "failed", meta: { auto: "care-billing", client_id: c.id, request_id: reqRow.id } });
      if (project?.id) await db.from("project_events").insert({ project_id: project.id, kind: "payment", note, data: { requestId: reqRow.id, auto: true } });
      return sent;
    };

    // 1. saved card: charge it and send a receipt
    let declined = false;
    if (via === "card" && ps.auth) {
      const charge = await chargeSaved({ auth: ps.auth, amountCents: c.care_amount_cents, metadata: { ...meta, auto: "1" }, reference: `care-${c.id}-${c.care_renews_at}` });
      if (charge.status === "unknown") {
        // It may have gone through. Don't charge again or send a link: the claimed request stays
        // open (so later runs skip this month) and you're told to check Paystack.
        if (project?.id) await db.from("project_events").insert({ project_id: project.id, kind: "payment", note: `${plan} for ${month}: the automatic card charge needs checking in Paystack (${charge.why})`, data: { requestId: reqRow.id, auto: true } });
        out.push({ client: c.id, status: "check:charge-unclear", why: charge.why }); continue;
      }
      if (charge.status === "success") {
        const tx = charge.tx;
        await recordCharge(db, tx).catch((e) => console.error("record failed:", e));
        await db.from("payment_requests").update({ checkout_id: String(tx.reference), status: "paid", paid_at: new Date().toISOString() }).eq("id", reqRow.id);
        const sent = await mail(`${c.name}: receipt for your ${plan} plan, ${month}`,
          `Hi ${first},\n\nThis is your receipt: we've charged ${money(c.care_amount_cents)} to your card${ps.auth.last4 ? " ending " + ps.auth.last4 : ""} for ${c.name}'s ${plan} plan for ${month}.\n\nNothing for you to do. To change the card or stop automatic payments, just reply.\n\nThanks,\n\n${sign}`,
          `${plan} for ${month} charged to the saved card automatically (${money(c.care_amount_cents)})`);
        out.push({ client: c.id, status: sent ? "charged" : "charged-no-receipt", to }); continue;
      }
      declined = true;
    }

    // 2. a payment link: Paystack (saves the card) or Yoco
    let link = "";
    try {
      if (via === "yoco") {
        const res = await fetch("https://payments.yoco.com/api/checkouts", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: c.care_amount_cents, currency: "ZAR", metadata: { ...meta, ref: "" },
            successUrl: `${SITE}/start?paid=1&kind=care`, cancelUrl: `${SITE}/start?paid=0`, failureUrl: `${SITE}/start?paid=0`,
          }),
        });
        const co = await res.json().catch(() => ({}));
        if (!res.ok || !co?.redirectUrl) throw new Error("checkout failed");
        link = co.redirectUrl;
        await db.from("payment_requests").update({ checkout_id: co.id, redirect_url: link }).eq("id", reqRow.id);
      } else {
        const ck = await initialize({ email: to, amountCents: c.care_amount_cents, metadata: meta, setup: true });
        link = ck.url;
        await db.from("payment_requests").update({ checkout_id: ck.reference, redirect_url: link }).eq("id", reqRow.id);
      }
    } catch {
      await db.from("payment_requests").update({ status: "cancelled" }).eq("id", reqRow.id);
      out.push({ client: c.id, status: "error", error: "checkout failed" }); continue;
    }

    const subject = `${c.name}: your ${plan} plan for ${month}`;
    const text = via === "yoco"
      ? `Hi ${first},\n\nHere's the link for ${c.name}'s ${plan} plan for ${month} (${money(c.care_amount_cents)}):\n\n${link}\n\nIt takes a minute by card. If you'd rather set up a monthly bank stop order, just reply and I'll send you the banking details.\n\nThanks,\n\n${sign}`
      : `Hi ${first},\n\n${declined ? "We couldn't charge your saved card this month. " : ""}Here's the link for ${c.name}'s ${plan} plan for ${month} (${money(c.care_amount_cents)}):\n\n${link}\n\nPay once by card and it's saved, so future months are charged automatically and you'll get a receipt by email. You can stop that any time by replying.\n\nThanks,\n\n${sign}`;
    const sent = await mail(subject, text, `${plan} payment link for ${month} emailed automatically (${money(c.care_amount_cents)})${declined ? ": saved card was declined" : ""}`);
    out.push({ client: c.id, status: sent ? "sent" : "send-failed", to });
  }

  const sent = out.filter((o) => o.status === "sent"), charged = out.filter((o) => String(o.status).startsWith("charged"));
  const problems = out.filter((o) => /^(error|check:|send-failed)/.test(String(o.status)));
  if ((sent.length || charged.length || problems.length) && !dryRun) {
    const look = problems.map((o) => `- ${name.get(String(o.client)) ?? o.client}: ${o.status === "check:charge-unclear" ? `the card charge needs checking in Paystack before anything else is sent (${o.why})` : o.status === "send-failed" ? "the payment email didn't send" : `not billed (${o.error})`}`).join("\n");
    await notifyEmail(`Monthly billing: ${charged.length} charged, ${sent.length} links sent${problems.length ? `, ${problems.length} to look at` : ""}`, `${charged.length ? `${charged.length} saved card${charged.length === 1 ? " was" : "s were"} charged automatically. ` : ""}${sent.length ? `Payment links went out to ${sent.length} monthly client${sent.length === 1 ? "" : "s"}. ` : ""}You'll see each payment in Money.${look ? `\n\nNeeds a look:\n${look}` : ""}`);
  }
  return json({ ok: true, count: out.length, results: out });
});

// The pg_cron job's x-billing-secret, checked against Supabase Vault (0034). Fails closed: no
// secret, no Vault entry or no check function means no.
async function cronSecretOk(db: SupabaseClient, given: string): Promise<boolean> {
  if (given.length < 32) return false;
  const { data, error } = await db.rpc("care_billing_secret_ok", { p_secret: given });
  if (error) { console.error("care-billing: secret check failed (run migration 0034):", error.message); return false; }
  return data === true;
}

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
