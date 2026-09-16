// analytics-properties
//   GET  ?clientId=...  → list the account's GA4 + Search Console properties
//   POST { clientId, ga4?, gsc? } → save the chosen property ids
// Deploy with verify_jwt = true. Untested — deploy and verify.
import { preflight, json } from "../_shared/cors.ts";
import { getCaller, canAccess } from "../_shared/auth.ts";
import { accessTokenFor } from "../_shared/google.ts";
import { serviceClient } from "../_shared/db.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const clientId = new URL(req.url).searchParams.get("clientId") ?? "";
    if (!canAccess(caller, clientId)) return json({ error: "forbidden" }, 403);
    try {
      const token = await accessTokenFor(clientId);
      const h = { Authorization: `Bearer ${token}` };
      const [ga4Res, gscRes] = await Promise.all([
        fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", { headers: h }),
        fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: h }),
      ]);
      const ga4Json = await ga4Res.json();
      const gscJson = await gscRes.json();
      const ga4 = (ga4Json.accountSummaries ?? []).flatMap((a: any) =>
        (a.propertySummaries ?? []).map((p: any) => ({
          id: String(p.property).replace("properties/", ""),
          display: `${p.displayName} (${a.displayName})`,
        })));
      const gsc = (gscJson.siteEntry ?? [])
        .filter((s: any) => s.permissionLevel !== "siteUnverifiedUser")
        .map((s: any) => ({ id: s.siteUrl, display: s.siteUrl }));
      return json({ ga4, gsc });
    } catch (e) {
      console.error("list properties failed:", e);
      return json({ error: "could not list properties; reconnect Google" }, 502);
    }
  }

  if (req.method === "POST") {
    const { clientId, ga4, gsc } = await req.json().catch(() => ({}));
    if (!clientId || !canAccess(caller, clientId)) return json({ error: "forbidden" }, 403);
    const db = serviceClient();
    const rows = [];
    if (ga4) rows.push({ client_id: clientId, kind: "ga4", property_id: String(ga4), display: String(ga4) });
    if (gsc) rows.push({ client_id: clientId, kind: "gsc", property_id: String(gsc), display: String(gsc) });
    if (rows.length) await db.from("analytics_properties").upsert(rows, { onConflict: "client_id,kind" });
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
});
