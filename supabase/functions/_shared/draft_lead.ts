// Draft a reply to one of Re-Charge's own leads (email or WhatsApp), from Re-Charge's facts and the
// lead's history. A person always reads, fixes the [gaps] and sends it from the panel; nothing goes
// out by itself. Runs on the home AI hub first (ai.ts), Claude as fallback or on request.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { aiJSON, type Engine } from "./ai.ts";

// Keep in step with pricing.html and the Terms. These are the only prices the draft may quote.
const FACTS = `About Re-Charge (the business replying):
- A small AI and automation studio based in Johannesburg, working with businesses anywhere. AI drafts the routine work; a person checks it.
- First step for almost anyone: a free 30-minute call. Booking link: https://calendar.app.google/58FYamh1ahXB4khM9
- Inbox Assistant (the simplest start): drafts every routine customer email from the client's own prices and policies. R9,500 setup, then R2,950 a month. Ready within 3 business days. A R1,500 deposit to start, which comes off the setup; the rest is paid only if it saves their team 5 hours a week over a two-week trial, otherwise the deposit is refunded in full.
- Starting prices (a fixed quote comes before any work): one automation from R15,000; custom AI that reads and replies (documents, WhatsApp, their own systems) from R25,000; a dashboard from R15,000; connecting systems from R45,000; a business website from R12,500; a website with bookings or payments from R35,000.
- Bigger processes go in stages, with a way out after each: Find (1-2 weeks, R15,000), Prove (from R35,000, half the Prove fee back if it misses the agreed target), Build and run (from R85,000).
- Monthly plans after launch: Operate R7,500, Optimise R15,000, Partner R35,000 a month; website hosting R450 or Care R1,450 a month. 3-month minimum, then month to month.
- Promise: we reply by 17:00 the next business day. Their data stays theirs; the AI doesn't train on it.`;

const SYSTEM = (channel: string, signoff: string) => `You draft ${channel === "whatsapp" ? "a WhatsApp message" : "an email"} from Re-Charge to a lead or client. A person reads it, fills in anything in [square brackets] and sends it. Nothing goes out by itself.

${FACTS}

How to write it:
- Answer what they actually asked, in the order they asked, then give one clear next step (usually: book the free 30-minute call, with the link).
- Warm, plain South African business English. No jargon, no hype, no exclamation marks beyond one. Reply in the language they wrote in.
- Use ONLY the facts above for prices and offers, and only the lead's own details below. NEVER invent dates, times, availability, names, results or promises. Where something is needed that you don't know, put a short placeholder in square brackets, like [a time that suits you] or [their website], and add it to "check".
- ${channel === "whatsapp" ? "WhatsApp: short, 2-5 lines, no subject, no markdown, no sign-off block; end with the first name only." : `Email: a short subject line and a body of 3-8 short paragraphs or lines. End with the sign-off: ${signoff || "[Your name]"}, Re-Charge.`}
- "check": at most four short instructions for the person (things to confirm or fill in). Empty if nothing.

Answer with ONE JSON object and nothing else:
{"subject": "${channel === "whatsapp" ? "" : "..."}", "body": "...", "check": ["..."]}`;

export type Draft = { subject: string; body: string; check: string[] };

// What the panel knows right now (stage, Inbox Assistant trial, budget, the quote sent), as plain lines.
function panelContext(c: Record<string, unknown> | null): string {
  if (!c || typeof c !== "object") return "";
  const t = (c.trial && typeof c.trial === "object") ? c.trial as Record<string, unknown> : null;
  const lines = [
    c.stage ? `Stage in our panel: ${String(c.stage).slice(0, 40)}` : "",
    t ? `They are on the Inbox Assistant trial: day ${Number(t.day) || 0} of 14, ${Number(t.hours) || 0} of ${Number(t.target) || 5} hours saved so far this week` : "",
    c.budget ? `Budget they gave: ${String(c.budget).slice(0, 60)} (don't quote far above it without saying why)` : "",
    c.quote ? `Quote already sent: ${String(c.quote).slice(0, 40)}` : "",
  ].filter(Boolean);
  return lines.length ? "What we know now:\n" + lines.map((l) => "- " + l).join("\n") : "";
}

export async function draftLeadReply(db: SupabaseClient, projectId: string, channel: "email" | "whatsapp", message = "", preferClaude = false, context: Record<string, unknown> | null = null): Promise<{ draft: Draft; engine: Engine; ms: number }> {
  const { data: p } = await db.from("projects").select("id, ref, name, business, email, phone, location, goal, category, status, quote_cents, ai_sort, details").eq("id", projectId).maybeSingle();
  if (!p) throw new Error("lead not found");
  const [{ data: evs }, { data: prof }] = await Promise.all([
    db.from("project_events").select("kind, note, created_at").eq("project_id", projectId).in("kind", ["note", "email", "whatsapp", "created", "status"]).order("created_at", { ascending: false }).limit(8),
    db.from("settings").select("value").eq("key", "profile").maybeSingle(),
  ]);
  const signoff = String((prof?.value as Record<string, unknown> | null)?.my_name || "");
  const d = (p.details || {}) as Record<string, unknown>, a = (p.ai_sort || {}) as Record<string, unknown>;
  const history = (evs || []).reverse().map((e) => `- ${String(e.created_at).slice(0, 10)} ${e.kind}: ${String(e.note || "").slice(0, 600)}`).join("\n");
  const lead = [
    `Lead ${p.ref}: ${[p.name, p.business, p.location].filter(Boolean).join(" · ") || "(no name)"}`,
    `Stage: ${p.status}${p.quote_cents ? ` · quote sent: R${Math.round(p.quote_cents / 100).toLocaleString("en-ZA")}` : ""}`,
    `How they came in: ${d.formType || (p.category || []).join(", ") || "unknown"}`,
    a.summary ? `What they want (sorted): ${a.summary}. Suggested next step: ${a.next_step || ""}` : "",
    p.goal ? `What they wrote:\n${String(p.goal).slice(0, 3000)}` : "",
    history ? `Recent history (oldest first):\n${history}` : "",
    panelContext(context),
    message ? `The message to answer now:\n${message.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n\n");
  const r = await aiJSON<Draft>("draft", SYSTEM(channel, signoff), lead, {
    maxTokens: 900, preferClaude,
    check: (x) => Boolean(x && typeof x.body === "string" && x.body.trim().length > 20),
  });
  const x = r.data;
  return { ...r, draft: {
    subject: channel === "email" ? String(x.subject || `Re: your enquiry`).trim().slice(0, 140) : "",
    body: String(x.body).replace(/\r\n/g, "\n").trim().slice(0, 6000),
    check: (Array.isArray(x.check) ? x.check : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 4),
  } };
}
