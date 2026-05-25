export const AGENT_IDS = ["claude", "gpt", "deepseek", "gemini", "kimi"] as const;

const names: Record<string, [string, string, string]> = {
  claude: ["Claude", "Anthropic", "#D97757"],
  gpt: ["GPT", "OpenAI", "#48BB78"],
  deepseek: ["DeepSeek", "DeepSeek", "#2556B6"],
  gemini: ["Gemini", "Google", "#BC4E32"],
  kimi: ["Kimi", "Moonshot", "#7C3AED"],
};

const symbols = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META", "GOOGL"];
const baseTime = Date.UTC(2026, 4, 25, 8, 0, 0);

export function mockAgents() {
  return {
    agents: AGENT_IDS.map((id, index) => mockAgent(id, index)),
  };
}

export function mockAgent(id: string, fallbackIndex = AGENT_IDS.indexOf(id as (typeof AGENT_IDS)[number])) {
  const index = Math.max(0, fallbackIndex);
  const meta = names[id] ?? [id, "Agent", "#2556B6"];
  const equity = 100000 + index * 1450 + Math.sin(index + 1) * 1200;
  const lastEquity = equity - 450 + index * 80;
  return {
    id,
    name: meta[0],
    company: meta[1],
    color: meta[2],
    account: {
      equity: equity.toFixed(2),
      buying_power: (equity * 1.7).toFixed(2),
      last_equity: lastEquity.toFixed(2),
      cash: (equity * 0.42).toFixed(2),
      portfolio_value: equity.toFixed(2),
      status: "ACTIVE",
    },
    positions: [0, 1].map((offset) => {
      const price = 90 + index * 11 + offset * 23;
      const qty = 5 + index + offset;
      return {
        symbol: symbols[(index + offset) % symbols.length],
        exchange: "NASDAQ",
        qty: String(qty),
        avg_entry_price: String(price - 2.5),
        side: "long",
        market_value: (price * qty).toFixed(2),
        unrealized_pl: (qty * 2.5).toFixed(2),
        unrealized_plpc: "0.027",
        current_price: price.toFixed(2),
      };
    }),
    metrics: {
      totalPnl: Number((equity - 100000).toFixed(2)),
      returnPct: Number((((equity - 100000) / 100000) * 100).toFixed(2)),
      dailyPnl: Number((equity - lastEquity).toFixed(2)),
      fees: Number((index * 1.73).toFixed(2)),
      daytradeCount: index,
      tradeCount: 12 + index * 3,
      sharpe: Number((1.1 + index * 0.17).toFixed(2)),
      winRate: Number((0.47 + index * 0.06).toFixed(2)),
      biggestWin: 740 + index * 95,
      biggestLoss: -360 - index * 45,
    },
    _cachedAt: baseTime,
  };
}

export function mockSnapshots() {
  const start = baseTime - 3 * 24 * 60 * 60 * 1000;
  const step = 20 * 60 * 1000;
  const points = Math.floor((3 * 24 * 60) / 20);
  const snapshots: Record<string, Array<{ fetchedAt: number; equity: number }>> = {};
  AGENT_IDS.forEach((id, idx) => {
    snapshots[id] = Array.from({ length: points }, (_, i) => ({
      fetchedAt: start + i * step,
      equity: Number((100000 + idx * 1000 + i * (6 + idx) + Math.sin(i / 8 + idx) * 350).toFixed(2)),
    }));
  });
  return { snapshots };
}

export function mockDecisions() {
  const actions = ["buy", "sell", "hold"] as const;
  return {
    decisions: Array.from({ length: 40 }, (_, i) => {
      const id = 10_000 + i;
      const agentId = AGENT_IDS[i % AGENT_IDS.length];
      const ts = baseTime - i * 43 * 60 * 1000;
      return {
        id,
        agentId,
        symbol: symbols[i % symbols.length],
        action: actions[i % actions.length],
        qty: 1 + (i % 7),
        price: Number((92 + i * 1.37).toFixed(2)),
        stopLoss: Number((88 + i * 1.1).toFixed(2)),
        profitTarget: Number((101 + i * 1.4).toFixed(2)),
        riskUsd: 120 + i * 4,
        confidence: Number((0.52 + (i % 10) * 0.04).toFixed(2)),
        confidenceNum: 52 + (i % 10) * 4,
        reasoning: `Momentum and risk screen for ${symbols[i % symbols.length]}.`,
        justification: `Portfolio exposure remains within the seeded mock limit.`,
        chainOfThought: `Mock private deliberation summary ${i + 1}: compare trend, exposure, and downside.`,
        timestamp: ts,
        createdAt: ts + 1000,
      };
    }),
  };
}

