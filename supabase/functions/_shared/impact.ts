// Shared by monthly-report and weekly-wins: what an assistant handled, the number
// we measured before the job, and the hours that difference is worth.
export type Ai = { convos: number; questions: number; afterHours: number };
export type After = { value: number; how?: string; note?: string; at?: string };
export type Baseline = { metric: string; value: number; unit: string; how?: string; note?: string; at?: string; volume?: number; hourly?: number; after?: After };

export function sumUsage(rows: Array<{ convos: number; questions: number; after_hours: number }>): Ai {
  return {
    convos: rows.reduce((a, r) => a + (Number(r.convos) || 0), 0),
    questions: rows.reduce((a, r) => a + (Number(r.questions) || 0), 0),
    afterHours: rows.reduce((a, r) => a + (Number(r.after_hours) || 0), 0),
  };
}

// The most recently touched job that has a baseline on it. A client can have several
// projects; the number we're reporting against is the one from the work we're doing.
export function pickBaseline(rows: Array<{ details?: { baseline?: Baseline; after?: After } }>): Baseline | null {
  for (const r of rows) {
    const b = r?.details?.baseline, a = r?.details?.after;
    if (b && b.metric && Number.isFinite(Number(b.value))) {
      const after = a && Number.isFinite(Number(a.value)) ? { ...a, value: Number(a.value) } : undefined;
      return { ...b, value: Number(b.value), ...(after ? { after } : {}) };
    }
  }
  return null;
}

// METHOD.md §4, the same sums as the panel's roiOf(). "Minutes to …" metrics are per
// item (times the volume); "Hours …" metrics are time already; Rands need an hourly cost.
export const PER_MONTH: Record<string, number> = { "a day": 21.7, "a week": 4.33, "a month": 1 };
export const kindOf = (m: string) => (/^minutes\b/i.test(m) ? "minutes" : /^hours\b/i.test(m) ? "hours" : "count");
export function roiOf(b: Baseline): { before: number; after: number; pct: number | null; hours: number | null; rands: number | null } | null {
  if (!b.after) return null;
  const before = b.value, after = b.after.value, change = before - after, per = PER_MONTH[b.unit] ?? 4.33, kind = kindOf(b.metric);
  const hours = kind === "minutes" && Number(b.volume) ? (change * Number(b.volume) * per) / 60 : kind === "hours" ? change * per : null;
  const rands = hours != null && Number(b.hourly) ? hours * Number(b.hourly) : null;
  return { before, after, pct: before ? Math.round((change / before) * 100) : null, hours, rands };
}
export function roiSentence(b: Baseline): string {
  const r = roiOf(b);
  if (!r) return "";
  const mins = kindOf(b.metric) === "minutes";
  const now = mins ? `it now takes about ${r.after} minutes` : `it's now about ${r.after} ${b.unit}`;
  const pct = r.pct != null && r.pct !== 0 ? ` (${Math.abs(r.pct)}% ${r.pct > 0 ? "less" : "more"})` : "";
  const hrs = r.hours != null && r.hours > 0 ? ` That's about ${Math.round(r.hours)} hours a month back${r.rands != null ? `, roughly R${Math.round(r.rands).toLocaleString("en-ZA").replace(/\s/g, ",")} of staff time` : ""}.` : "";
  return `Measured the same way, ${now}${pct}.${hrs}`;
}

// Say where the number came from, every time. A figure the owner gave us off the top
// of their head is worth reporting against — as long as we never dress it up as
// something we measured.
export function baselineSentence(b: Baseline): string {
  const src = b.how === "We counted it" ? "we counted" : b.how === "From their reviews or page" ? "we found, from your reviews and your page," : "you told us";
  const per = b.unit || "a week";
  if (kindOf(b.metric) === "minutes") return `When we started, ${src} it took about ${b.value} minutes ${b.metric.replace(/^minutes\s*/i, "")}${b.volume ? `, about ${b.volume} of them ${per}` : ""}.`;
  const monthly = per === "a day" ? b.value * 30 : per === "a week" ? b.value * 4.3 : null;
  const rounded = monthly != null ? Math.round(monthly / (monthly >= 20 ? 5 : 1)) * (monthly >= 20 ? 5 : 1) : null;
  return `When we started, ${src} ${b.metric.toLowerCase()} came to about ${b.value} ${per}${rounded ? ` — somewhere near ${rounded} in a month like this one` : ""}.`;
}
