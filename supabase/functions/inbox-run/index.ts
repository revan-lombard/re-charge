// inbox-run — the Inbox Assistant at work. Every 10 minutes (pg_cron, 0027), for each active
// inbox:
//   1. measure: drafts we made earlier that are no longer drafts were either sent (compare what
//      went out with what we drafted) or discarded. That's what the trial and the monthly
//      report are judged on.
//   2. draft: new customer emails get a reply drafted from the client's own facts, saved as a
//      draft in the same thread of their inbox (Microsoft 365; Gmail too), and the email gets the
//      "AI draft ready" label. Anything the AI can't know is left as a [gap] for the person checking it.
// Nothing is ever sent from here.
//
// The drafts are written on Re-Charge's own AI computer (_shared/draft_reply.ts), about 10 to 30
// seconds each, so a run makes a few per inbox and the rest wait for the next one. While the PC is
// off, measuring still runs and drafting waits: nothing is lost, the emails are picked up later.
//
// POST {}                       (cron; at most once every 8 minutes)
// POST { accountId }            (staff: run one inbox now)
import { writeReply } from "../_shared/draft_reply.ts";
import { AiOffline } from "../_shared/ai.ts";
import { preflight, json, serveCors } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { encrypt, decrypt } from "../_shared/crypto.ts";
import { ReconnectNeeded, similarity } from "../_shared/gmail.ts";
import { providerFor, type Provider } from "../_shared/inbox_providers.ts";

const BUDGET_MS = 60_000;          // stop starting new drafts after this (one can take up to 60 s more); the rest wait 10 minutes
const PER_INBOX = 4;               // new drafts per inbox per run
const EXPIRE_DAYS = 7;             // a draft nobody touched for a week counts as not used

