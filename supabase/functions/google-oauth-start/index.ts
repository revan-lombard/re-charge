// google-oauth-start — returns the Google consent URL for a client the caller
// may access. Deploy with verify_jwt = true (needs the user's Supabase token).
// Untested — deploy and verify.
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { getCaller, canAccess } from "../_shared/auth.ts";
import { signState } from "../_shared/crypto.ts";
import { authUrl } from "../_shared/google.ts";

serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const { clientId } = await req.json().catch(() => ({}));
  if (!clientId || !canAccess(caller, clientId)) return json({ error: "forbidden" }, 403);
  // g: marks a Google connect state; exp: the consent link works for 30 minutes, like the Facebook one.
  const state = await signState({ g: 1, clientId, uid: caller.userId, exp: Date.now() + 30 * 60e3 });
  return json({ url: authUrl(state) });
});
