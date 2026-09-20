// monthly-report — emails each client on an active hosting/care plan a plain
// summary of how their website performed over the last 30 days, from the
// cached GA4 + Search Console data (analytics_cache). Meant to run on a
// schedule (Supabase cron, monthly) and can be triggered manually. Guarded by
// REPORT_SECRET. Deploy with verify_jwt = false. Untested — deploy and verify.
//
// Manual test (single client, no email sent):
//   curl -X POST "$FN/monthly-report" -H "x-report-secret: <REPORT_SECRET>" \
//        -H "content-type: application/json" -d '{"clientId":"<uuid>","dryRun":true}'
import { serviceClient } from "../_shared/db.ts";

const RANGE = "30d"; // "last month" ≈ the rolling 30-day snapshot the sync stores

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("REPORT_SECRET");
  if (!secret || req.headers.get("x-report-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const onlyClient: string | undefined = body?.clientId;
  const dryRun = Boolean(body?.dryRun);

  const db = serviceClient();
  let q = db.from("clients").select("id, name, site_label, report_emails, care_active");
  q = onlyClient ? q.eq("id", onlyClient) : q.eq("care_active", true);
  const { data: clients, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const out: Array<Record<string, unknown>> = [];
  for (const c of clients ?? []) {
    const to: string[] = Array.isArray(c.report_emails) ? c.report_emails.filter(Boolean) : [];
    const { data: cache } = await db
      .from("analytics_cache")
      .select("kind, payload, fetched_at")
      .eq("client_id", c.id)
      .eq("range", RANGE);
    const ga4 = cache?.find((r) => r.kind === "ga4")?.payload as Ga4 | undefined;
    const gsc = cache?.find((r) => r.kind === "gsc")?.payload as Gsc | undefined;

    if (!ga4 && !gsc) { out.push({ client: c.id, status: "skipped:no-data" }); continue; }
    if (!to.length)   { out.push({ client: c.id, status: "skipped:no-recipients" }); continue; }

    const label = String(c.site_label || c.name || "your website");
    const subject = `${label} — your monthly report (${monthLabel()})`;
    const html = renderHtml(label, ga4, gsc);

    if (dryRun) { out.push({ client: c.id, status: "dry-run", to, subject }); continue; }

    const sent = await sendEmail(to, subject, html);
    out.push({ client: c.id, status: sent ? "sent" : "send-failed", to });
  }

  return json({ ok: true, range: RANGE, count: out.length, results: out });
});

// ---------- email ----------
async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REPORT_FROM") ?? Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>";
  if (!apiKey) { console.error("monthly-report: RESEND_API_KEY not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) { console.error("Resend error:", await res.text()); return false; }
    return true;
  } catch (e) {
    console.error("sendEmail failed:", e);
    return false;
  }
}

// ---------- rendering ----------
type Ga4 = {
  overview?: { users?: number; sessions?: number; newUsers?: number; pageViews?: number; conversions?: number };
  sources?: Array<{ label: string; sessions: number }>;
  pages?: Array<{ path: string; views: number }>;
  events?: Array<{ name: string; count: number }>;
};
type Gsc = {
  totals?: { clicks?: number; impressions?: number; ctr?: number; position?: number };
  queries?: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>;
};

const fmt = (n: unknown) => Number(n || 0).toLocaleString("en-ZA");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function monthLabel(): string {
  return new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function tile(label: string, value: string): string {
  return `<td style="padding:8px 6px;vertical-align:top">
    <div style="border:1px solid #e5e8ee;border-radius:10px;padding:12px 14px;background:#fff">
      <div style="font:600 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#7a8699">${esc(label)}</div>
      <div style="font:700 22px/1.2 Arial,Helvetica,sans-serif;color:#0a0d13;margin-top:4px">${esc(value)}</div>
    </div></td>`;
}

function list(title: string, items: Array<{ k: string; v: string }>): string {
  if (!items.length) return "";
  const rows = items.map((i) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eef1f5;font:400 14px Arial,Helvetica,sans-serif;color:#0a0d13">${esc(i.k)}</td>
     <td style="padding:6px 0;border-bottom:1px solid #eef1f5;font:600 14px Arial,Helvetica,sans-serif;color:#2f6fe0;text-align:right;white-space:nowrap">${esc(i.v)}</td></tr>`).join("");
  return `<h3 style="font:600 15px Arial,Helvetica,sans-serif;color:#0a0d13;margin:22px 0 6px">${esc(title)}</h3>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`;
}

function renderHtml(label: string, ga4?: Ga4, gsc?: Gsc): string {
  const o = ga4?.overview ?? {};
  const t = gsc?.totals ?? {};
  const tiles: string[] = [];
  if (ga4) {
    tiles.push(tile("Visitors", fmt(o.users)));
    tiles.push(tile("Sessions", fmt(o.sessions)));
    tiles.push(tile("Page views", fmt(o.pageViews)));
    if (o.conversions) tiles.push(tile("Conversions", fmt(o.conversions)));
  }
  if (gsc) {
    tiles.push(tile("Google clicks", fmt(t.clicks)));
    tiles.push(tile("Search impressions", fmt(t.impressions)));
  }
  // chunk tiles into rows of 3 for email-client layout
  const tileRows: string[] = [];
  for (let i = 0; i < tiles.length; i += 3) {
    tileRows.push(`<tr>${tiles.slice(i, i + 3).join("")}</tr>`);
  }

  const topPages = list("Most-visited pages", (ga4?.pages ?? []).slice(0, 5).map((p) => ({ k: p.path, v: fmt(p.views) + " views" })));
  const topSources = list("Where visitors came from", (ga4?.sources ?? []).slice(0, 5).map((s) => ({ k: s.label, v: fmt(s.sessions) })));
  const topQueries = list("Top Google searches", (gsc?.queries ?? []).slice(0, 5).map((q) => ({ k: q.key, v: fmt(q.clicks) + " clicks" })));

  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;padding:24px 0">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%">
      <tr><td style="padding:0 12px 14px">
        <div style="font:700 18px Arial,Helvetica,sans-serif;color:#0a0d13">RE-CHARGE</div>
        <div style="font:400 13px Arial,Helvetica,sans-serif;color:#7a8699">Monthly report · ${esc(monthLabel())}</div>
      </td></tr>
      <tr><td style="background:#fff;border:1px solid #e5e8ee;border-radius:14px;padding:20px">
        <h1 style="font:700 20px Arial,Helvetica,sans-serif;color:#0a0d13;margin:0 0 2px">${esc(label)}</h1>
        <p style="font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#54607a;margin:0 0 14px">How your site performed over the last 30 days.</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${tileRows.join("")}</table>
        ${topPages}${topSources}${topQueries}
        <p style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#8a93a6;margin:22px 0 0">Included with your Hosting &amp; Care plan. Reply to this email any time to chat about the numbers or what to improve next.</p>
      </td></tr>
      <tr><td style="padding:14px 12px;font:400 12px Arial,Helvetica,sans-serif;color:#8a93a6">Re-Charge · Independent digital studio, South Africa</td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
