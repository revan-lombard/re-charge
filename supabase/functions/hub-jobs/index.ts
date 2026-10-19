// hub-jobs — the office PC's worker (hub/worker.py) collects AI jobs here, answers them with its own
// model and hands the answers back (hub/README.md, ADMIN.md 8da). The website chat, the demos, "try it
// on your own email" and the panel's sorting and drafting all leave their jobs in ai_requests (0035)
// and wait a few seconds. The PC only ever calls out, so nothing on it is open to the internet and it
// needs no address, tunnel or open port.
// Auth: Authorization: Bearer <LOCAL_AI_TOKEN> (the hub password). Deploy with verify_jwt = false.
//
// POST { action: "next", ready, models, version, wait } → waits up to `wait` seconds (at most 20)
//      for a job: { ok, mode, job: null | { id, task, body, ms_left }, calls_waiting }
//      Every "next" also records that the PC is on (hub_status), which the website reads. With
//      ready: false (the model isn't answering) no job is handed out. ms_left is measured here, so the
//      PC's own clock doesn't matter. mode is "direct" if LOCAL_AI_URL is still set (then the website
//      doesn't use these jobs; the worker warns).
// POST { action: "done", id, text }   → the answer, for the backend that's waiting on it
// POST { action: "fail", id, error }
import { serviceClient } from "../_shared/db.ts";
import { hubMode } from "../_shared/ai.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The database update hasn't been run: tables or the claim function are missing
const notSetUp = (e: { code?: string; message?: string } | null) => Boolean(e && (["42P01", "42883", "PGRST202", "PGRST205"].includes(String(e.code)) || /does not exist|could not find/i.test(String(e.message))));
const SETUP = "Database not set up: run supabase/migrations/0035_hub_queue.sql in the Supabase SQL Editor (ADMIN.md 8da)";

function authorised(req: Request): boolean {
  const want = Deno.env.get("LOCAL_AI_TOKEN") || "";
  const got = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length < 24 || got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!authorised(req)) return json({ ok: false, error: "wrong hub password" }, 401);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  const now = () => new Date().toISOString();
  const seen = (fields: Record<string, unknown> = {}) => db.from("hub_status").upsert({ id: 1, last_seen: now(), ...fields });
  const callsWaiting = async () => {
    const { count } = await db.from("calls").select("id", { count: "exact", head: true }).eq("status", "queued").then((r) => r, () => ({ count: 0 }));
    return count ?? 0;
  };

  if (body.action === "next") {
    const ready = body.ready !== false;
    const models = Array.isArray(body.models) ? body.models.map((m: unknown) => String(m).slice(0, 120)).slice(0, 8) : [];
    const up = await seen({ ready, models, version: String(body.version || "").slice(0, 20) || null });
    if (notSetUp(up.error)) return json({ ok: false, error: SETUP }, 500);
    // nothing lingers: a job whose wait ended over a minute ago is swept away (0035 also does this every 5 minutes)
    await db.from("ai_requests").delete().lt("expires_at", new Date(Date.now() - 60e3).toISOString()).then(() => {}, () => {});
    const mode = hubMode();
    if (!ready) return json({ ok: true, mode, job: null, calls_waiting: await callsWaiting() });
    const until = Date.now() + Math.min(Math.max(Number(body.wait) || 0, 0), 20) * 1000;
    for (;;) {
      if (req.signal?.aborted) break;   // the PC hung up: don't hand a job to nobody
      const { data, error } = await db.rpc("claim_ai_request");
      if (notSetUp(error)) return json({ ok: false, error: SETUP }, 500);
      const job = Array.isArray(data) ? data[0] : data;
      if (job?.id) {
        // busy until the job's wait ends, so a long answer doesn't make the PC look switched off
        await db.from("hub_status").update({ busy_until: job.expires_at }).eq("id", 1).then(() => {}, () => {});
        return json({ ok: true, mode, job: { id: job.id, task: job.task, body: job.body, ms_left: Math.max(0, Date.parse(job.expires_at) - Date.now()) }, calls_waiting: await callsWaiting() });
      }
      if (Date.now() + 500 >= until) break;
      await sleep(500);
    }
    return json({ ok: true, mode, job: null, calls_waiting: await callsWaiting() });
  }

  const id = String(body.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ ok: false, error: "bad id" }, 400);
  if (body.action === "done" || body.action === "fail") {
    // Only while the backend is still waiting: an answer is never stored for a wait that has ended.
    const fields = body.action === "done" ? { status: "done", result: String(body.text ?? "").slice(0, 20_000) } : { status: "failed", error: String(body.error || "failed").slice(0, 300) };
    await db.from("ai_requests").update(fields).eq("id", id).eq("status", "working").gt("expires_at", now());
    await seen({ busy_until: null }).then(() => {}, () => {});
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
