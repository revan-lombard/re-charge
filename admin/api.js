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
      async searchNotes(q) {
        return ok(await supa.from("project_events").select("project_id, note").eq("kind", "note").ilike("note", `%${q}%`).limit(100));
      },
    },
    payments: {
      async list() { return ok(await supa.from("payments").select("*").order("created_at", { ascending: false }).limit(1000)); },
      async match(id, projectId) { return ok(await supa.from("payments").update({ project_id: projectId, matched: true }).eq("id", id).select("*").single()); },
    },
    clients: {
      async list() { return ok(await supa.from("clients").select("*").order("name")); },
    },
    spam: {
      async add(email) { return ok(await supa.from("spam_senders").upsert({ email: email.toLowerCase() }).select()); },
    },
  };
}
