import { useTranslation } from "react-i18next";

import { Stat } from "@/components/Stat";
import { money, number, toNum } from "@/lib/format";
import type { ContestantDetail, ContestantSummary } from "@/lib/types";

export function Stats({ contestant }: { contestant: ContestantSummary }) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-4">
      <Stat label={t("dashboard.rank")} value={`#${contestant.rank}`} />
      <Stat label={t("dashboard.equity")} value={money(contestant.equity)} />
      <Stat label={t("dashboard.return")} value={`${contestant.returnPct.toFixed(2)}%`} />
      <Stat label={t("dashboard.votes")} value={number(contestant.votes)} />
    </div>
  );
}

export function StatsMini({ contestant }: { contestant: ContestantSummary }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
      <span>{money(contestant.equity, true)}</span>
      <span>{contestant.returnPct.toFixed(2)}%</span>
      <span>{number(contestant.votes)}❤</span>
    </div>
  );
}

export function PositionsTable({ contestant }: { contestant: ContestantDetail }) {
  const { t } = useTranslation();
  if (!contestant.positions.length) return <div className="py-6 text-center text-sm font-bold text-zinc-500">{t("contestant.noPositions")}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-xs font-black text-zinc-500">
            <th>{t("contestant.symbol")}</th>
            <th>{t("contestant.qty")}</th>
            <th>{t("contestant.side")}</th>
            <th>{t("contestant.value")}</th>
            <th>{t("contestant.pnl")}</th>
          </tr>
        </thead>
        <tbody>
          {contestant.positions.map((p, i) => (
            <tr key={`${p.symbol}-${i}`} className="border-t">
              <td className="py-2 font-black">{String(p.symbol ?? "")}</td>
              <td>{String(p.qty ?? "")}</td>
              <td>{String(p.side ?? "")}</td>
              <td>{money(toNum(p.market_value))}</td>
              <td>{money(toNum(p.unrealized_pl))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValues({ data }: { data: Record<string, number | string | null> }) {
  return (
    <div className="space-y-2">
      {Object.entries(data).slice(0, 16).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-3 border-b py-2 text-sm">
          <span className="font-bold text-zinc-500">{key}</span>
          <span className="font-black">{typeof value === "number" ? number(value) : String(value ?? "")}</span>
        </div>
      ))}
    </div>
  );
}
