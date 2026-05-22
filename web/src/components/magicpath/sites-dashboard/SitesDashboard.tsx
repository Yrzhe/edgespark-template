// EdgeSpark Host — Sites (refined light, Linear/Render-grounded). Design artifact; mock data.
// Real <table> for column alignment. Neutral base + amber (EdgeSpark) accent + semantic status.

type Status = "ready" | "building" | "failed";
interface SiteRow {
  name: string;
  slug: string;
  status: Status;
  files: number;
  size: string;
  updated: string;
}
const SITES: SiteRow[] = [{
  name: "Marketing site",
  slug: "marketing",
  status: "ready",
  files: 42,
  size: "3.1 MB",
  updated: "2m ago"
}, {
  name: "Launch waitlist",
  slug: "launch",
  status: "ready",
  files: 8,
  size: "412 KB",
  updated: "1h ago"
}, {
  name: "Docs portal",
  slug: "docs",
  status: "building",
  files: 318,
  size: "12.4 MB",
  updated: "just now"
}, {
  name: "Agent demo",
  slug: "agent-demo",
  status: "ready",
  files: 5,
  size: "88 KB",
  updated: "yesterday"
}, {
  name: "Old landing",
  slug: "old-landing",
  status: "failed",
  files: 21,
  size: "1.2 MB",
  updated: "3d ago"
}];
const Spark = ({
  className = ""
}: {
  className?: string;
}) => <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="M13 2 4.5 13.2c-.4.5 0 1.3.7 1.3H11l-1 7.5 8.5-11.2c.4-.5 0-1.3-.7-1.3H12l1-7.5Z" fill="currentColor" /></svg>;
const Icon = ({
  d,
  className = ""
}: {
  d: string;
  className?: string;
}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d={d} /></svg>;
const ICONS = {
  connect: "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M3 12h4m10 0h4M12 3v4m0 10v4",
  sites: "M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z",
  key: "M15 7a4 4 0 1 0-3.9 5l-1.6 1.6v2h-2v2H5l-1 1H2v-3l6.1-6.1A4 4 0 0 0 15 7Zm1 0h.01",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h10v10H9zM5 15H4V4h11v1",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  external: "M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",
  upload: "M12 16V4m0 0L7 9m5-5 5 5M20 17v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2",
  dots: "M12 6h.01M12 12h.01M12 18h.01",
  logout: "M16 17l5-5-5-5M21 12H9M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"
};
function StatusChip({
  s
}: {
  s: Status;
}) {
  const map: Record<Status, {
    label: string;
    text: string;
    dot: string;
  }> = {
    ready: {
      label: "Ready",
      text: "text-emerald-700",
      dot: "bg-emerald-500"
    },
    building: {
      label: "Building",
      text: "text-amber-700",
      dot: "bg-amber-500 animate-pulse"
    },
    failed: {
      label: "Failed",
      text: "text-rose-700",
      dot: "bg-rose-500"
    }
  };
  const v = map[s];
  return <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${v.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />{v.label}
    </span>;
}
function NavItem({
  icon,
  label,
  active = false,
  count
}: {
  icon: string;
  label: string;
  active?: boolean;
  count?: string;
}) {
  return <button className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${active ? "bg-amber-50 text-amber-800" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`}>
      <Icon d={icon} className={`h-[18px] w-[18px] ${active ? "text-amber-600" : "text-neutral-400"}`} />
      <span className="flex-1 text-left">{label}</span>
      {count && <span className="text-[12px] tabular-nums text-neutral-400">{count}</span>}
    </button>;
}
export const SitesDashboard = () => {
  return <div className="flex h-full min-h-screen w-full bg-neutral-50 text-neutral-900" style={{
    fontFamily: "Inter, system-ui, sans-serif"
  }}>
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm"><Spark className="h-[18px] w-[18px]" /></span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-neutral-900">Hatch</p>
            <p className="text-[11px] text-neutral-400">edge host for agents</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
          <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Start</p>
          <NavItem icon={ICONS.connect} label="Connect AI" />
          <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Manage</p>
          <NavItem icon={ICONS.sites} label="Sites" active count="5" />
          <NavItem icon={ICONS.key} label="API Keys" count="3" />
          <NavItem icon={ICONS.data} label="BaaS Data" />
        </nav>
        <div className="border-t border-neutral-200 p-2.5">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-neutral-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700">OW</span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium">owner</p>
              <p className="truncate text-[11px] text-neutral-400">owner@example.com</p>
            </div>
            <button className="text-neutral-400 hover:text-neutral-700" title="Sign out"><Icon d={ICONS.logout} className="h-[17px] w-[17px]" /></button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4">
          <div className="flex-1">
            <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">Sites</h1>
            <p className="mt-0.5 text-[13px] text-neutral-500">5 static sites on the edge · 2 deploys today</p>
          </div>
          <div className="relative hidden sm:block">
            <Icon d={ICONS.search} className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input placeholder="Search sites" className="h-8 w-56 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
          </div>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-amber-600">
            <Icon d={ICONS.plus} className="h-4 w-4" /> New site
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[{
            label: "Sites",
            value: "5",
            sub: "1 building"
          }, {
            label: "Deploys · 7d",
            value: "23",
            sub: "+6 vs last week"
          }, {
            label: "Storage",
            value: "17.2 MB",
            sub: "content-addressed"
          }, {
            label: "API keys",
            value: "3",
            sub: "1 used today"
          }].map(s => <div key={s.label} className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{s.label}</p>
                <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-neutral-900">{s.value}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">{s.sub}</p>
              </div>)}
          </div>

          {/* Sites table */}
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-[26%]" /><col className="w-[24%]" /><col className="w-[13%]" />
                <col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="px-5 py-2.5 font-semibold">Site</th>
                  <th className="px-3 py-2.5 font-semibold">Public URL</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Files</th>
                  <th className="px-3 py-2.5 font-semibold">Updated</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {SITES.map(s => <tr key={s.slug} className="group hover:bg-neutral-50">
                    <td className="px-5 py-3 align-middle">
                      <div className="truncate font-medium text-neutral-900">{s.name}</div>
                      <div className="truncate font-mono text-[12px] text-neutral-400">/{s.slug}</div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center gap-1.5">
                        <code className="truncate rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[12px] text-neutral-600">…/s/{s.slug}/</code>
                        <button className="shrink-0 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 group-hover:opacity-100" title="Copy URL"><Icon d={ICONS.copy} className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle"><StatusChip s={s.status} /></td>
                    <td className="px-3 py-3 text-right align-middle tabular-nums text-neutral-500">{s.files}</td>
                    <td className="px-3 py-3 align-middle text-neutral-500">{s.updated}</td>
                    <td className="px-5 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50" title="Open"><Icon d={ICONS.external} className="h-3.5 w-3.5" /> Open</button>
                        <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50" title="Deploy"><Icon d={ICONS.upload} className="h-3.5 w-3.5" /> Deploy</button>
                        <button className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title="More"><Icon d={ICONS.dots} className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center text-[12px] text-neutral-400">Drag a folder onto a site to deploy a new immutable version · instant rollback</p>
        </div>
      </main>
    </div>;
};