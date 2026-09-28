// site-monitor — checks every live client site (clients.site_label) and
// re-charge.co.za: does it load, how fast, is HTTPS valid. Runs every 10
// minutes from pg_cron (migration 0015). Public, but throttled to one run per
// 4 minutes, so calling it can't be used to hammer anyone; staff can force a
// check from the panel ("Check now"). State lives in `monitors`, history in
// `site_checks` (kept 30 days). Emails NOTIFY_EMAIL when a site goes down
// (two failed checks in a row) and when it comes back.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient, notifyEmail } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";

const OWN = [{ url: "https://re-charge.co.za/", label: "re-charge.co.za (our website)", client_id: null as string | null }];
const TIMEOUT_MS = 20000, SLOW_MS = 6000, MIN_GAP_MS = 4 * 60 * 1000;

type Target = { url: string; label: string; client_id: string | null };
type Result = { url: string; ok: boolean; http: number | null; ms: number; error: string | null };

async function check(t: Target): Promise<Result> {
  const started = Date.now();
  try {
    const res = await fetch(t.url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "Re-Charge uptime monitor (+https://re-charge.co.za)" } });
    const text = await res.text();                       // read the page so a hung body counts as slow
    const ms = Date.now() - started;
    if (res.status >= 400) return { url: t.url, ok: false, http: res.status, ms, error: `The site answered with error ${res.status}` };
    if (text.trim().length < 200) return { url: t.url, ok: false, http: res.status, ms, error: "The page came back almost empty" };
    return { url: t.url, ok: true, http: res.status, ms, error: null };
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string } };
    const ms = Date.now() - started, msg = [err?.cause?.code, err?.cause?.message, err?.message].filter(Boolean).join(" ") || String(e);
    const error = /timed? ?out|abort/i.test(msg) ? `No answer within ${TIMEOUT_MS / 1000} seconds`
      : /certificate|ssl|tls/i.test(msg) ? "HTTPS certificate problem (browsers will show a security warning)"
      : /dns|lookup|resolve|name not known/i.test(msg) ? "The domain doesn't point anywhere (DNS problem, or the domain expired)"
      : /refused|reset|unreachable/i.test(msg) ? "The server refused the connection"
      : "Couldn't connect: " + msg.slice(0, 120);
    return { url: t.url, ok: false, http: null, ms, error };
  }
}

const mins = (a: string, b = new Date().toISOString()) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
const dur = (m: number) => m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} day${m >= 2880 ? "s" : ""}`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const db = serviceClient();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron sends {}; GET has none */ }
  const force = body.force === true && Boolean((await getCaller(req))?.isStaff);

  // throttle (one run per few minutes unless staff forces it)
  const { data: last } = await db.from("settings").select("value").eq("key", "monitor_run").maybeSingle();
  const lastAt = (last?.value as { at?: string } | null)?.at;
  if (!force && lastAt && Date.now() - Date.parse(lastAt) < MIN_GAP_MS) return json({ ok: true, skipped: "ran recently" });
  await db.from("settings").upsert({ key: "monitor_run", value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });

  const { data: clients } = await db.from("clients").select("id, name, site_label, monitor").not("site_label", "is", null);
  const targets: Target[] = [...OWN];
  for (const c of clients ?? []) {
    const host = String(c.site_label || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host || c.monitor === false || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) continue;
    targets.push({ url: `https://${host}/`, label: `${host} (${c.name})`, client_id: c.id });
  }

  const results = await Promise.all(targets.map(check));
  await db.from("site_checks").insert(results.map((r) => ({ url: r.url, ok: r.ok, http: r.http, ms: r.ms, error: r.error })));

  const { data: states } = await db.from("monitors").select("*").in("url", targets.map((t) => t.url));
  const byUrl = new Map((states ?? []).map((s: Record<string, unknown>) => [s.url as string, s]));
  const now = new Date().toISOString();
  const downs: string[] = [], ups: string[] = [];
  for (const [i, t] of targets.entries()) {
    const r = results[i];
    const s = (byUrl.get(t.url) ?? { status: "unknown", since: now, fail_count: 0, alerted_down: false }) as Record<string, unknown>;
    let status = s.status as string, since = s.since as string, alerted = Boolean(s.alerted_down);
    const fails = r.ok ? 0 : Number(s.fail_count || 0) + 1;
    if (r.ok) {
      const next = r.ms > SLOW_MS ? "slow" : "up";
      if (status === "down" && alerted) ups.push(`${t.label} is back up (it was down for ${dur(mins(since))}).`);
      if (next !== status) { status = next; since = now; }
      alerted = false;
    } else if (fails >= 2 && status !== "down") {
      // down since the first failed check, roughly one interval ago
      status = "down"; since = new Date(Date.now() - 10 * 60000).toISOString();
      downs.push(`${t.label} is DOWN: ${r.error}.\nOpen it: ${t.url}`);
      alerted = true;
    }
    await db.from("monitors").upsert({ url: t.url, label: t.label, client_id: t.client_id, status, since, fail_count: fails, last_checked: now, last_ms: r.ms, last_http: r.http, last_error: r.error, alerted_down: alerted });
  }
  // sites no longer monitored (client removed / unticked) drop off the list
  const keep = targets.map((t) => t.url);
  await db.from("monitors").delete().not("url", "in", `(${keep.map((u) => `"${u}"`).join(",")})`);
  // keep 30 days of history
  if (Math.random() < 0.05) await db.from("site_checks").delete().lt("checked_at", new Date(Date.now() - 30 * 86400e3).toISOString());

  if (downs.length) await notifyEmail(`⚠ Site down: ${downs.length === 1 ? targets.find((t) => downs[0].startsWith(t.label))?.label ?? "" : downs.length + " sites"}`, downs.join("\n\n") + "\n\nThe panel shows details under Clients. You'll get another email when it's back.");
  if (ups.length) await notifyEmail(`✓ Back up: ${ups.length === 1 ? ups[0].split(" is back")[0] : ups.length + " sites"}`, ups.join("\n"));

  return json({ ok: true, checked: results.length, down: results.filter((r) => !r.ok).length, results: force ? results : undefined });
});
