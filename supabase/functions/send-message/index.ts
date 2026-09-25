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
  let replyTo = inbox;
  try {
    const { data } = await db.from("settings").select("value").eq("key", "profile").maybeSingle();
    const v = (data?.value ?? {}) as Record<string, unknown>;
    if (typeof v.reply_to === "string" && /@/.test(v.reply_to)) replyTo = v.reply_to.trim();
  } catch { /* keep fallback */ }

  const payload: Record<string, unknown> = { from, to, subject, text, html: wrapHtml(text) };
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

// Plain text → simple branded HTML. Content is escaped; URLs become links.
function wrapHtml(text: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#2f6fe0;">${u}</a>`);
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f6;padding:28px 12px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
<tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0a0d13;padding:18px 26px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td style="vertical-align:middle;"><img src="https://re-charge.co.za/assets/logo-mark.png" width="24" height="23" alt="R" style="display:block;border:0;"></td>
<td style="vertical-align:middle;padding-left:2px;color:#ffffff;font-weight:700;letter-spacing:0.08em;font-size:14px;">E<span style="color:#82b1ff;">-</span>CHARGE</td></tr></table></td></tr>
<tr><td style="padding:26px 26px 12px;color:#0a0d13;font-size:15.5px;line-height:1.6;">${paragraphs}</td></tr>
<tr><td style="padding:14px 26px 22px;color:#8b97a9;font-size:12.5px;line-height:1.55;border-top:1px solid #e6eaf1;">Re-Charge · Tell us the problem. We'll build the solution. · <a href="https://re-charge.co.za" style="color:#4d8dff;text-decoration:none;">re-charge.co.za</a></td></tr>
</table></td></tr></table>`;
}
