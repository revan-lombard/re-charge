// weekly-wins — a short email to clients on a monthly plan, so the value of the
// AI is visible every week, not just on the 1st:
//
//   • first-week: once, 7 to 13 days after a job went live (projects.details.liveAt).
//   • weekly: on Mondays (South African time), what their assistant handled in the
//     last 7 days, and the hours saved when we've measured a before-and-after.
//
// Only real numbers (see _shared/wins.ts); a client with nothing to report gets no
// email. Same recipients and plans as monthly-report. A client can be switched off
// in the panel; what was sent and when is kept in settings under wins:<client id>.
//
// Runs daily from pg_cron (no credentials, safe to call: the dates stop repeats).
// Staff from the panel: { clientId, kind: "weekly" | "first-week", dryRun? }.
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { preflight, json } from "../_shared/cors.ts";
import { loadProfile, wrapHtml } from "../_shared/mail.ts";
import { sumUsage, pickBaseline } from "../_shared/impact.ts";
import { composeWins } from "../_shared/wins.ts";

const PLANS = ["care", "inbox", "operate", "optimise", "ai_partner", "business", "partner"];
const DAY = 86400e3;
type State = { off?: boolean; weeklyAt?: string; firstWeekAt?: string };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.json().catch(() => ({}));
  const caller = req.headers.get("Authorization") ? await getCaller(req).catch(() => null) : null;
  const manual = Boolean(caller?.isStaff);
  const onlyClient: string | undefined = manual && typeof body?.clientId === "string" ? body.clientId : undefined;
  const forceKind: string | undefined = manual && ["weekly", "first-week"].includes(body?.kind) ? body.kind : undefined;
  const dryRun = manual && Boolean(body?.dryRun);

  const db = serviceClient();
  let q = db.from("clients").select("id, name, email, report_emails, care_active, care_plan");
  q = onlyClient ? q.eq("id", onlyClient) : q.eq("care_active", true).in("care_plan", PLANS);
  const { data: clients, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const sast = new Date(Date.now() + 2 * 3600e3);
  const monday = sast.getUTCDay() === 1;
  const prof = await loadProfile(db, Deno.env.get("NOTIFY_EMAIL") ?? "");
  const out: Array<Record<string, unknown>> = [];

  for (const c of clients ?? []) {
    const key = `wins:${c.id}`;
    const st = ((await db.from("settings").select("value").eq("key", key).maybeSingle()).data?.value ?? {}) as State;
    if (st.off && !manual) { out.push({ client: c.id, status: "skipped:off" }); continue; }

    const [{ data: bots }, { data: projs }] = await Promise.all([
      db.from("assistant_demos").select("slug").eq("client_id", c.id).eq("kind", "live"),
      db.from("projects").select("name, details, updated_at").eq("client_id", c.id).order("updated_at", { ascending: false }).limit(20),
    ]);
    const liveAt = Math.max(0, ...(projs ?? []).map((p: { details?: { liveAt?: string } }) => Date.parse(p.details?.liveAt ?? "") || 0));
    const sinceLive = liveAt ? (Date.now() - liveAt) / DAY : null;

    let kind: "weekly" | "first-week" | null = (forceKind as "weekly" | "first-week") ?? null;
    if (!kind && sinceLive != null && sinceLive >= 7 && sinceLive < 14 && !st.firstWeekAt) kind = "first-week";
    if (!kind && monday && (!st.weeklyAt || Date.now() - Date.parse(st.weeklyAt) > 6 * DAY) && (sinceLive == null || sinceLive >= 14)) kind = "weekly";
    if (!kind) { out.push({ client: c.id, status: "skipped:not-due" }); continue; }

    const days = kind === "first-week" && liveAt ? Math.min(13, Math.max(7, Math.round(sinceLive!))) : 7;
    const fromDay = new Date((kind === "first-week" && liveAt ? liveAt : Date.now() - 7 * DAY) + 2 * 3600e3).toISOString().slice(0, 10);
    const slugs = (bots ?? []).map((b: { slug: string }) => b.slug).filter(Boolean);
    const ai = slugs.length ? sumUsage((await db.from("assistant_usage").select("convos, questions, after_hours").in("scope", slugs).gte("day", fromDay)).data ?? []) : null;
    const baseline = pickBaseline(projs ?? []);
    const first = String(projs?.[0]?.name ?? "").trim().split(/\s+/)[0] || "there";
    const mail = composeWins({ kind, business: c.name, first, ai, baseline, days });
    if (!mail) { out.push({ client: c.id, kind, status: "skipped:no-data" }); continue; }

    const to: string[] = (Array.isArray(c.report_emails) && c.report_emails.filter(Boolean).length ? c.report_emails.filter(Boolean) : [c.email]).filter(Boolean);
    const sign = prof.sig.text || prof.myName || "Re-Charge";
    const text = `${mail.text}\n\nThanks,\n\n${sign}`;
    if (dryRun) { out.push({ client: c.id, kind, status: "preview", to, subject: mail.subject, text }); continue; }
    if (!to.length) { out.push({ client: c.id, kind, status: "skipped:no-recipients" }); continue; }

    const sent = await sendEmail(to, mail.subject, text, wrapHtml(text, prof.sig), prof.replyTo);
    if (sent) await db.from("settings").upsert({ key, value: { ...st, [kind === "weekly" ? "weeklyAt" : "firstWeekAt"]: new Date().toISOString() }, updated_at: new Date().toISOString() });
    await db.from("messages").insert({ project_id: null, kind: "email", to_address: to.join(", "), subject: mail.subject, body: text, status: sent ? "sent" : "failed", meta: { auto: "weekly-wins", kind, client_id: c.id } });
    out.push({ client: c.id, kind, status: sent ? "sent" : "send-failed", to });
  }
  return json({ ok: true, count: out.length, results: out });
});

async function sendEmail(to: string[], subject: string, text: string, html: string, replyTo: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("weekly-wins: RESEND_API_KEY not set"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTIFY_FROM") ?? "Re-Charge <onboarding@resend.dev>", to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  }).catch((e) => { console.error("weekly-wins email failed:", e); return null; });
  return Boolean(res?.ok);
}
