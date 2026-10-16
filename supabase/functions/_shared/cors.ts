// Shared CORS helpers for the Edge Functions a browser calls (the website, the admin panel, the
// client dashboard: all on re-charge.co.za).
//
// Only these origins may read the answers: the live site (with and without www) and the local test
// server (scripts/shots serve the repo on 127.0.0.1:8199). Nothing on another domain calls these
// functions, so there is no need for "*"; keeping it closed also stops another site from using the
// website's AI through its own visitors' browsers. Webhooks, pg_cron and the office PC don't send
// an Origin and aren't affected.
//
// ALLOW_ORIGIN (optional secret) replaces the list: comma-separated origins, or "*" to open it up
// for a test. If you set it to just https://re-charge.co.za before, that still works.
const DEFAULT_ORIGINS = ["https://re-charge.co.za", "https://www.re-charge.co.za", "http://127.0.0.1:8199", "http://localhost:8199"];
const ALLOWED = (Deno.env.get("ALLOW_ORIGIN") ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
const ORIGINS = ALLOWED.length ? ALLOWED : DEFAULT_ORIGINS;
const OPEN = ORIGINS.includes("*");

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": OPEN ? "*" : ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

// The Access-Control-Allow-Origin value for this request: the caller's origin when it's allowed.
export function allowOrigin(req: Request): string {
  if (OPEN) return "*";
  const o = (req.headers.get("Origin") ?? "").replace(/\/+$/, "");
  return ORIGINS.includes(o) ? o : ORIGINS[0];
}

// Deno.serve, plus the right Access-Control-Allow-Origin on every answer that carries CORS headers
// (json() and preflight() below add them; redirects and plain responses are left as they are).
export function serveCors(handler: (req: Request) => Response | Promise<Response>) {
  return Deno.serve(async (req: Request) => {
    const res = await handler(req);
    if (!res.headers.has("Access-Control-Allow-Origin")) return res;
    const origin = allowOrigin(req);
    try {
      res.headers.set("Access-Control-Allow-Origin", origin);
      return res;
    } catch {
      // some responses have read-only headers: copy them
      const h = new Headers(res.headers);
      h.set("Access-Control-Allow-Origin", origin);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Origin": allowOrigin(req) } });
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
