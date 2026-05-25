import { NavLink } from "react-router-dom";

import { ContestantAvatar } from "@/components/ContestantAvatar";
import { Panel } from "@/components/ui";
import { money, number } from "@/lib/format";
import type { ContestantSummary } from "@/lib/types";

export function Leaderboard({
  title,
  caption,
  contestants,
  mode,
}: {
  title: string;
  caption: string;
  contestants: ContestantSummary[];
  mode: "equity" | "votes";
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-black">{title}</h2>
        <span className="text-xs font-bold text-zinc-500">{caption}</span>
      </div>
      <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">
        {contestants.map((c, index) => (
          <NavLink key={c.id} to={`/c/${c.id}`} className="flex items-center gap-2 rounded-lg border p-2 hover:bg-zinc-50" style={{ borderColor: "#0C0A0F22" }}>
            <span className="w-7 text-center text-sm font-black">{mode === "equity" ? c.rank : index + 1}</span>
            <ContestantAvatar name={c.displayName} company={`${c.company ?? c.tagline} ${c.displayName}`} avatarUrl={c.avatarUrl} color={c.accentColor} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black">{c.displayName}</span>
              <span className="block truncate text-xs font-semibold text-zinc-500">{c.id}</span>
            </span>
            <span className="text-right text-sm font-black">{mode === "equity" ? money(c.equity) : number(c.votes)}</span>
          </NavLink>
        ))}
      </div>
    </Panel>
  );
}
