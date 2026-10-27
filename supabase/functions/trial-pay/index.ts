// trial-pay — the public side of an Inbox Assistant trial (/trial-start?t=<token>), from the deposit
// to the decision. One link per lead, sent from the panel (ADMIN.md 8dk); the page shows what fits now:
//
//   deposit   not paid yet: what they get, the terms, then the R1,500 refundable deposit (Yoco), or EFT
//   trial     paid, running: the day, and a link to their own Inbox Assistant page
//   decide    day 14 or later, no result yet: the measured week's hours against the target, then
//             "Keep it" (one Yoco checkout: the rest of the setup and the first month) or "It didn't
//             save 5 hours" (a refund request to us; the refund itself is done by hand, as before)
//   kept / refund   the outcome
//
// POST { t, action: "view" }                     → the state above
// POST { t, action: "accept", name, agree, method: "card" | "eft" }   → records agreement; card: { redirectUrl }, eft: { bank }
// POST { t, action: "keep", agree }              → { redirectUrl } (yoco-webhook marks the trial kept once paid)
// POST { t, action: "refund", reason? }          → asks us for the refund
//
// Public (verify_jwt = false). The token (details.trialPay.token, 32+ random characters made in the panel)
// is the only credential. The answer holds only what the client needs: never contact details or notes.
// Rand only (Yoco). A saved card for automatic monthly payments needs Paystack live (ADMIN.md 8bp).
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { createYocoCheckout } from "../_shared/yoco.ts";
import { sendPush } from "../_shared/push.ts";
import { inboxResult } from "../_shared/inbox_stats.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
// the same as the panel (admin.js: INBOX_DEPOSIT, INBOX_SETUP, PLAN_MONTHLY.inbox) and the site
const DEPOSIT = 150000, SETUP = 950000, MONTHLY = 295000;
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const DAY = 864e5;

// deno-lint-ignore no-explicit-any
type DB = any;
type Project = { id: string; ref: string; business: string | null; name: string | null; status: string; deposit_paid: boolean | null; details: Record<string, unknown> | null };
type Account = { id: string; slug: string | null; status: string; trial_started_at: string | null; baseline_minutes: number; check_minutes: number; target_hours: number | null };

const money = (c: number) => "R" + Math.round(c / 100).toLocaleString("en-ZA").replace(/\s/g, ",");

