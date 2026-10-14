// Microsoft 365 / Outlook for the Inbox Assistant, through Microsoft Graph. The same job as
// gmail.ts: a consent link, tokens per inbox (encrypted; Microsoft rotates the refresh token on
// every refresh, so the new one is always stored), and the Graph calls the assistant needs.
//
// Permissions: Mail.ReadWrite (read, draft and categorise mail; it can't send) and
// offline_access (keep working without the client signing in again), plus User.Read for the
// address. Nothing is ever sent from here.
import { serviceClient } from "./db.ts";
import { encrypt, decrypt } from "./crypto.ts";
import { ReconnectNeeded } from "./gmail.ts";

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const MS_SCOPES = "offline_access Mail.ReadWrite User.Read";
export const CATEGORY = "AI draft ready";

const redirectUri = () => Deno.env.get("INBOX_OAUTH_REDIRECT") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/inbox-oauth-callback`;
const creds = () => ({ client_id: Deno.env.get("MS_CLIENT_ID")!, client_secret: Deno.env.get("MS_CLIENT_SECRET")! });

export function outlookAuthUrl(state: string, loginHint?: string): string {
  const p = new URLSearchParams({ client_id: creds().client_id, response_type: "code", redirect_uri: redirectUri(), response_mode: "query", scope: MS_SCOPES, state, prompt: "select_account" });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH}/authorize?${p}`;
}

type Tok = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

async function token(body: Record<string, string>): Promise<Tok> {
  const res = await fetch(`${AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...creds(), scope: MS_SCOPES, ...body }) });
  if (!res.ok) {
    const t = await res.text();
    if (/invalid_grant|interaction_required|AADSTS70008|AADSTS700082/.test(t)) throw new ReconnectNeeded("Microsoft access was removed or has expired: send a new connect link.");
    throw new Error("Microsoft token request failed: " + t.slice(0, 300));
  }
  return await res.json();
}
export const exchangeOutlookCode = (code: string) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });

export async function storeOutlookTokens(accountId: string, tok: Tok) {
  const row: Record<string, unknown> = {
    account_id: accountId, access_token: await encrypt(tok.access_token),
    expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString(),
  };
  if (tok.refresh_token) row.refresh_token = await encrypt(tok.refresh_token);
  const { error } = await serviceClient().from("inbox_secrets").upsert(row, { onConflict: "account_id" });
  if (error) throw new Error("could not store the inbox tokens: " + error.message);
}

export async function outlookToken(accountId: string): Promise<string> {
  const { data } = await serviceClient().from("inbox_secrets").select("access_token, refresh_token, expires_at").eq("account_id", accountId).maybeSingle();
  if (!data) throw new ReconnectNeeded("This inbox hasn't been connected yet.");
  if (data.access_token && data.expires_at && Date.parse(data.expires_at) > Date.now()) return await decrypt(data.access_token);
  if (!data.refresh_token) throw new ReconnectNeeded("No refresh token: send a new connect link.");
  const tok = await token({ grant_type: "refresh_token", refresh_token: await decrypt(data.refresh_token) });
  await storeOutlookTokens(accountId, tok);   // Microsoft hands back a new refresh token each time
  return tok.access_token;
}

export class GraphError extends Error { constructor(public status: number, msg: string) { super(msg); } }

// Graph call. Bodies come back as plain text (Prefer header), so no HTML parsing is needed.
export async function graph<T = Record<string, unknown>>(tok: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(GRAPH + path, { ...init, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: 'outlook.body-content-type="text"', ...(init.headers || {}) } });
  if (!res.ok) throw new GraphError(res.status, `Graph ${init.method || "GET"} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 202 || res.status === 204 ? ({} as T) : await res.json();
}

export type OMessage = {
  id: string; conversationId: string; subject?: string; isDraft?: boolean; receivedDateTime?: string; sentDateTime?: string;
  from?: { emailAddress?: { address?: string; name?: string } }; replyTo?: { emailAddress?: { address?: string; name?: string } }[];
  body?: { content?: string }; uniqueBody?: { content?: string }; internetMessageHeaders?: { name: string; value: string }[]; categories?: string[];
};
export const addr = (x?: { emailAddress?: { address?: string; name?: string } }) => x?.emailAddress ? `${x.emailAddress.name ? `"${x.emailAddress.name}" ` : ""}<${x.emailAddress.address || ""}>` : "";
export const q = (s: string) => s.replace(/'/g, "''");   // OData string literal
