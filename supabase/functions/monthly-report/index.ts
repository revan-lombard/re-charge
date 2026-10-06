// monthly-report — the Care plan's monthly email, and the reason the plan gets
// renewed. It leads with what their AI assistant actually handled (assistant_usage,
// 0025) measured against the number we wrote down before we started
// (projects.details.baseline), then the website: was it up, how fast it was, and
// (where Google Analytics / Search Console is connected) how many people visited
// and found it on Google.
//
// The order matters. A client who can't see what they're paying for cancels at
// month three, and "your site was up" has never convinced anyone on its own.
//
// Clients on Care or Business Care only (Hosting doesn't include it), to
// report_emails or the client's email.
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
const PLANS = ["care", "operate", "optimise", "ai_partner", "business", "partner"];   // Hosting does not include the report; everything above it does.

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
  const sinceDay = since.slice(0, 10);          // assistant_usage is kept per day, not per second
  const out: Array<Record<string, unknown>> = [];
  for (const c of clients ?? []) {
    if (!manual && c.last_report_at && Date.now() - Date.parse(c.last_report_at) < MIN_GAP_DAYS * 86400e3) { out.push({ client: c.id, status: "skipped:sent-recently" }); continue; }
    const to: string[] = (Array.isArray(c.report_emails) && c.report_emails.filter(Boolean).length ? c.report_emails.filter(Boolean) : [c.email]).filter(Boolean);

    const [{ data: cache }, { data: mons }, { data: bots }, { data: projs }] = await Promise.all([
      db.from("analytics_cache").select("kind, payload").eq("client_id", c.id).eq("range", RANGE),
      db.from("monitors").select("url").eq("client_id", c.id),
      db.from("assistant_demos").select("slug").eq("client_id", c.id).eq("kind", "live"),
      db.from("projects").select("details, updated_at").eq("client_id", c.id).order("updated_at", { ascending: false }).limit(20),
    ]);
    const ga4 = cache?.find((r) => r.kind === "ga4")?.payload as Ga4 | undefined;
    const gsc = cache?.find((r) => r.kind === "gsc")?.payload as Gsc | undefined;
    const urls = (mons ?? []).map((m: { url: string }) => m.url);
    const up = urls.length ? uptimeOf((await db.from("site_checks").select("ok, ms, checked_at").in("url", urls).gte("checked_at", since).order("checked_at").limit(20000)).data ?? []) : null;

    // What their assistant handled this month, and what we promised to improve.
    const slugs = (bots ?? []).map((b: { slug: string }) => b.slug).filter(Boolean);
    const ai = slugs.length ? sumUsage((await db.from("assistant_usage").select("convos, questions, after_hours").in("scope", slugs).gte("day", sinceDay)).data ?? []) : null;
    const baseline = pickBaseline(projs ?? []);

    if (!ga4 && !gsc && !up && !ai && !baseline?.after) { out.push({ client: c.id, status: "skipped:no-data" }); continue; }
    const label = String(c.site_label || c.name || "your website");
    const subject = baseline?.after
      ? `${label}: what we improved, ${monthLabel()}`
      : ai
      ? `${label}: what your assistant did in ${monthLabel()}`
      : `${label}: your monthly website report (${monthLabel()})`;
    const html = renderHtml(label, up, ga4, gsc, ai, baseline);
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

// ---------- the AI assistant, and the number we promised to improve ----------
type Ai = { convos: number; questions: number; afterHours: number };
type After = { value: number; how?: string; note?: string; at?: string };
type Baseline = { metric: string; value: number; unit: string; how?: string; note?: string; at?: string; volume?: number; hourly?: number; after?: After };

export function sumUsage(rows: Array<{ convos: number; questions: number; after_hours: number }>): Ai {
  return {
    convos: rows.reduce((a, r) => a + (Number(r.convos) || 0), 0),
    questions: rows.reduce((a, r) => a + (Number(r.questions) || 0), 0),
    afterHours: rows.reduce((a, r) => a + (Number(r.after_hours) || 0), 0),
  };
}

// The most recently touched job that has a baseline on it. A client can have several
// projects; the number we're reporting against is the one from the work we're doing.
export function pickBaseline(rows: Array<{ details?: { baseline?: Baseline; after?: After } }>): Baseline | null {
  for (const r of rows) {
    const b = r?.details?.baseline, a = r?.details?.after;
    if (b && b.metric && Number.isFinite(Number(b.value))) {
      const after = a && Number.isFinite(Number(a.value)) ? { ...a, value: Number(a.value) } : undefined;
      return { ...b, value: Number(b.value), ...(after ? { after } : {}) };
    }
  }
  return null;
}

// METHOD.md §4, the same sums as the panel's roiOf(). "Minutes to …" metrics are per
// item (times the volume); "Hours …" metrics are time already; Rands need an hourly cost.
const PER_MONTH: Record<string, number> = { "a day": 21.7, "a week": 4.33, "a month": 1 };
const kindOf = (m: string) => (/^minutes\b/i.test(m) ? "minutes" : /^hours\b/i.test(m) ? "hours" : "count");
export function roiOf(b: Baseline): { before: number; after: number; pct: number | null; hours: number | null; rands: number | null } | null {
  if (!b.after) return null;
  const before = b.value, after = b.after.value, change = before - after, per = PER_MONTH[b.unit] ?? 4.33, kind = kindOf(b.metric);
  const hours = kind === "minutes" && Number(b.volume) ? (change * Number(b.volume) * per) / 60 : kind === "hours" ? change * per : null;
  const rands = hours != null && Number(b.hourly) ? hours * Number(b.hourly) : null;
  return { before, after, pct: before ? Math.round((change / before) * 100) : null, hours, rands };
}
export function roiSentence(b: Baseline): string {
  const r = roiOf(b);
  if (!r) return "";
  const mins = kindOf(b.metric) === "minutes";
  const now = mins ? `it now takes about ${r.after} minutes` : `it's now about ${r.after} ${b.unit}`;
  const pct = r.pct != null && r.pct !== 0 ? ` (${Math.abs(r.pct)}% ${r.pct > 0 ? "less" : "more"})` : "";
  const hrs = r.hours != null && r.hours > 0 ? ` That's about ${Math.round(r.hours)} hours a month back${r.rands != null ? `, roughly R${Math.round(r.rands).toLocaleString("en-ZA").replace(/\s/g, ",")} of staff time` : ""}.` : "";
  return `Measured the same way, ${now}${pct}.${hrs}`;
}

// Say where the number came from, every time. A figure the owner gave us off the top
// of their head is worth reporting against — as long as we never dress it up as
// something we measured.
export function baselineSentence(b: Baseline): string {
  const src = b.how === "We counted it" ? "we counted" : b.how === "From their reviews or page" ? "we found, from your reviews and your page," : "you told us";
  const per = b.unit || "a week";
  if (kindOf(b.metric) === "minutes") return `When we started, ${src} it took about ${b.value} minutes ${b.metric.replace(/^minutes\s*/i, "")}${b.volume ? `, about ${b.volume} of them ${per}` : ""}.`;
  const monthly = per === "a day" ? b.value * 30 : per === "a week" ? b.value * 4.3 : null;
  const rounded = monthly != null ? Math.round(monthly / (monthly >= 20 ? 5 : 1)) * (monthly >= 20 ? 5 : 1) : null;
  return `When we started, ${src} ${b.metric.toLowerCase()} came to about ${b.value} ${per}${rounded ? ` — somewhere near ${rounded} in a month like this one` : ""}.`;
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

// `width` is for a fixed-layout table (the assistant's row): without it three tiles
// have a minimum width of their own and push an email off the side of a phone.
function tile(label: string, value: string, width?: string): string {
  return `<td${width ? ` width="${width}"` : ""} style="padding:8px 6px;vertical-align:top">
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

export function renderHtml(label: string, up: Up | null, ga4?: Ga4, gsc?: Gsc, ai?: Ai | null, baseline?: Baseline | null): string {
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

  // The assistant leads, because it's the part they're least able to see for themselves.
  let aiBlock = "";
  if (ai) {
    const aiTiles = [
      tile("Chats", fmt(ai.convos), "33.33%"),            // "Conversations" is one long word: it can't wrap, so it breaks the row on a phone
      tile("Questions", fmt(ai.questions), "33.33%"),
      tile("After hours", fmt(ai.afterHours), "33.33%"),
    ].join("");
    const share = ai.questions ? Math.round((ai.afterHours / ai.questions) * 100) : 0;
    const body = ai.questions === 0
      ? `Nobody asked your assistant anything this month. That nearly always means people can't find it rather than that they didn't need it — reply to this email and I'll help you put it in front of them.`
      : `Your assistant answered ${fmt(ai.questions)} question${ai.questions === 1 ? "" : "s"} across ${fmt(ai.convos)} conversation${ai.convos === 1 ? "" : "s"}${ai.afterHours ? `, and ${fmt(ai.afterHours)} of them (${share}%) came in before 8am, after 5pm or over a weekend — when there was nobody at the phone` : ""}.`;
    aiBlock = `<div style="border:1px solid #d9e4f7;background:#f3f7ff;border-radius:12px;padding:16px;margin:0 0 18px">
      <div style="font:600 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#2f6fe0">Your AI assistant</div>
      <p style="font:400 14px/1.55 Arial,Helvetica,sans-serif;color:#0a0d13;margin:6px 0 10px">${esc(body)}</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed"><tr>${aiTiles}</tr></table>
      ${baseline && !baseline.after ? `<p style="font:400 13px/1.55 Arial,Helvetica,sans-serif;color:#54607a;margin:10px 0 0">${esc(baselineSentence(baseline))}${baseline.note ? ` <span style="color:#8a93a6">(${esc(baseline.note)})</span>` : ""}</p>` : ""}
      ${ai.questions ? `<p style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#8a93a6;margin:10px 0 0">Did it get something wrong, or have your prices or hours changed? Reply to this email and I'll update what it knows — that's part of your plan.</p>` : ""}
    </div>`;
  }

  const topPages = list("Most-visited pages", (ga4?.pages ?? []).slice(0, 5).map((p) => ({ k: p.path, v: fmt(p.views) + " views" })));
  const topSources = list("Where visitors came from", (ga4?.sources ?? []).slice(0, 5).map((s) => ({ k: s.label, v: fmt(s.sessions) })));
  const topQueries = list("Top Google searches", (gsc?.queries ?? []).slice(0, 5).map((q) => ({ k: q.key, v: fmt(q.clicks) + " clicks" })));

  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;padding:24px 0">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%">
      <tr><td style="padding:0 12px 14px">
        <div style="font:700 18px Arial,Helvetica,sans-serif;color:#0a0d13">RE-CHARGE</div>
        <div style="font:400 13px Arial,Helvetica,sans-serif;color:#7a8699">Monthly report · ${esc(monthLabel())} · last 30 days</div>
      </td></tr>
      <tr><td style="background:#fff;border:1px solid #e5e8ee;border-radius:14px;padding:20px">
        <h1 style="font:700 20px Arial,Helvetica,sans-serif;color:#0a0d13;margin:0 0 2px">${esc(label)}</h1>
        ${baseline?.after ? `<div style="border:1px solid #cdeedd;background:#effaf4;border-radius:12px;padding:16px;margin:0 0 18px">
          <div style="font:600 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#1a8a55">What we improved</div>
          <p style="font:700 22px/1.25 Arial,Helvetica,sans-serif;color:#0a0d13;margin:6px 0 4px">${esc(String(baseline.value))} → ${esc(String(baseline.after.value))}${kindOf(baseline.metric) === "minutes" ? " minutes" : ""}</p>
          <p style="font:400 14px/1.55 Arial,Helvetica,sans-serif;color:#0a0d13;margin:0">${esc(baselineSentence(baseline))} ${esc(roiSentence(baseline))}</p>
        </div>` : ""}
        ${aiBlock}
        ${tiles.length ? `<p style="font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#54607a;margin:0 0 14px">${esc(summary)}</p>` : ""}
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${tileRows.join("")}</table>
        ${topPages}${topSources}${topQueries}
        <p style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#8a93a6;margin:22px 0 0">Included with your plan. Need a change — new prices, hours, a step in the process, or something your system should know? Just reply to this email.</p>
      </td></tr>
      <tr><td style="padding:14px 12px;font:400 12px Arial,Helvetica,sans-serif;color:#8a93a6">Re-Charge · Independent digital studio, South Africa</td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

