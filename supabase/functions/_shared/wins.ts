// The weekly "time saved" email and the one-off "your first week" email.
// Pure wording, no database: weekly-wins gathers the numbers and calls this.
//
// Only real numbers go in. Questions and after-hours counts come from
// assistant_usage. Hours are only claimed when there's a measured before-and-after
// (projects.details.baseline + after); otherwise the email sticks to the counts.
import { roiOf, baselineSentence, type Ai, type Baseline } from "./impact.ts";
import type { InboxResult } from "./inbox_stats.ts";

export type WinsInput = {
  kind: "weekly" | "first-week";
  business: string;          // client name
  first: string;             // contact's first name
  ai: Ai | null;             // usage over the period
  baseline: Baseline | null;
  days: number;              // length of the period
  inbox?: InboxResult | null; // the Inbox Assistant, if they have one
};
export type WinsMail = { subject: string; text: string } | null;

const n = (x: number) => Math.round(x).toLocaleString("en-ZA").replace(/\s/g, ",");

export function hoursFor(b: Baseline | null, days: number): number | null {
  const r = b ? roiOf(b) : null;
  if (!r || r.hours == null || r.hours <= 0) return null;
  return (r.hours / 30.4) * days;     // roiOf is per month
}

export function composeWins(p: WinsInput): WinsMail {
  const q = p.ai?.questions ?? 0, ah = p.ai?.afterHours ?? 0, convos = p.ai?.convos ?? 0;
  const hrs = hoursFor(p.baseline, p.days);
  const hrsR = hrs != null && hrs >= 1 ? Math.round(hrs) : null;
  const ib = p.inbox && p.inbox.drafted ? p.inbox : null;
  const ibHrs = ib && ib.hours >= 1 ? Math.round(ib.hours) : null;
  // Weekly with nothing true to say: send nothing. The first week still gets a
  // check-in, just without numbers.
  if (!q && hrsR == null && !ib && p.kind === "weekly") return null;

  const lines: string[] = [];
  if (q) lines.push(`• ${n(q)} question${q === 1 ? "" : "s"} answered${convos > 1 ? `, across ${n(convos)} conversations` : ""}`);
  if (ah) lines.push(`• ${n(ah)} of them after hours or at the weekend, when nobody would have been there`);
  if (hrsR != null) lines.push(`• About ${n(hrsR)} hour${hrsR === 1 ? "" : "s"} of your team's time, based on the before-and-after we measured`);
  if (ib) lines.push(`• ${n(ib.drafted)} customer email${ib.drafted === 1 ? "" : "s"} drafted for your team, ${n(ib.sent)} of them sent`);
  if (ibHrs != null) lines.push(`• About ${n(ibHrs)} hour${ibHrs === 1 ? "" : "s"} of typing saved on email (counted only from the drafts your team sent)`);

  if (p.kind === "first-week") {
    const subject = `${p.business}: your first week with AI`;
    const measure = p.baseline && !p.baseline.after
      ? `\n\nAt the end of the first month we'll measure it against where you started. ${baselineSentence(p.baseline)}`
      : "";
    const did = lines.length ? ` Here's what it did:\n\n${lines.join("\n")}` : " How has it been for your team?";
    const text = `Hi ${p.first},\n\nIt's been a week since it went live.${did}${measure}\n\nThe first weeks are when the small fixes happen. If anything felt off, or a customer got an answer you'd change, just reply and we'll adjust it.`;
    return { subject, text };
  }
  const subject = hrsR != null
    ? `${p.business}: about ${n(hrsR)} hours saved this week`
    : ibHrs != null
    ? `${p.business}: about ${n(ibHrs)} hours saved on email this week`
    : q
    ? `${p.business}: ${n(q)} question${q === 1 ? "" : "s"} answered by AI this week`
    : `${p.business}: ${n(ib!.drafted)} emails drafted for you this week`;
  const text = `Hi ${p.first},\n\nYour week with AI:\n\n${lines.join("\n")}\n\nAnything it got wrong, or anything that's changed (prices, hours, a new service)? Just reply and we'll update it.`;
  return { subject, text };
}
