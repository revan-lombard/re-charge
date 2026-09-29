// send-message — sends an email from the admin panel via Resend and logs it.
//
// Called by /admin/ with the signed-in user's JWT (verify_jwt = true in
// config.toml). Only users in the `staff` table may send. The browser composes
// the final subject/body (variables already filled in, previewed by the
// sender); this function adds the branded HTML wrapper, sends, and records the
// message in `messages` + a `project_events` timeline entry.
//
// Env: RESEND_API_KEY, NOTIFY_FROM (verified sender), NOTIFY_EMAIL (fallback
// reply-to and the bcc "copy to me" address), ALLOW_ORIGIN.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { loadProfile, wrapHtml } from "../_shared/mail.ts";

type Body = {
  projectId?: string | null;
  templateId?: string | null;
  to: string;
  subject: string;
  text: string;
  copyMe?: boolean;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ ok: false, error: "not signed in" }, 401);
  if (!caller.isStaff) return json({ ok: false, error: "staff only" }, 403);

  let body: Body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const text = String(body.text ?? "").replace(/\r\n/g, "\n").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ ok: false, error: "invalid recipient" }, 400);
  if (!subject || !text) return json({ ok: false, error: "subject and body are required" }, 400);
  if (text.length > 20000) return json({ ok: false, error: "body too long" }, 400);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (body.projectId && !UUID.test(String(body.projectId))) return json({ ok: false, error: "bad projectId" }, 400);
  if (body.templateId && !UUID.test(String(body.templateId))) body.templateId = null;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>";
  const inbox = Deno.env.get("NOTIFY_EMAIL") ?? "";
  if (!apiKey) return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);

  const db = serviceClient();
  // reply-to: the address you configured in Settings, else the notification inbox
  const { replyTo, sig } = await loadProfile(db, inbox);

  const payload: Record<string, unknown> = { from, to, subject, text, html: wrapHtml(text, sig) };
  if (replyTo) payload.reply_to = replyTo;
  if (body.copyMe && inbox) payload.bcc = inbox;
  if (body.projectId) payload.tags = [{ name: "project", value: String(body.projectId).replace(/[^a-zA-Z0-9_-]/g, "") }];

  let providerId: string | null = null;
  let status = "sent";
  let errorText: string | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { status = "failed"; errorText = `Resend ${res.status}: ${j?.message ?? JSON.stringify(j)}`; }
    else providerId = j?.id ?? null;
  } catch (e) { status = "failed"; errorText = String(e); }

  const { data: msg, error: logErr } = await db.from("messages").insert({
    project_id: body.projectId ?? null, kind: "email", to_address: to, subject, body: text,
    template_id: body.templateId ?? null, provider_id: providerId, status,
    meta: errorText ? { error: errorText, by: caller.userId } : { by: caller.userId },
  }).select("id").single();
  if (logErr) console.error("send-message: sent but could not log message:", logErr);

  if (body.projectId) {
    await db.from("project_events").insert({
      project_id: body.projectId, kind: "email",
      note: status === "sent" ? `Email sent: "${subject}"` : `Email FAILED: "${subject}"`,
      data: { message_id: msg?.id ?? null, to, provider_id: providerId, error: errorText },
    });
  }

  if (status !== "sent") return json({ ok: false, error: errorText, messageId: msg?.id ?? null }, 502);
  return json({ ok: true, id: providerId, messageId: msg?.id ?? null, logged: !logErr });
});
