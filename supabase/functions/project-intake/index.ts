// project-intake — receives a submission from the website Project Builder and
// stores it as a project record, then emails a notification.
//
// The website posts the same JSON it currently sends to Formspree. To switch
// the site over, set ENQUIRY_ENDPOINT in config.js to this function's URL:
//   https://<project-ref>.supabase.co/functions/v1/project-intake
// Deploy public (no JWT): see supabase/config.toml.
//
// Untested against a live project — deploy and verify.
import { preflight, json } from "../_shared/cors.ts";
import { loadProfile, wrapHtml } from "../_shared/mail.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { pushBriefs } from "../_shared/buildqueue.ts";

// keys we store as first-class columns; everything else goes into details jsonb
const TOP = new Set([
  "name", "email", "phone", "business", "category", "goal", "budget",
  "deadline", "indicativePrice", "channel", "type", "page", "_subject",
  "submittedAt", "attachments", "_gotcha", "location",
]);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  // honeypot — silently accept and discard bots
  if (body._gotcha) return json({ ok: true });

  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!TOP.has(k)) details[k] = v;
  }
  // The site's call-request and free-mockup modals use their own field names
  // (callName/mkBusiness, callEmail/mkEmail, …). Normalise every form type to
  // the same columns so a project enquiry, a call request and a free-mockup
  // request all store — and notify — cleanly.
  const formType = str(body.formType) ??
    (str(body.type) === "project-enquiry" ? "Project enquiry" : "Enquiry");
  const name = str(body.name) ?? str(body.callName) ?? str(body.mkBusiness);
  const email = str(body.email) ?? str(body.callEmail) ?? str(body.mkEmail);
  const phone = str(body.phone) ?? str(body.callPhone) ?? str(body.mkPhone);
  const business = str(body.business) ?? str(body.mkBusiness);
  const goal = str(body.goal) ?? str(body.mkAbout);
  const location = (str(body.location) ?? str(body.mkLocation))?.slice(0, 120) ?? null;
  let category = String(body.category ?? body.projectType ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!category.length && formType !== "Project enquiry" && formType !== "Enquiry") {
    category = [formType];
  }

  const row = {
    name, email, phone, business, category, goal, details, location,
    budget: str(body.budget),
    deadline: str(body.deadline),
    indicative_price: str(body.indicativePrice),
    channel: str(body.channel),
    status: "new",
  };

  try {
    const db = serviceClient();
    // Referrals: ?ref=<client slug> from a client's share link credits that
    // client (a free year of Care when this lead goes live); ?ref=credit is a
    // click on a "Website by Re-Charge" footer link.
    const refCode = str(body.ref)?.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || null;
    if (refCode === "credit") (row as Record<string, unknown>).source = "credit";
    else if (refCode) {
      const { data: by } = await db.from("clients").select("id, name").eq("slug", refCode).maybeSingle();
      if (by) { (row as Record<string, unknown>).source = "referral"; details.referredBy = { clientId: by.id, name: by.name }; }
    }
    // A prospect we contacted (outreach) who now fills in a form on the site is
    // the same lead replying, not a new one: update that record instead of
    // creating a duplicate, so its history and notes stay together.
    const prospect = await findProspect(db, email, phone);
    let data: { id: string; ref: string; build_status: string | null };
    if (prospect) {
      const patch: Record<string, unknown> = {
        status: "new", archived: false, next_action: null, next_action_at: null,
        name: name ?? prospect.name, email: email ?? prospect.email, phone: phone ?? prospect.phone,
        business: business ?? prospect.business, goal: goal ?? prospect.goal, location: location ?? prospect.location,
        category: category.length ? category : prospect.category,
        details: { ...(prospect.details ?? {}), ...details },
        budget: row.budget ?? prospect.budget, deadline: row.deadline ?? prospect.deadline,
        indicative_price: row.indicative_price ?? prospect.indicative_price, channel: row.channel ?? prospect.channel,
      };
      if (formType === "Free mockup request" && ["none", "failed", null].includes(prospect.build_status) && await autoQueueOn(db)) patch.build_status = "queued";
      const { data: upd, error } = await db.from("projects").update(patch).eq("id", prospect.id).select("id, ref, build_status").single();
      if (error) throw error;
      data = upd;
      await db.from("project_events").insert({
        project_id: data.id, kind: "note", note: `Replied through the website (${formType}) — was a prospect`,
        data: { attachments: body.attachments ?? null, page: body.page ?? null, merged: true },
      });
    } else {
      const { data: ins, error } = await db.from("projects").insert(row).select("id, ref, build_status").single();
      if (error) throw error;
      data = ins;
      await db.from("project_events").insert({
        project_id: data.id, kind: "created", note: `Submitted from website (${formType})`,
        data: { attachments: body.attachments ?? null, page: body.page ?? null },
      });
    }

    // Surface the form-specific extras (call day/time, mockup brief, chosen
    // features, …) in the email — anything already shown above is skipped.
    const shown = new Set([
      "formType", "callName", "callEmail", "callPhone",
      "mkBusiness", "mkEmail", "mkPhone", "mkAbout", "projectType",
    ]);
    const extra = Object.entries(details).filter(([k, v]) =>
      !shown.has(k) && !k.startsWith("_") && v != null && String(v).trim().length);
    const detailLines = extra.length
      ? ["", "Details:", ...extra.map(([k, v]) => `  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)]
      : [];
    const subject = str(body._subject)
      ? `${data.ref}: ${str(body._subject)}`
      : `New ${formType} ${data.ref}: ${name ?? ""}`;
    const subjectLine = prospect ? `${subject} (a prospect you contacted)` : subject;
    await notifyEmail(
      subjectLine,
      [
        `Type: ${formType}`,
        `Ref: ${data.ref}`,
        `Name: ${name ?? ""}`,
        `Email: ${email ?? ""}`,
        `Phone: ${phone ?? ""}`,
        `Business: ${business ?? ""}`,
        `Location: ${location ?? ""}`,
        `Category: ${category.join(", ")}`,
        `Budget: ${row.budget ?? ""}`,
        `Deadline: ${row.deadline ?? ""}`,
        "",
        `Goal / message:\n${goal ?? ""}`,
        ...detailLines,
        "",
        `Attachments: ${body.attachments ?? "none"}`,
      ].join("\n"),
      email ?? undefined,
    );
    // Instant thank-you to the person who enquired (Settings → Your details).
    // A fast, personal reply is the cheapest way to win more of these.
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      await thankYou(db, { projectId: data.id, ref: data.ref, email, name, business, formType, details }).catch((e) => console.error("thank-you email failed:", e));
    }
    // Auto-queued mockup request (Settings → automatic mockups): hand the
    // brief to the GitHub-based builder now, so it's picked up on the next run.
    if (data.build_status === "queued") {
      const r = await pushBriefs(db, [data.id]).catch((e) => ({ pushed: 0, errors: [String(e)] }));
      if (r.errors.length) console.error("auto-queue push failed:", r.errors);
    }
    return json({ ok: true, id: data.id, ref: data.ref });
  } catch (e) {
    console.error("intake failed:", e);
    return json({ ok: false, error: "could not store project" }, 500);
  }
});

// Digits only, with a South African leading 0 turned into 27 (082… → 2782…).
function normPhone(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "27" + d.slice(1);
  if (d.startsWith("270") && d.length === 12) d = "27" + d.slice(3);
  return d;
}

// deno-lint-ignore no-explicit-any
async function findProspect(db: any, email: string | null, phone: string | null) {
  if (!email && !phone) return null;
  const { data, error } = await db.from("projects")
    .select("id, ref, name, email, phone, business, goal, location, category, details, budget, deadline, indicative_price, channel, build_status")
    .in("status", ["prospect", "contacted"]).eq("spam", false)
    .order("updated_at", { ascending: false }).limit(2000);
  if (error || !data) return null;
  const e = email?.toLowerCase(), ph = normPhone(phone);
  // deno-lint-ignore no-explicit-any
  return data.find((p: any) => e && p.email && p.email.toLowerCase() === e)
    // deno-lint-ignore no-explicit-any
    ?? data.find((p: any) => ph.length >= 9 && normPhone(p.phone) === ph) ?? null;
}

// deno-lint-ignore no-explicit-any
async function autoQueueOn(db: any): Promise<boolean> {
  const { data } = await db.from("settings").select("value").eq("key", "autobuild").maybeSingle();
  return Boolean(data?.value?.auto_queue);
}

function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

// ---------- the instant thank-you ----------
async function thankYou(db: ReturnType<typeof serviceClient>, p: { projectId: string; ref: string; email: string; name: string | null; business: string | null; formType: string; details: Record<string, unknown> }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const { data: spam } = await db.from("spam_senders").select("email").eq("email", p.email.toLowerCase()).maybeSingle();
  if (spam) return;
  const inbox = Deno.env.get("NOTIFY_EMAIL") ?? "";
  const prof = await loadProfile(db, inbox);
  if (!prof.autoreply) return;
  const first = (p.name ?? "").trim().split(/\s+/)[0] || "there";
  const biz = p.business || "your business";
  const wa = prof.whatsapp ? prof.whatsapp.replace(/^27/, "0").replace(/^(\d{3})(\d{3})(\d+)$/, "$1 $2 $3") : "";
  const me = prof.myName || "Re-Charge";
  const d = p.details;
  let subject: string, body: string;
  if (p.formType === "Free mockup request") {
    subject = `Your free mockup for ${biz}`;
    body = `Hi ${first},\n\nThanks for asking for a free mockup for ${biz}. I've got everything you sent.\n\nI'll build it and send you a private link to look at on your phone, usually within 2 business days. If you think of anything else you'd like on it, like photos, prices or a site you like the look of, just reply to this email.\n\nThere's nothing to pay, and no obligation.`;
  } else if (p.formType === "Call request") {
    const when = [d.callDay, d.callTime].filter((x) => typeof x === "string" && x).join(", ");
    subject = "Your call with Re-Charge";
    body = `Hi ${first},\n\nThanks for booking a call. I'll phone you${when ? ` on ${when}` : ""}.\n\nIf the time stops suiting you, just reply to this email with a better one${wa ? `, or WhatsApp me on ${wa}` : ""}.`;
  } else {
    subject = `Got your message${p.business ? `: ${p.business}` : ""}`;
    body = `Hi ${first},\n\nThanks for getting in touch${p.business ? ` about ${p.business}` : ""}. I've got your message and I'll come back to you within one business day, with a couple of questions or a plan.\n\nAfter that you'll get a fixed quote online. You don't pay anything until you've seen it and said yes.${wa ? `\n\nIf it's easier to talk, WhatsApp me on ${wa}.` : ""}`;
  }
  const text = `${body}\n\nThanks,\n\n${prof.sig.text || me}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>", to: p.email, subject, text, html: wrapHtml(text, prof.sig), ...(prof.replyTo ? { reply_to: prof.replyTo } : {}), tags: [{ name: "project", value: p.projectId.replace(/[^a-zA-Z0-9_-]/g, "") }] }),
  });
  const j = await res.json().catch(() => ({}));
  await db.from("messages").insert({ project_id: p.projectId, kind: "email", to_address: p.email, subject, body: text, provider_id: j?.id ?? null, status: res.ok ? "sent" : "failed", meta: { auto: "thank-you", ...(res.ok ? {} : { error: `Resend ${res.status}` }) } });
  await db.from("project_events").insert({ project_id: p.projectId, kind: "email", note: res.ok ? `Automatic thank-you email sent: "${subject}"` : `Automatic thank-you email FAILED: "${subject}"`, data: { auto: true } });
}
