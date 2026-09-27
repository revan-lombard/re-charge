// quote — the public side of an online quote (/quote?t=<token>).
//
// POST { t, action: "view" }                         → the quote (marks it viewed once)
// POST { t, action: "accept", name }                 → accepts; returns a Yoco deposit checkout if unpaid
// POST { t, action: "decline", reason? }             → declines
//
// Public (verify_jwt = false). The token is the only credential: 32+ random
// characters created in the admin panel, looked up with the service role. The
// response contains only what the client needs to see — never email, phone,
// staff notes or other internal fields.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { createYocoCheckout } from "../_shared/yoco.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const DEPOSIT = 50000;
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const PRE_APPROVAL = ["prospect", "contacted", "new", "deposit_paid", "under_review", "clarification", "quote_sent"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  let body: { t?: string; action?: string; name?: string; reason?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const t = String(body.t ?? "");
  if (!TOKEN.test(t)) return json({ ok: false, error: "not found" }, 404);

  const db = serviceClient();
  const { data: p } = await db.from("projects")
    .select("id, ref, business, name, status, deposit_paid, quote_items, quote_cents, quote_status, quote_valid_until, quote_timeline, quote_notes, quote_accepted_at, quote_accepted_name, spam")
    .eq("quote_token", t).maybeSingle();
  if (!p || p.spam) return json({ ok: false, error: "not found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(p.quote_valid_until && p.quote_valid_until < today && p.quote_status !== "accepted");
  const view = () => ({
    ok: true,
    quote: {
      ref: p.ref, business: p.business || p.name || "", firstName: String(p.name || "").trim().split(/\s+/)[0] || "",
      items: (Array.isArray(p.quote_items) ? p.quote_items : []).filter((i: { desc?: string; cents?: number }) => i && (i.desc || i.cents))
        .map((i: { desc?: string; cents?: number }) => ({ desc: String(i.desc || "Item"), cents: Math.round(Number(i.cents) || 0) })),
      totalCents: p.quote_cents || 0, depositCents: DEPOSIT, depositPaid: p.deposit_paid,
      timeline: p.quote_timeline || "", notes: p.quote_notes || "", validUntil: p.quote_valid_until,
      status: expired ? "expired" : p.quote_status, acceptedAt: p.quote_accepted_at, acceptedName: p.quote_accepted_name,
    },
  });
  const who = p.business || p.name || p.ref;
  const money = (c: number) => "R" + Math.trunc(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (body.action === "view" || !body.action) {
    if (p.quote_status === "sent") {
      await db.from("projects").update({ quote_status: "viewed", quote_viewed_at: new Date().toISOString() }).eq("id", p.id);
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: "Client opened the quote", data: { quote: "viewed" } });
      p.quote_status = "viewed";
    }
    return json(view());
  }

  if (body.action === "accept") {
    if (expired) return json({ ok: false, error: "This quote has expired — ask us for an updated one." }, 410);
    if (p.quote_status === "declined") return json({ ok: false, error: "This quote was declined. Ask us if you'd like a new one." }, 409);
    if (!p.quote_cents) return json({ ok: false, error: "This quote isn't ready yet." }, 409);
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (p.quote_status !== "accepted") {
      if (name.length < 2) return json({ ok: false, error: "Please type your full name to accept." }, 400);
      const now = new Date().toISOString();
      await db.from("projects").update({ quote_status: "accepted", quote_accepted_at: now, quote_accepted_name: name }).eq("id", p.id);
      await db.from("projects").update({ status: "approved" }).eq("id", p.id).in("status", PRE_APPROVAL);
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Quote accepted online by ${name} (${money(p.quote_cents)})`, data: { quote: "accepted", name, ip: req.headers.get("x-forwarded-for") ?? null } });
      await notifyEmail(`${p.ref}: quote accepted — ${who}`, `${name} accepted the quote for ${who} (${p.ref}) — ${money(p.quote_cents)}.\n\n${p.deposit_paid ? "Deposit already paid." : "They're being sent to pay the R500 deposit now."}\n\n${SITE}/admin/#/p/${p.id}`);
      p.quote_status = "accepted"; p.quote_accepted_at = now; p.quote_accepted_name = name;
    }
    let checkoutUrl: string | null = null;
    if (!p.deposit_paid) {
      try {
        const c = await createYocoCheckout({
          amountCents: DEPOSIT,
          metadata: { projectId: p.id, ref: p.ref, kind: "deposit", description: `R500 deposit — ${who}` },
          successUrl: `${SITE}/quote?t=${t}&paid=1`, cancelUrl: `${SITE}/quote?t=${t}&paid=0`,
        });
        checkoutUrl = c.redirectUrl;
        await db.from("project_events").insert({ project_id: p.id, kind: "payment", note: "Deposit checkout created from the accepted quote", data: { checkoutId: c.id } });
      } catch (e) { console.error("quote: checkout failed", e); }
    }
    return json({ ...view(), checkoutUrl });
  }

  if (body.action === "decline") {
    if (p.quote_status === "accepted") return json({ ok: false, error: "This quote is already accepted — message us to change anything." }, 409);
    const reason = String(body.reason ?? "").trim().slice(0, 500);
    await db.from("projects").update({ quote_status: "declined", quote_decline_reason: reason || null }).eq("id", p.id);
    await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Client declined the quote online${reason ? `: "${reason}"` : ""}`, data: { quote: "declined" } });
    await notifyEmail(`${p.ref}: quote declined — ${who}`, `The quote for ${who} (${p.ref}) was declined online.${reason ? `\n\nReason: ${reason}` : ""}\n\n${SITE}/admin/#/p/${p.id}`);
    p.quote_status = "declined";
    return json(view());
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
