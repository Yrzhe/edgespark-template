import { NavLink, Outlet } from "react-router-dom";
import type { AuthUser } from "@edgespark/web";

import { clearManagementToken } from "@/lib/api";
import { client } from "@/lib/edgespark";

const Spark = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M13 2 4.5 13.2c-.4.5 0 1.3.7 1.3H11l-1 7.5 8.5-11.2c.4-.5 0-1.3-.7-1.3H12l1-7.5Z" fill="currentColor" />
  </svg>
);

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  connect: "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M3 12h4m10 0h4M12 3v4m0 10v4",
  sites: "M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z",
  key: "M15 7a4 4 0 1 0-3.9 5l-1.6 1.6v2h-2v2H5l-1 1H2v-3l6.1-6.1A4 4 0 0 0 15 7Zm1 0h.01",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
  logout: "M16 17l5-5-5-5M21 12H9M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4",
};

const nav = [
  { section: "Start", items: [{ to: "/connect", icon: ICONS.connect, label: "Connect AI" }] },
  {
    section: "Manage",
    items: [
      { to: "/sites", icon: ICONS.sites, label: "Sites" },
      { to: "/keys", icon: ICONS.key, label: "API Keys" },
      { to: "/baas", icon: ICONS.data, label: "BaaS Data" },
    ],
  },
];

export function Layout({ user }: { user: AuthUser }) {
  const initials = (user.name ?? user.email ?? "owner")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");

  async function signOut() {
    clearManagementToken();
    await client.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="flex h-full min-h-screen w-full bg-neutral-50 text-neutral-900" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
            <Spark className="h-[18px] w-[18px]" />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-neutral-900">Hatch</p>
            <p className="text-[11px] text-neutral-400">edge host for agents</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
          {nav.map((group) => (
            <div key={group.section}>
              <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{group.section}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      isActive ? "bg-amber-50 text-amber-800" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon d={item.icon} className={`h-[18px] w-[18px] ${isActive ? "text-amber-600" : "text-neutral-400"}`} />
                      <span className="flex-1 text-left">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-neutral-200 p-2.5">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-neutral-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700">{initials || "OW"}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium">{user.name ?? "owner"}</p>
              <p className="truncate text-[11px] text-neutral-400">{user.email}</p>
            </div>
            <button className="text-neutral-400 hover:text-neutral-700" title="Sign out" onClick={signOut}>
              <Icon d={ICONS.logout} className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>
      </aside>
      <Outlet />
    </div>
  );
}
