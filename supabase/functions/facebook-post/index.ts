// facebook-post — post to the Re-Charge Facebook Page from the admin panel (ADMIN.md 8cp).
//
// POST { action } from the panel (staff only):
//   status      → { ok, ready, connected, page_name, connected_at }   ready = the Meta app secrets are set
//   connect     → { ok, url }   the Facebook "allow" link; Facebook sends you back to the GET below
//   disconnect  → { ok }
//   publish     { postId } → { ok, post_url }   post it now
// POST { action: "due" } from pg_cron every 5 minutes (no sign-in): publishes Facebook posts marked
//   auto_publish whose scheduled time has passed. It can only post what staff already scheduled.
// GET ?code=…&state=… : Facebook's redirect after "allow". Stores the Page token (encrypted).
//
// Secrets: FB_APP_ID, FB_APP_SECRET, TOKEN_ENCRYPTION_KEY (already set for the inbox), optional
// FB_PAGE_ID (which Page, if you manage more than one). Deploy with verify_jwt = false.
// Untested against the live Graph API — test once with "Post to Facebook now" after connecting.
import { preflight, json } from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/db.ts";
import { encrypt, decrypt, signState, verifyState } from "../_shared/crypto.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
const SCOPES = "pages_show_list,pages_manage_posts,pages_read_engagement";
const env = (k: string) => Deno.env.get(k) || "";
const selfUrl = () => `${env("SUPABASE_URL")}/functions/v1/facebook-post`;
const site = () => env("SITE_URL") || "https://re-charge.co.za";

async function fb<T = Record<string, unknown>>(path: string, params: Record<string, string>, method = "GET"): Promise<T> {
  const body = new URLSearchParams(params);
  const res = method === "GET" ? await fetch(`${GRAPH}${path}?${body}`) : await fetch(`${GRAPH}${path}`, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `Facebook said ${res.status}`);
  return data as T;
}

