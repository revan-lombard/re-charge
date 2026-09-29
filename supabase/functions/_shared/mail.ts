// Shared email pieces: the branded HTML layout and your Settings profile
// (reply-to, signature, signature photo). Used by send-message and by
// project-intake's instant thank-you email.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type Profile = { replyTo: string; sig: Sig; myName: string; whatsapp: string; autoreply: boolean };

export async function loadProfile(db: SupabaseClient, fallbackReplyTo = ""): Promise<Profile> {
  const out: Profile = { replyTo: fallbackReplyTo, sig: { text: "", photo: "" }, myName: "", whatsapp: "", autoreply: true };
  try {
    const { data } = await db.from("settings").select("value").eq("key", "profile").maybeSingle();
    const v = (data?.value ?? {}) as Record<string, unknown>;
    if (typeof v.reply_to === "string" && /@/.test(v.reply_to)) out.replyTo = v.reply_to.trim();
    if (typeof v.signature === "string") out.sig.text = v.signature.replace(/\r\n/g, "\n").trim();
    if (typeof v.my_name === "string") out.myName = v.my_name.trim();
    if (typeof v.whatsapp === "string") out.whatsapp = v.whatsapp.replace(/\D/g, "");
    if (v.autoreply === false) out.autoreply = false;
    // only our own public storage, so a stray value can't pull images from elsewhere
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "") + "/storage/v1/object/public/branding/";
    if (typeof v.signature_photo === "string" && base.length > 40 && v.signature_photo.startsWith(base) && !/["'<>\s]/.test(v.signature_photo)) out.sig.photo = v.signature_photo;
  } catch { /* keep fallbacks */ }
  return out;
}

export type Sig = { text: string; photo: string };

// Plain text → simple branded HTML. Content is escaped; URLs become links.
// When the email ends with your saved signature and you've added a photo in
// Settings, the signature is shown with the photo beside it.
export function wrapHtml(text: string, sig: Sig = { text: "", photo: "" }): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#2f6fe0;">${u}</a>`);
  let main = text, sigHtml = "";
  if (sig.photo && sig.text && text.endsWith(sig.text)) {
    main = text.slice(0, text.length - sig.text.length).trimEnd();
    const lines = sig.text.split("\n").map((l, i) => i === 0 ? `<b style="color:#0a0d13;">${linkify(esc(l))}</b>` : linkify(esc(l))).join("<br>");
    sigHtml = `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 4px;"><tr>
<td style="vertical-align:top;padding-right:14px;"><img src="${sig.photo}" width="64" height="64" alt="" style="display:block;border:0;border-radius:50%;width:64px;height:64px;"></td>
<td style="vertical-align:middle;color:#3d4757;font-size:14px;line-height:1.5;">${lines}</td></tr></table>`;
  }
  const paragraphs = main.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("") + sigHtml;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f6;padding:28px 12px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
<tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0a0d13;padding:18px 26px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td style="vertical-align:middle;"><img src="https://re-charge.co.za/assets/logo-mark.png" width="24" height="23" alt="R" style="display:block;border:0;"></td>
<td style="vertical-align:middle;padding-left:2px;color:#ffffff;font-weight:700;letter-spacing:0.08em;font-size:14px;">E<span style="color:#82b1ff;">-</span>CHARGE</td></tr></table></td></tr>
<tr><td style="padding:26px 26px 12px;color:#0a0d13;font-size:15.5px;line-height:1.6;">${paragraphs}</td></tr>
<tr><td style="padding:14px 26px 22px;color:#8b97a9;font-size:12.5px;line-height:1.55;border-top:1px solid #e6eaf1;">Re-Charge · Tell us the problem. We'll build the solution. · <a href="https://re-charge.co.za" style="color:#4d8dff;text-decoration:none;">re-charge.co.za</a></td></tr>
</table></td></tr></table>`;
}
