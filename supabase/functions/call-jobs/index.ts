// call-jobs — the office PC's worker (hub/worker.py) collects call recordings here and hands back the
// transcript and summary (ADMIN.md 8cu). The PC only ever calls out, so nothing on it is exposed.
// Auth: Authorization: Bearer <LOCAL_AI_TOKEN> (the same hub password). Deploy with verify_jwt = false.
//
// POST { action: "next" }  → { ok, job: null } or { ok, job: { id, audio_url, filename, lead } }
// POST { action: "done", id, transcript, summary, seconds } → saved on the call and the lead's timeline
// POST { action: "fail", id, error }
import { serviceClient } from "../_shared/db.ts";
import { sendPush } from "../_shared/push.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

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

  if (body.action === "next") {
    // a job left "working" for 30 minutes (the PC restarted mid-call) goes back in the queue
    await db.from("calls").update({ status: "queued" }).eq("status", "working").lt("claimed_at", new Date(Date.now() - 30 * 60e3).toISOString());
    const { data: next } = await db.from("calls").select("id, project_id, title, audio_path").eq("status", "queued").order("created_at").limit(1).maybeSingle();
    if (!next) return json({ ok: true, job: null });
    const { data: claimed } = await db.from("calls").update({ status: "working", claimed_at: new Date().toISOString() }).eq("id", next.id).eq("status", "queued").select("id").maybeSingle();
    if (!claimed) return json({ ok: true, job: null });            // another worker took it
    const { data: signed } = await db.storage.from("calls").createSignedUrl(next.audio_path, 3600);
    const { data: p } = next.project_id ? await db.from("projects").select("ref, name, business, goal, status").eq("id", next.project_id).maybeSingle() : { data: null };
    return json({ ok: true, job: { id: next.id, audio_url: signed?.signedUrl, filename: next.audio_path.split("/").pop(), title: next.title || "", lead: p ? { ref: p.ref, name: p.name, business: p.business, goal: String(p.goal || "").slice(0, 800), status: p.status } : null } });
  }

  const id = String(body.id || "");
  const { data: call } = await db.from("calls").select("id, project_id, title").eq("id", id).maybeSingle();
  if (!call) return json({ ok: false, error: "call not found" }, 404);

  if (body.action === "done") {
    const transcript = String(body.transcript || "").slice(0, 200_000);
    const summary = body.summary && typeof body.summary === "object" ? body.summary : null;
    await db.from("calls").update({ status: "done", transcript, summary, seconds: Number(body.seconds) || null, error: null, done_at: new Date().toISOString() }).eq("id", id);
    if (call.project_id) {
      const s = (summary || {}) as Record<string, unknown>;
      const lines = [`Call notes${call.title ? ": " + call.title : ""}`, String(s.summary || ""), ...(Array.isArray(s.actions) && s.actions.length ? ["To do: " + (s.actions as string[]).join("; ")] : []), s.next_step ? `Next: ${s.next_step}` : ""].filter(Boolean);
      await db.from("project_events").insert({ project_id: call.project_id, kind: "note", note: lines.join("\n").slice(0, 3000), data: { call_id: id } });
      const { data: p } = await db.from("projects").select("ref, business, name").eq("id", call.project_id).maybeSingle();
      await sendPush(db, { title: `Call notes ready: ${p?.business || p?.name || p?.ref || "a lead"}`, body: String(s.summary || "Transcribed").slice(0, 120), url: `/admin/#/p/${call.project_id}`, tag: `call-${id}` }).catch(() => {});
    }
    return json({ ok: true });
  }
  if (body.action === "fail") {
    await db.from("calls").update({ status: "failed", error: String(body.error || "failed").slice(0, 300), done_at: new Date().toISOString() }).eq("id", id);
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
