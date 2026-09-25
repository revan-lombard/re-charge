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
          options: { emailRedirectTo: location.origin + "/admin/", shouldCreateUser: true },
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
    },
    events: {
      async list(projectId) {
        return ok(await supa.from("project_events").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(500));
      },
      async insert(projectId, kind, note, data = {}) {
        return ok(await supa.from("project_events").insert({ project_id: projectId, kind, note, data }).select("*").single());
      },
      async recent(limit = 25) {
        return ok(await supa.from("project_events").select("*, projects(ref, business, name)").order("created_at", { ascending: false }).limit(limit));
      },
      async byKind(kind) { return ok(await supa.from("project_events").select("project_id, note, data, created_at").eq("kind", kind).limit(5000)); },
      async searchNotes(q) {
        return ok(await supa.from("project_events").select("project_id, note").eq("kind", "note").ilike("note", `%${q}%`).limit(100));
      },
    },
    payments: {
      async list() { return ok(await supa.from("payments").select("*").order("paid_at", { ascending: false }).limit(2000)); },
      async match(id, projectId) { return ok(await supa.from("payments").update({ project_id: projectId, matched: true }).eq("id", id).select("*").single()); },
      async insert(row) { return ok(await supa.from("payments").insert(row).select("*").single()); },
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
      async recent(sinceIso) { return ok(await supa.from("messages").select("id, kind, status, project_id, created_at").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(1000)); },
      async insert(row) { return ok(await supa.from("messages").insert(row).select("*").single()); },
    },
    settings: {
      async get(key) { const r = ok(await supa.from("settings").select("value").eq("key", key).maybeSingle()); return r?.value ?? null; },
      async set(key, value) { return ok(await supa.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }).select("value").single()); },
    },
    // Staff-only Edge Function calls (the user's JWT goes along; the function checks `staff`).
    async sendEmail(payload) { return callFn("send-message", payload); },
    async requestPayment(payload) { return callFn("create-yoco-checkout", payload); },
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
