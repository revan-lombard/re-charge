// One way for the backend to ask an AI for a JSON answer: the home AI hub first, Claude as fallback.
//
// The hub is the office PC running a local model (Ollama with Llama 3.1, or LM Studio). It costs nothing per job and the text
// never goes to an outside AI. If the hub is off, slow or gives an answer that isn't valid JSON,
// aiJSON sends the same job to Claude (when ANTHROPIC_API_KEY is set), so the panel's back-office
// jobs (sorting leads, drafting replies) keep working.
//
// Two ways to reach the PC (hub/README.md, ADMIN.md 8da):
//  - "queue" (the default, and the one to use): only LOCAL_AI_TOKEN is set. Each job is left in
//    ai_requests (0035) and this waits a few seconds while hub/worker.py on the PC collects it
//    through the hub-jobs function and hands the answer back. The PC only calls out: no address,
//    tunnel or open port. hub_status says whether it's on.
//  - "direct" (the older way): LOCAL_AI_URL is set too, a public address for the PC (a tunnel), which
//    this calls. Two kinds of API there: hub/proxy.py's OpenAI-style /v1/... (LOCAL_AI_URL is the base),
//    or a simple chat API, POST {messages} → {reply}, such as the FastAPI wrapper around Ollama in the
//    owner's Llama handover (LOCAL_AI_URL ends in /chat; LOCAL_AI_TOKEN is that API's key). ADMIN.md 8db.
//
// The public website is different: its chat and "try it on your own email" (assistant/index.ts) use
// hubChat only, and go to Claude only when ASSISTANT_CLAUDE_FALLBACK=on. Off, the default, keeps the
// website at zero API cost: with the PC off, the site falls back to prepared answers and WhatsApp.
//
// Secrets: LOCAL_AI_TOKEN (the hub's password); for direct mode only, LOCAL_AI_URL, LOCAL_AI_MODEL (in
// queue mode set HUB_MODEL on the PC instead) and LOCAL_AI_ACCESS_ID / LOCAL_AI_ACCESS_SECRET;
// ANTHROPIC_API_KEY for the fallback, optional CLAUDE_SORT_MODEL.
// Every job is logged to ai_jobs (task, which engine, how long) for the panel's AI hub card.
import { serviceClient } from "./db.ts";

export type Engine = "local" | "claude";
const env = (k: string) => Deno.env.get(k) || "";
export type HubMode = "queue" | "direct" | "off";
export const hubMode = (): HubMode => env("LOCAL_AI_TOKEN").length < 24 ? "off" : env("LOCAL_AI_URL") ? "direct" : "queue";
export const hubConfigured = () => hubMode() !== "off";
export const claudeConfigured = () => Boolean(env("ANTHROPIC_API_KEY"));
const CLAUDE_MODEL = () => env("CLAUDE_SORT_MODEL") || "claude-haiku-5-5";

// Pull the first JSON object out of a model's reply (local models sometimes add words or ``` fences)
export function parseJSON<T>(text: string): T {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in the answer");
  return JSON.parse(t.slice(a, b + 1)) as T;
}

