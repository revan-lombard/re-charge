// ai-hub — the admin panel's door to the home AI hub (ADMIN.md 8cq). Staff only.
// POST { action: "status" } → is the hub set up and answering, which model, jobs today by engine
// POST { action: "sort", text, source? } → the message sorted, plus leads it might belong to
// POST { action: "resort", projectId } → sort (or re-sort) one lead's enquiry and save it on the lead
// POST { action: "draft", projectId, channel: "email"|"whatsapp", message?, best? } → a reply to check and send
import { preflight, json } from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/db.ts";
import { hubConfigured, claudeConfigured, hubUrl, hubHeaders } from "../_shared/ai.ts";
import { sortMessage } from "../_shared/sort.ts";
import { sortProject } from "../_shared/sort_project.ts";
import { draftLeadReply } from "../_shared/draft_lead.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();

  if (body.action === "status") {
    let online = false, models: string[] = [], hubError = "";
    if (hubConfigured()) {
      try {
        const r = await fetch(hubUrl("/v1/models"), { headers: hubHeaders(), signal: AbortSignal.timeout(6000) });
        if (!r.ok) throw new Error(`answered ${r.status}`);
        const j = await r.json(); online = true; models = (j.data || []).map((m: { id: string }) => m.id).slice(0, 8);
      } catch (e) { hubError = (e as Error).message; }
    }
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data: jobs } = await db.from("ai_jobs").select("engine, ok, ms").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(5000);
    const { data: today } = await db.from("ai_jobs").select("engine, ok").gte("created_at", since.toISOString()).limit(5000);
    const count = (rows: { engine: string; ok: boolean }[] | null, e: string) => (rows || []).filter((x) => x.ok && x.engine === e).length;
    const localMs = (jobs || []).filter((x) => x.ok && x.engine === "local").map((x) => x.ms || 0);
    return json({ ok: true, hub: { configured: hubConfigured(), online, models, error: hubError }, claude: claudeConfigured(),
      today: { local: count(today, "local"), claude: count(today, "claude") }, week: { local: count(jobs, "local"), claude: count(jobs, "claude") },
      avg_local_ms: localMs.length ? Math.round(localMs.reduce((a, b) => a + b, 0) / localMs.length) : null });
  }

  if (body.action === "sort") {
    const text = String(body.text || "").trim();
    if (text.length < 3) return json({ ok: false, error: "Paste the message first" }, 400);
    try {
      const r = await sortMessage(text, String(body.source || "message"));
      // leads it might belong to: same email or phone, or the business name
      const w = r.sorted.who, emails = [...new Set([w.email, ...(text.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi) || [])].filter(Boolean).map((x) => String(x).toLowerCase()))].slice(0, 3);
      const digits = [...new Set([w.phone, ...(text.match(/(?:\+?27|0)[\d\s-]{8,12}/g) || [])].filter(Boolean).map((x) => String(x).replace(/\D/g, "").replace(/^27/, "0")).filter((x) => x.length >= 9))].slice(0, 3);
      const ors = [...emails.map((e) => `email.ilike.${e}`), ...digits.map((d) => `phone.ilike.%${d.slice(-9)}%`), ...(w.business ? [`business.ilike.%${w.business.replace(/[%,()]/g, "").slice(0, 40)}%`] : [])];
      let matches: unknown[] = [];
      if (ors.length) { const { data } = await db.from("projects").select("id, ref, business, name, status").or(ors.join(",")).eq("spam", false).limit(5); matches = data || []; }
      return json({ ok: true, ...r, matches });
    } catch (e) { return json({ ok: false, error: (e as Error).message }, 502); }
  }

  if (body.action === "resort") {
    try { return json({ ok: true, ai_sort: await sortProject(db, String(body.projectId || "")) }); }
    catch (e) { return json({ ok: false, error: (e as Error).message }, 502); }
  }
  if (body.action === "draft") {
    try { return json({ ok: true, ...(await draftLeadReply(db, String(body.projectId || ""), body.channel === "whatsapp" ? "whatsapp" : "email", String(body.message || ""), Boolean(body.best))) }); }
    catch (e) { return json({ ok: false, error: (e as Error).message }, 502); }
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
