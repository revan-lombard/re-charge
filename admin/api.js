// Data layer for the admin panel: a thin, typed-by-convention wrapper over
// supabase-js. Every call runs as the signed-in user through Row-Level
// Security — the browser only ever holds the public anon key + the user's JWT.
// supabase-js is served from our own files (admin/vendor, pinned at 2.45.4), not fetched from a
// CDN at run time, so nothing outside this repo runs inside the signed-in panel.
const SUPABASE_JS = "/admin/vendor/supabase-2.45.4.js";
function loadSupabase() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SUPABASE_JS; s.async = true;
    s.onload = () => (window.supabase && window.supabase.createClient ? resolve(window.supabase) : reject(new Error("The database library didn't load. Refresh the page.")));
    s.onerror = () => reject(new Error("The database library didn't load. Check your connection and refresh."));
    document.head.appendChild(s);
  });
}

// details keys written by the server (trial-pay, the payment webhooks, sales-desk): see projects.update
const SERVER_KEYS = ["trialResult", "trialResultAt", "trialTermsAt", "trialTermsBy", "trialPayMethod", "trialEftNotifiedAt", "refundRequestedAt", "refundReason", "keepRequestedAt", "keepPaidAt", "salesDesk"];
export async function createApi(cfg) {
  const { createClient } = await loadSupabase();
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
        // Most panel saves send the whole details object from the panel's copy, which can be minutes old.
        // The keys the server writes (the trial page, payments, the Sales desk) are always taken as they are
        // in the database now, so an old copy can't undo a payment or a client's choice. The panel changes
        // those keys only through mergeDetails.
        if (patch && patch.details) {
          const cur = ok(await supa.from("projects").select("details").eq("id", id).single());
          const now = cur?.details || {}, det = { ...patch.details };
          for (const k of SERVER_KEYS) { if (k in now) det[k] = now[k]; else delete det[k]; }
          patch = { ...patch, details: det };
        }
        return ok(await supa.from("projects").update(patch).eq("id", id).select("*").single());
      },
      // Only these details keys (null removes one), merged in the database in one step (0040), so a stale copy
      // in the panel never writes over what the trial page or a payment changed meanwhile
      async mergeDetails(id, patch) {
        const r = await supa.rpc("merge_project_details", { p_id: id, p_patch: patch });
        if (r.error && !/merge_project_details|function/i.test(r.error.message)) throw new Error(r.error.message);
        if (r.error) {   // before database update 0040: read it fresh, then write (a much smaller window)
          const cur = ok(await supa.from("projects").select("details").eq("id", id).single());
          const det = { ...(cur?.details || {}), ...patch }; for (const k of Object.keys(patch)) if (patch[k] === null) delete det[k];
          return ok(await supa.from("projects").update({ details: det }).eq("id", id).select("*").single());
        }
        return ok(await supa.from("projects").select("*").eq("id", id).single());
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
    // Call recordings (0033): transcribed and summarised on the office PC (hub/worker.py)
    calls: {
      async list(projectId) { let q = supa.from("calls").select("*").order("created_at", { ascending: false }).limit(50); if (projectId) q = q.eq("project_id", projectId); return ok(await q); },
      async create(row) { return ok(await supa.from("calls").insert(row).select("*").single()); },
      async retry(id) { return ok(await supa.from("calls").update({ status: "queued", error: null }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("calls").delete().eq("id", id)); },
      async upload(blob, name) { const ext = ((name || "").split(".").pop() || "webm").toLowerCase().replace(/[^a-z0-9]/g, "") || "webm"; const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`; ok(await supa.storage.from("calls").upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false })); return path; },
      async audioUrl(path) { return ok(await supa.storage.from("calls").createSignedUrl(path, 3600)).signedUrl; },
      async removeAudio(path) { return ok(await supa.storage.from("calls").remove([path])); },
    },
    // Costs (0032): bills the business pays, read by AI from a PDF, photo or text
    expenses: {
      async list() { return ok(await supa.from("expenses").select("*").order("spent_on", { ascending: false }).limit(1000)); },
      async insert(row) { return ok(await supa.from("expenses").insert(row).select("*").single()); },
      async remove(id) { return ok(await supa.from("expenses").delete().eq("id", id)); },
    },
    docs: {   // the private "documents" bucket: invoices and payment proofs
      async upload(file) { const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, ""); const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`; ok(await supa.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false })); return path; },
      async url(path) { return ok(await supa.storage.from("documents").createSignedUrl(path, 600)).signedUrl; },
      async remove(path) { return ok(await supa.storage.from("documents").remove([path])); },
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
      // Assistants (0024). kind 'demo' is built for a prospect from public information;
      // kind 'live' is the same row once they're paying, tied to the client it belongs to.
      async forProject(projectId) { return ok(await supa.from("assistant_demos").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle()); },
      async forClient(clientId) { return ok(await supa.from("assistant_demos").select("*").eq("client_id", clientId).order("created_at", { ascending: false })) || []; },
      async upsert(row) {
        const live = { kind: row.kind || "demo", client_id: row.client_id || null };
        if (row.id) return ok(await supa.from("assistant_demos").update({ business: row.business, knowledge: row.knowledge, ...live, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single());
        return ok(await supa.from("assistant_demos").insert({ slug: row.slug, business: row.business, knowledge: row.knowledge, project_id: row.project_id || null, ...live }).select("*").single());
      },
    },
    // Live demos (0029): a public example page per prospect, built by the AI from what you enter.
    liveDemos: {
      async forProject(projectId) { return ok(await supa.from("live_demos").select("*").eq("project_id", projectId).order("created_at", { ascending: false })) || []; },
      async create(row) { return ok(await supa.from("live_demos").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("live_demos").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()); },
      async remove(id) { return ok(await supa.from("live_demos").delete().eq("id", id)); },
    },
    inbox: {
      async list() { return ok(await supa.from("inbox_accounts").select("*").order("created_at", { ascending: false }).limit(200)); },
      async allDrafts(sinceIso) { return ok(await supa.from("inbox_drafts").select("account_id, status, similarity, created_at").gte("created_at", sinceIso).limit(5000)); },
      async forProject(projectId) { return ok(await supa.from("inbox_accounts").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle()); },
      async create(row) { return ok(await supa.from("inbox_accounts").insert(row).select("*").single()); },
      async update(id, patch) { return ok(await supa.from("inbox_accounts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()); },
      // What it learns from (0037): how many of their replies it keeps, and forgetting them
      async examples(accountId) { const r = await supa.from("inbox_examples").select("id", { count: "exact", head: true }).eq("account_id", accountId); if (r.error) return null; return r.count ?? 0; },
      async forgetExamples(accountId) { return ok(await supa.from("inbox_examples").delete().eq("account_id", accountId)); },
      // The page, its replies and any stored Microsoft access go together (on delete cascade, 0027)
      async remove(id) { const rows = ok(await supa.from("inbox_accounts").delete().eq("id", id).select("id")); if (!rows?.length) throw new Error("Nothing was deleted: check you're signed in as staff"); return null; },
      async drafts(accountId, sinceIso, untilIso, max = 500) { let q = supa.from("inbox_drafts").select("id, status, reason, gist, checks, similarity, created_at, resolved_at").eq("account_id", accountId).gte("created_at", sinceIso); if (untilIso) q = q.lt("created_at", untilIso); return ok(await q.order("created_at", { ascending: false }).limit(max)) || []; },
    },
    usage: {
      // What the assistants handled, per day (0025). Summed here so the panel shows the
      // same numbers the client's monthly report does.
      async since(scopes, sinceDay) {
        if (!scopes.length) return { convos: 0, questions: 0, afterHours: 0, days: 0 };
        const rows = ok(await supa.from("assistant_usage").select("convos, questions, after_hours, day").in("scope", scopes).gte("day", sinceDay)) || [];
        return rows.reduce((a, r) => ({ convos: a.convos + (r.convos || 0), questions: a.questions + (r.questions || 0), afterHours: a.afterHours + (r.after_hours || 0), days: a.days + 1 }), { convos: 0, questions: 0, afterHours: 0, days: 0 });
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
    // The home AI hub (0031): status | sort { text, source } | resort { projectId }
    async aiHub(action, payload = {}) { return callFn("ai-hub", { action, ...payload }); },
    // Facebook Page posting (0030): status | connect | disconnect | publish { postId }
    async facebook(action, payload = {}) { const r = await callFn("facebook-post", { action, ...payload }); if (r && r.ok === false) throw new Error(r.error || "Facebook error"); return r; },
    // phone alerts (Web Push): key | subscribe | unsubscribe | list | test
    async push(action, payload = {}) { return callFn("notify-push", { action, ...payload }); },
    async requestPayment(payload) { return callFn("create-yoco-checkout", payload); },
    async paystackLink(clientId) { return callFn("paystack-link", { clientId }); },
    // Inbox Assistant (0027): the Google consent link for one inbox, and "run it now".
    async inboxConnect(accountId, provider) { return callFn("inbox-connect", { accountId, provider }); },
    async inboxRun(accountId) { return callFn("inbox-run", { accountId }); },
    // The AI computer writes the next items for one live demo (restart: from the first); the panel calls
    // it until done: { ok, done, have, total }.
    // The Sales desk (ADMIN.md 8dh): research a prospect, write its first message, or record what you did with it
    async salesDesk(projectId, action, channel, extra = {}) { return callFn("sales-desk", { projectId, action, channel, ...extra }); },
    async liveDemoBuild(id, restart, run) { return callFn("live-demo", { build: { id, restart: Boolean(restart), run } }); },
    async publishSite(payload) { return callFn("publish-site", payload); },
    async buildSync(payload) { return callFn("build-sync", payload); },
    async checkSites() { return callFn("site-monitor", { force: true }); },
    async wins(clientId, kind, dryRun) { return callFn("weekly-wins", { clientId, kind, dryRun: Boolean(dryRun) }); },
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