export function hubHeaders(): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${env("LOCAL_AI_TOKEN")}`, "Content-Type": "application/json" };
  // Direct mode only (ADMIN.md 8da, "The older way"): a Cloudflare Access service token in front of a
  // tunnel, so Cloudflare turns away everyone else before anything reaches the PC
  if (env("LOCAL_AI_ACCESS_ID") && env("LOCAL_AI_ACCESS_SECRET")) {
    h["CF-Access-Client-Id"] = env("LOCAL_AI_ACCESS_ID");
    h["CF-Access-Client-Secret"] = env("LOCAL_AI_ACCESS_SECRET");
  }
  return h;
}
export const hubUrl = (path: string) => env("LOCAL_AI_URL").replace(/\/+$/, "") + path;
// Direct mode's API: "chat" (LOCAL_AI_URL ends in /chat) or "openai" (hub/proxy.py)
export const hubApi = (): "chat" | "openai" | "" => hubMode() !== "direct" ? "" : /\/chat\/?$/.test(env("LOCAL_AI_URL").split("?")[0]) ? "chat" : "openai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type ChatReq = { messages: { role: string; content: string }[]; max_tokens: number; temperature: number };

// Queue mode: leave the job for the PC and wait for its answer. The job is deleted as soon as this
// stops waiting, answered or not, so no visitor text stays on the server (0035 sweeps up after a
// backend that was stopped mid-wait).
async function viaQueue(task: string, req: ChatReq, timeoutMs: number): Promise<string> {
  if (!(await hubOnline())) throw new Error("the office PC isn't connected right now");
  const db = serviceClient();
  const id = crypto.randomUUID();
  try {
    const { error } = await db.from("ai_requests").insert({ id, task, body: req, expires_at: new Date(Date.now() + timeoutMs).toISOString() });
    if (error) throw new Error("couldn't leave the job for the PC");
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      await sleep(400);
      const { data: r, error: e } = await db.from("ai_requests").select("status, result, error").eq("id", id).maybeSingle();
      if (e) continue;                                  // one failed look: keep waiting
      if (r?.status === "done") return String(r.result || "");
      if (r?.status === "failed") throw new Error(r.error || "the PC couldn't answer");
      if (!r) throw new Error("the job disappeared");
    }
    throw new Error("the office PC took too long");
  } finally {
    await db.from("ai_requests").delete().eq("id", id).then(() => {}, () => {});
  }
}

// One chat request to the PC's model, whichever way the PC is connected. Returns the answer's text.
async function hubComplete(task: string, req: ChatReq, timeoutMs: number): Promise<string> {
  if (hubMode() === "queue") return await viaQueue(task, req, timeoutMs);
  if (hubApi() === "chat") {
    // the simple chat API takes only the messages (no length or temperature) and answers { reply }
    const res = await fetch(env("LOCAL_AI_URL"), { method: "POST", headers: hubHeaders(), signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify({ messages: req.messages, stream: false }) });
    if (!res.ok) throw new Error(`the PC's chat API said ${res.status}`);
    const j = await res.json();
    return String(j?.reply ?? j?.choices?.[0]?.message?.content ?? "");
  }
  const res = await fetch(hubUrl("/v1/chat/completions"), {
    method: "POST", headers: hubHeaders(), signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: env("LOCAL_AI_MODEL") || "local", stream: false, ...req }),
  });
  if (!res.ok) throw new Error(`hub said ${res.status}`);
  const j = await res.json();
  return String(j?.choices?.[0]?.message?.content || "");
}

// Direct mode: is the address answering? For the simple chat API, a GET on /chat is enough: a running
// API says 405 (it only takes POST), while Cloudflare says 530 when the tunnel is down or its address
// changed, and 502 when the tunnel is up but the API on the PC isn't running.
export async function directStatus(): Promise<{ online: boolean; models: string[]; error: string }> {
  const chat = hubApi() === "chat";
  try {
    const r = await fetch(chat ? env("LOCAL_AI_URL") : hubUrl("/v1/models"), { headers: hubHeaders(), signal: AbortSignal.timeout(chat ? 5000 : 6000) });
    if (chat) {
      if ([200, 405, 422].includes(r.status)) return { online: true, models: ["your /chat API"], error: "" };
      return { online: false, models: [], error: r.status === 530 ? "the tunnel is down, or its address changed: update LOCAL_AI_URL" : r.status === 502 ? "the tunnel is up, but the API on the PC isn't running" : r.status === 401 || r.status === 403 ? "the API refused the key: check LOCAL_AI_TOKEN" : `answered ${r.status}` };
    }
    if (!r.ok) return { online: false, models: [], error: `answered ${r.status}` };
    const j = await r.json();
    return { online: true, models: (j.data || []).map((m: { id: string }) => m.id).slice(0, 8), error: "" };
  } catch (e) { return { online: false, models: [], error: (e as Error).name === "TimeoutError" ? "didn't answer in time (is the PC on?)" : (e as Error).message }; }
}

async function askHub(task: string, system: string, user: string, maxTokens: number): Promise<string> {
  return await hubComplete(task, { temperature: 0, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }, 45_000);
}

