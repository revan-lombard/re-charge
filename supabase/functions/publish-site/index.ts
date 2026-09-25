// publish-site — publishes or removes a static preview under previews/<slug>/
// on the GitHub Pages repo, from the admin panel. Staff JWT required.
//
// POST { siteId, action: "publish", files: [{ path, content }] }  content = base64
// POST { siteId, action: "unpublish" }
//
// One atomic commit per call via the GitHub Git Data API: blobs → tree (with
// deletions for files no longer present) → commit → update branch ref.
// HTML files get <meta name="robots" content="noindex,nofollow"> injected so
// previews never show up in search.
//
// Secrets: GITHUB_TOKEN (fine-grained PAT, Contents: read/write on the repo),
//          GITHUB_REPO (owner/repo, default revan-lombard/re-charge),
//          GITHUB_BRANCH (default main), SITE_URL.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";

const REPO = Deno.env.get("GITHUB_REPO") ?? "revan-lombard/re-charge";
const BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";
const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const MAX_FILES = 300;
const MAX_BYTES = 20 * 1024 * 1024;   // decoded, per publish
const SAFE_PATH = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._\-\/ ]{1,200}$/;

type FileIn = { path: string; content: string };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) return json({ ok: false, error: "GITHUB_TOKEN not set — see ADMIN.md §8f" }, 503);

  let body: { siteId?: string; action?: string; files?: FileIn[] };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const db = serviceClient();
  const { data: site, error: sErr } = await db.from("sites").select("*").eq("id", String(body.siteId ?? "")).maybeSingle();
  if (sErr || !site) return json({ ok: false, error: "unknown site" }, 404);
  if (!/^[a-z0-9-]{2,60}$/.test(site.slug)) return json({ ok: false, error: "bad slug" }, 400);
  const prefix = `previews/${site.slug}/`;

  const gh = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}: ${j?.message ?? ""}`);
    return j;
  };

  try {
    // current head + tree
    const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const headSha: string = ref.object.sha;
    const headCommit = await gh(`/repos/${REPO}/git/commits/${headSha}`);
    const baseTree: string = headCommit.tree.sha;
    const existing = await gh(`/repos/${REPO}/git/trees/${baseTree}?recursive=1`);
    const existingPaths: string[] = (existing.tree ?? []).filter((t: { type: string; path: string }) => t.type === "blob" && t.path.startsWith(prefix)).map((t: { path: string }) => t.path);

    const tree: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    let published: string[] = [];
    let bytes = 0;

    if (body.action === "publish") {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return json({ ok: false, error: "no files" }, 400);
      if (files.length > MAX_FILES) return json({ ok: false, error: `too many files (max ${MAX_FILES})` }, 400);
      if (!files.some((f) => f.path.replace(/^\/+/, "") === "index.html")) return json({ ok: false, error: "an index.html at the top level is required" }, 400);
      for (const f of files) {
        const rel = String(f.path ?? "").replace(/^\/+/, "").replace(/\\/g, "/");
        if (!SAFE_PATH.test(rel)) return json({ ok: false, error: `unsafe path: ${rel}` }, 400);
        let b64 = String(f.content ?? "");
        if (/\.html?$/i.test(rel)) b64 = bytesToBase64(injectNoindex(base64ToBytes(b64)));
        const size = Math.floor(b64.length * 3 / 4);
        bytes += size;
        if (bytes > MAX_BYTES) return json({ ok: false, error: "upload too large (max 20 MB)" }, 400);
        const blob = await gh(`/repos/${REPO}/git/blobs`, { method: "POST", body: JSON.stringify({ content: b64, encoding: "base64" }) });
        tree.push({ path: prefix + rel, mode: "100644", type: "blob", sha: blob.sha });
        published.push(rel);
      }
      // remove files from a previous publish that aren't in this one
      for (const p of existingPaths) if (!published.includes(p.slice(prefix.length))) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
    } else if (body.action === "unpublish") {
      if (!existingPaths.length) {
        await db.from("sites").update({ status: "unpublished", files: [], bytes: 0, updated_at: new Date().toISOString() }).eq("id", site.id);
        return json({ ok: true, removed: 0 });
      }
      for (const p of existingPaths) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
    } else {
      return json({ ok: false, error: "action must be publish or unpublish" }, 400);
    }

    const newTree = await gh(`/repos/${REPO}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree }) });
    const message = body.action === "publish"
      ? `Publish preview: ${site.name} (${published.length} files)\n\nvia admin panel`
      : `Unpublish preview: ${site.name}\n\nvia admin panel`;
    const commit = await gh(`/repos/${REPO}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }) });
    await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });

    const url = `${SITE}/previews/${site.slug}/`;
    const patch = body.action === "publish"
      ? { status: "published", url, files: published, bytes, commit_sha: commit.sha, published_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status: "unpublished", files: [], bytes: 0, commit_sha: commit.sha, updated_at: new Date().toISOString() };
    await db.from("sites").update(patch).eq("id", site.id);
    if (site.project_id) {
      await db.from("projects").update({ preview_url: body.action === "publish" ? url : null }).eq("id", site.project_id);
      await db.from("project_events").insert({ project_id: site.project_id, kind: "note", note: body.action === "publish" ? `Preview published: ${url}` : `Preview unpublished (${site.name})`, data: { site_id: site.id, commit: commit.sha, by: caller.userId } });
    }
    return json({ ok: true, url: body.action === "publish" ? url : null, commit: commit.sha, files: published.length, removed: tree.filter((t) => t.sha === null).length });
  } catch (e) {
    console.error("publish-site failed:", e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 502);
  }
});

function bytesToBase64(u: Uint8Array): string { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000))); return btoa(s); }
function base64ToBytes(b64: string): Uint8Array { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function injectNoindex(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(bytes);
  if (/name=["']robots["']/i.test(text)) return bytes;
  const tag = '<meta name="robots" content="noindex,nofollow">';
  const out = /<head[^>]*>/i.test(text) ? text.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`) : `${tag}\n${text}`;
  return new TextEncoder().encode(out);
}
