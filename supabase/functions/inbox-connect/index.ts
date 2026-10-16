// inbox-connect — staff only. POST { accountId, provider: "gmail" | "outlook" } → { ok, url }: the
// consent link the client opens to connect their Gmail or Microsoft 365 inbox to the Inbox
// Assistant. Signed and valid for 14 days; the consent screen shows exactly what's asked for
// (read, draft and label their mail; never send).
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/db.ts";
import { signState } from "../_shared/crypto.ts";
import { gmailAuthUrl } from "../_shared/gmail.ts";
import { outlookAuthUrl } from "../_shared/outlook.ts";

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  const { accountId, provider: p0 } = await req.json().catch(() => ({}));
  const provider = p0 === "outlook" ? "outlook" : "gmail";
  const need = provider === "outlook" ? ["MS_CLIENT_ID", "MS_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"] : ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"];
  const missing = need.filter((k) => !Deno.env.get(k));
  if (missing.length) return json({ ok: false, error: `${provider === "outlook" ? "Microsoft" : "Google"} isn't set up yet: ${missing.join(", ")} needed (ADMIN.md 8cd/8ce).` }, 503);
  const { data: acc } = await serviceClient().from("inbox_accounts").select("id, email").eq("id", String(accountId || "")).maybeSingle();
  if (!acc) return json({ ok: false, error: "inbox not found" }, 404);
  const state = await signState({ inbox: acc.id, p: provider, exp: Date.now() + 14 * 864e5 });
  return json({ ok: true, provider, url: provider === "outlook" ? outlookAuthUrl(state, acc.email || undefined) : gmailAuthUrl(state, acc.email || undefined) });
});
