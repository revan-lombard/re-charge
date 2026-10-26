// What the Inbox Assistant learns from (0037): real replies the business sent, kept encrypted, the
// newest few given to the next draft as examples of how they write (_shared/draft_reply.ts).
import { encrypt, decrypt } from "./crypto.ts";

export type Example = { gist: string; reply: string };
const KEEP = 20;            // per business
const USE = 3;              // in each draft
export const EXAMPLE_MAX = 800;   // characters of one example in a draft

// deno-lint-ignore no-explicit-any
export async function saveExample(db: any, accountId: string, ex: { reply: string; gist?: string | null; source: "approved" | "own" | "sent"; draftId?: string | null }): Promise<void> {
  const reply = String(ex.reply || "").trim().slice(0, 4000);
  if (reply.length < 20) return;   // nothing worth learning from
  try {
    // a reply taught twice (a tap, then a paste) keeps only the newest
    if (ex.draftId) await db.from("inbox_examples").delete().eq("account_id", accountId).eq("draft_id", ex.draftId);
    await db.from("inbox_examples").insert({ account_id: accountId, draft_id: ex.draftId || null, source: ex.source, gist: (ex.gist || "").slice(0, 300) || null, reply_enc: await encrypt(reply) });
    const { data: old } = await db.from("inbox_examples").select("id").eq("account_id", accountId).order("created_at", { ascending: false }).range(KEEP, KEEP + 50);
    if (old?.length) await db.from("inbox_examples").delete().in("id", old.map((o: { id: string }) => o.id));
  } catch (e) { console.error("inbox example not saved", (e as Error).message); }   // learning must never break a reply
}

// The newest few, decrypted; [] if there are none or they can't be read
// deno-lint-ignore no-explicit-any
export async function loadExamples(db: any, accountId: string): Promise<Example[]> {
  try {
    const { data } = await db.from("inbox_examples").select("gist, reply_enc").eq("account_id", accountId).order("created_at", { ascending: false }).limit(USE);
    const out: Example[] = [];
    for (const r of data || []) { try { out.push({ gist: r.gist || "", reply: (await decrypt(r.reply_enc)).slice(0, EXAMPLE_MAX) }); } catch { /* skip one that can't be read */ } }
    return out;
  } catch { return []; }
}
