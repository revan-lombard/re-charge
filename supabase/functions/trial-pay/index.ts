// trial-pay — the public side of an Inbox Assistant trial (/trial-start?t=<token>), from the deposit
// to the decision. One link per lead, sent from the panel (ADMIN.md 8dk); the page shows what fits now:
//
//   deposit   not paid yet: what they get, the terms, then the R1,500 refundable deposit (Yoco), or EFT
//   trial     paid, running (or the measured week, days 8 to 14, not over yet)
//   decide    the measured week is over and there's no result yet: its hours against the target, then
//             "Keep it" (one Yoco checkout: the rest of the setup and the first month), or, only if it
//             missed the target, "ask for the refund" (we're told; the refund itself is done by hand)
//   kept / refund / refunded   the outcome
//
// POST { t, action: "view" }                     → the state above
// POST { t, action: "accept", name, agree, method: "card" | "eft" }   → records agreement; card: { redirectUrl }, eft: { bank }
// POST { t, action: "keep", agree }              → { redirectUrl } (yoco-webhook marks the trial kept once paid)
// POST { t, action: "refund", reason? }          → asks us for the refund
//
// Public (verify_jwt = false). The token (details.trialPay.token, 32 random characters made in the panel)
// is the only credential. The answer holds only what the client needs: never contact details or notes.
// Amounts are set here, never by the page: the setup can be lower for a founding client (the panel saves
// it on the link, details.trialPay.setupCents), and Keep it charges what's left after the deposit paid.
// Each open checkout is reused (no second payable link), and a lead gets at most a few a day.
// details is only ever changed with merge_project_details (0040), so nothing writes over anything else.
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
const REUSE_MS = 3600e3;           // an open checkout is offered again for an hour (older ones are cancelled on our side)
const MAX_CHECKOUTS_A_DAY = 6;     // per lead: plenty for a real client, a wall for a script

// deno-lint-ignore no-explicit-any
type DB = any;
type Project = { id: string; ref: string; business: string | null; name: string | null; status: string; spam: boolean | null; archived: boolean | null; deposit_paid: boolean | null; details: Record<string, unknown> | null };
type Account = { id: string; slug: string | null; status: string; trial_started_at: string | null; baseline_minutes: number; check_minutes: number; target_hours: number | null };

