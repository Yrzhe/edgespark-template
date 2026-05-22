// Hatch — BaaS Data (refined light, Linear/Neon-grounded). Design artifact; mock data.
// Collections list (counts + rule badges) -> records table (real <table>) -> row-detail panel.

type Rule = "public-append" | "public" | "private";
interface Collection {
  name: string;
  count: number;
  read: "public" | "private";
  write: Rule;
}
interface Rec {
  id: string;
  name: string;
  email: string;
  message: string;
  created: string;
}
const COLLECTIONS: Collection[] = [{
  name: "messages",
  count: 128,
  read: "private",
  write: "public-append"
}, {
  name: "signups",
  count: 42,
  read: "private",
  write: "public-append"
}, {
  name: "site-config",
  count: 3,
  read: "public",
  write: "private"
}, {
  name: "reviews",
  count: 17,
  read: "public",
  write: "public"
}];
const RECORDS: Rec[] = [{
  id: "01HZXM…a9f",
  name: "Ava Chen",
  email: "ava@x.com",
  message: "Love the edge speed!",
  created: "2m ago"
}, {
  id: "01HZXN…b3d",
  name: "Ben Liu",
  email: "ben@x.com",
  message: "Can I get a custom domain?",
  created: "14m ago"
}, {
  id: "01HZXP…c1e",
  name: "Cara Ng",
  email: "cara@x.com",
  message: "Deployed in seconds 🚀",
  created: "1h ago"
}, {
  id: "01HZXQ…d8a",
  name: "Dan Ito",
  email: "dan@x.com",
  message: "Rollback saved me.",
  created: "3h ago"
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
  filter: "M3 5h18l-7 8v5l-4 2v-7L3 5Z",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h6l1-13",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  logout: "M16 17l5-5-5-5M21 12H9M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"
};
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
      <Icon d={icon} className={`h-[18px] w-[18px] ${active ? "text-amber-600" : "text-neutral-400"}`} /><span className="flex-1 text-left">{label}</span>
      {count && <span className="text-[12px] tabular-nums text-neutral-400">{count}</span>}
    </button>;
}
function RuleBadge({
  rule
}: {
  rule: Rule | "public" | "private";
}) {
  const map: Record<string, string> = {
    "public-append": "text-sky-700 bg-sky-50 ring-sky-200",
    public: "text-amber-700 bg-amber-50 ring-amber-200",
    private: "text-neutral-600 bg-neutral-100 ring-neutral-200"
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${map[rule]}`}>{rule}</span>;
}
export const BaaSData = () => {
  const active = COLLECTIONS[0];
  const sel = RECORDS[1];
  return <div className="flex h-full min-h-screen w-full bg-neutral-50 text-neutral-900" style={{
    fontFamily: "Inter, system-ui, sans-serif"
  }}>
      {/* App sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm"><Spark className="h-[18px] w-[18px]" /></span>
          <div className="leading-tight"><p className="text-[13px] font-semibold text-neutral-900">Hatch</p><p className="text-[11px] text-neutral-400">edge host for agents</p></div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
          <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Start</p>
          <NavItem icon={ICONS.connect} label="Connect AI" />
          <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Manage</p>
          <NavItem icon={ICONS.sites} label="Sites" count="5" />
          <NavItem icon={ICONS.key} label="API Keys" count="3" />
          <NavItem icon={ICONS.data} label="BaaS Data" active />
        </nav>
        <div className="border-t border-neutral-200 p-2.5">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-neutral-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700">OW</span>
            <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-[13px] font-medium">owner</p><p className="truncate text-[11px] text-neutral-400">owner@example.com</p></div>
            <button className="text-neutral-400 hover:text-neutral-700" title="Sign out"><Icon d={ICONS.logout} className="h-[17px] w-[17px]" /></button>
          </div>
        </div>
      </aside>

      {/* Collections panel */}
      <div className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex items-center justify-between px-4 py-3.5">
          <h2 className="text-[13px] font-semibold text-neutral-900">Collections</h2>
          <button className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50" title="New collection"><Icon d={ICONS.plus} className="h-4 w-4" /></button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Icon d={ICONS.search} className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input placeholder="Search" className="h-8 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-[12px] placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
          </div>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          {COLLECTIONS.map(c => <button key={c.name} className={`mb-0.5 flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors ${c.name === active.name ? "bg-amber-50" : "hover:bg-neutral-50"}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] text-neutral-900">{c.name}</span>
                <span className="text-[12px] tabular-nums text-neutral-400">{c.count}</span>
              </div>
              <div className="flex gap-1"><RuleBadge rule={c.read === "public" ? "public" : "private"} /><RuleBadge rule={c.write} /></div>
            </button>)}
        </div>
      </div>

      {/* Records main */}
      <main className="flex min-w-0 flex-1 flex-col bg-neutral-50">
        <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h1 className="font-mono text-[15px] font-semibold tracking-tight text-neutral-900">{active.name}</h1>
            <span className="text-[13px] text-neutral-400">{active.count} records</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-neutral-400">read</span><RuleBadge rule="private" />
            <span className="ml-1 text-[11px] text-neutral-400">write</span><RuleBadge rule="public-append" />
            <button className="ml-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-50">Edit rules</button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"><Icon d={ICONS.filter} className="h-3.5 w-3.5" /> Filter</button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-[12px] font-medium text-white hover:bg-amber-600"><Icon d={ICONS.plus} className="h-3.5 w-3.5" /> Add record</button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* records table */}
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup><col className="w-[20%]" /><col className="w-[18%]" /><col className="w-[24%]" /><col className="w-[26%]" /><col className="w-[12%]" /></colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="px-5 py-2.5">id</th><th className="px-3 py-2.5">name</th><th className="px-3 py-2.5">email</th><th className="px-3 py-2.5">message</th><th className="px-3 py-2.5">created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {RECORDS.map(r => <tr key={r.id} className={`hover:bg-neutral-50 ${r.id === sel.id ? "bg-amber-50/50" : ""}`}>
                    <td className="truncate px-5 py-3 align-middle font-mono text-[12px] text-neutral-400">{r.id}</td>
                    <td className="truncate px-3 py-3 align-middle text-neutral-900">{r.name}</td>
                    <td className="truncate px-3 py-3 align-middle font-mono text-[12px] text-neutral-500">{r.email}</td>
                    <td className="truncate px-3 py-3 align-middle text-neutral-500">{r.message}</td>
                    <td className="px-3 py-3 align-middle text-neutral-400">{r.created}</td>
                  </tr>)}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-neutral-100 bg-white px-5 py-3 text-[12px] text-neutral-400">
              <span>Showing 4 of {active.count}</span>
              <button className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-neutral-600 hover:bg-neutral-50">Load more</button>
            </div>
          </div>

          {/* row detail */}
          <aside className="hidden w-80 shrink-0 flex-col border-l border-neutral-200 bg-white xl:flex">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="text-[13px] font-semibold text-neutral-900">Record</h3>
              <button className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] text-rose-600 hover:bg-rose-50"><Icon d={ICONS.trash} className="h-3.5 w-3.5" /> Delete</button>
            </div>
            <div className="flex-1 overflow-auto px-4 py-4">
              <Field label="id" value={sel.id} mono />
              <Field label="name" value={sel.name} />
              <Field label="email" value={sel.email} mono />
              <Field label="message" value={sel.message} />
              <Field label="created_at" value="2026-02-25 07:46:11" mono />
              <Field label="source_ip_hash" value="sha256:9c1a…b73f" mono />
              <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">Public-append records are immutable. The owner can delete for moderation; visitors can’t read or edit.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>;
};
function Field({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return <div className="mb-3">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <div className={`rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-neutral-800 ${mono ? "font-mono text-[12px]" : "text-[13px]"}`}>{value}</div>
    </div>;
}