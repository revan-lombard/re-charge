// Gmail for the Inbox Assistant (0027): the consent link, tokens per inbox (encrypted at
// rest), and the few Gmail calls the assistant needs: list new mail, read one email, save a
// reply as a draft in its thread, label it, and later see what happened to that draft.
//
// One scope: gmail.modify (read, draft and label; it can't delete mail permanently). Nothing
// is ever sent from here: a person opens the draft, checks it and presses send.
import { serviceClient } from "./db.ts";
import { encrypt, decrypt } from "./crypto.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "openid", "email"].join(" ");
export const LABEL_NAME = "AI draft ready";

const redirectUri = () => Deno.env.get("INBOX_OAUTH_REDIRECT") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/inbox-oauth-callback`;

export function gmailAuthUrl(state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",           // always returns a refresh token
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type Tok = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeGmailCode(code: string): Promise<Tok> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code", redirect_uri: redirectUri(),
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    }),
  });
  if (!res.ok) throw new Error("token exchange failed: " + await res.text());
  return await res.json();
}

export async function storeInboxTokens(accountId: string, tok: Tok) {
  const row: Record<string, unknown> = {
    account_id: accountId,
    access_token: await encrypt(tok.access_token),
    expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (tok.refresh_token) row.refresh_token = await encrypt(tok.refresh_token);
  const { error } = await serviceClient().from("inbox_secrets").upsert(row, { onConflict: "account_id" });
  if (error) throw new Error("could not store the inbox tokens: " + error.message);
}

export class ReconnectNeeded extends Error {}

// A valid access token for one inbox, refreshed when it has expired.
export async function inboxToken(accountId: string): Promise<string> {
  const db = serviceClient();
  const { data } = await db.from("inbox_secrets").select("access_token, refresh_token, expires_at").eq("account_id", accountId).maybeSingle();
  if (!data) throw new ReconnectNeeded("This inbox hasn't been connected yet.");
  if (data.access_token && data.expires_at && Date.parse(data.expires_at) > Date.now()) return await decrypt(data.access_token);
  if (!data.refresh_token) throw new ReconnectNeeded("No refresh token: send a new connect link.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: await decrypt(data.refresh_token),
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (/invalid_grant/.test(t)) throw new ReconnectNeeded("Google access was removed or has expired: send a new connect link.");
    throw new Error("token refresh failed: " + t);
  }
  const tok = await res.json();
  await db.from("inbox_secrets").update({
    access_token: await encrypt(tok.access_token),
    expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  return tok.access_token;
}

// ---------- Gmail API ----------
export class GmailError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function gmail<T = Record<string, unknown>>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) throw new GmailError(res.status, `Gmail ${init.method || "GET"} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? ({} as T) : await res.json();
}

export type Header = { name: string; value: string };
export type Part = { mimeType?: string; filename?: string; headers?: Header[]; body?: { data?: string; size?: number }; parts?: Part[] };
export type GMessage = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: Part; snippet?: string };

export const header = (m: GMessage | Part | undefined, name: string): string => {
  const hs = (m && "payload" in m ? m.payload?.headers : (m as Part | undefined)?.headers) || [];
  return hs.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
};

// ---------- text ----------
export function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}
export function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ""; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); };

export function htmlToText(h: string): string {
  return h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// The readable body of an email: its text/plain part, or its HTML turned into text.
export function bodyText(p: Part | undefined): string {
  if (!p) return "";
  const find = (x: Part, type: string): string => {
    if (x.mimeType === type && x.body?.data && !x.filename) return b64urlDecode(x.body.data);
    for (const c of x.parts || []) { const t = find(c, type); if (t) return t; }
    return "";
  };
  const plain = find(p, "text/plain");
  if (plain.trim()) return plain.replace(/\r\n/g, "\n").trim();
  const html = find(p, "text/html");
  return html ? htmlToText(html) : "";
}

// What a person actually wrote in a reply: everything above the quoted email.
export function stripQuoted(t: string): string {
  const lines = t.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^On .{6,200}wrote:\s*$/.test(l.trim()) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l.trim()) || /^From: .+/.test(l.trim()) && out.length > 2) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

// How much of the draft survived into what was sent, 0..1 (word overlap, Dice coefficient).
// Placeholders like [price] are ignored, since a person is meant to fill those in.
export function similarity(draft: string, sent: string): number {
  const words = (t: string) => t.toLowerCase().replace(/\[[^\]]{1,80}\]/g, " ").match(/[\p{L}\p{N}']+/gu) || [];
  const a = words(draft), b = words(sent);
  if (!a.length || !b.length) return 0;
  const count = new Map<string, number>(); for (const w of a) count.set(w, (count.get(w) || 0) + 1);
  let hit = 0; for (const w of b) { const n = count.get(w) || 0; if (n) { hit++; count.set(w, n - 1); } }
  return Math.round((2 * hit / (a.length + b.length)) * 100) / 100;
}

// Mail we should never draft a reply to: newsletters, notifications, automatic replies.
// Shared by Gmail and Outlook: `h` looks up a header by name.
export function skipFor(from0: string, h: (name: string) => string, inboxEmail: string, labels: string[] = []): string {
  const from = from0.toLowerCase();
  if (inboxEmail && from.includes(inboxEmail.toLowerCase())) return "from this inbox";
  if (/(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|bounce)/.test(from)) return "automatic sender";
  if (h("List-Unsubscribe") || h("List-Id")) return "mailing list";
  if (/^(bulk|list|junk)$/i.test(h("Precedence").trim())) return "bulk mail";
  const auto = h("Auto-Submitted").trim().toLowerCase();
  if (auto && auto !== "no") return "automatic reply";
  if (labels.some((l) => /^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l))) return "not a customer category";
  return "";
}
export const skipReason = (m: GMessage, inboxEmail: string): string => skipFor(header(m, "From"), (n) => header(m, n), inboxEmail, m.labelIds || []);

const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

// An RFC 2822 reply to `m`, in its thread, as Gmail's base64url `raw`.
export function replyRaw(m: GMessage, fromEmail: string, body: string): string {
  const subj0 = header(m, "Subject") || "";
  const subject = /^re:/i.test(subj0.trim()) ? subj0 : `Re: ${subj0}`;
  const to = header(m, "Reply-To") || header(m, "From");
  const msgId = header(m, "Message-ID") || header(m, "Message-Id");
  const refs = [header(m, "References"), msgId].filter(Boolean).join(" ").trim();
  const lines = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${encWord(subject)}`,
    ...(msgId ? [`In-Reply-To: ${msgId}`] : []),
    ...(refs ? [`References: ${refs}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    (b64(body.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) || [""]).join("\r\n"),
  ];
  return b64urlEncode(lines.join("\r\n"));
}

export async function ensureLabel(token: string): Promise<string> {
  const { labels = [] } = await gmail<{ labels?: { id: string; name: string }[] }>(token, "/labels");
  const hit = labels.find((l) => l.name === LABEL_NAME);
  if (hit) return hit.id;
  const base = { name: LABEL_NAME, labelListVisibility: "labelShow", messageListVisibility: "show" };
  try {
    return (await gmail<{ id: string }>(token, "/labels", { method: "POST", body: JSON.stringify({ ...base, color: { backgroundColor: "#16a766", textColor: "#ffffff" } }) })).id;
  } catch {
    // Gmail only accepts colours from its own palette; a plain label is fine too.
    return (await gmail<{ id: string }>(token, "/labels", { method: "POST", body: JSON.stringify(base) })).id;
  }
}
