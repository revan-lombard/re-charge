// quote — the public side of an online quote (/quote?t=<token>).
//
// POST { t, action: "view" }                         → the quote (marks it viewed once)
// POST { t, action: "accept", name }                 → accepts; returns a Yoco deposit checkout if unpaid
// POST { t, action: "decline", reason? }             → declines
// POST { t, action: "content", fields }              → after accepting: their services, hours… (content checklist)
// POST { t, action: "upload", name, type, data }     → after accepting: one logo / photo / PDF (base64)
//
// A quote can offer up to three options (projects.quote_options, 0022). Accepting
// then needs { choice }: the chosen option is copied into quote_items / quote_cents.
// A pay-monthly option has no deposit: the first month is paid instead.
//
// Public (verify_jwt = false). The token is the only credential: 32+ random
// characters created in the admin panel, looked up with the service role. The
// response contains only what the client needs to see — never email, phone,
// staff notes or other internal fields.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { createYocoCheckout } from "../_shared/yoco.ts";
import { sendPush } from "../_shared/push.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
// The deposit scales with the job. A flat R500 was right when a website was R2,000;
// on a R19,500 build it is not a commitment, and it leaves too much of the work
// unpaid for too long. 40%, rounded to the nearest R100, never less than R1,000.
const DEPOSIT_SHARE = 0.4;
const DEPOSIT_MIN = 100000;
// Capped at the total, so a job smaller than the minimum is simply paid in full
// rather than being asked for a deposit larger than the price.
const depositOn = (totalCents: number) =>
  Math.min(totalCents, Math.max(DEPOSIT_MIN, Math.round((totalCents * DEPOSIT_SHARE) / 10000) * 10000));
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const MAX_FILES = 40, MAX_BYTES = 6 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const CONTENT_FIELDS = ["about", "services", "hours", "area", "extra"] as const;
type Item = { desc: string; cents: number };
type Monthly = { cents: number; months: number; afterCents: number };
type Opt = { key: string; name: string; note: string; items: Item[]; totalCents: number; recommended: boolean; monthly: Monthly | null };
const cleanItems = (raw: unknown): Item[] => (Array.isArray(raw) ? raw : [])
  .filter((i) => i && (i.desc || i.cents)).slice(0, 20)
  .map((i) => ({ desc: String(i.desc || "Item").slice(0, 200), cents: Math.max(-10_000_000, Math.round(Number(i.cents) || 0)) }));   // negative = a discount line
