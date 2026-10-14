// What the Inbox Assistant did over a period, for the monthly report and the weekly email.
// The same rule as the panel card: a draft sent nearly as written (≥75% the same) saves the
// time one email takes by hand, minus the time to check it; one sent after real edits saves
// half; rewritten, unused or skipped saves nothing.
export type InboxResult = { drafted: number; sent: number; asIs: number; edited: number; hours: number };
type Row = { status: string; similarity: number | null; account_id: string };
type Acc = { id: string; baseline_minutes: number; check_minutes: number };

export function inboxResult(rows: Row[], accounts: Acc[]): InboxResult | null {
  if (!accounts.length) return null;
  const per = new Map(accounts.map((a) => [a.id, Math.max(0, Number(a.baseline_minutes || 6) - Number(a.check_minutes || 1))]));
  let drafted = 0, sent = 0, asIs = 0, edited = 0, mins = 0;
  for (const r of rows) {
    if (r.status === "skipped") continue;
    drafted++;
    if (r.status !== "sent") continue;
    sent++;
    const s = Number(r.similarity), m = per.get(r.account_id) ?? 5;
    if (s >= 0.75) { asIs++; mins += m; } else if (s >= 0.4) { edited++; mins += m / 2; }
  }
  return { drafted, sent, asIs, edited, hours: Math.round((mins / 60) * 10) / 10 };
}

// deno-lint-ignore no-explicit-any
export async function loadInbox(db: any, clientId: string, projectIds: string[], sinceIso: string): Promise<InboxResult | null> {
  const ors = [`client_id.eq.${clientId}`, ...(projectIds.length ? [`project_id.in.(${projectIds.join(",")})`] : [])].join(",");
  const { data: accs } = await db.from("inbox_accounts").select("id, baseline_minutes, check_minutes, status").or(ors);
  const live = (accs || []).filter((a: { status: string }) => a.status === "active" || a.status === "paused");
  if (!live.length) return null;
  const { data: rows } = await db.from("inbox_drafts").select("status, similarity, account_id").in("account_id", live.map((a: Acc) => a.id)).gte("created_at", sinceIso).limit(10000);
  return inboxResult(rows || [], live);
}
