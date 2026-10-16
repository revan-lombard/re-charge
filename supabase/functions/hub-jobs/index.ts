// hub-jobs — the office PC's worker (hub/worker.py) collects AI jobs here, answers them with its own
// model and hands the answers back (hub/README.md, ADMIN.md 8da). The website chat, the demos, "try it
// on your own email" and the panel's sorting and drafting all leave their jobs in ai_requests (0035)
// and wait a few seconds. The PC only ever calls out, so nothing on it is open to the internet and it
// needs no address, tunnel or open port.
// Auth: Authorization: Bearer <LOCAL_AI_TOKEN> (the hub password). Deploy with verify_jwt = false.
//
// POST { action: "next", ready, models, version, wait } → waits up to `wait` seconds (at most 20)
//      for a job: { ok, job: null | { id, task, body, expires_at }, calls_waiting }
//      Every "next" also records that the PC is on (hub_status), which the website reads. With
//      ready: false (LM Studio isn't answering) no job is handed out.
// POST { action: "done", id, text }   → the answer, for the backend that's waiting on it
// POST { action: "fail", id, error }
import { serviceClient } from "../_shared/db.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const seen = (ready?: boolean, extra: Record<string, unknown> = {}) =>
    db.from("hub_status").upsert({ id: 1, last_seen: new Date().toISOString(), ...(ready === undefined ? {} : { ready }), ...extra }).then(() => {}, () => {});

  if (body.action === "next") {
    const ready = body.ready !== false;
    const models = Array.isArray(body.models) ? body.models.map((m: unknown) => String(m).slice(0, 120)).slice(0, 8) : [];
    await seen(ready, { models, version: String(body.version || "").slice(0, 20) || null });
    // nothing lingers: a job nobody is waiting for any more is swept away after 10 minutes
    await db.from("ai_requests").delete().lt("created_at", new Date(Date.now() - 10 * 60e3).toISOString()).then(() => {}, () => {});
    const { count } = await db.from("calls").select("id", { count: "exact", head: true }).eq("status", "queued").then((r) => r, () => ({ count: 0 }));
    const calls_waiting = count ?? 0;
    if (!ready) return json({ ok: true, job: null, calls_waiting });
    const until = Date.now() + Math.min(Math.max(Number(body.wait) || 0, 0), 20) * 1000;
    for (;;) {
      const { data } = await db.rpc("claim_ai_request");
      const job = Array.isArray(data) ? data[0] : data;
      if (job?.id) return json({ ok: true, job: { id: job.id, task: job.task, body: job.body, expires_at: job.expires_at }, calls_waiting });
      if (Date.now() + 500 >= until) break;
      await sleep(500);
    }
    return json({ ok: true, job: null, calls_waiting });
  }

  const id = String(body.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ ok: false, error: "bad id" }, 400);
  if (body.action === "done") {
    // If the backend already stopped waiting, the job is gone and this changes nothing.
    await db.from("ai_requests").update({ status: "done", result: String(body.text ?? "").slice(0, 20_000) }).eq("id", id).eq("status", "working");
    await seen();
    return json({ ok: true });
  }
  if (body.action === "fail") {
    await db.from("ai_requests").update({ status: "failed", error: String(body.error || "failed").slice(0, 300) }).eq("id", id).eq("status", "working");
    await seen();
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
