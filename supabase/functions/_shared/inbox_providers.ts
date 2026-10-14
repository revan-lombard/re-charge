// The Inbox Assistant talks to Gmail and Microsoft 365 through one small interface, so
// inbox-run doesn't care which one a client uses.
import {
  inboxToken, gmail, GmailError, type GMessage, header, bodyText, stripQuoted, skipFor, replyRaw, ensureLabel,
} from "./gmail.ts";
import { outlookToken, graph, GraphError, type OMessage, addr, q, CATEGORY } from "./outlook.ts";

export type InMsg = { id: string; threadId: string; from: string; subject: string; text: string; skip: string; received: number; raw?: unknown };
export interface Provider {
  listNew(sinceMs: number): Promise<{ id: string; threadId: string }[]>;   // newest first
  read(id: string): Promise<InMsg>;
  threadState(m: InMsg): Promise<"ok" | "draft" | "answered">;
  draft(m: InMsg, reply: string): Promise<string>;                       // the draft's id
  label(m: InMsg): Promise<void>;
  draftOpen(draftId: string): Promise<boolean>;                           // still an unsent draft?
  sentAfter(threadId: string, sinceMs: number): Promise<string | null>;  // what the person actually sent
}
type Acc = { id: string; provider?: string | null; email: string | null; label_id: string | null };

export async function providerFor(acc: Acc, saveLabel: (id: string) => Promise<void>): Promise<Provider> {
  return acc.provider === "outlook" ? outlookProvider(acc, await outlookToken(acc.id)) : gmailProvider(acc, await inboxToken(acc.id), saveLabel);
}

// ---------- Gmail ----------
function gmailProvider(acc: Acc, token: string, saveLabel: (id: string) => Promise<void>): Provider {
  return {
    async listNew(sinceMs) {
      const qs = `in:inbox -from:me newer_than:2d${sinceMs ? ` after:${Math.floor(sinceMs / 1000)}` : ""} -category:promotions -category:social -category:updates -category:forums`;
      const r = await gmail<{ messages?: { id: string; threadId: string }[] }>(token, `/messages?maxResults=25&q=${encodeURIComponent(qs)}`);
      return r.messages || [];
    },
    async read(id) {
      const m = await gmail<GMessage>(token, `/messages/${id}?format=full`);
      return { id, threadId: m.threadId, from: header(m, "From"), subject: header(m, "Subject"), text: bodyText(m.payload), received: Number(m.internalDate || 0),
        skip: skipFor(header(m, "From"), (n) => header(m, n), acc.email || "", m.labelIds || []), raw: m };
    },
    async threadState(m) {
      const t = await gmail<{ messages?: GMessage[] }>(token, `/threads/${m.threadId}?format=minimal`);
      const msgs = t.messages || [];
      if (msgs.some((x) => (x.labelIds || []).includes("DRAFT"))) return "draft";
      if (msgs.length && msgs[msgs.length - 1].id !== m.id) return "answered";
      return "ok";
    },
    async draft(m, reply) {
      const made = await gmail<{ id: string }>(token, "/drafts", { method: "POST", body: JSON.stringify({ message: { threadId: m.threadId, raw: replyRaw(m.raw as GMessage, acc.email || "", reply) } }) });
      return made.id;
    },
    async label(m) {
      if (!acc.label_id) { acc.label_id = await ensureLabel(token); await saveLabel(acc.label_id); }
      await gmail(token, `/messages/${m.id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [acc.label_id] }) });
    },
    async draftOpen(draftId) {
      try { await gmail(token, `/drafts/${draftId}?format=minimal`); return true; }
      catch (e) { if (e instanceof GmailError && e.status === 404) return false; throw e; }
    },
    async sentAfter(threadId, sinceMs) {
      const thread = await gmail<{ messages?: GMessage[] }>(token, `/threads/${threadId}?format=full`);
      const sent = (thread.messages || []).filter((x) => (x.labelIds || []).includes("SENT") && Number(x.internalDate || 0) >= sinceMs - 60000).pop();
      return sent ? stripQuoted(bodyText(sent.payload)) : null;
    },
  };
}

// ---------- Microsoft 365 / Outlook ----------
function outlookProvider(acc: Acc, token: string): Provider {
  const SEL = "id,conversationId,subject,from,replyTo,uniqueBody,body,internetMessageHeaders,isDraft,receivedDateTime,categories";
  return {
    async listNew(sinceMs) {
      const since = new Date(Math.max(sinceMs, Date.now() - 2 * 864e5)).toISOString();
      const r = await graph<{ value?: OMessage[] }>(token, `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$orderby=receivedDateTime desc&$top=25&$select=id,conversationId`);
      return (r.value || []).map((m) => ({ id: m.id, threadId: m.conversationId }));
    },
    async read(id) {
      const m = await graph<OMessage>(token, `/me/messages/${encodeURIComponent(id)}?$select=${SEL}`);
      const hs = m.internetMessageHeaders || [];
      const h = (n: string) => hs.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || "";
      const from = addr(m.from);
      return { id, threadId: m.conversationId, from, subject: m.subject || "", text: (m.uniqueBody?.content || m.body?.content || "").trim(),
        received: Date.parse(m.receivedDateTime || "") || 0, skip: m.isDraft ? "a draft" : skipFor(from, h, acc.email || ""), raw: m };
    },
    async threadState(m) {
      const r = await graph<{ value?: OMessage[] }>(token, `/me/messages?$filter=${encodeURIComponent(`conversationId eq '${q(m.threadId)}'`)}&$select=id,isDraft,receivedDateTime,sentDateTime&$top=50`);
      const all = r.value || [];
      if (all.some((x) => x.isDraft)) return "draft";
      const later = all.filter((x) => x.id !== m.id && Date.parse(x.sentDateTime || x.receivedDateTime || "") > m.received + 1000);
      return later.length ? "answered" : "ok";
    },
    async draft(m, reply) {
      // createReply makes a draft with the right recipient, subject and thread; then we put our text in it
      const d = await graph<OMessage>(token, `/me/messages/${encodeURIComponent(m.id)}/createReply`, { method: "POST", body: "{}" });
      await graph(token, `/me/messages/${encodeURIComponent(d.id)}`, { method: "PATCH", body: JSON.stringify({ body: { contentType: "Text", content: reply } }) });
      return d.id;
    },
    async label(m) {
      const cats = (m.raw as OMessage).categories || [];
      if (!cats.includes(CATEGORY)) await graph(token, `/me/messages/${encodeURIComponent(m.id)}`, { method: "PATCH", body: JSON.stringify({ categories: [...cats, CATEGORY] }) });
    },
    async draftOpen(draftId) {
      try { const d = await graph<OMessage>(token, `/me/messages/${encodeURIComponent(draftId)}?$select=id,isDraft`); return d.isDraft !== false; }
      catch (e) { if (e instanceof GraphError && e.status === 404) return false; throw e; }
    },
    async sentAfter(threadId, sinceMs) {
      const r = await graph<{ value?: OMessage[] }>(token, `/me/mailFolders/sentitems/messages?$filter=${encodeURIComponent(`conversationId eq '${q(threadId)}'`)}&$select=uniqueBody,body,sentDateTime&$top=10`);
      const sent = (r.value || []).filter((x) => Date.parse(x.sentDateTime || "") >= sinceMs - 60000).sort((a, b) => Date.parse(a.sentDateTime || "") - Date.parse(b.sentDateTime || "")).pop();
      return sent ? stripQuoted((sent.uniqueBody?.content || sent.body?.content || "").trim()) : null;
    },
  };
}
