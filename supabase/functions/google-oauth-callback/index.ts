// google-oauth-callback — Google redirects here after consent. Exchanges the
// code for tokens and stores them (refresh token encrypted) for the client in
// the signed state. Register its URL as the OAuth redirect URI in Google Cloud
// and set it as GOOGLE_OAUTH_REDIRECT. Deploy with verify_jwt = false.
// Untested — deploy and verify.
import { verifyState } from "../_shared/crypto.ts";
import { exchangeCode, storeCredentials } from "../_shared/google.ts";

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const site = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
  const back = (ok: boolean) => Response.redirect(`${site}/dashboard/?connected=${ok ? 1 : 0}`, 302);

  if (!code || !state) return back(false);
  const payload = await verifyState(state);
  if (!payload || !payload.clientId) return back(false);
  try {
    const tok = await exchangeCode(code);
    await storeCredentials(String(payload.clientId), tok);
    return back(true);
  } catch (e) {
    console.error("oauth callback failed:", e);
    return back(false);
  }
});
