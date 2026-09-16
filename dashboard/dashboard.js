// Re-Charge analytics dashboard. Reads cached GA4 + Search Console metrics from
// Supabase (RLS scopes each user to their own client). Untested end-to-end —
// deploy the backend, set SUPABASE_URL/ANON_KEY in config.js, then verify.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CFG = window.RECHARGE_CONFIG || {};
const FN = CFG.SUPABASE_URL ? `${CFG.SUPABASE_URL}/functions/v1` : "";
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString("en-ZA");
const money = (n) => "R" + fmt(n);

if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  $("bootMsg").textContent = "Dashboard not configured yet — set SUPABASE_URL and SUPABASE_ANON_KEY in config.js.";
} else {
  boot();
}

async function boot() {
  const supa = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  let clientId = null;
  let range = "30d";

  const { data: { session } } = await supa.auth.getSession();
  render(session);
  supa.auth.onAuthStateChange((_e, s) => render(s));

  // sign in (magic link)
  $("signInForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("signInEmail").value.trim();
    const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
    const msg = $("signInMsg");
    msg.hidden = false;
    msg.textContent = error ? ("Could not send link: " + error.message) : "Check your email for the sign-in link.";
  });
  $("signOut").addEventListener("click", async () => { await supa.auth.signOut(); location.reload(); });

  $("rangeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $("rangeSeg").querySelectorAll("button").forEach((x) => x.classList.remove("is-active"));
    b.classList.add("is-active"); range = b.dataset.r; loadData();
  });

  $("connectBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    const token = (await supa.auth.getSession()).data.session?.access_token;
    const r = await fetch(`${FN}/google-oauth-start`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const j = await r.json();
    if (j.url) location.href = j.url; else alert(j.error || "Could not start Google connect");
  });

  $("saveProps").addEventListener("click", async () => {
    const token = (await supa.auth.getSession()).data.session?.access_token;
    await fetch(`${FN}/analytics-properties`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ga4: $("ga4Select").value, gsc: $("gscSelect").value }),
    });
    alert("Saved. Analytics will populate after the next sync (or trigger analytics-sync).");
  });

  async function render(session) {
    $("bootMsg").hidden = true;
    const signedIn = Boolean(session);
    $("viewSignedOut").hidden = signedIn;
    $("viewApp").hidden = !signedIn;
    $("signOut").hidden = !signedIn;
    if (!signedIn) return;

    $("whoami").hidden = false;
    $("whoami").textContent = session.user.email;

    // resolve which client this user belongs to
    const { data: mem } = await supa.from("client_users").select("client_id, clients(name)").limit(1);
    if (mem && mem.length) {
      clientId = mem[0].client_id;
      $("clientName").textContent = mem[0].clients?.name || "Analytics";
    } else {
      // staff with no membership: fall back to the Re-Charge client
      const { data: rc } = await supa.from("clients").select("id, name").eq("slug", "re-charge").maybeSingle();
      if (rc) { clientId = rc.id; $("clientName").textContent = rc.name; }
    }
    if (!clientId) { $("bootMsg").hidden = false; $("bootMsg").textContent = "Your account isn't linked to a client yet."; return; }

    if (new URLSearchParams(location.search).get("connected") === "1") await loadProperties();
    await loadData();
  }

  async function loadProperties() {
    const token = (await supa.auth.getSession()).data.session?.access_token;
    const r = await fetch(`${FN}/analytics-properties?clientId=${encodeURIComponent(clientId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ga4 && !j.gsc) return;
    $("connectPanel").hidden = false;
    $("propertyPicker").hidden = false;
    fillSelect($("ga4Select"), j.ga4 || []);
    fillSelect($("gscSelect"), j.gsc || []);
  }
  function fillSelect(sel, items) {
    sel.innerHTML = '<option value="">— none —</option>' +
      items.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.display)}</option>`).join("");
  }

  async function loadData() {
    if (!clientId) return;
    const { data } = await supa.from("analytics_cache").select("kind, payload, fetched_at").eq("client_id", clientId).eq("range", range);
    const ga4 = data?.find((d) => d.kind === "ga4")?.payload;
    const gsc = data?.find((d) => d.kind === "gsc")?.payload;
    const fetched = data?.[0]?.fetched_at;
    if (!ga4 && !gsc) { $("noData").hidden = false; $("connectPanel").hidden = false; } else { $("noData").hidden = true; }
    renderTiles(ga4, gsc);
    renderTraffic(ga4);
    renderQueries(gsc);
    renderBars($("pages"), (ga4?.pages || []).map((p) => ({ label: p.path, value: p.views })), fmt);
    renderBars($("events"), (ga4?.events || []).map((e) => ({ label: e.name, value: e.count })), fmt);
    $("fetchedAt").textContent = fetched ? "Last updated " + new Date(fetched).toLocaleString("en-ZA") : "";
  }

  function renderTiles(ga4, gsc) {
    const o = ga4?.overview || {}; const t = gsc?.totals || {};
    const convRate = o.sessions ? ((o.conversions || 0) / o.sessions * 100) : 0;
    const tiles = [
      ["Users", fmt(o.users)], ["Sessions", fmt(o.sessions)],
      ["Search clicks", fmt(t.clicks)], ["Search impressions", fmt(t.impressions)],
      ["Conversions", fmt(o.conversions)], ["Conversion rate", convRate.toFixed(1) + "%"],
    ];
    $("tiles").innerHTML = tiles.map(([k, v]) => `<div class="dash__tile"><span>${k}</span><b>${v}</b></div>`).join("");
  }
  function renderTraffic(ga4) {
    const trend = ga4?.trend || [];
    const max = Math.max(1, ...trend.map((d) => d.sessions));
    $("trafficChart").innerHTML = trend.map((d) =>
      `<div class="col"><div class="bar" style="height:${Math.round(d.sessions / max * 100)}%" title="${d.date}: ${fmt(d.sessions)}"></div></div>`).join("");
    renderBars($("sources"), (ga4?.sources || []).map((s) => ({ label: s.label, value: s.sessions })), fmt);
  }
  function renderQueries(gsc) {
    const body = $("queries").querySelector("tbody");
    body.innerHTML = (gsc?.queries || []).map((q) =>
      `<tr><td>${escapeHtml(q.key)}</td><td>${fmt(q.clicks)}</td><td>${fmt(q.impressions)}</td><td>${(q.ctr * 100).toFixed(1)}%</td><td>${q.position.toFixed(1)}</td></tr>`).join("")
      || '<tr><td colspan="5" class="muted">No search data.</td></tr>';
  }
  function renderBars(ul, items, f) {
    const max = Math.max(1, ...items.map((i) => i.value));
    ul.innerHTML = items.map((i) =>
      `<li><span class="dash__bar-label">${escapeHtml(i.label || "—")}</span><span class="dash__bar-track"><span class="dash__bar-fill" style="width:${Math.round(i.value / max * 100)}%"></span></span><b>${f(i.value)}</b></li>`).join("")
      || '<li class="muted">No data.</li>';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
}