const money = (c: number) => "R" + Math.round(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

async function load(db: DB, t: string): Promise<Project | null> {
  const { data } = await db.from("projects").select("id, ref, business, name, status, spam, archived, deposit_paid, details").eq("details->trialPay->>token", t).maybeSingle();
  return data;
}
// what they've paid in Inbox Assistant deposits (by card here, or a card link or EFT recorded from the lead's card,
// all noted "Inbox Assistant deposit…"; another deposit on the lead, like a website's, doesn't count);
// a lead marked paid with no record: the usual R1,500
async function deposits(db: DB, p: Project): Promise<number> {
  const { data } = await db.from("payments").select("amount_cents, note").eq("project_id", p.id).eq("kind", "deposit").eq("status", "succeeded");
  const all = (data || []) as { amount_cents: number | null; note: string | null }[];
  // paid: as the panel's card sees it (marked paid, or any deposit recorded on the lead)
  if (!p.deposit_paid && !all.length) return 0;
  // how much: the Inbox Assistant deposits; recorded under another description, the usual R1,500
  const sum = all.filter((r) => /inbox assistant deposit/i.test(String(r.note || ""))).reduce((a, r) => a + (Number(r.amount_cents) || 0), 0);
  return sum || DEPOSIT;
}
async function account(db: DB, p: Project): Promise<Account | null> {
  const { data } = await db.from("inbox_accounts").select("id, slug, status, trial_started_at, baseline_minutes, check_minutes, target_hours")
    .eq("project_id", p.id).neq("status", "disconnected").order("created_at", { ascending: false }).limit(1);   // as the panel's trial list
  return (data || [])[0] || null;
}
// The measured week is days 8 to 14 (the measurement agreement, and the panel's trial card); every row is read
async function measured(db: DB, a: Account): Promise<{ day: number; hours: number | null; target: number; over: boolean }> {
  const start = a.trial_started_at ? Date.parse(a.trial_started_at) : NaN, target = Number(a.target_hours || 5);
  if (!Number.isFinite(start)) return { day: 0, hours: null, target, over: false };
  const day = Math.floor((Date.now() - start) / DAY) + 1;
  if (day < 8) return { day, hours: null, target, over: false };
  const rows: unknown[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("inbox_drafts").select("status, similarity, account_id").eq("account_id", a.id)
      .gte("created_at", new Date(start + 7 * DAY).toISOString()).lt("created_at", new Date(start + 14 * DAY).toISOString())
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error("couldn't read the trial's replies");
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  // deno-lint-ignore no-explicit-any
  return { day, hours: inboxResult(rows as any, [a])?.hours ?? 0, target, over: Date.now() >= start + 14 * DAY };
}
async function bank(db: DB, ref: string) {
  const { data } = await db.from("settings").select("value").eq("key", "profile").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, string>;
  const b = { accountName: v.bank_account_name || v.legal_name || "", bank: v.bank_name || "", accountNo: v.bank_account_no || "", branch: v.bank_branch || "", reference: ref };
  return b.accountNo ? b : null;
}
// Only these keys, in the database, in one step (0040): never a stale or empty copy written back
async function patchDetails(db: DB, id: string, fields: Record<string, unknown>) {
  const { error } = await db.rpc("merge_project_details", { p_id: id, p_patch: fields });
  if (error) throw new Error("couldn't save (database update 0040: " + error.message + ")");
}
// One payable link per thing: an open one is offered again; a few new ones a day at most
async function checkout(db: DB, p: Project, t: string, kind: "deposit" | "balance", amount: number, description: string, trial: string) {
  const { data: mine, error: rErr } = await db.from("payment_requests").select("id, amount_cents, redirect_url, status, created_at").eq("project_id", p.id).eq("kind", kind)
    .eq("description", description).order("created_at", { ascending: false }).limit(50);
  if (rErr) throw new Error("couldn't check the payments");
  // paid already, at any age: never a second one
  if ((mine || []).some((r: { status: string }) => r.status === "paid")) throw new Paid();
  const fresh = Date.now() - REUSE_MS;
  const reuse = (mine || []).find((r: { status: string; amount_cents: number; redirect_url: string | null; created_at: string }) => r.status === "open" && r.amount_cents === amount && r.redirect_url && Date.parse(r.created_at) >= fresh);
  if (reuse) return reuse.redirect_url as string;
  // anything older (or for another amount) is no longer offered
  const stale = (mine || []).filter((r: { status: string }) => r.status === "open").map((r: { id: string }) => r.id);
  if (stale.length) await db.from("payment_requests").update({ status: "cancelled" }).in("id", stale);
  const { count } = await db.from("payment_requests").select("id", { count: "exact", head: true }).eq("project_id", p.id).gte("created_at", new Date(Date.now() - DAY).toISOString());
  if ((count || 0) >= MAX_CHECKOUTS_A_DAY) throw new TooMany();
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
class Paid extends Error {}
class TooMany extends Error {}
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
  if (!p || p.spam) return json({ ok: false, error: "We couldn't find that trial link." }, 404);
  const d = p.details || {};
  const tp = (d.trialPay || {}) as { setupCents?: number };
  const setup = Number.isFinite(Number(tp.setupCents)) && Number(tp.setupCents) >= 0 ? Math.min(SETUP, Math.round(Number(tp.setupCents))) : SETUP;
  const paidIn = await deposits(db, p);
  const paid = paidIn > 0;
  const keep = Math.max(0, setup + MONTHLY - paidIn);   // what's left of the setup, and the first month (a waived setup: the deposit comes off the month)
  const acc = paid ? await account(db, p) : null;
  const m = acc ? await measured(db, acc) : null;
  const result = String(d.trialResult || "");
  const closed = (p.status === "declined" || Boolean(p.archived)) && !result;
  // keepPaidAt: yoco-webhook saw the Keep it payment (kept, even if the result itself couldn't be recorded)
  const stage = result === "refunded" ? "refunded" : result === "kept" || d.keepPaidAt ? "kept" : d.refundRequestedAt ? "refund"
    : closed ? "closed" : !paid ? "deposit" : m && m.over ? "decide" : "trial";
  const missed = Boolean(m && m.hours !== null && m.hours < m.target);
  const action = String(body.action || "view");
  const keepDesc = "Inbox Assistant: the rest of the setup and the first month";

  try {
    if (action === "view") {
      const first = String(p.name || "").trim().split(/\s+/)[0] || "";
      return json({
        ok: true, stage, business: p.business || p.name || "", first, ref: p.ref,
        prices: { deposit: DEPOSIT, setup, monthly: MONTHLY, balance: Math.max(0, setup - paidIn), keep },
        agreed: Boolean(d.trialTermsAt), refundOpen: stage === "decide" && missed,
        trial: acc ? { day: m?.day ?? 0, started: Boolean(acc.trial_started_at), page: acc.slug ? `${SITE}/trial?t=${acc.slug}` : null } : null,
        result: m && m.hours !== null ? { hours: m.hours, target: m.target, over: m.over } : null,
        bank: stage === "deposit" && d.trialTermsAt && d.trialPayMethod === "eft" ? await bank(db, p.ref) : null,
      });
    }

    if (action === "accept") {
      if (stage !== "deposit") return json({ ok: false, error: stage === "closed" ? "This trial link is no longer active." : "The deposit is already paid." }, 409);
      const name = String(body.name || "").trim().slice(0, 120);
      if (!body.agree || name.length < 2) return json({ ok: false, error: "Type your name and tick that you agree to the terms." }, 400);
      const method = body.method === "eft" ? "eft" : "card";
      const first = !d.trialTermsAt, switched = d.trialPayMethod !== method;
      if (first || switched) {
        await patchDetails(db, p.id, { trialTermsAt: d.trialTermsAt || new Date().toISOString(), trialTermsBy: first ? name : d.trialTermsBy, trialPayMethod: method });
        if (first) await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Trial page: ${name} agreed to the Inbox Assistant trial terms`, data: { trialTermsBy: name } });
      }
      if (method === "eft") {
        // told once, ever (switching back and forth doesn't send another)
        if (!d.trialEftNotifiedAt) {
          await patchDetails(db, p.id, { trialEftNotifiedAt: new Date().toISOString() });
          await tellUs(db, p, "Trial: paying the deposit by EFT", `${String(d.trialTermsBy || name)} chose EFT. Mark it paid on the lead when it arrives.`);
        }
        return json({ ok: true, bank: await bank(db, p.ref) });
      }
      return json({ ok: true, redirectUrl: await checkout(db, p, t, "deposit", DEPOSIT, "Inbox Assistant deposit (refundable; it comes off the setup)", "deposit") });
    }

    if (action === "keep") {
      if (stage !== "decide") return json({ ok: false, error: stage === "kept" ? "You're all set: it's already paid." : "That's possible once the measured week is over (after day 14)." }, 409);
      if (!body.agree) return json({ ok: false, error: "Tick that you'd like to keep it." }, 400);
      if (keep === 0) {   // nothing left to pay (a free setup and a deposit that covers the month): kept as it is
        await patchDetails(db, p.id, { trialResult: "kept", trialResultAt: new Date().toISOString() });
        await tellUs(db, p, "Trial: kept", "They chose Keep it; nothing more was due.");
        return json({ ok: true, kept: true });
      }
      return json({ ok: true, redirectUrl: await checkout(db, p, t, "balance", keep, keepDesc, "keep") });
    }

    if (action === "refund") {
      if (stage !== "decide") return json({ ok: false, error: "That's possible once the measured week is over (after day 14)." }, 409);
      if (!missed) return json({ ok: false, error: "Your trial hit the target, so the deposit isn't refunded under the trial terms. If something isn't right, WhatsApp us." }, 409);
      const reason = String(body.reason || "").trim().slice(0, 600);
      await patchDetails(db, p.id, { refundRequestedAt: new Date().toISOString(), ...(reason ? { refundReason: reason } : {}) });
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Trial page: asked for the deposit refund${reason ? `: "${reason}"` : ""}`, data: { refundRequested: true } });
      await tellUs(db, p, "Trial: refund requested", `Check it and refund ${money(paidIn)} within 7 days, then mark the trial as refunded on the lead.${reason ? ` They said: ${reason}` : ""}`);
      return json({ ok: true });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof Paid) return json({ ok: false, error: "That's already paid: this page updates in a moment." }, 409);
    if (e instanceof TooMany) return json({ ok: false, error: "Too many payment attempts today. Please WhatsApp us and we'll sort it out." }, 429);
    console.error("trial-pay:", (e as Error).message);
    return json({ ok: false, error: "Payments aren't available right now. Please try again in a moment, or WhatsApp us." }, 502);
  }
});
