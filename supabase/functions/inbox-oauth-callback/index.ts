// inbox-oauth-callback — Google or Microsoft sends the client here after they allow access.
// Stores the tokens (encrypted), records which address was connected, starts the two-week
// trial clock, tells us by email, and sends the client to a thank-you notice on the site.
// Deploy with verify_jwt = false. Register this URL as an authorised redirect URI on the
// Google OAuth client (or set INBOX_OAUTH_REDIRECT to wherever it is served).
import { verifyState } from "../_shared/crypto.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { exchangeGmailCode, storeInboxTokens, gmail } from "../_shared/gmail.ts";
import { exchangeOutlookCode, storeOutlookTokens, graph } from "../_shared/outlook.ts";

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const site = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
  const back = (ok: boolean) => Response.redirect(`${site}/inbox-assistant?connected=${ok ? 1 : 0}#connected`, 302);
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code || !state) return back(false);       // includes "access denied" on the consent screen
  const s = await verifyState(state);
  if (!s || !s.inbox || (typeof s.exp === "number" && s.exp < Date.now())) return back(false);
  const db = serviceClient();
  try {
    const outlook = s.p === "outlook";
    let address = "";
    if (outlook) {
      const tok = await exchangeOutlookCode(code);
      if (!/Mail\.ReadWrite/i.test(String(tok.scope || ""))) { console.error("inbox connect: Mail.ReadWrite not granted"); return back(false); }
      await storeOutlookTokens(String(s.inbox), tok);
      const me = await graph<{ mail?: string; userPrincipalName?: string }>(tok.access_token, "/me?$select=mail,userPrincipalName");
      address = me.mail || me.userPrincipalName || "";
    } else {
      const tok = await exchangeGmailCode(code);
      const granted = String((tok as { scope?: string }).scope || "");
      if (granted && !/gmail\.modify/.test(granted)) { console.error("inbox connect: gmail.modify not granted"); return back(false); }
      await storeInboxTokens(String(s.inbox), tok);
      address = (await gmail<{ emailAddress?: string }>(tok.access_token, "/profile")).emailAddress || "";
    }
    const prof = { emailAddress: address };
    const { data: acc } = await db.from("inbox_accounts").select("business, trial_started_at").eq("id", String(s.inbox)).maybeSingle();
    await db.from("inbox_accounts").update({
      email: prof.emailAddress || null, provider: outlook ? "outlook" : "gmail", status: "active", last_error: null,
      trial_started_at: acc?.trial_started_at || new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", String(s.inbox));
    await notifyEmail(`📥 Inbox connected: ${acc?.business || "a client"}`, `${acc?.business || "A client"} connected ${prof.emailAddress || "their inbox"} to the Inbox Assistant. Drafts start within 30 minutes; the two-week trial is running.\n\nCheck the knowledge on their lead page before the first drafts go in.`);
    return back(true);
  } catch (e) {
    console.error("inbox connect failed:", e);
    return back(false);
  }
});
