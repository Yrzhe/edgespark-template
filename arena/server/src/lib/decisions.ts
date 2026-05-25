export interface PublicDecision {
  id: number;
  contestantId: string;
  symbol: string;
  action: string;
  qty: number | null;
  price: number | null;
  confidence: number | null;
  reasoning: string;
  justification: string;
  chainOfThought: string;
  timestamp: number;
  createdAt: number;
}

export function decisionMinute(ts: number): number {
  return Math.floor(ts / 60000) * 60000;
}

export function groupDecisionsByMinute(rows: PublicDecision[], limit: number) {
  const minutes: Array<{ minute: number; items: Omit<PublicDecision, "createdAt">[] }> = [];
  const index = new Map<number, Omit<PublicDecision, "createdAt">[]>();
  let lastCursorSource: { createdAt: number; id: number } | null = null;
  for (const row of rows) {
    const minute = decisionMinute(row.createdAt);
    let items = index.get(minute);
    if (!items) {
      if (minutes.length >= limit) break;
      items = [];
      index.set(minute, items);
      minutes.push({ minute, items });
    }
    const { createdAt, ...item } = row;
    items.push(item);
    lastCursorSource = { createdAt, id: row.id };
  }
  return { minutes, lastCursorSource };
}