function cleanOptions(raw: unknown): Opt[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((o, i) => {
    const items = cleanItems(o?.items);
    const m = o?.monthly && Number(o.monthly.cents) > 0 ? { cents: Math.round(Number(o.monthly.cents)), months: Math.min(36, Math.max(1, Math.round(Number(o.monthly.months) || 12))), afterCents: Math.max(0, Math.round(Number(o.monthly.afterCents) || 0)) } : null;
    return { key: String(o?.key || "abc"[i]).slice(0, 8), name: String(o?.name || `Option ${i + 1}`).slice(0, 80), note: String(o?.note || "").slice(0, 400), items, totalCents: items.reduce((a, x) => a + x.cents, 0), recommended: Boolean(o?.recommended), monthly: m };
  }).filter((o) => o.items.length || o.monthly);
}
const PRE_APPROVAL = ["prospect", "contacted", "new", "deposit_paid", "under_review", "clarification", "quote_sent"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  let body: { t?: string; action?: string; name?: string; reason?: string; choice?: string; fields?: Record<string, unknown>; type?: string; data?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const t = String(body.t ?? "");
  if (!TOKEN.test(t)) return json({ ok: false, error: "not found" }, 404);

  const db = serviceClient();
  const { data: p } = await db.from("projects")
    .select("id, ref, business, name, status, deposit_paid, client_id, quote_items, quote_cents, quote_status, quote_valid_until, quote_timeline, quote_notes, quote_accepted_at, quote_accepted_name, quote_options, quote_choice, details, spam")
    .eq("quote_token", t).maybeSingle();
  if (!p || p.spam) return json({ ok: false, error: "not found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(p.quote_valid_until && p.quote_valid_until < today && p.quote_status !== "accepted");
  // after acceptance the quote link doubles as the client's project tracker
  const STAGE: Record<string, string> = { in_development: "building", client_review: "building", final_payment: "building", live: "live", care: "live", declined: "lost" };
  const track = async () => {
    if (p.quote_status !== "accepted") return null;
    const { data: pays } = await db.from("payments").select("amount_cents").eq("project_id", p.id).eq("status", "succeeded");
    const paidCents = (pays ?? []).reduce((a: number, x: { amount_cents: number | null }) => a + (x.amount_cents || 0), 0);
    let site = "";
    if (STAGE[p.status] === "live" && p.client_id) {
      const { data: c } = await db.from("clients").select("site_label").eq("id", p.client_id).maybeSingle();
      site = String(c?.site_label || "").replace(/[^a-z0-9.\-]/gi, "");
    }
    return { stage: STAGE[p.status] || "accepted", paidCents, site };
  };
  let progress: Awaited<ReturnType<typeof track>> = null;
  const options = p.quote_status === "accepted" ? [] : cleanOptions(p.quote_options);
  const monthlyOf = (): Monthly | null => (p.details?.payMonthly?.cents ? p.details.payMonthly as Monthly : null);
  const depositFor = () => monthlyOf()?.cents || depositOn(p.quote_cents || 0);
  const contentSummary = () => { const c = p.details?.content; return c ? { sent: CONTENT_FIELDS.some((k) => c[k]), files: Array.isArray(c.files) ? c.files.length : 0, fields: Object.fromEntries(CONTENT_FIELDS.map((k) => [k, String(c[k] || "")])) } : { sent: false, files: 0, fields: {} }; };
  const view = () => ({
    ok: true,
    quote: {
      ref: p.ref, business: p.business || p.name || "", firstName: String(p.name || "").trim().split(/\s+/)[0] || "",
      items: (Array.isArray(p.quote_items) ? p.quote_items : []).filter((i: { desc?: string; cents?: number }) => i && (i.desc || i.cents))
        .map((i: { desc?: string; cents?: number }) => ({ desc: String(i.desc || "Item"), cents: Math.round(Number(i.cents) || 0) })),
      totalCents: p.quote_cents || 0, depositCents: depositFor(), depositPaid: p.deposit_paid, monthly: monthlyOf(),
      options: options.map(({ key, name, note, items, totalCents, recommended, monthly }) => ({ key, name, note, items, totalCents, recommended, monthly, depositCents: monthly ? monthly.cents : depositOn(totalCents || 0) })),
      choice: p.quote_choice || null, content: p.quote_status === "accepted" ? contentSummary() : null,
      timeline: p.quote_timeline || "", notes: p.quote_notes || "", validUntil: p.quote_valid_until,
      status: expired ? "expired" : p.quote_status, acceptedAt: p.quote_accepted_at, acceptedName: p.quote_accepted_name,
      progress,
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
    progress = await track();
    return json(view());
  }

  if (body.action === "accept") {
    if (expired) return json({ ok: false, error: "This quote has expired — ask us for an updated one." }, 410);
    if (p.quote_status === "declined") return json({ ok: false, error: "This quote was declined. Ask us if you'd like a new one." }, 409);
    if (!p.quote_cents) return json({ ok: false, error: "This quote isn't ready yet." }, 409);
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (p.quote_status !== "accepted") {
      if (name.length < 2) return json({ ok: false, error: "Please type your full name to accept." }, 400);
      if (options.length) {
        const opt = options.find((o) => o.key === String(body.choice ?? ""));
        if (!opt) return json({ ok: false, error: "Please pick one of the options first." }, 400);
        const details = { ...(p.details || {}), payMonthly: opt.monthly };
        const cents = opt.monthly ? opt.monthly.cents : opt.totalCents;
        const items = opt.monthly
          ? [...opt.items.map((i) => ({ desc: i.desc, cents: 0 })), { desc: `${opt.name}: ${money(opt.monthly.cents)} a month for ${opt.monthly.months} months (the first month now)${opt.monthly.afterCents ? `, then Care at ${money(opt.monthly.afterCents)} a month` : ""}`, cents }]
          : opt.items;
        await db.from("projects").update({ quote_choice: opt.key, quote_items: items, quote_cents: cents, details }).eq("id", p.id);
        Object.assign(p, { quote_choice: opt.key, quote_items: items, quote_cents: cents, details });
        await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Client chose "${opt.name}"${opt.monthly ? ` (pay monthly: ${money(opt.monthly.cents)} × ${opt.monthly.months})` : ` (${money(cents)})`}`, data: { quote: "choice", key: opt.key } });
      }
      const now = new Date().toISOString();
      await db.from("projects").update({ quote_status: "accepted", quote_accepted_at: now, quote_accepted_name: name }).eq("id", p.id);
      await db.from("projects").update({ status: "approved" }).eq("id", p.id).in("status", PRE_APPROVAL);
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: `Quote accepted online by ${name} (${money(p.quote_cents)})`, data: { quote: "accepted", name, ip: req.headers.get("x-forwarded-for") ?? null } });
      const pm = monthlyOf(), startPay = pm ? `the first month (${money(pm.cents)})` : `the ${money(depositFor())} deposit`;
      await notifyEmail(`${p.ref}: quote accepted — ${who}`, `${name} accepted the quote for ${who} (${p.ref}) — ${pm ? `pay monthly, ${money(pm.cents)} × ${pm.months}` : money(p.quote_cents)}.\n\n${p.deposit_paid ? "Deposit already paid." : `They're being sent to pay ${startPay} now.`}\n\n${SITE}/admin/#/p/${p.id}`);
      await sendPush(db, { title: `Quote accepted: ${who}`, body: `${pm ? money(pm.cents) + "/month" : money(p.quote_cents)} · ${p.deposit_paid ? "deposit already paid" : `they're paying ${startPay} now`}`, url: `/admin/#/p/${p.id}`, tag: `quote-${p.id}` });
      p.quote_status = "accepted"; p.quote_accepted_at = now; p.quote_accepted_name = name;
    }
    let checkoutUrl: string | null = null;
    if (!p.deposit_paid) {
      try {
        const pm = monthlyOf();
        const c = await createYocoCheckout({
          amountCents: depositFor(),
          metadata: { projectId: p.id, ref: p.ref, kind: "deposit", description: pm ? `First month (${money(pm.cents)}) — ${who}` : `${money(depositFor())} deposit — ${who}` },
          successUrl: `${SITE}/quote?t=${t}&paid=1`, cancelUrl: `${SITE}/quote?t=${t}&paid=0`,
        });
        checkoutUrl = c.redirectUrl;
        await db.from("project_events").insert({ project_id: p.id, kind: "payment", note: `${pm ? "First-month" : "Deposit"} checkout created from the accepted quote`, data: { checkoutId: c.id } });
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
  if (body.action === "content" || body.action === "upload") {
    if (p.quote_status !== "accepted") return json({ ok: false, error: "Accept the quote first." }, 409);
    // re-read details so two quick saves don't overwrite each other
    const { data: fresh } = await db.from("projects").select("details").eq("id", p.id).single();
    const details = { ...(fresh?.details || {}) } as Record<string, unknown>;
    const content = { ...((details.content as Record<string, unknown>) || {}) } as Record<string, unknown>;
    const files = Array.isArray(content.files) ? [...content.files] : [];
    const first = !CONTENT_FIELDS.some((k) => content[k]) && !files.length;
    if (body.action === "content") {
      const f = body.fields || {};
      for (const k of CONTENT_FIELDS) content[k] = String(f[k] ?? "").trim().slice(0, 3000);
      if (!CONTENT_FIELDS.some((k) => content[k])) return json({ ok: false, error: "Fill in at least one box." }, 400);
      content.at = new Date().toISOString();
    } else {
      const type = String(body.type || ""), ext = FILE_TYPES[type];
      if (!ext) return json({ ok: false, error: "Photos (JPG, PNG, WebP) or PDFs only." }, 415);
      if (files.length >= MAX_FILES) return json({ ok: false, error: `That's the limit of ${MAX_FILES} files. WhatsApp us the rest.` }, 413);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(String(body.data || "")), (ch) => ch.charCodeAt(0)); } catch { return json({ ok: false, error: "That file didn't come through. Try again." }, 400); }
      if (!bytes.length || bytes.length > MAX_BYTES) return json({ ok: false, error: "Files must be under 6 MB." }, 413);
      const path = `${p.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await db.storage.from("client-content").upload(path, bytes, { contentType: type, upsert: false });
      if (upErr) { console.error("quote: upload failed", upErr); return json({ ok: false, error: "The upload failed. Try again in a minute." }, 500); }
      files.push({ path, name: String(body.name || "file").replace(/[^\w .()-]/g, "").slice(0, 80) || "file", type, size: bytes.length, at: new Date().toISOString() });
      content.files = files;
    }
    details.content = content;
    await db.from("projects").update({ details }).eq("id", p.id);
    p.details = details;
    if (first) {
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: "Client started sending their content (photos, services, hours)", data: { content: true } });
      await sendPush(db, { title: `Content coming in: ${who}`, body: "They've started sending their photos and details", url: `/admin/#/p/${p.id}`, tag: `content-${p.id}` });
    } else if (body.action === "content") {
      await db.from("project_events").insert({ project_id: p.id, kind: "note", note: "Client updated their content details", data: { content: true } });
    }
    return json({ ok: true, content: contentSummary() });
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
