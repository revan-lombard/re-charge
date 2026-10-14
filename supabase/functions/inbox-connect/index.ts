// inbox-connect — staff only. POST { accountId } → { ok, url }: the Google consent link the
// client opens to connect their Gmail to the Inbox Assistant. The link is signed and valid for
// 14 days; the consent screen shows exactly what's asked for (read, draft and label their mail).
import { preflight, json } from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/db.ts";
import { signState } from "../_shared/crypto.ts";
import { gmailAuthUrl } from "../_shared/gmail.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET") || !Deno.env.get("TOKEN_ENCRYPTION_KEY")) {
    return json({ ok: false, error: "Google isn't set up yet: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY are needed (ADMIN.md 8cd)." }, 503);
  }
  const { accountId } = await req.json().catch(() => ({}));
  const { data: acc } = await serviceClient().from("inbox_accounts").select("id, email").eq("id", String(accountId || "")).maybeSingle();
  if (!acc) return json({ ok: false, error: "inbox not found" }, 404);
  const state = await signState({ inbox: acc.id, exp: Date.now() + 14 * 864e5 });
  return json({ ok: true, url: gmailAuthUrl(state, acc.email || undefined) });
});