type Account = { id: string; business: string; provider: string | null; email: string | null; knowledge: string; signoff: string; label_id: string | null; trial_started_at: string | null };
serveCors(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as { accountId?: string };
  const db = serviceClient();
  let only = "";
  if (body.accountId) {
    const caller = await getCaller(req);
    if (!caller?.isStaff) return json({ ok: false, error: "staff only" }, 403);
    only = String(body.accountId);
  } else {
    // cron (or anyone): throttled, so calling it more often can't flood the AI computer
    const { data } = await db.from("settings").select("value").eq("key", "inbox_run").maybeSingle();
    const at = (data?.value as { at?: string } | null)?.at;
    if (at && Date.now() - Date.parse(at) < 8 * 60000) return json({ ok: true, skipped: "ran recently" });
    await db.from("settings").upsert({ key: "inbox_run", value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  }

  let q = db.from("inbox_accounts").select("id, business, provider, email, knowledge, signoff, label_id, trial_started_at").order("last_run_at", { ascending: true, nullsFirst: true });
  // trial pages (provider 'page') have no inbox to check
  q = (only ? q.eq("id", only) : q.eq("status", "active")).in("provider", ["gmail", "outlook"]);
  const { data: accounts } = await q;
  const started = Date.now();
  const summary: Record<string, unknown>[] = [];
  for (const acc of (accounts || []) as Account[]) {
    const r = { id: acc.id, business: acc.business, measured: 0, drafted: 0, skipped: 0, offline: false, error: "" };
    try {
      const mail = await providerFor(acc, async (id) => { await db.from("inbox_accounts").update({ label_id: id }).eq("id", acc.id); });
      r.measured = await measure(db, mail, acc);
      if (Date.now() - started < BUDGET_MS) {
        const n = await draftNew(db, mail, acc, started);
        r.drafted = n.drafted; r.skipped = n.skipped; r.offline = n.offline;
      }
      await db.from("inbox_accounts").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("id", acc.id);
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
      console.error(`inbox-run ${acc.business}:`, r.error);
      await db.from("inbox_accounts").update({
        last_run_at: new Date().toISOString(), last_error: r.error.slice(0, 300),
        ...(e instanceof ReconnectNeeded ? { status: "error" } : {}),
      }).eq("id", acc.id);
    }
    summary.push(r);
  }
  return json({ ok: true, inboxes: summary });
});

// ---------- 1. what happened to earlier drafts ----------
// Only drafts this function put in their inbox. Replies made on their page (a page account that
// later connected Microsoft 365) have no draft_id: they're measured by the taps on the page, and
// asking the mailbox about a null id fails the whole run.
// deno-lint-ignore no-explicit-any
async function measure(db: any, mail: Provider, acc: Account): Promise<number> {
  const { data: open } = await db.from("inbox_drafts").select("id, thread_id, draft_id, draft_text, created_at")
    .eq("account_id", acc.id).eq("status", "drafted").not("draft_id", "is", null).order("created_at", { ascending: true }).limit(20);
  let n = 0;
  for (const d of open || []) {
    const at = Date.parse(d.created_at);
    if (Date.now() - at < 5 * 60000) continue;
    if (await mail.draftOpen(d.draft_id)) {
      if (Date.now() - at > EXPIRE_DAYS * 864e5) {
        await db.from("inbox_drafts").update({ status: "expired", draft_text: null, resolved_at: new Date().toISOString() }).eq("id", d.id); n++;
      }
      continue;
    }
    // The draft is gone: was a reply sent in the thread after we drafted it?
    const sent = await mail.sentAfter(d.thread_id, at);
    const patch: Record<string, unknown> = { draft_text: null, resolved_at: new Date().toISOString() };
    if (sent !== null) {
      const draft = d.draft_text ? await decrypt(d.draft_text).catch(() => "") : "";
      patch.status = "sent";
      patch.similarity = draft ? similarity(draft, sent) : null;
    } else {
      patch.status = "discarded";
    }
    await db.from("inbox_drafts").update(patch).eq("id", d.id); n++;
  }
  return n;
}

// ---------- 2. draft replies to new customer emails ----------
// deno-lint-ignore no-explicit-any
async function draftNew(db: any, mail: Provider, acc: Account, started: number) {
  let drafted = 0, skipped = 0, offline = false;
  const since = acc.trial_started_at ? Date.parse(acc.trial_started_at) - 864e5 : 0;   // a day before connecting, at most
  const list = await mail.listNew(since);
  const ids = list.map((m) => m.id);
  if (!ids.length) return { drafted, skipped, offline };
  const { data: seen } = await db.from("inbox_drafts").select("message_id").eq("account_id", acc.id).in("message_id", ids);
  const done = new Set((seen || []).map((s: { message_id: string }) => s.message_id));
  const fresh = list.filter((m) => !done.has(m.id)).reverse();   // oldest first
  const skip = async (m: { id: string; threadId: string }, reason: string, gist = "") => {
    await db.from("inbox_drafts").upsert({ account_id: acc.id, message_id: m.id, thread_id: m.threadId, status: "skipped", reason, gist: gist || null }, { onConflict: "account_id,message_id" });
    skipped++;
  };

  for (const ref of fresh) {
    if (drafted >= PER_INBOX || Date.now() - started > BUDGET_MS) break;
    const m = await mail.read(ref.id);
    if (m.skip) { await skip(ref, m.skip); continue; }
    // Only the latest message in a thread nobody has answered, and with no draft already in it.
    const state = await mail.threadState(m);
    if (state === "draft") { await skip(ref, "a draft already exists"); continue; }
    if (state === "answered") { await skip(ref, "already answered"); continue; }

    const text = m.text.slice(0, 8000);
    if (text.length < 5) { await skip(ref, "no text"); continue; }
    let out;
    try { out = await writeReply(acc, { from: m.from, subject: m.subject, text }, "inbox-auto-draft"); }
    catch (e) {
      // The PC is off: stop, and the next run picks these up. A bad answer: leave this one for the next run too.
      if (e instanceof AiOffline) { offline = true; break; }
      console.error(`inbox-run ${acc.business}: draft failed`, (e as Error).message);
      continue;
    }
    if ("skip" in out) { await skip(ref, out.skip, out.gist); continue; }
    const d = out.draft;

    const draftId = await mail.draft(m, d.reply.trim());
    await mail.label(m).catch((e) => console.error("label failed", e));
    await db.from("inbox_drafts").upsert({
      account_id: acc.id, message_id: ref.id, thread_id: ref.threadId, draft_id: draftId, status: "drafted",
      gist: (d.gist || "").slice(0, 300), checks: (d.check || []).slice(0, 5).map(String), draft_text: await encrypt(d.reply.trim()),
    }, { onConflict: "account_id,message_id" });
    drafted++;
  }
  return { drafted, skipped, offline };
}
