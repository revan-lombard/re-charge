// build-sync — the admin panel's link to the GitHub-based mockup builder.
//   POST { action: "push", projectId? }  → encrypt + commit queued briefs
//   POST { action: "pull" }              → record finished builds from the repo
//   POST { action: "sync" }              → both
// Staff JWT required (verify_jwt = true). Uses GITHUB_TOKEN (already set for Sites).
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { pushBriefs, pullResults } from "../_shared/buildqueue.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  let body: { action?: string; projectId?: string } = {};
  try { body = await req.json(); } catch { /* empty body = sync */ }
  const action = body.action ?? "sync";
  const db = serviceClient();
  const out = { ok: true, pushed: 0, pulled: 0, errors: [] as string[] };
  try {
    if (action === "push" || action === "sync") { const r = await pushBriefs(db, body.projectId ? [String(body.projectId)] : undefined); out.pushed = r.pushed; out.errors.push(...r.errors); }
    if (action === "pull" || action === "sync") { const r = await pullResults(db); out.pulled = r.pulled; out.errors.push(...r.errors); }
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 502); }
  return json(out);
});
