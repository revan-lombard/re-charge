// Paystack: card payments in rand that can be charged again each month.
//
// The first payment is a normal Paystack checkout; Paystack hands back a
// reusable "authorization" for the card, which we keep in settings under
// paystack:<clientId> = { auto, auth: { code, last4, brand, exp, email, at } }.
// After that, care-billing charges the card itself on the due date.
//
// Secret: PAYSTACK_SECRET_KEY (sk_test_… while the account is in test mode).
// Docs: https://paystack.com/docs/payments/recurring-charges
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendPush } from "./push.ts";

const API = "https://api.paystack.co";
export const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";

export type PaystackAuth = { code: string; last4?: string; brand?: string; exp?: string; email: string; at: string };
export type PaystackSetting = { auto?: boolean; auth?: PaystackAuth | null };

export const settingKey = (clientId: string) => `paystack:${clientId}`;

export async function loadSetting(db: SupabaseClient, clientId: string): Promise<PaystackSetting> {
  const { data } = await db.from("settings").select("value").eq("key", settingKey(clientId)).maybeSingle();
  return (data?.value ?? {}) as PaystackSetting;
}
export async function saveSetting(db: SupabaseClient, clientId: string, value: PaystackSetting) {
  await db.from("settings").upsert({ key: settingKey(clientId), value, updated_at: new Date().toISOString() });
}

async function call(path: string, body?: unknown): Promise<any> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) throw new Error("Paystack not configured");
  const res = await fetch(API + path, body === undefined
    ? { method: "GET", headers: { Authorization: `Bearer ${secret}` } }
    : { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.status) { console.error("paystack", path, j?.message); throw new Error(j?.message || "Paystack request failed"); }
  return j.data;
}

// A Paystack checkout page. setup = true: the card is saved for automatic monthly charges.
export async function initialize(opts: { email: string; amountCents: number; metadata: Record<string, string>; setup?: boolean; callback?: string }): Promise<{ url: string; reference: string }> {
  const d = await call("/transaction/initialize", {
    email: opts.email, amount: opts.amountCents, currency: "ZAR", channels: ["card"],
    callback_url: opts.callback ?? `${SITE}/start?paid=1&kind=care`,
    metadata: { ...opts.metadata, setup: opts.setup ? "1" : "0" },
  });
  return { url: d.authorization_url, reference: d.reference };
}

// Charge a saved card.
//   success:  the money was taken (tx is Paystack's transaction)
//   declined: nothing was taken, so a payment link is the next step
//   unknown:  it may or may not have gone through (still processing, or Paystack couldn't be
//             asked): don't charge again and don't send a link; a person checks Paystack.
// `reference` makes the charge idempotent: Paystack refuses a second transaction with the same
// reference, and on any error we look the reference up, so a timeout that did charge the card is
// recognised as a success instead of being treated as a decline.
export type ChargeResult = { status: "success"; tx: any } | { status: "declined" } | { status: "unknown"; why: string };
export async function chargeSaved(opts: { auth: PaystackAuth; amountCents: number; metadata: Record<string, string>; reference?: string }): Promise<ChargeResult> {
  let d: any;
  try {
    d = await call("/transaction/charge_authorization", {
      authorization_code: opts.auth.code, email: opts.auth.email, amount: opts.amountCents, currency: "ZAR", metadata: opts.metadata,
      ...(opts.reference ? { reference: opts.reference } : {}),
    });
  } catch (e) {
    console.error("charge failed:", (e as Error).message);
    return opts.reference ? await chargeByReference(opts.reference) : { status: "declined" };
  }
  return chargeOutcome(d);
}
function chargeOutcome(d: any): ChargeResult {
  const st = String(d?.status ?? "");
  if (st === "success") return { status: "success", tx: d };
  if (st === "failed" || st === "reversed" || st === "abandoned") return { status: "declined" };
  return { status: "unknown", why: `Paystack says "${st || "no status"}"` };
}
// What happened to the transaction with this reference (after an error, or a "duplicate reference").
export async function chargeByReference(reference: string): Promise<ChargeResult> {
  try {
    return chargeOutcome(await call(`/transaction/verify/${encodeURIComponent(reference)}`));
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/not found/i.test(msg)) return { status: "declined" };   // no transaction under this reference: nothing was taken
    return { status: "unknown", why: msg.slice(0, 120) || "couldn't check with Paystack" };
  }
}

// HMAC-SHA512 of the raw body with the secret key, hex: the x-paystack-signature header.
export async function verifySignature(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== header.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ header.charCodeAt(i);
  return r === 0;
}

// Record a successful Paystack charge (from the webhook or straight after a saved-card charge).
// Idempotent on the reference: returns false if it was already recorded.
export async function recordCharge(db: SupabaseClient, tx: any, raw: unknown = tx): Promise<boolean> {
  let meta = tx.metadata ?? {};
  if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = {}; } }
  const KINDS = new Set(["deposit", "balance", "care", "other"]);
  const kind = KINDS.has(String(meta.kind)) ? String(meta.kind) : "other";
  const clientId = meta.clientId ? String(meta.clientId) : null;
  const projectId = meta.projectId ? String(meta.projectId) : null;
  const requestId = meta.requestId ? String(meta.requestId) : null;
  const amount = Number(tx.amount) || null;
  const email = tx.customer?.email ?? null;

  const { data: inserted, error } = await db.from("payments").upsert({
    project_id: projectId, client_id: clientId, provider: "paystack", provider_id: String(tx.reference),
    amount_cents: amount, currency: String(tx.currency ?? "ZAR"), kind,
    reference: String(tx.reference), note: meta.description ? String(meta.description) : null,
    email, status: "succeeded", matched: Boolean(projectId || clientId), raw,
  }, { onConflict: "provider,provider_id", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  if (!inserted?.length) return false;

  if (requestId) await db.from("payment_requests").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", requestId);

  // keep the card for next month
  const a = tx.authorization;
  if (clientId && a?.reusable && a?.authorization_code && email) {
    const cur = await loadSetting(db, clientId);
    await saveSetting(db, clientId, {
      auto: cur.auto || meta.setup === "1",
      auth: { code: a.authorization_code, last4: a.last4, brand: a.card_type || a.brand, exp: a.exp_month && a.exp_year ? `${a.exp_month}/${String(a.exp_year).slice(-2)}` : undefined, email, at: new Date().toISOString() },
    });
  }

  const money = fmtMoney(amount ?? 0);
  const what = kind === "care" ? "monthly plan" : kind;
  if (projectId) await db.from("project_events").insert({ project_id: projectId, kind: "payment", note: `${money} ${what} paid by card (Paystack)${meta.auto === "1" ? ", charged automatically" : ""}`, data: { reference: tx.reference, amount, kind, requestId } });
  let who = email ?? "someone";
  if (clientId) { const { data: c } = await db.from("clients").select("name").eq("id", clientId).maybeSingle(); who = c?.name || who; }
  await sendPush(db, { title: `💰 ${money} ${what} paid`, body: `${who} · Paystack`, url: clientId ? `/admin/#/c/${clientId}` : "/admin/#/money", tag: `pay-${tx.reference}` }).catch(() => {});
  return true;
}

export function fmtMoney(cents: number): string {
  const whole = Math.trunc(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rem = Math.abs(cents % 100);
  return "R" + whole + (rem ? "." + String(rem).padStart(2, "0") : "");
}
