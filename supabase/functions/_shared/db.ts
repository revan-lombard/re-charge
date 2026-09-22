// Service-role Supabase client for Edge Functions. Bypasses RLS — never expose
// the service-role key to the browser. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are injected automatically by the Supabase runtime.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Optional email notification via Resend (https://resend.com). No-op if unset.
// `replyTo` (e.g. the customer's email) lets you reply straight to them.
export async function notifyEmail(subject: string, text: string, replyTo?: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("NOTIFY_EMAIL");
  const from = Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>";
  if (!apiKey || !to) {
    console.warn(`notifyEmail skipped: ${!apiKey ? "RESEND_API_KEY" : "NOTIFY_EMAIL"} not set`);
    return;
  }
  const payload: Record<string, unknown> = { from, to, subject, text };
  if (replyTo) payload.reply_to = replyTo;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`notifyEmail: Resend returned ${res.status} — ${detail}`);
    } else {
      console.log(`notifyEmail: sent to ${to} from ${from}`);
    }
  } catch (e) {
    console.error("notifyEmail failed:", e);
  }
}
