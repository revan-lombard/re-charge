// One way for the backend to ask an AI for a JSON answer: the home AI hub first, Claude as fallback.
//
// The hub is the office PC running a local model (LM Studio or Ollama) behind hub/proxy.py, reached
// over a Tailscale Funnel address (hub/README.md, ADMIN.md 8cq). It costs nothing per job and the
// text never leaves your own machine. If the hub is off, slow or gives an answer that isn't valid
// JSON, aiJSON sends the same job to Claude (when ANTHROPIC_API_KEY is set), so the panel's back-office
// jobs (sorting leads, drafting replies) keep working.
//
// The public website is different: its chat and "try it on your own email" (assistant/index.ts) use
// hubChat only, and go to Claude only when ASSISTANT_CLAUDE_FALLBACK=on. Off, the default, keeps the
// website at zero API cost: with the PC off, the site falls back to prepared answers and WhatsApp.
//
// Secrets: LOCAL_AI_URL (https://…ts.net), LOCAL_AI_TOKEN (the hub's password), optional
// LOCAL_AI_MODEL; ANTHROPIC_API_KEY for the fallback, optional CLAUDE_SORT_MODEL.
// Every job is logged to ai_jobs (task, which engine, how long) for the panel's AI hub card.
import { serviceClient } from "./db.ts";

export type Engine = "local" | "claude";
const env = (k: string) => Deno.env.get(k) || "";
export const hubConfigured = () => Boolean(env("LOCAL_AI_URL") && env("LOCAL_AI_TOKEN"));
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
  return { Authorization: `Bearer ${env("LOCAL_AI_TOKEN")}`, "Content-Type": "application/json" };
}
export const hubUrl = (path: string) => env("LOCAL_AI_URL").replace(/\/+$/, "") + path;

async function askHub(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch(hubUrl("/v1/chat/completions"), {
    method: "POST", headers: hubHeaders(), signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ model: env("LOCAL_AI_MODEL") || "local", temperature: 0, max_tokens: maxTokens, stream: false,
      messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`hub said ${res.status}`);
  const j = await res.json();
  return String(j?.choices?.[0]?.message?.content || "");
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
      const data = parseJSON<T>(await askHub(system, user, maxTokens));
      if (!valid(data)) throw new Error("answer didn't fit the format");
      const ms = Date.now() - t0; await log(task, "local", ms, true); return { data, engine: "local", ms };
    } catch (e) { await log(task, "local", Date.now() - t0, false, (e as Error).message); }
  }
  if (!claudeConfigured()) throw new Error(hubConfigured() ? "The AI hub didn't answer and no Claude key is set" : "No AI set up yet (ADMIN.md 8cq)");
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
    const res = await fetch(hubUrl("/v1/chat/completions"), {
      method: "POST", headers: hubHeaders(), signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: env("LOCAL_AI_MODEL") || "local", temperature: 0.3, max_tokens: maxTokens, stream: false, messages: [{ role: "system", content: system }, ...messages] }),
    });
    if (!res.ok) throw new Error(`hub said ${res.status}`);
    const text = String((await res.json())?.choices?.[0]?.message?.content || "").trim();
    if (!text) throw new Error("empty answer");
    await log(task, "local", Date.now() - t0, true);
    return text;
  } catch (e) { await log(task, "local", Date.now() - t0, false, (e as Error).message); throw e; }
}
export async function logClaudeJob(task: string, ms: number, ok: boolean, error?: string) { await log(task, "claude", ms, ok, error); }

// Is the hub answering right now? Cached for a minute per function instance (the website asks on every page).
let _online: { at: number; ok: boolean } | null = null;
export async function hubOnline(): Promise<boolean> {
  if (!hubConfigured()) return false;
  if (_online && Date.now() - _online.at < 60_000) return _online.ok;
  let ok = false;
  try { const r = await fetch(hubUrl("/v1/models"), { headers: hubHeaders(), signal: AbortSignal.timeout(3000) }); ok = r.ok; } catch { ok = false; }
  _online = { at: Date.now(), ok };
  return ok;
}