async function askClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(45_000),
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Claude said ${res.status}`);
  return (j.content || []).map((c: { type: string; text?: string }) => c.type === "text" ? c.text : "").join("");
}

async function log(task: string, engine: Engine, ms: number, ok: boolean, error?: string) {
  try { await serviceClient().from("ai_jobs").insert({ task, engine, ms, ok, error: error ? error.slice(0, 300) : null }); } catch { /* the log must never break a job */ }
}

export async function aiJSON<T>(task: string, system: string, user: string, opts: { maxTokens?: number; check?: (x: T) => boolean; preferClaude?: boolean } = {}): Promise<{ data: T; engine: Engine; ms: number }> {
  const maxTokens = opts.maxTokens ?? 600;
  const valid = (x: T) => !opts.check || opts.check(x);
  // preferClaude: skip the hub (the panel's "Draft with Claude instead"), unless there is no Claude key
  if (hubConfigured() && !(opts.preferClaude && claudeConfigured())) {
    const t0 = Date.now();
    try {
      const data = parseJSON<T>(await askHub(task, system, user, maxTokens));
      if (!valid(data)) throw new Error("answer didn't fit the format");
      const ms = Date.now() - t0; await log(task, "local", ms, true); return { data, engine: "local", ms };
    } catch (e) { await log(task, "local", Date.now() - t0, false, (e as Error).message); }
  }
  if (!claudeConfigured()) throw new Error(hubConfigured() ? "The AI hub didn't answer and no Claude key is set" : "No AI set up yet (ADMIN.md 8cq and 8da)");
  const t0 = Date.now();
  try {
    const data = parseJSON<T>(await askClaude(system, user, maxTokens));
    if (!valid(data)) throw new Error("answer didn't fit the format");
    const ms = Date.now() - t0; await log(task, "claude", ms, true); return { data, engine: "claude", ms };
  } catch (e) { await log(task, "claude", Date.now() - t0, false, (e as Error).message); throw e; }
}

// A plain-text chat answer from the hub (the website assistant). Throws if the hub can't answer in time.
export async function hubChat(task: string, system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens = 500, timeoutMs = 30_000): Promise<string> {
  const t0 = Date.now();
  try {
    const text = (await hubComplete(task, { temperature: 0.3, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }, timeoutMs)).trim();
    if (!text) throw new Error("empty answer");
    await log(task, "local", Date.now() - t0, true);
    return text;
  } catch (e) { await log(task, "local", Date.now() - t0, false, (e as Error).message); throw e; }
}
export async function logClaudeJob(task: string, ms: number, ok: boolean, error?: string) { await log(task, "claude", ms, ok, error); }

// The PC in queue mode: when it last checked in (hub-jobs), and whether its model is answering.
// Online means its model is ready and it checked in within 35 seconds (an idle PC checks in about
// every 20), or it's busy answering a job (busy_until, set when it collects one). error is set when
// the database update (0035) hasn't been run.
export async function pcStatus(): Promise<{ online: boolean; ready: boolean; models: string[]; last_seen: string | null; error: string }> {
  const { data, error } = await serviceClient().from("hub_status").select("last_seen, ready, models, busy_until").eq("id", 1).maybeSingle();
  const now = Date.now(), seen = data?.last_seen ? Date.parse(data.last_seen) : 0, busy = data?.busy_until ? Date.parse(data.busy_until) : 0;
  const ready = Boolean(data?.ready);
  const setup = error && (["42P01", "42703", "PGRST205", "PGRST204"].includes(String(error.code)) || /does not exist|could not find/i.test(String(error.message)));
  return { online: ready && (now - seen < 35_000 || now < busy + 5_000), ready, models: (data?.models as string[]) || [], last_seen: data?.last_seen || null,
    error: error ? (setup ? "run database update 0035 (ADMIN.md 8da)" : String(error.message || "couldn't read the PC's status")) : "" };
}

// Is the hub answering right now? Cached per function instance (the website asks on every page).
let _online: { at: number; ok: boolean } | null = null;
export async function hubOnline(): Promise<boolean> {
  const mode = hubMode();
  if (mode === "off") return false;
  if (_online && Date.now() - _online.at < (mode === "queue" ? 10_000 : 60_000)) return _online.ok;
  let ok = false;
  if (mode === "queue") { try { ok = (await pcStatus()).online; } catch { ok = false; } }
  else ok = (await directStatus()).online;
  _online = { at: Date.now(), ok };
  return ok;
}
