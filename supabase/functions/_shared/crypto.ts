// AES-GCM encryption for refresh tokens at rest, plus signed OAuth `state`.
// TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).
// Untested — deploy and verify.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToB64(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}
function keyBytes(): Uint8Array {
  const k = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  return b64ToBytes(k);
}

async function aesKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", keyBytes(), { name: "AES-GCM" }, false, usage);
}

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await aesKey(["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(plain));
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(ct))}`;
}

export async function decrypt(token: string): Promise<string> {
  const [ivb, ctb] = token.split(".");
  const k = await aesKey(["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivb) }, k, b64ToBytes(ctb));
  return new TextDecoder().decode(pt);
}

// ---- signed OAuth state (HMAC over the same key material) ----
async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", keyBytes(), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = bytesToB64(new TextEncoder().encode(JSON.stringify({ ...payload, n: crypto.randomUUID() })));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body));
  return `${body}.${bytesToB64(new Uint8Array(mac))}`;
}
export async function verifyState(state: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = (state || "").split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC", await hmacKey(), b64ToBytes(sig), new TextEncoder().encode(body),
  );
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(b64ToBytes(body))); } catch { return null; }
}
