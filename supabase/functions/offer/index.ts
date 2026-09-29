// offer — public, read-only: the site's limited-offer banner asks this whether
// an offer is running and how many spots are left. Cached for 5 minutes.
import { preflight, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { offerStatus } from "../_shared/offer.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  let body: Record<string, unknown> = { active: false };
  try {
    const o = await offerStatus(serviceClient());
    body = o.active ? { active: true, name: o.name, total: o.total, left: o.left, ends: o.ends, area: o.area, code: o.code } : { active: false };
  } catch (e) { console.error("offer failed:", e); }
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
});
