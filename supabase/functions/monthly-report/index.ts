// monthly-report — the Care plan's monthly email: was the site up, how fast it
// was, and (where Google Analytics / Search Console is connected) how many
// people visited and found it on Google. Clients on Care or Business Care only
// (Hosting doesn't include it), to report_emails or the client's email.
//
// Three ways in (deploy with verify_jwt = false):
//   • pg_cron on the 1st of the month, no credentials (0018). Safe to call by
//     anyone: it only sends to a client whose last report is 25+ days old.
//   • the admin panel, as a signed-in staff user: { clientId, dryRun? } to
//     preview (returns the HTML) or send one client's report now.
//   • x-report-secret: <REPORT_SECRET> for manual runs, same body.
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { preflight, json } from "../_shared/cors.ts";

const RANGE = "30d";          // the rolling 30-day analytics snapshot the sync stores
const MIN_GAP_DAYS = 25;      // scheduled runs never report a client twice in a month
const PLANS = ["care", "business"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const body = await req.json().catch(() => ({}));
  const secret = Deno.env.get("REPORT_SECRET");
  const bySecret = Boolean(secret) && req.headers.get("x-report-secret") === secret;
  const caller = !bySecret && req.headers.get("Authorization") ? await getCaller(req).catch(() => null) : null;
  const manual = bySecret || Boolean(caller?.isStaff);
  const onlyClient: string | undefined = manual && typeof body?.clientId === "string" ? body.clientId : undefined;
  const dryRun = manual && Boolean(body?.dryRun);

  const db = serviceClient();
  let q = db.from("clients").select("id, name, site_label, email, report_emails, care_active, care_plan, last_report_at");
  q = onlyClient ? q.eq("id", onlyClient) : q.eq("care_active", true).in("care_plan", PLANS);
  const { data: clients, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const out: Array<Record<string, unknown>> = [];
  for (const c of clients ?? []) {
    if (!manual && c.last_report_at && Date.now() - Date.parse(c.last_report_at) < MIN_GAP_DAYS * 86400e3) { out.push({ client: c.id, status: "skipped:sent-recently" }); continue; }
    const to: string[] = (Array.isArray(c.report_emails) && c.report_emails.filter(Boolean).length ? c.report_emails.filter(Boolean) : [c.email]).filter(Boolean);

    const [{ data: cache }, { data: mons }] = await Promise.all([
      db.from("analytics_cache").select("kind, payload").eq("client_id", c.id).eq("range", RANGE),
      db.from("monitors").select("url").eq("client_id", c.id),
    ]);
    const ga4 = cache?.find((r) => r.kind === "ga4")?.payload as Ga4 | undefined;
    const gsc = cache?.find((r) => r.kind === "gsc")?.payload as Gsc | undefined;
    const urls = (mons ?? []).map((m: { url: string }) => m.url);
    const up = urls.length ? uptimeOf((await db.from("site_checks").select("ok, ms, checked_at").in("url", urls).gte("checked_at", since).order("checked_at").limit(20000)).data ?? []) : null;

    if (!ga4 && !gsc && !up) { out.push({ client: c.id, status: "skipped:no-data" }); continue; }
    const label = String(c.site_label || c.name || "your website");
    const subject = `${label}: your monthly website report (${monthLabel()})`;
    const html = renderHtml(label, up, ga4, gsc);
    if (dryRun) { out.push({ client: c.id, status: "preview", to, subject, html }); continue; }
    if (!to.length) { out.push({ client: c.id, status: "skipped:no-recipients" }); continue; }

    const sent = await sendEmail(to, subject, html);
    if (sent) await db.from("clients").update({ last_report_at: new Date().toISOString() }).eq("id", c.id);
    out.push({ client: c.id, status: sent ? "sent" : "send-failed", to });
  }

  return json({ ok: true, range: RANGE, count: out.length, results: out });
});

// ---------- uptime from the site monitor ----------
type Up = { checks: number; uptime: number; avgMs: number | null; outages: number };
function uptimeOf(rows: Array<{ ok: boolean; ms: number | null }>): Up | null {
  if (!rows.length) return null;
  const ok = rows.filter((r) => r.ok);
  const ms = ok.map((r) => r.ms).filter((m): m is number => typeof m === "number");
  // an outage = two or more failed checks in a row (the monitor's own rule)
  let outages = 0, run = 0;
  for (const r of rows) { if (r.ok) { if (run >= 2) outages++; run = 0; } else run++; }
  if (run >= 2) outages++;
  return { checks: rows.length, uptime: ok.length / rows.length, avgMs: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null, outages };
}

// ---------- email ----------
async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REPORT_FROM") ?? Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>";
  if (!apiKey) { console.error("monthly-report: RESEND_API_KEY not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(Deno.env.get("NOTIFY_EMAIL") ? { reply_to: Deno.env.get("NOTIFY_EMAIL") } : {}) }),
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

function renderHtml(label: string, up: Up | null, ga4?: Ga4, gsc?: Gsc): string {
  const o = ga4?.overview ?? {};
  const t = gsc?.totals ?? {};
  const tiles: string[] = [];
  let summary = "How your site did over the last 30 days.";
  if (up) {
    const pct = up.uptime >= 0.9995 ? "100%" : (Math.floor(up.uptime * 1000) / 10).toFixed(1) + "%";
    const secs = up.avgMs != null ? (up.avgMs / 1000).toFixed(1) + " s" : "—";
    tiles.push(tile("Online", pct));
    tiles.push(tile("Average load time", secs));
    tiles.push(tile("Outages", up.outages ? String(up.outages) : "None"));
    summary = `Your site was online ${pct === "100%" ? "the whole time" : pct + " of the time"}${up.avgMs != null ? ` and loaded in ${secs} on average` : ""}. We check it every 10 minutes${up.outages ? `; we were alerted to ${up.outages === 1 ? "one outage" : up.outages + " outages"} and looked into ${up.outages === 1 ? "it" : "them"} straight away` : ""}.`;
  }
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
        <p style="font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#54607a;margin:0 0 14px">${esc(summary)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${tileRows.join("")}</table>
        ${topPages}${topSources}${topQueries}
        <p style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#8a93a6;margin:22px 0 0">Included with your Care plan. Need a change to your site, like new prices, photos or hours? Just reply to this email.</p>
      </td></tr>
      <tr><td style="padding:14px 12px;font:400 12px Arial,Helvetica,sans-serif;color:#8a93a6">Re-Charge · Independent digital studio, South Africa</td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

