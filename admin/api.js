// Data layer for the admin panel: a thin, typed-by-convention wrapper over
// supabase-js. Every call runs as the signed-in user through Row-Level
// Security — the browser only ever holds the public anon key + the user's JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export async function createApi(cfg) {
  const supa = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const ok = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };

  return {
    mock: false,
    auth: {
      async getSession() { return (await supa.auth.getSession()).data.session; },
      onChange(cb) { supa.auth.onAuthStateChange((_e, s) => cb(s)); },
      async signIn(email) {
        return ok(await supa.auth.signInWithOtp({
          email,
          // Staff accounts are created once (first sign-in) and then locked: no new users from this form.
          options: { emailRedirectTo: location.origin + "/admin/", shouldCreateUser: false },
        }));
      },
      async verifyCode(email, token) {
        return ok(await supa.auth.verifyOtp({ email, token: token.replace(/\D/g, ""), type: "email" }));
      },
      async signOut() { await supa.auth.signOut(); },
      async isStaff(userId) {
        const row = ok(await supa.from("staff").select("user_id").eq("user_id", userId).maybeSingle());
        return Boolean(row);
      },
    },
    projects: {
      async list() {
        return ok(await supa.from("projects").select("*").order("updated_at", { ascending: false }).limit(2000));
      },
      async get(id) { return ok(await supa.from("projects").select("*").eq("id", id).maybeSingle()); },
      async update(id, patch) {
        return ok(await supa.from("projects").update(patch).eq("id", id).select("*").single());
      },
      async insert(row) { return ok(await supa.from("projects").insert(row).select("*").single()); },
      async remove(id) { return ok(await supa.from("projects").delete().eq("id", id)); },
      async insertMany(rows) { return rows.length ? ok(await supa.from("projects").insert(rows).select("id, ref")) : []; },
    },
    events: {
      async list(projectId) {
        return ok(await supa.from("project_events").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(500));
      },
      async insert(projectId, kind, note, data = {}) {
        return ok(await supa.from("project_events").insert({ project_id: projectId, kind, note, data }).select("*").single());
      },
      async recent(limit = 25) {
        return ok(await supa.from("project_events").select("*, projects(ref, business, name, spam)").order("created_at", { ascending: false }).limit(limit));
      },
      async insertMany(rows) { return rows.length ? ok(await supa.from("project_events").insert(rows).select("id")) : []; },
      async byKind(kind) { return ok(await supa.from("project_events").select("project_id, note, data, created_at").eq("kind", kind).limit(5000)); },
      async searchNotes(q) {
        return ok(await supa.from("project_events").select("project_id, note").eq("kind", "note").ilike("note", `%${q}%`).limit(100));
      },
    },
    payments: {
      async list() { return ok(await supa.from("payments").select("*").order("paid_at", { ascending: false }).limit(2000)); },
      async match(id, projectId, clientId = null) { return ok(await supa.from("payments").update({ project_id: projectId || null, ...(clientId ? { client_id: clientId } : {}), matched: true }).eq("id", id).select("*").single()); },
      async insert(row) { return ok(await supa.from("payments").insert(row).select("*").single()); },
      async setKind(id, kind) { return ok(await supa.from("payments").update({ kind }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("payments").delete().eq("id", id)); },
    },
    requests: {
      async list() { return ok(await supa.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(500)); },
      async cancel(id) { return ok(await supa.from("payment_requests").update({ status: "cancelled" }).eq("id", id).select("*").single()); },
    },
    clients: {
      async list() { return ok(await supa.from("clients").select("*").order("name")); },
      async insert(row) { return ok(await supa.from("clients").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("clients").update(patch).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("clients").delete().eq("id", id)); },
    },
    spam: {
      async add(email) { return ok(await supa.from("spam_senders").upsert({ email: email.toLowerCase() }).select()); },
    },
    templates: {
      async list() { return ok(await supa.from("templates").select("*").order("kind").order("name")); },
      async insert(row) { return ok(await supa.from("templates").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("templates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("templates").delete().eq("id", id)); },
    },
    messages: {
      async list(projectId) { return ok(await supa.from("messages").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(200)); },
      async recent(sinceIso) { return ok(await supa.from("messages").select("id, kind, status, project_id, template_id, to_address, created_at").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(1000)); },
      async insert(row) { return ok(await supa.from("messages").insert(row).select("*").single()); },
    },
    campaigns: {
      async list() { return ok(await supa.from("campaigns").select("*").order("created_at", { ascending: false })); },
      async insert(row) { return ok(await supa.from("campaigns").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("campaigns").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("campaigns").delete().eq("id", id)); },
    },
    posts: {
      async list() { return ok(await supa.from("posts").select("*").order("created_at", { ascending: false }).limit(1000)); },
      async insert(row) { return ok(await supa.from("posts").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("posts").delete().eq("id", id)); },
    },
    sites: {
      async list() { return ok(await supa.from("sites").select("*").order("updated_at", { ascending: false })); },
      async insert(row) { return ok(await supa.from("sites").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("sites").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("sites").delete().eq("id", id)); },
    },
    storage: {
      async upload(file, folder = "posts") {
        const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${folder}/${crypto.randomUUID()}.${ext}`;
        ok(await supa.storage.from("marketing").upload(path, file, { contentType: file.type, upsert: false }));
        return path;
      },
      async url(path) { const d = ok(await supa.storage.from("marketing").createSignedUrl(path, 3600)); return d?.signedUrl || ""; },
      async copy(path) { const ext = path.split(".").pop(); const to = `posts/${crypto.randomUUID()}.${ext}`; ok(await supa.storage.from("marketing").copy(path, to)); return to; },
      async remove(path) { return ok(await supa.storage.from("marketing").remove([path])); },
    },
    demos: {
      // per-prospect demo assistants (0024)
      async forProject(projectId) { return ok(await supa.from("assistant_demos").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle()); },
      async upsert(row) {
        if (row.id) return ok(await supa.from("assistant_demos").update({ business: row.business, knowledge: row.knowledge, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single());
        return ok(await supa.from("assistant_demos").insert({ slug: row.slug, business: row.business, knowledge: row.knowledge, project_id: row.project_id || null }).select("*").single());
      },
    },
    analytics: {
      // what analytics-sync cached for a client (ranges 7d / 30d / 90d / 365d)
      async cached(clientId, range) { return ok(await supa.from("analytics_cache").select("kind, payload, fetched_at").eq("client_id", clientId).eq("range", range)) || []; },
    },
    content: {
      // private bucket (0022): what clients send from their quote page
      async url(path) { const d = ok(await supa.storage.from("client-content").createSignedUrl(path, 3600)); return d?.signedUrl || ""; },
    },
    branding: {
      // public bucket (0013): for images that must load inside emails
      async upload(blob, ext = "jpg") {
        const path = `signature/${crypto.randomUUID()}.${ext}`;
        ok(await supa.storage.from("branding").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false, cacheControl: "31536000" }));
        return supa.storage.from("branding").getPublicUrl(path).data.publicUrl;
      },
      async remove(url) { const m = String(url || "").match(/\/branding\/(.+)$/); if (m) ok(await supa.storage.from("branding").remove([decodeURIComponent(m[1])])); },
    },
    settings: {
      async get(key) { const r = ok(await supa.from("settings").select("value").eq("key", key).maybeSingle()); return r?.value ?? null; },
      async set(key, value) { return ok(await supa.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }).select("value").single()); },
    },
    // Staff-only Edge Function calls (the user's JWT goes along; the function checks `staff`).
    async sendEmail(payload) { return callFn("send-message", payload); },
    // phone alerts (Web Push): key | subscribe | unsubscribe | list | test
    async push(action, payload = {}) { return callFn("notify-push", { action, ...payload }); },
    async requestPayment(payload) { return callFn("create-yoco-checkout", payload); },
    async publishSite(payload) { return callFn("publish-site", payload); },
    async buildSync(payload) { return callFn("build-sync", payload); },
    async checkSites() { return callFn("site-monitor", { force: true }); },
    async report(clientId, dryRun) { return callFn("monthly-report", { clientId, dryRun: Boolean(dryRun) }); },
    async finder(action, config) { return callFn("finder", { action, config }); },
    monitors: {
      async list() { return ok(await supa.from("monitors").select("*").order("label")); },
      async history(url, sinceIso) { return ok(await supa.from("site_checks").select("checked_at, ok, ms, http, error").eq("url", url).gte("checked_at", sinceIso).order("checked_at", { ascending: true }).limit(2000)); },
    },
  };
  async function callFn(name, payload) {
    const token = (await supa.auth.getSession()).data.session?.access_token;
    const r = await fetch(`${cfg.SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `${name} failed (${r.status})`);
    return j;
  }
}
