// The current limited offer (Settings → Limited offer in the panel): a % off
// the first year of Care for the first N clients, with the
// real number of spots left: a spot is taken when a lead on the offer pays its
// deposit. The offer switches itself off when it's full or past its end date.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type Offer = { active: boolean; code: string; name: string; total: number; taken: number; left: number; ends: string; discount: number };

export async function offerStatus(db: SupabaseClient): Promise<Offer> {
  const { data } = await db.from("settings").select("value").eq("key", "offer").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const code = typeof v.code === "string" && /^[a-z0-9-]{2,40}$/.test(v.code) ? v.code : "founding";
  const total = Math.max(0, Math.min(1000, Math.round(Number(v.total) || 0)));
  const ends = typeof v.ends === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.ends) ? v.ends : "";
  // % off the first year of Care (50 = R450 instead of R900)
  const discount = Math.max(5, Math.min(100, Math.round(Number(v.discount) || 50)));
  const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("details->>offer", code).eq("deposit_paid", true);
  const taken = count ?? 0, left = Math.max(0, total - taken);
  const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);   // SAST
  return { active: v.active === true && total > 0 && left > 0 && (!ends || ends >= today), code, name: typeof v.name === "string" && v.name ? v.name.slice(0, 40) : `Founding ${total}`, total, taken, left, ends, discount };
}
