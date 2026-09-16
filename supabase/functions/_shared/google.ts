// Google token handling + a valid access token for a client's stored credentials.
// Untested — deploy and verify.
import { serviceClient } from "./db.ts";
import { encrypt, decrypt } from "./crypto.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "openid", "email",
].join(" ");

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    redirect_uri: Deno.env.get("GOOGLE_OAUTH_REDIRECT")!,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      redirect_uri: Deno.env.get("GOOGLE_OAUTH_REDIRECT")!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token exchange failed: " + await res.text());
  return await res.json();
}

// Store credentials for a client (refresh token encrypted at rest).
export async function storeCredentials(clientId: string, tok: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }) {
  const db = serviceClient();
  const expires_at = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  const row: Record<string, unknown> = {
    client_id: clientId, provider: "google",
    access_token: await encrypt(tok.access_token),
    expires_at, scope: tok.scope ?? GOOGLE_SCOPES, updated_at: new Date().toISOString(),
  };
  if (tok.refresh_token) row.refresh_token = await encrypt(tok.refresh_token);
  await db.from("oauth_credentials").upsert(row, { onConflict: "client_id,provider" });
}

// Return a valid access token, refreshing if expired.
export async function accessTokenFor(clientId: string): Promise<string> {
  const db = serviceClient();
  const { data, error } = await db.from("oauth_credentials")
    .select("access_token, refresh_token, expires_at").eq("client_id", clientId).eq("provider", "google").single();
  if (error || !data) throw new Error("no google credentials for client");

  if (data.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now()) {
    return await decrypt(data.access_token);
  }
  if (!data.refresh_token) throw new Error("no refresh token; reconnect Google");
  const refresh = await decrypt(data.refresh_token);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refresh, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("token refresh failed: " + await res.text());
  const tok = await res.json();
  await db.from("oauth_credentials").update({
    access_token: await encrypt(tok.access_token),
    expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("client_id", clientId).eq("provider", "google");
  return tok.access_token;
}
