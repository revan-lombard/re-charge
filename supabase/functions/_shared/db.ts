// Service-role Supabase client for Edge Functions. Bypasses RLS — never expose
// the secret key to the browser. The Supabase runtime injects the keys:
// SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (new API keys, a JSON object
// of name → key) and the legacy SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY.
// New keys win, so the legacy JWT keys can be switched off in the dashboard.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function injectedKey(jsonVar: string, legacyVar: string): string {
  try {
    const all = JSON.parse(Deno.env.get(jsonVar) ?? "{}") as Record<string, unknown>;
    const k = all.default ?? Object.values(all)[0];
    if (typeof k === "string" && k) return k;
  } catch { /* not set or not JSON: fall back */ }
  return Deno.env.get(legacyVar) ?? "";
}
export const secretKey = () => injectedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
export const publishableKey = () => injectedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = secretKey();
  if (!url || !key) throw new Error("Missing SUPABASE_URL / secret key");
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
