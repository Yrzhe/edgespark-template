// Hatch — API Keys (refined light, Linear/OpenAI-grounded). Design artifact; mock data.
// Real <table> for alignment. Neutral base + amber accent. Reveal-once modal (Resend pattern).

interface KeyRow {
  name: string;
  prefix: string;
  created: string;
  lastUsed: string;
  revoked?: boolean;
}
const KEYS: KeyRow[] = [{
  name: "ci-deploy",
  prefix: "esk_ab12",
  created: "Feb 25, 2026",
  lastUsed: "2m ago"
}, {
  name: "claude-agent",
  prefix: "esk_9f4c",
  created: "Feb 20, 2026",
  lastUsed: "1h ago"
}, {
  name: "codex-agent",
  prefix: "esk_77de",
  created: "Feb 11, 2026",
  lastUsed: "yesterday"
}, {
  name: "old-laptop",
  prefix: "esk_0a31",
  created: "Jan 30, 2026",
  lastUsed: "Never",
  revoked: true
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
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 12h.01",
  logout: "M16 17l5-5-5-5M21 12H9M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4",
  warn: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
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
      <Icon d={icon} className={`h-[18px] w-[18px] ${active ? "text-amber-600" : "text-neutral-400"}`} />
      <span className="flex-1 text-left">{label}</span>
      {count && <span className="text-[12px] tabular-nums text-neutral-400">{count}</span>}
    </button>;
}
function Sidebar({
  active
}: {
  active: string;
}) {
  return <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm"><Spark className="h-[18px] w-[18px]" /></span>
        <div className="leading-tight"><p className="text-[13px] font-semibold text-neutral-900">Hatch</p><p className="text-[11px] text-neutral-400">edge host for agents</p></div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
        <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Start</p>
        <NavItem icon={ICONS.connect} label="Connect AI" active={active === "connect"} />
        <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Manage</p>
        <NavItem icon={ICONS.sites} label="Sites" count="5" active={active === "sites"} />
        <NavItem icon={ICONS.key} label="API Keys" count="3" active={active === "keys"} />
        <NavItem icon={ICONS.data} label="BaaS Data" active={active === "data"} />
      </nav>
      <div className="border-t border-neutral-200 p-2.5">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-neutral-100">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700">OW</span>
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-[13px] font-medium">owner</p><p className="truncate text-[11px] text-neutral-400">owner@example.com</p></div>
          <button className="text-neutral-400 hover:text-neutral-700" title="Sign out"><Icon d={ICONS.logout} className="h-[17px] w-[17px]" /></button>
        </div>
      </div>
    </aside>;
}
export const APIKeys = () => {
  return <div className="flex h-full min-h-screen w-full bg-neutral-50 text-neutral-900" style={{
    fontFamily: "Inter, system-ui, sans-serif"
  }}>
      <Sidebar active="keys" />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4">
          <div className="flex-1">
            <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">API Keys</h1>
            <p className="mt-0.5 text-[13px] text-neutral-500">Agent keys for the management API · stored hashed, secret shown once</p>
          </div>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-amber-600"><Icon d={ICONS.plus} className="h-4 w-4" /> New key</button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup><col className="w-[26%]" /><col className="w-[28%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[16%]" /></colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="px-5 py-2.5">Name</th><th className="px-3 py-2.5">Key</th><th className="px-3 py-2.5">Created</th><th className="px-3 py-2.5">Last used</th><th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {KEYS.map(k => <tr key={k.prefix} className="group hover:bg-neutral-50">
                    <td className="px-5 py-3 align-middle font-medium text-neutral-900">{k.name}</td>
                    <td className="px-3 py-3 align-middle"><code className="font-mono text-[12px] text-neutral-500">{k.prefix}{"·".repeat(12)}</code></td>
                    <td className="px-3 py-3 align-middle text-neutral-500">{k.created}</td>
                    <td className="px-3 py-3 align-middle text-neutral-500">{k.lastUsed}</td>
                    <td className="px-5 py-3 align-middle">
                      <div className="flex items-center justify-end gap-3">
                        {k.revoked ? <span className="text-[13px] font-medium text-neutral-400">Revoked</span> : <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>}
                        {!k.revoked && <button className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] font-medium text-rose-600 opacity-0 transition-opacity hover:bg-rose-50 group-hover:opacity-100">Revoke</button>}
                      </div>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-neutral-400">Never paste a key-creation response into agent logs or third-party LLM context.</p>
        </div>

        {/* Reveal-once modal */}
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Icon d={ICONS.key} className="h-4 w-4" /></span>
              <div className="flex-1">
                <h2 className="text-[14px] font-semibold text-neutral-900">Your new API key</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">Copy it now — for security this is the <span className="font-medium text-neutral-900">only time</span> it’s shown.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <code className="flex-1 truncate font-mono text-[13px] text-neutral-800">esk_ab12c3d4e5f6g7h8i9j0k1l2m3n4o5p6</code>
              <button className="text-neutral-400 hover:text-neutral-700" title="Reveal"><Icon d={ICONS.eye} className="h-4 w-4" /></button>
              <button className="text-neutral-400 hover:text-neutral-700" title="Copy"><Icon d={ICONS.copy} className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
              <Icon d={ICONS.warn} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Store it in a secret manager. Don’t commit it or paste it into agent / LLM context.</span>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3.5 text-[13px] font-medium text-white hover:bg-amber-600"><Icon d={ICONS.copy} className="h-4 w-4" /> Copy &amp; close</button>
            </div>
          </div>
        </div>
      </main>
    </div>;
};