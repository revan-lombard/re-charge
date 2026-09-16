// google-oauth-start — returns the Google consent URL for a client the caller
// may access. Deploy with verify_jwt = true (needs the user's Supabase token).
// Untested — deploy and verify.
import { preflight, json } from "../_shared/cors.ts";
import { getCaller, canAccess } from "../_shared/auth.ts";
import { signState } from "../_shared/crypto.ts";
import { authUrl } from "../_shared/google.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const { clientId } = await req.json().catch(() => ({}));
  if (!clientId || !canAccess(caller, clientId)) return json({ error: "forbidden" }, 403);
  const state = await signState({ clientId, uid: caller.userId });
  return json({ url: authUrl(state) });
});
