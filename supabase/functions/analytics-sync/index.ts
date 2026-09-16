// analytics-sync — pulls GA4 + Search Console metrics for every connected
// client and caches them in analytics_cache. Meant to run on a schedule
// (Supabase cron) and can be triggered manually. Guarded by SYNC_SECRET.
// Deploy with verify_jwt = false. Untested — deploy and verify.
import { serviceClient } from "../_shared/db.ts";
import { accessTokenFor } from "../_shared/google.ts";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = typeof RANGES[number];
const DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

Deno.serve(async (req) => {
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret && req.headers.get("x-sync-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  const db = serviceClient();
  const { data: props } = await db.from("analytics_properties").select("client_id, kind, property_id");
  const byClient = new Map<string, { ga4?: string; gsc?: string }>();
  for (const p of props ?? []) {
    const e = byClient.get(p.client_id) ?? {};
    if (p.kind === "ga4") e.ga4 = p.property_id;
    if (p.kind === "gsc") e.gsc = p.property_id;
    byClient.set(p.client_id, e);
  }

  const results: Record<string, string> = {};
  for (const [clientId, sel] of byClient) {
    try {
      const token = await accessTokenFor(clientId);
      for (const range of RANGES) {
        if (sel.ga4) await cache(db, clientId, "ga4", range, await ga4Payload(sel.ga4, token, range));
        if (sel.gsc) await cache(db, clientId, "gsc", range, await gscPayload(sel.gsc, token, range));
      }
      results[clientId] = "ok";
    } catch (e) {
      console.error("sync failed for", clientId, e);
      results[clientId] = "error";
    }
  }
  return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
});

async function cache(db: any, clientId: string, kind: string, range: string, payload: unknown) {
  await db.from("analytics_cache").upsert(
    { client_id: clientId, kind, range, payload, fetched_at: new Date().toISOString() },
    { onConflict: "client_id,kind,range" },
  );
}

// ---------- GA4 (Data API v1beta) ----------
async function ga4Run(propertyId: string, token: string, body: unknown) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("GA4 " + await res.text());
  return await res.json();
}
function ga4Range(range: Range) { return [{ startDate: `${DAYS[range]}daysAgo`, endDate: "today" }]; }
function rows(r: any) { return r.rows ?? []; }
function dimVal(row: any, i = 0) { return row.dimensionValues?.[i]?.value ?? ""; }
function metVal(row: any, i = 0) { return Number(row.metricValues?.[i]?.value ?? 0); }

async function ga4Payload(propertyId: string, token: string, range: Range) {
  const dateRanges = ga4Range(range);
  const [overview, trend, sources, pages, devices, countries, events] = await Promise.all([
    ga4Run(propertyId, token, { dateRanges, metrics: ["activeUsers", "sessions", "newUsers", "screenPageViews", "conversions"].map((name) => ({ name })) }),
    ga4Run(propertyId, token, { dateRanges, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
    ga4Run(propertyId, token, { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], limit: 8, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    ga4Run(propertyId, token, { dateRanges, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], limit: 10, orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] }),
    ga4Run(propertyId, token, { dateRanges, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }] }),
    ga4Run(propertyId, token, { dateRanges, dimensions: [{ name: "country" }], metrics: [{ name: "sessions" }], limit: 10, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    ga4Run(propertyId, token, { dateRanges, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 12, orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] }),
  ]);
  const o = rows(overview)[0];
  return {
    overview: {
      users: o ? metVal(o, 0) : 0, sessions: o ? metVal(o, 1) : 0, newUsers: o ? metVal(o, 2) : 0,
      pageViews: o ? metVal(o, 3) : 0, conversions: o ? metVal(o, 4) : 0,
    },
    trend: rows(trend).map((r: any) => ({ date: dimVal(r), users: metVal(r, 0), sessions: metVal(r, 1) })),
    sources: rows(sources).map((r: any) => ({ label: dimVal(r), sessions: metVal(r) })),
    pages: rows(pages).map((r: any) => ({ path: dimVal(r), views: metVal(r) })),
    devices: rows(devices).map((r: any) => ({ label: dimVal(r), sessions: metVal(r) })),
    countries: rows(countries).map((r: any) => ({ label: dimVal(r), sessions: metVal(r) })),
    events: rows(events).map((r: any) => ({ name: dimVal(r), count: metVal(r) })),
  };
}

// ---------- Search Console (v3) ----------
function isoDaysAgo(n: number) { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); }
async function gscQuery(siteUrl: string, token: string, body: unknown) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("GSC " + await res.text());
  return await res.json();
}
async function gscPayload(siteUrl: string, token: string, range: Range) {
  const endDate = isoDaysAgo(2);           // GSC data lags ~2 days
  const startDate = isoDaysAgo(2 + DAYS[range]);
  const base = { startDate, endDate, rowLimit: 10 };
  const [totals, queries, pages, trend] = await Promise.all([
    gscQuery(siteUrl, token, { ...base, rowLimit: 1 }),
    gscQuery(siteUrl, token, { ...base, dimensions: ["query"] }),
    gscQuery(siteUrl, token, { ...base, dimensions: ["page"] }),
    gscQuery(siteUrl, token, { ...base, dimensions: ["date"], rowLimit: DAYS[range] }),
  ]);
  const t = totals.rows?.[0] ?? {};
  const map = (rws: any[]) => (rws ?? []).map((r) => ({
    key: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0, position: r.position ?? 0,
  }));
  return {
    totals: { clicks: t.clicks ?? 0, impressions: t.impressions ?? 0, ctr: t.ctr ?? 0, position: t.position ?? 0 },
    queries: map(queries.rows), pages: map(pages.rows), trend: map(trend.rows),
  };
}
