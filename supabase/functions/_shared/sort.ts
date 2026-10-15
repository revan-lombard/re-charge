// Sorting incoming messages (website enquiries, emails, WhatsApps): what kind, how urgent,
// one line on what they want, who it's from, and the next step. Runs on the home AI hub first.
import { aiJSON, type Engine } from "./ai.ts";

export const KINDS = ["quote", "booking", "question", "support", "payment", "complaint", "supplier", "job", "spam", "other"] as const;
export const URGENCY = ["now", "today", "later"] as const;
export type Sorted = {
  kind: typeof KINDS[number]; urgency: typeof URGENCY[number]; summary: string; next_step: string;
  is_lead: boolean; who: { name?: string; business?: string; email?: string; phone?: string };
};

const SYSTEM = `You sort incoming messages for Re-Charge, a small AI and automation studio in Johannesburg that builds AI assistants, automations and websites for businesses. A person reads your result; you never reply to anyone.

Answer with ONE JSON object and nothing else:
{"kind": "...", "urgency": "...", "summary": "...", "next_step": "...", "is_lead": true|false, "who": {"name": "", "business": "", "email": "", "phone": ""}}

kind, exactly one of:
- quote: wants a price or a quote for work
- booking: wants a call, meeting or time slot
- question: a general question about what we do
- support: an existing client with a problem or a change request
- payment: about an invoice, a payment, proof of payment or a refund
- complaint: unhappy about something we did
- supplier: someone selling to us (marketing, SEO, software, partnerships)
- job: someone looking for work with us
- spam: junk, scams, bulk mail, nonsense
- other: none of these

urgency, exactly one of:
- now: something is broken or down, an angry client, a deadline today, or they ask to be called back urgently
- today: a new enquiry or a client waiting for an answer (most real messages)
- later: newsletters, suppliers, job seekers, spam, anything that can wait

summary: one plain sentence, at most 20 words, saying what they want.
next_step: one short instruction for us, starting with a verb (e.g. "Reply with the price for a 5-page website and offer a call").
is_lead: true only if this could become paid work from a new or existing client.
who: copy the sender's details only if they appear in the message; leave a field empty if not. Never invent them.`;

export async function sortMessage(text: string, source = "message"): Promise<{ sorted: Sorted; engine: Engine; ms: number }> {
  const clipped = String(text || "").slice(0, 6000);
  const r = await aiJSON<Sorted>("sort", SYSTEM, `Source: ${source}\n\nMessage:\n${clipped}`, {
    maxTokens: 400,
    check: (x) => Boolean(x && KINDS.includes(x.kind) && URGENCY.includes(x.urgency) && typeof x.summary === "string"),
  });
  const s = r.data, who = s.who || {};
  const clean = (v: unknown, n: number) => String(v || "").trim().slice(0, n);
  return { ...r, sorted: {
    kind: s.kind, urgency: s.urgency, summary: clean(s.summary, 200), next_step: clean(s.next_step, 200), is_lead: Boolean(s.is_lead),
    who: { name: clean(who.name, 80), business: clean(who.business, 120), email: clean(who.email, 120), phone: clean(who.phone, 30) },
  } };
}