async function publish(db: ReturnType<typeof serviceClient>, postId: string) {
  const { data: post } = await db.from("posts").select("*").eq("id", postId).maybeSingle();
  if (!post) throw new Error("post not found");
  if (post.channel !== "facebook") throw new Error("This post isn't set to Facebook");
  if (post.fb_post_id) return { post_url: post.post_url };            // never post twice
  const text = String(post.publish_text || post.body || "").trim();
  if (!text) throw new Error("The post has no text yet. Open it and press Save first.");
  const { data: acc } = await db.from("social_accounts").select("page_id, token_enc").eq("platform", "facebook").maybeSingle();
  if (!acc) throw new Error("No Facebook Page connected (Settings → Facebook Page)");
  const token = await decrypt(acc.token_enc);
  let id = "";
  try {
    if (post.image_path) {
      // a photo post: Facebook fetches the image from a short-lived signed link; the link goes in the caption
      const { data: signed } = await db.storage.from("marketing").createSignedUrl(post.image_path, 600);
      if (!signed?.signedUrl) throw new Error("couldn't read the post image");
      const caption = post.publish_link && !text.includes(post.publish_link) ? `${text}\n\n${post.publish_link}` : text;
      const r = await fb<{ post_id?: string; id: string }>(`/${acc.page_id}/photos`, { url: signed.signedUrl, caption, access_token: token }, "POST");
      id = r.post_id || r.id;
    } else {
      const params: Record<string, string> = { message: text, access_token: token };
      if (post.publish_link) params.link = post.publish_link;
      id = (await fb<{ id: string }>(`/${acc.page_id}/feed`, params, "POST")).id;
    }
  } catch (e) {
    const msg = (e as Error).message;
    await db.from("posts").update({ publish_error: msg, updated_at: new Date().toISOString() }).eq("id", postId);
    if (/token|session|permission|OAuth/i.test(msg)) await db.from("social_accounts").update({ last_error: msg }).eq("platform", "facebook");
    throw e;
  }
  const post_url = `https://www.facebook.com/${id}`;
  await db.from("posts").update({ status: "posted", posted_at: new Date().toISOString(), fb_post_id: id, post_url, publish_error: null, updated_at: new Date().toISOString() }).eq("id", postId);
  return { post_url };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const db = serviceClient();

  // ---- Facebook sends the browser back here after "allow" ----
  if (req.method === "GET") {
    const u = new URL(req.url);
    const back = (ok: boolean, why = "") => Response.redirect(`${site()}/admin/#/settings?fb=${ok ? "connected" : "failed"}${why ? "&why=" + encodeURIComponent(why) : ""}`, 302);
    const code = u.searchParams.get("code"), state = u.searchParams.get("state");
    if (!code || !state) return back(false, "Facebook access wasn't allowed");
    const s = await verifyState(state);
    if (!s || s.fb !== 1 || (typeof s.exp === "number" && s.exp < Date.now())) return back(false, "The link expired. Try Connect again.");
    try {
      const short = await fb<{ access_token: string }>("/oauth/access_token", { client_id: env("FB_APP_ID"), client_secret: env("FB_APP_SECRET"), redirect_uri: selfUrl(), code });
      // a long-lived user token gives Page tokens that don't expire
      const long = await fb<{ access_token: string }>("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: env("FB_APP_ID"), client_secret: env("FB_APP_SECRET"), fb_exchange_token: short.access_token });
      const pages = await fb<{ data: { id: string; name: string; access_token: string; tasks?: string[] }[] }>("/me/accounts", { access_token: long.access_token, fields: "id,name,access_token,tasks", limit: "50" });
      const want = env("FB_PAGE_ID");
      const page = pages.data.find((p) => (want ? p.id === want : true) && (!p.tasks || p.tasks.includes("CREATE_CONTENT")));
      if (!page) return back(false, want ? "That account doesn't manage the Page in FB_PAGE_ID" : "No Page you can post to was shared. Tick your Page when Facebook asks.");
      await db.from("social_accounts").upsert({ platform: "facebook", page_id: page.id, page_name: page.name, token_enc: await encrypt(page.access_token), connected_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }, { onConflict: "platform" });
      return back(true);
    } catch (e) { console.error("facebook connect", e); return back(false, (e as Error).message.slice(0, 160)); }
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  // ---- the 5-minute run: due, auto-publish Facebook posts ----
  if (action === "due") {
    const { data: due } = await db.from("posts").select("id").eq("channel", "facebook").eq("status", "scheduled").eq("auto_publish", true)
      .is("fb_post_id", null).lte("scheduled_at", new Date().toISOString()).limit(5);
    const out: { id: string; ok: boolean; error?: string }[] = [];
    for (const p of due || []) {
      try { await publish(db, p.id); out.push({ id: p.id, ok: true }); }
      catch (e) {
        // stop retrying a broken post every 5 minutes: back to "drafted", with the reason on it
        await db.from("posts").update({ status: "drafted", auto_publish: false }).eq("id", p.id);
        out.push({ id: p.id, ok: false, error: (e as Error).message });
      }
    }
    return json({ ok: true, posted: out });
  }

  const caller = await getCaller(req);
  if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
  const ready = Boolean(env("FB_APP_ID") && env("FB_APP_SECRET") && env("TOKEN_ENCRYPTION_KEY"));

  if (action === "status") {
    const { data: acc } = await db.from("social_accounts").select("page_name, connected_at, last_error").eq("platform", "facebook").maybeSingle();
    return json({ ok: true, ready, connected: Boolean(acc), page_name: acc?.page_name || "", connected_at: acc?.connected_at || null, last_error: acc?.last_error || null });
  }
  if (action === "connect") {
    if (!ready) return json({ ok: false, error: "Facebook isn't set up yet: add FB_APP_ID and FB_APP_SECRET as Supabase secrets (ADMIN.md 8cp)." }, 503);
    const state = await signState({ fb: 1, by: caller.userId, exp: Date.now() + 30 * 60e3 });
    const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    u.search = new URLSearchParams({ client_id: env("FB_APP_ID"), redirect_uri: selfUrl(), state, scope: SCOPES, response_type: "code" }).toString();
    return json({ ok: true, url: u.toString() });
  }
  if (action === "disconnect") {
    await db.from("social_accounts").delete().eq("platform", "facebook");
    return json({ ok: true });
  }
  if (action === "publish") {
    try { return json({ ok: true, ...(await publish(db, String(body.postId || ""))) }); }
    catch (e) { return json({ ok: false, error: (e as Error).message }, 400); }
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
