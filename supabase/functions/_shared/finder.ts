// Prospect finder — the other direction of the GitHub bridge in buildqueue.ts.
//
//   panel ──config──► repo _build/finder/config.json   (areas, business types, how many)
//   Routine (weekly): research → encrypt with _build/finder/pubkey.pem → _build/finder/results/<date>.json
//   Supabase ◄──────── pullFinds: decrypt (private key in private_keys), skip known businesses, add prospects
//
// The repo is public, so finds are encrypted; the config holds nothing private.
import { b64, unb64, gh, putFile, deleteFile, BRANCH } from "./buildqueue.ts";

// deno-lint-ignore no-explicit-any
type DB = any;
const DIR = "_build/finder";
const pem = (label: string, der: ArrayBuffer) => `-----BEGIN ${label}-----\n${b64(new Uint8Array(der)).match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
const derOf = (p: string) => unb64(p.replace(/-----[A-Z ]+-----/g, ""));

// Illiondale / Edenvale and surrounds, and the kinds of business that most
// often have no website (from Revan's research list, Sept 2026).
export const DEFAULT_CONFIG = {
  areas: ["Illiondale", "Edenvale", "Eastleigh, Edenvale", "Eden Glen", "Sebenza", "De Klerkshof", "Isando", "Spartan, Kempton Park", "Greenstone Hill", "Dowerglen", "Bedfordview"],
  types: ["Hair salons, barbers, beauty & nail salons", "Plumbers, electricians, builders, painters, pool services", "Restaurants, takeaways, cafés, bars, bakeries, butcheries", "Crèches, nursery schools, tutors, dance & music studios", "Mechanics, panel beaters, tyre shops", "Engineering, steel fabrication, welding", "Hardware stores, building supplies, locksmiths, pest control", "Gyms, dentists, physiotherapists", "Accountants, attorneys, printing & signage", "Cleaning services, laundromats, tailors, upholstery, furniture", "Pet grooming, couriers, wholesalers", "Guesthouses, B&Bs, lodges, event venues", "Photographers, florists, décor & party hire, caterers", "Vets, optometrists, doctors, pharmacies, spas", "Estate agents, insurance brokers, security companies", "Solar installers, landscapers, garden services, car washes", "Boutiques, gift shops, cellphone & computer repairs"],
  perRun: 20,
};

export async function setup(db: DB): Promise<{ created: boolean }> {
  const { data } = await db.from("private_keys").select("name").eq("name", "finder").maybeSingle();
  if (data) return { created: false };
  const kp = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const priv = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", kp.publicKey));
  const { error } = await db.from("private_keys").insert({ name: "finder", pem: priv });
  if (error) throw new Error("could not store the finder key: " + error.message);
  await putFile(`${DIR}/pubkey.pem`, pub, "Prospect finder: public key (finds are encrypted with it)");
  return { created: true };
}

export async function writeConfig(cfg: { areas: string[]; types: string[]; perRun: number; enabled: boolean; nationwide?: boolean }) {
  const clean = {
    v: 1, enabled: cfg.enabled !== false, nationwide: cfg.nationwide === true,   // nationwide: scripts/finder.js adds towns across SA
    areas: cfg.areas.map((a) => String(a).trim().slice(0, 60)).filter(Boolean).slice(0, 30),
    types: cfg.types.map((t) => String(t).trim().slice(0, 120)).filter(Boolean).slice(0, 20),
    perRun: Math.min(40, Math.max(5, Math.round(Number(cfg.perRun) || 20))),
    updatedAt: new Date().toISOString(),
  };
  await putFile(`${DIR}/config.json`, JSON.stringify(clean, null, 2) + "\n", "Prospect finder: update what to look for");
  return clean;
}

async function decrypt(obj: Record<string, string>, privPem: string): Promise<string> {
  if (obj.alg !== "RSA-OAEP-256+A256GCM") throw new Error("unknown format");
  const priv = await crypto.subtle.importKey("pkcs8", derOf(privPem), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, priv, unb64(obj.key));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(obj.iv) }, aes, unb64(obj.data)));
}

const s = (v: unknown, n = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, n) : null; };
const digits = (p: unknown) => { let d = String(p ?? "").replace(/\D/g, ""); if (d.startsWith("0")) d = "27" + d.slice(1); return d; };
const bizKey = (b: unknown) => String(b ?? "").toLowerCase().replace(/\b(pty|ltd|cc|inc|incorporated|the)\b|[^a-z0-9]/g, "");
const host = (u: unknown) => String(u ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const POT = new Set(["very_high", "high", "medium", "low"]);

// 0–100: reviews count most (log scale, ~500 reviews = full marks), then a
// good rating, then signs of recent activity. Same formula as the panel's.
export function activityScore(reviews: number | null, rating: number | null, note: string | null, recent: boolean): number | null {
  if (reviews == null && rating == null && !note && !recent) return null;
  const r = reviews ? Math.min(1, Math.log10(reviews + 1) / Math.log10(501)) * 60 : 0;
  const q = rating != null && reviews ? Math.max(0, Math.min(1, (rating - 3) / 2)) * 20 * Math.min(1, reviews / 20) : 0;   // a 5.0 from 3 reviews counts little
  const a = recent ? 20 : note ? 8 : 0;
  return Math.round(Math.min(100, r + q + a));
}

const SOCIAL = /(^|\.|\/)(facebook\.com|fb\.com|instagram\.com)/i;
// only real Google Maps / Business Profile links
const googleUrl = (v: unknown) => { const u = typeof v === "string" ? v.trim().slice(0, 300) : ""; return /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|business\.google\.com|share\.google)/i.test(u) ? u : null; };

export async function pullFinds(db: DB): Promise<{ added: number; skipped: number; files: number; errors: string[] }> {
  const out = { added: 0, skipped: 0, files: 0, errors: [] as string[] };
  const list = await gh(`/contents/${DIR}/results?ref=${BRANCH}`);
  if (list.status === 404) return out;
  if (list.status !== 200) { out.errors.push(`GitHub ${list.status} listing finds`); return out; }
  const files = (list.body as { name: string; path: string; sha: string }[]).filter((f) => f.name.endsWith(".json"));
  if (!files.length) return out;
  const { data: key } = await db.from("private_keys").select("pem").eq("name", "finder").maybeSingle();
  if (!key) { out.errors.push("finder not set up yet"); return out; }
  const { data: known } = await db.from("projects").select("business, phone, email, website").limit(10000);
  const kb = new Set((known ?? []).map((p: Record<string, unknown>) => bizKey(p.business)).filter(Boolean));
  const kp = new Set((known ?? []).map((p: Record<string, unknown>) => digits(p.phone)).filter((d: string) => d.length >= 9));
  const ke = new Set((known ?? []).map((p: Record<string, unknown>) => String(p.email ?? "").toLowerCase()).filter(Boolean));
  const kh = new Set((known ?? []).map((p: Record<string, unknown>) => host(p.website)).filter(Boolean));

  for (const f of files) {
    try {
      const file = await gh(`/contents/${f.path}?ref=${BRANCH}`);
      const obj = JSON.parse(new TextDecoder().decode(unb64(file.body.content)));
      const payload = JSON.parse(await decrypt(obj, key.pem)) as { found?: Record<string, unknown>[]; searched?: string };
      const rows = [];
      for (const r of (payload.found ?? []).slice(0, 60)) {
        const business = s(r.business, 120); if (!business) continue;
        const phone = s(r.phone, 40), email = s(r.email, 120)?.toLowerCase() ?? null, website = s(r.website, 200);
        const dup = kb.has(bizKey(business)) || (phone && kp.has(digits(phone))) || (email && ke.has(email)) || (website && kh.has(host(website)));
        if (dup) { out.skipped++; continue; }
        kb.add(bizKey(business)); if (phone) kp.add(digits(phone)); if (email) ke.add(email); if (website) kh.add(host(website));
        const potential = POT.has(String(r.potential)) ? String(r.potential) : null;
        const reviews = Number.isFinite(Number(r.review_count)) && r.review_count !== null && r.review_count !== "" ? Math.max(0, Math.round(Number(r.review_count))) : null;
        const rating = Number.isFinite(Number(r.rating)) && r.rating !== null && r.rating !== "" ? Math.min(5, Math.max(0, Math.round(Number(r.rating) * 10) / 10)) : null;
        const activity = s(r.activity, 200);
        const notes = [s(r.website_note, 200), s(r.why, 300), r.source_url ? `Found via: ${s(r.source_url, 300)}` : null].filter(Boolean).join(" · ");
        rows.push({
          business, name: s(r.contact_name, 80), email, phone, location: s(r.location, 120),
          website: website ? (/^https?:\/\//i.test(website) ? website : "https://" + website) : null,
          // no website of their own? then the pitch is simply a website
          potential, potential_note: !website || SOCIAL.test(website) ? "A website" : s(r.opportunity, 160), goal: notes || null,
          review_count: reviews, rating, activity_note: activity, activity_score: activityScore(reviews, rating, activity, r.active_recently === true),
          source: "outreach", status: "prospect", category: ["Websites"],
          details: { formType: "Prospect finder", finderType: s(r.type, 80), sourceUrl: s(r.source_url, 300), ...(googleUrl(r.google_url) ? { googleUrl: googleUrl(r.google_url) } : {}) },
        });
      }
      if (rows.length) {
        const { data: ins, error } = await db.from("projects").insert(rows).select("id");
        if (error) throw error;
        await db.from("project_events").insert((ins ?? []).map((p: { id: string }) => ({ project_id: p.id, kind: "created", note: `Found by the prospect finder${payload.searched ? " (" + String(payload.searched).slice(0, 120) + ")" : ""}`, data: { finder: f.name } })));
        out.added += rows.length;
      }
      await deleteFile(f.path, f.sha, `Prospect finder: imported ${f.name}`);
      out.files++;
    } catch (e) { out.errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (out.files) await db.from("settings").upsert({ key: "finder_last", value: { at: new Date().toISOString(), added: out.added, skipped: out.skipped }, updated_at: new Date().toISOString() });
  return out;
}
