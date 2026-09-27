// Mockup-builder queue that runs entirely through GitHub, so the builder
// (a scheduled Claude session whose network can reach GitHub but not
// Supabase) never needs to talk to Supabase.
//
//   Supabase ──(encrypted brief)──► repo _build/queue/<slug>.json
//   builder: decrypt, build previews/<slug>/, write _build/results/<slug>.json, delete the queue file
//   Supabase ◄──(result)────────── repo _build/results/<slug>.json   (read + deleted by pullResults)
//
// The repo is public, so briefs are encrypted (RSA-OAEP-256 + AES-256-GCM)
// with BUILD_PUBLIC_KEY; only the builder holds the private key. Folders that
// start with "_" are not published by GitHub Pages (Jekyll).
import { BUILD_PUBLIC_KEY } from "./build_pubkey.ts";

// deno-lint-ignore no-explicit-any
type DB = any;
const REPO = Deno.env.get("GITHUB_REPO") ?? "revan-lombard/re-charge";
const BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";
const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const QUEUE = "_build/queue";
const RESULTS = "_build/results";

const enc = new TextEncoder();
function b64(u: Uint8Array): string { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s: string): Uint8Array<ArrayBuffer> { const bin = atob(s.replace(/\s+/g, "")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mockup";
const rand = (n: number) => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; const r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map((x) => a[x % a.length]).join(""); };

export async function encryptBrief(plain: string): Promise<Record<string, unknown>> {
  const der = unb64(BUILD_PUBLIC_KEY.replace(/-----[A-Z ]+-----/g, ""));
  const pub = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, enc.encode(plain)));   // ciphertext || 16-byte tag
  const key = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw));
  return { v: 1, alg: "RSA-OAEP-256+A256GCM", key: b64(key), iv: b64(iv), data: b64(data) };
}

// deno-lint-ignore no-explicit-any
async function gh(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKEN not set");
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, body };
}
async function putFile(path: string, text: string, message: string) {
  const cur = await gh(`/contents/${path}?ref=${BRANCH}`);
  const sha = cur.status === 200 ? cur.body?.sha : undefined;
  const r = await gh(`/contents/${path}`, { method: "PUT", body: JSON.stringify({ message, content: b64(enc.encode(text)), branch: BRANCH, ...(sha ? { sha } : {}) }) });
  if (r.status >= 300) throw new Error(`GitHub ${r.status} writing ${path}: ${r.body?.message ?? ""}`);
}
async function deleteFile(path: string, sha: string, message: string) {
  const r = await gh(`/contents/${path}`, { method: "DELETE", body: JSON.stringify({ message, sha, branch: BRANCH }) });
  if (r.status >= 300 && r.status !== 404) throw new Error(`GitHub ${r.status} deleting ${path}: ${r.body?.message ?? ""}`);
}

/** Encrypt + commit briefs for queued projects (all queued, or just `ids`). */
export async function pushBriefs(db: DB, ids?: string[]): Promise<{ pushed: number; errors: string[] }> {
  const errors: string[] = [];
  let q = db.from("projects")
    .select("id, ref, name, email, phone, business, category, goal, details, indicative_price, budget, build_site_id")
    .eq("build_status", "queued").eq("spam", false).order("created_at").limit(5);
  if (ids?.length) q = q.in("id", ids);
  const { data: rows, error } = await q;
  if (error) return { pushed: 0, errors: [error.message] };
  let pushed = 0;
  for (const p of rows ?? []) {
    try {
      let site = p.build_site_id ? (await db.from("sites").select("id, slug").eq("id", p.build_site_id).maybeSingle()).data : null;
      if (!site) {
        const slug = slugify(p.business || p.name || "mockup").slice(0, 28) + "-" + rand(4);
        const ins = await db.from("sites").insert({ name: `${p.business || p.name || p.ref} — mockup`, slug, kind: "mockup", status: "draft", project_id: p.id, description: "Automatic mockup from the free-mockup request." }).select("id, slug").single();
        if (ins.error) throw new Error(ins.error.message);
        site = ins.data;
      }
      const d = p.details ?? {};
      const brief = {
        v: 1, ref: p.ref, slug: site.slug, previewUrl: `${SITE}/previews/${site.slug}/`,
        business: p.business || d.mkBusiness || p.name || "", contactName: p.name || "", email: p.email || "", phone: p.phone || "",
        about: p.goal || d.mkAbout || "", include: d.mkInclude || d.features || "", style: d.mkStyle || "",
        industry: d.mkIndustry || "", currentSite: d.mkCurrent || "", likedDemo: d.mkDemo || "",
        category: p.category ?? [], indicativePrice: p.indicative_price || "", budget: p.budget || "",
      };
      await putFile(`${QUEUE}/${site.slug}.json`, JSON.stringify(await encryptBrief(JSON.stringify(brief))) + "\n", `Queue mockup build: ${site.slug}\n\nencrypted brief, via admin panel`);
      await db.from("projects").update({ build_status: "building", build_started_at: new Date().toISOString(), build_brief: brief, build_site_id: site.id, build_log: null }).eq("id", p.id);
      pushed++;
    } catch (e) { errors.push(`${p.ref}: ${(e as Error).message}`); }
  }
  return { pushed, errors };
}

/** Read builder results from the repo, record them, and delete the result files. */
export async function pullResults(db: DB): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  const list = await gh(`/contents/${RESULTS}?ref=${BRANCH}`);
  if (list.status === 404) return { pulled: 0, errors };
  if (list.status >= 300 || !Array.isArray(list.body)) return { pulled: 0, errors: [`GitHub ${list.status} listing results`] };
  let pulled = 0;
  for (const f of list.body.filter((x: { type: string; name: string }) => x.type === "file" && x.name.endsWith(".json"))) {
    try {
      const file = await gh(`/contents/${f.path}?ref=${BRANCH}`);
      const r = JSON.parse(new TextDecoder().decode(unb64(file.body?.content ?? "")));
      const slug = String(r.slug || f.name.replace(/\.json$/, ""));
      const { data: site } = await db.from("sites").select("id, project_id").eq("slug", slug).maybeSingle();
      if (site) {
        const built = r.status === "built";
        const url = built ? String(r.url || `${SITE}/previews/${slug}/`) : null;
        const notes = String(r.notes ?? "").slice(0, 4000);
        await db.from("sites").update(built
          ? { status: "published", url, files: Array.isArray(r.files) ? r.files : [], bytes: Number(r.bytes) || 0, commit_sha: r.commit ? String(r.commit) : null, published_at: new Date().toISOString(), notes: notes || null, updated_at: new Date().toISOString() }
          : { status: "draft", notes: notes || null, updated_at: new Date().toISOString() }).eq("id", site.id);
        if (site.project_id) {
          await db.from("projects").update({ build_status: built ? "built" : "failed", build_log: notes || null, build_started_at: null, ...(url ? { preview_url: url } : {}) }).eq("id", site.project_id);
          await db.from("project_events").insert({ project_id: site.project_id, kind: "note",
            note: built ? `Mockup built automatically: ${url} — review it, then send "Mockup ready"` : `Automatic mockup build failed — ${notes.slice(0, 200) || "see build log"}`,
            data: { auto_build: true, status: r.status, commit: r.commit ?? null } });
        }
      }
      await deleteFile(f.path, f.sha, `Build result recorded: ${slug}`);
      pulled++;
    } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
  }
  return { pulled, errors };
}
