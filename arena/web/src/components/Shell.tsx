import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { Activity, Bot, KeyRound, Languages, LogIn, Sparkles, Trophy, Users } from "lucide-react";

import { arenaApi } from "@/lib/api";
import { client } from "@/lib/edgespark";
import { CREAM, INK, NAVY, ORANGE } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { useUpstreamPump } from "@/hooks/useUpstreamPump";
import { languages, setLocale, type Locale } from "@/i18n";
import type { MeResponse } from "@/lib/types";
import { Avatar } from "@/components/ui";

export interface ShellContext {
  onLogin: () => void;
  isAuthenticated: boolean;
  isOwner: boolean;
  ownerChecked: boolean;
}

export function Shell() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  useUpstreamPump();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [ownerChecked, setOwnerChecked] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setMe(null);
      setOwnerChecked(true);
      return;
    }
    setOwnerChecked(false);
    void arenaApi.me().then((nextMe) => setMe(nextMe)).catch(() => setMe(null)).finally(() => setOwnerChecked(true));
  }, [auth.isAuthenticated]);

  const locale = (i18n.language.startsWith("zh") ? "zh" : "en") as Locale;
  const isOwner = me?.isOwner === true;
  const nav = [
    ["/", t("app.dashboard"), Trophy],
    ["/decisions", t("app.decisions"), Activity],
    ["/contestants", t("app.contestants"), Users],
    ...(isOwner ? [
      ["/admin", t("app.admin"), KeyRound],
      ["/connect", t("app.connect"), Bot],
    ] as const : []),
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: CREAM, color: INK }}>
      <header className="sticky top-0 z-40 border-b-2 bg-white" style={{ borderColor: INK }}>
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: INK }}>
              <Trophy size={17} color={ORANGE} />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-base font-black leading-none">{t("app.name")}<Sparkles size={14} color={ORANGE} strokeWidth={2.4} /></span>
              <span className="block text-[11px] font-semibold text-zinc-500">{t("app.subtitle")}</span>
            </span>
          </NavLink>
          <a href="https://bloome.im" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-zinc-500 hover:bg-zinc-100 sm:flex">
            <span>{t("app.by")}</span>
            <img src="/brand/bloome-wordmark-ink.svg" alt={t("app.bloomeAlt")} className="h-4 w-auto" />
          </a>
          <nav className="ml-3 hidden items-center gap-1 md:flex">
            {nav.map(([to, label, Icon]) => <HeaderLink key={to} to={to} label={label} icon={<Icon size={15} />} />)}
          </nav>
          <button className="ml-auto flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-bold" style={{ borderColor: INK }} onClick={() => setLocale(languages.find((lng) => lng !== locale) ?? "en")}>
            <Languages size={15} />{locale.toUpperCase()}
          </button>
          {auth.isAuthenticated ? (
            <button onClick={() => void auth.signOut()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: NAVY }}>
              <Avatar name={me?.displayName ?? auth.user?.name ?? t("app.user")} src={me?.avatarUrl ?? null} size="sm" />
              <span className="hidden sm:inline">{me?.displayName ?? auth.user?.email ?? t("app.user")}</span>
            </button>
          ) : (
            <button onClick={() => setLoginOpen(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: NAVY }}>
              <LogIn size={15} />{t("app.signIn")}
            </button>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:hidden">
          {nav.map(([to, label, Icon]) => <HeaderLink key={to} to={to} label={label} icon={<Icon size={15} />} mobile />)}
        </nav>
      </header>
      <AuthPrompt open={loginOpen} onClose={() => setLoginOpen(false)} />
      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <Outlet context={{ onLogin: () => setLoginOpen(true), isAuthenticated: auth.isAuthenticated, isOwner, ownerChecked } satisfies ShellContext} />
      </main>
      <Footer />
    </div>
  );
}

function HeaderLink({ to, label, icon, mobile = false }: { to: string; label: string; icon: React.ReactNode; mobile?: boolean }) {
  return (
    <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex ${mobile ? "shrink-0" : ""} items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${isActive ? "bg-zinc-950 text-white" : mobile ? "bg-zinc-100" : "hover:bg-zinc-100"}`}>
      {icon}{label}
    </NavLink>
  );
}

function AuthPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const node = ref.current;
    node.innerHTML = "";
    client.authUI.mount(node, { onSuccess: onClose });
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border-2 bg-white p-4" style={{ borderColor: INK }}>
        <div className="mb-4 flex items-start gap-3">
          <img src="/brand/bloome-app-icon.png" alt={t("app.bloomeAlt")} className="h-14 w-14 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">{t("app.signIn")}</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">{t("app.bloomeSlogan")}</p>
          </div>
          <button className="text-sm font-black" onClick={onClose}>{t("app.cancel")}</button>
        </div>
        <div ref={ref} />
      </div>
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-center gap-2 px-4 pb-6 pt-2 text-xs font-semibold text-zinc-500">
      <a href="https://bloome.im" target="_blank" rel="noreferrer" className="inline-flex items-center">
        <img src="/brand/bloome-wordmark-ink.svg" alt={t("app.bloomeAlt")} className="h-4 w-auto" />
      </a>
      <span>{t("app.powered")}</span>
    </footer>
  );
}

export function useShellContext() {
  return useOutletContext<ShellContext>();
}
