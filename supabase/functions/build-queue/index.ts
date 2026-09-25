// build-queue — the hand-off between the admin panel and the automatic
// mockup builder (a scheduled Claude session).
//
//   GET  /build-queue            → up to 3 queued briefs; marks them "building"
//   POST /build-queue            → { projectId, status: "built"|"failed", url?, files?, commit?, notes? }
//
// Auth: header  x-build-secret: <BUILD_SECRET>  (a long random string set both
// as a Supabase secret and in the builder's environment). No JWT: the builder
// is a machine, not a staff login. The panel itself never calls this — it
// queues by updating projects.build_status under RLS.
import { serviceClient } from "../_shared/db.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://re-charge.co.za";
const STALE_MS = 3 * 60 * 60 * 1000;   // a build older than 3h is assumed dead → re-queued

Deno.serve(async (req) => {
  const secret = Deno.env.get("BUILD_SECRET");
  if (!secret) return new Response("BUILD_SECRET not set", { status: 503 });
  const given = req.headers.get("x-build-secret") ?? "";
  if (given.length !== secret.length || !timingSafeEqual(given, secret)) return new Response("unauthorised", { status: 401 });
  const db = serviceClient();

  if (req.method === "GET") {
    // recover builds that never reported back
    await db.from("projects").update({ build_status: "queued", build_started_at: null })
      .eq("build_status", "building").lt("build_started_at", new Date(Date.now() - STALE_MS).toISOString());

    const { data: rows, error } = await db.from("projects")
      .select("id, ref, name, email, phone, business, category, goal, details, indicative_price, budget, build_site_id, preview_url")
      .eq("build_status", "queued").eq("spam", false).order("created_at").limit(3);
    if (error) return json({ ok: false, error: error.message }, 500);

    const briefs = [];
    for (const p of rows ?? []) {
      // one sites record per project build; create it if the panel didn't
      let site = p.build_site_id ? (await db.from("sites").select("*").eq("id", p.build_site_id).maybeSingle()).data : null;
      if (!site) {
        const slug = slugify(p.business || p.name || "mockup").slice(0, 28) + "-" + rand(4);
        const ins = await db.from("sites").insert({
          name: `${p.business || p.name || p.ref} — mockup`, slug, kind: "mockup", status: "draft",
          project_id: p.id, description: "Automatic mockup from the free-mockup request.",
        }).select("*").single();
        site = ins.data;
      }
      const d = p.details ?? {};
      const brief = {
        projectId: p.id, ref: p.ref, siteId: site?.id ?? null, slug: site?.slug ?? null,
        business: p.business || d.mkBusiness || p.name || "",
        contactName: p.name || "", email: p.email || "", phone: p.phone || "",
        about: p.goal || d.mkAbout || "", include: d.mkInclude || d.features || "", style: d.mkStyle || "",
        category: p.category ?? [], indicativePrice: p.indicative_price || "", budget: p.budget || "",
        formType: d.formType || "", submittedAt: d.submittedAt || null,
        previewUrl: `${SITE}/previews/${site?.slug}/`,
      };
      await db.from("projects").update({ build_status: "building", build_started_at: new Date().toISOString(), build_brief: brief, build_site_id: site?.id ?? null }).eq("id", p.id);
      briefs.push(brief);
    }
    return json({ ok: true, briefs });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
    const projectId = String(body.projectId ?? "");
    const status = body.status === "built" ? "built" : "failed";
    const { data: p } = await db.from("projects").select("id, ref, build_site_id, business, name").eq("id", projectId).maybeSingle();
    if (!p) return json({ ok: false, error: "unknown project" }, 404);
    const notes = String(body.notes ?? "").slice(0, 4000);
    const url = status === "built" ? String(body.url ?? "") : null;
    await db.from("projects").update({
      build_status: status, build_log: notes, build_started_at: null,
      ...(url ? { preview_url: url } : {}),
    }).eq("id", p.id);
    if (p.build_site_id) {
      await db.from("sites").update(status === "built"
        ? { status: "published", url, files: Array.isArray(body.files) ? body.files : [], bytes: Number(body.bytes) || 0, commit_sha: body.commit ? String(body.commit) : null, published_at: new Date().toISOString(), notes: notes || null, updated_at: new Date().toISOString() }
        : { status: "draft", notes: notes || null, updated_at: new Date().toISOString() }).eq("id", p.build_site_id);
    }
    await db.from("project_events").insert({
      project_id: p.id, kind: "note",
      note: status === "built" ? `Mockup built automatically: ${url} — review it, then send "Mockup ready"` : `Automatic mockup build failed — ${notes.slice(0, 200) || "see build log"}`,
      data: { auto_build: true, status, commit: body.commit ?? null },
    });
    return json({ ok: true });
  }
  return new Response("method not allowed", { status: 405 });
});

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }); }
function slugify(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mockup"; }
function rand(n: number) { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function timingSafeEqual(a: string, b: string) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