async function load(db: DB, t: string): Promise<Project | null> {
  const { data } = await db.from("projects").select("id, ref, business, name, status, deposit_paid, details").eq("details->trialPay->>token", t).maybeSingle();
  return data;
}
async function depositPaid(db: DB, p: Project): Promise<boolean> {
  if (p.deposit_paid) return true;
  const { data } = await db.from("payments").select("id").eq("project_id", p.id).eq("kind", "deposit").eq("status", "succeeded").limit(1);
  return Boolean(data?.length);
}
async function account(db: DB, p: Project): Promise<Account | null> {
  const { data } = await db.from("inbox_accounts").select("id, slug, status, trial_started_at, baseline_minutes, check_minutes, target_hours")
    .eq("project_id", p.id).order("created_at", { ascending: false }).limit(1);
  return (data || [])[0] || null;
}
// The measured week is days 8 to 14 (the measurement agreement, and the panel's trial card)
async function measured(db: DB, a: Account): Promise<{ day: number; hours: number | null; target: number; complete: boolean }> {
  const start = a.trial_started_at ? Date.parse(a.trial_started_at) : NaN, target = Number(a.target_hours || 5);
  if (!Number.isFinite(start)) return { day: 0, hours: null, target, complete: false };
  const day = Math.floor((Date.now() - start) / DAY) + 1;
  if (day < 8) return { day, hours: null, target, complete: false };
  const { data: rows } = await db.from("inbox_drafts").select("status, similarity, account_id").eq("account_id", a.id)
    .gte("created_at", new Date(start + 7 * DAY).toISOString()).lt("created_at", new Date(start + 14 * DAY).toISOString()).limit(5000);
  return { day, hours: inboxResult(rows || [], [a])?.hours ?? 0, target, complete: day > 14 };
}
async function bank(db: DB, ref: string) {
  const { data } = await db.from("settings").select("value").eq("key", "profile").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, string>;
  const b = { accountName: v.bank_account_name || v.legal_name || "", bank: v.bank_name || "", accountNo: v.bank_account_no || "", branch: v.bank_branch || "", reference: ref };
  return b.accountNo ? b : null;
}
// Merge into details as they are now (never a stale copy)
async function patchDetails(db: DB, id: string, fields: Record<string, unknown>) {
  const { data } = await db.from("projects").select("details").eq("id", id).maybeSingle();
  await db.from("projects").update({ details: { ...((data?.details as Record<string, unknown>) || {}), ...fields } }).eq("id", id);
}
async function checkout(db: DB, p: Project, t: string, kind: "deposit" | "balance", amount: number, description: string, trial: string) {
  const { data: reqRow, error } = await db.from("payment_requests").insert({ project_id: p.id, amount_cents: amount, kind, description }).select("id").single();
  if (error) throw new Error("could not store the payment request");
  const back = `${SITE}/trial-start?t=${encodeURIComponent(t)}&paid=`;
  try {
    const co = await createYocoCheckout({ amountCents: amount, metadata: { projectId: p.id, ref: p.ref, kind, requestId: reqRow.id, description, trial }, successUrl: `${back}1`, cancelUrl: `${back}0` });
    await db.from("payment_requests").update({ checkout_id: co.id, redirect_url: co.redirectUrl }).eq("id", reqRow.id);
    await db.from("project_events").insert({ project_id: p.id, kind: "payment", note: `Trial page: ${description} checkout opened (${money(amount)})`, data: { checkoutId: co.id, requestId: reqRow.id, amount, kind, by: "client" } });
    return co.redirectUrl;
  } catch (e) {
    await db.from("payment_requests").update({ status: "cancelled" }).eq("id", reqRow.id);
    throw e;
  }
}
async function tellUs(db: DB, p: Project, title: string, body: string) {
  const who = p.business || p.name || p.ref;
  await sendPush(db, { title, body: `${who}${body ? ": " + body : ""}`, url: `/admin/#/p/${p.id}`, tag: `trial-${p.id}-${title}` }).catch(() => {});
  await notifyEmail(`${title}: ${who} (${p.ref})`, `${who} (${p.ref})\n${body}\n\n${SITE}/admin/#/p/${p.id}`).catch(() => {});
}

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as { t?: string; action?: string; name?: string; agree?: boolean; method?: string; reason?: string };
  const t = String(body.t || "");
  if (!TOKEN.test(t)) return json({ ok: false, error: "That link isn't complete." }, 404);
  const db = serviceClient();
  const p = await load(db, t);
  if (!p) return json({ ok: false, error: "We couldn't find that trial link." }, 404);
  const d = p.details || {};
  const paid = await depositPaid(db, p);
  const acc = paid ? await account(db, p) : null;
  const m = acc ? await measured(db, acc) : null;
  const result = String(d.trialResult || "");
  const stage = result === "kept" ? "kept" : result === "refunded" ? "refunded" : d.refundRequestedAt ? "refund"
    : !paid ? "deposit" : m && m.day >= 14 ? "decide" : "trial";
  const action = String(body.action || "view");

  try {
    if (action === "view") {
      const first = String(p.name || "").trim().split(/\s+/)[0] || "";
      return json({
        ok: true, stage, business: p.business || p.name || "", first, ref: p.ref,
        prices: { deposit: DEPOSIT, setup: SETUP, monthly: MONTHLY, balance: SETUP - DEPOSIT, keep: SETUP - DEPOSIT + MONTHLY },
        agreed: Boolean(d.trialTermsAt),
        trial: acc ? { day: m?.day ?? 0, started: Boolean(acc.trial_started_at), page: acc.slug ? `${SITE}/trial?t=${acc.slug}` : null } : null,
        result: m && m.hours !== null ? { hours: m.hours, target: m.target, complete: m.complete } : null,
        bank: stage === "deposit" && d.trialTermsAt && d.trialPayMethod === "eft" ? await bank(db, p.ref) : null,
      });
    }

    if (action === "accept") {
      if (stage !== "deposit") return json({ ok: false, error: "The deposit is already paid." }, 409);
      const name = String(body.name || "").trim().slice(0, 120);
      if (!body.agree || name.length < 2) return json({ ok: false, error: "Type your name and tick that you agree to the terms." }, 400);
      const method = body.method === "eft" ? "eft" : "card";
      if (!d.trialTermsAt || d.trialTermsBy !== name || d.trialPayMethod !== method) {
        await patchDetails(db, p.id, { trialTermsAt: d.trialTermsAt || new Date().toISOString(), trialTermsBy: name, trialPayMethod: method });
        await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Trial page: ${name} agreed to the Inbox Assistant trial terms (${method === "eft" ? "paying by EFT" : "paying by card"})`, data: { trialTermsBy: name } });
      }
      if (method === "eft") {
        await tellUs(db, p, "Trial: paying the deposit by EFT", `${name} chose EFT. Mark it paid on the lead when it arrives.`);
        return json({ ok: true, bank: await bank(db, p.ref) });
      }
      return json({ ok: true, redirectUrl: await checkout(db, p, t, "deposit", DEPOSIT, "Inbox Assistant deposit (refundable; it comes off the setup)", "deposit") });
    }

    if (action === "keep") {
      if (stage !== "decide") return json({ ok: false, error: stage === "kept" ? "You're all set: it's already paid." : "That's possible from day 14 of the trial." }, 409);
      if (!body.agree) return json({ ok: false, error: "Tick that you'd like to keep it." }, 400);
      await patchDetails(db, p.id, { keepRequestedAt: new Date().toISOString() });
      return json({ ok: true, redirectUrl: await checkout(db, p, t, "balance", SETUP - DEPOSIT + MONTHLY, "Inbox Assistant: the rest of the setup and the first month", "keep") });
    }

    if (action === "refund") {
      if (stage !== "decide") return json({ ok: false, error: "That's possible from day 14 of the trial." }, 409);
      const reason = String(body.reason || "").trim().slice(0, 600);
      await patchDetails(db, p.id, { refundRequestedAt: new Date().toISOString(), ...(reason ? { refundReason: reason } : {}) });
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Trial page: asked for the deposit refund${reason ? `: "${reason}"` : ""}`, data: { refundRequested: true } });
      await tellUs(db, p, "Trial: refund requested", `Refund the ${money(DEPOSIT)} within 7 days, then mark the trial as refunded on the lead.${reason ? ` They said: ${reason}` : ""}`);
      return json({ ok: true });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    console.error("trial-pay:", (e as Error).message);
    return json({ ok: false, error: "Payments aren't available right now. Please try again in a moment, or WhatsApp us." }, 502);
  }
});
