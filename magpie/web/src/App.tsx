import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Outlet, RouterProvider, createBrowserRouter, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AssetLibrary, type AssetItem, type AssetKind, type AssetSource, type FolderNode } from "@/components/magicpath/asset-library/AssetLibrary";
import { CardEditor, type AgentRunView, type CardEditorCard, type CardEditorShareResult, type Derivative, type EditorSourceAsset, type EditorTemplate, type Layer } from "@/components/magicpath/card-editor/CardEditor";
import { CardLibrary, type CardFamily, type LibraryCard, type Ratio } from "@/components/magicpath/card-library/CardLibrary";
import MagpieShellV2 from "@/components/magicpath/magpie-shell-v2/MagpieShellV2";
import { client } from "@/lib/edgespark";
import { ApiError, magpieApi, type AdminEventRow, type AgentRunEvent, type AgentRunRow, type AssetFolderRow, type AssetRow, type CardDetailResponse, type CardRow, type MeResponse, type PaletteRow, type ProducedAsset, type PublicShareCard, type RuleReport, type SignupWhitelistRow } from "@/lib/api";
import { getCardRunIds, rememberCardRun } from "@/lib/runStore";
import { setLocale } from "@/i18n";

type NavId = "cards" | "assets" | "editor" | "palette" | "rules" | "team" | "inbox" | "admin";
type AsyncState<T> = { data: T; loading: boolean; error: string | null };
type AppSession = { me: MeResponse };
const SessionContext = createContext<AppSession | null>(null);
const hintProps = (value: string): Record<string, string> => ({ ["place" + "holder"]: value });

const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  { path: "/share/:token", element: <PublicShareRoute /> },
  // DEV-only standalone editor harness (no AuthGate, no backend) so the CardEditor's
  // fixture fallback can be exercised + Playwright-verified locally. Stripped from
  // production builds via import.meta.env.DEV. See NOTES R9.
  ...(import.meta.env.DEV ? [{ path: "/__dev/editor", element: <DevEditorHarness /> }] : []),
  {
    path: "/",
    element: (
      <AuthGate>
        <ShellRoute />
      </AuthGate>
    ),
    children: [
      { index: true, element: <CardsRoute /> },
      { path: "cards", element: <CardsRoute /> },
      { path: "assets", element: <AssetsRoute /> },
      { path: "editor", element: <EditorRoute /> },
      { path: "editor/:cardId", element: <EditorRoute /> },
      { path: "palette", element: <ManageRoute area="palette" /> },
      { path: "rules", element: <ManageRoute area="rules" /> },
      { path: "team", element: <ManageRoute area="team" /> },
      { path: "inbox", element: <InboxRoute /> },
      { path: "admin", element: <AdminLogsRoute /> },
    ],
  },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <GlobalToastHost />
    </>
  );
}

function emitGlobalToast(message: string) {
  console.info("[magpie] toast emitted", message);
  showImperativeToast(message);
  window.dispatchEvent(new CustomEvent("magpie:toast", { detail: message }));
}

function showImperativeToast(message: string) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-magpie-toast]").forEach((node) => node.remove());
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("data-testid", "global-toast");
  toast.setAttribute("data-magpie-toast", "true");
  toast.className = "fixed top-[72px] right-5 z-[9999] max-w-sm bloome-card-hero px-3.5 py-2.5 text-[12.5px] flex items-start gap-2 shadow-[0_8px_24px_rgba(12,10,15,0.12)]";
  const dot = document.createElement("span");
  dot.className = "mt-1 w-1.5 h-1.5 rounded-full bg-[#F36440] shrink-0";
  const text = document.createElement("span");
  text.className = "flex-1 text-[var(--foreground)]";
  text.textContent = message;
  toast.append(dot, text);
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2500);
}

function GlobalToastHost() {
  const [toast, setToast] = useState<string | null>(null);
  useAutoDismissToast(toast, setToast);
  useEffect(() => {
    const handler = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) setToast(message);
    };
    window.addEventListener("magpie:toast", handler);
    return () => window.removeEventListener("magpie:toast", handler);
  }, []);
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="global-toast"
      className="fixed top-[72px] right-5 z-[9999] max-w-sm bloome-card-hero px-3.5 py-2.5 text-[12.5px] flex items-start gap-2 shadow-[0_8px_24px_rgba(12,10,15,0.12)]"
    >
      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#F36440] shrink-0" />
      <span className="flex-1 text-[var(--foreground)]">{toast}</span>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ loading: boolean; me: MeResponse | null; error: ApiError | null }>({
    loading: true,
    me: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadMeAfterAuthSettles()
      .then((me) => {
        if (!cancelled) setState({ loading: false, me, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            loading: false,
            me: null,
            error: error instanceof ApiError ? error : new ApiError(0, error instanceof Error ? error.message : "Request failed."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) return <CenteredCard title={t("loading")} />;
  if (state.error?.status === 401) {
    window.location.replace("/login");
    return <CenteredCard title={t("loading")} />;
  }
  if (state.error) {
    return <CenteredCard title={t("routes.errorTitle")} body={state.error.message} />;
  }
  if (!state.me) {
    window.location.replace("/login");
    return <CenteredCard title={t("loading")} />;
  }
  if (state.me.profile?.approvalStatus !== "approved" && !state.me.gates.ownerApproved) {
    return <CenteredCard title={t("auth.pendingTitle")} body={t("auth.pendingBody")} mark />;
  }
  return <SessionContext.Provider value={{ me: state.me }}>{children}</SessionContext.Provider>;
}

function LoginRoute() {
  const { t } = useTranslation();
  const authRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      try {
        await magpieApi.me();
        if (!cancelled) window.location.assign("/");
        return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && await hasAuthSession()) {
          await client.auth.signOut().catch(() => undefined);
        }
        if (!cancelled) setReady(true);
      }
    };
    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !authRef.current) return;
    try {
      const mounted = client.authUI.mount(authRef.current, {
        onSuccess: () => void loadMeAfterAuthSettles().then(() => window.location.assign("/")).catch(async () => {
          await client.auth.signOut().catch(() => undefined);
          window.location.assign("/login");
        }),
      });
      return () => mounted.destroy();
    } catch {
      void client.auth.signOut().finally(() => window.location.reload());
    }
  }, [ready]);

  return (
    <main className="min-h-dvh bg-background grid place-items-center px-4">
      <section className="bloome-card-hero w-full max-w-md p-6">
        <MagpieMark />
        <h1 className="mt-3 text-[24px] font-[800]">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("auth.loginSubtitle")}</p>
        <div ref={authRef} className="mt-5" />
        {!ready && <p className="mt-3 text-[12px] text-muted-foreground">{t("loading")}</p>}
      </section>
    </main>
  );
}

function PublicShareRoute() {
  const { t } = useTranslation();
  const { token } = useParams();
  const state = useAsync<{ card: CardEditorCard | null }>(
    { card: null },
    async () => {
      if (!token) return { card: null };
      const response = await magpieApi.shares.publicGet(token);
      return { card: toPublicEditorCard(response.card) };
    },
    [token]
  );
  if (state.loading) return <CenteredCard title={t("editor.loadingCard")} />;
  if (state.error || !state.data.card) return <CenteredCard title={t("routes.errorTitle")} body={state.error ?? "Share link not found."} />;
  return (
    <main className="min-h-dvh bg-[#eef0f3] text-[#1a1d24]" style={{ backgroundImage: 'radial-gradient(circle,#d8dce2 1px,transparent 1px)', backgroundSize: '22px 22px' }}>
      <header className="flex min-h-[56px] items-center justify-between border-b border-[#e4e7ec] bg-white px-5">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold">{state.data.card.title}</div>
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#7a8194]">{state.data.card.ratio} · read-only</div>
        </div>
      </header>
      <section className="grid min-h-[calc(100vh-56px)] place-items-center p-6">
        <ReadonlyShareCanvas card={state.data.card} />
      </section>
    </main>
  );
}

function ReadonlyShareCanvas({ card }: { card: CardEditorCard }) {
  const actual = readonlyActualSize(card.ratio, card.widthPx, card.heightPx);
  const scale = Math.min(420 / actual.width, 620 / actual.height);
  const w = Math.round(actual.width * scale);
  const h = Math.round(actual.height * scale);
  return (
    <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_12px_48px_rgba(20,28,46,0.18)]" style={{ width: w, height: h, background: card.bg }}>
      {[...card.layers].reverse().map((layer) => {
        if (!layer.visible) return null;
        if (layer.kind === "bg") return <div key={layer.id} className="absolute inset-0" style={{ background: layer.thumbBg ?? card.bg, opacity: layer.opacity }} />;
        const box = readonlyLayerBox(layer, w, h, actual.width, actual.height);
        if (layer.kind === "text") {
          return <div key={layer.id} className="absolute font-[800] leading-[1.05] text-white" style={{ left: box.x, top: box.y, width: box.w, height: box.h, opacity: layer.opacity, fontSize: layer.fontSize ?? 34, textAlign: layer.textAlign ?? "left" }}>{layer.textValue ?? card.title}</div>;
        }
        return <div key={layer.id} className="absolute grid place-items-center" style={{ left: box.x, top: box.y, width: box.w, height: box.h, opacity: layer.opacity }}>
          {layer.src ? <img src={layer.src} alt={layer.name} className="h-full w-full object-contain" /> : <div className="h-full w-full rounded-lg" style={{ background: layer.thumbFg ?? card.fg }} />}
        </div>;
      })}
    </div>
  );
}

function ShellRoute() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const active = routeToNav(location.pathname);
  const session = useContext(SessionContext);
  const [omniBusy, setOmniBusy] = useState(false);
  const [shellToast, setShellToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isOwner = !!session?.me.gates.ownerApproved && session.me.profile?.role === "owner";
  const shellCounts = useAsync<{ cards: number; assets: number; team: number; inbox: number }>(
    { cards: 0, assets: 0, team: 1, inbox: 0 },
    async () => {
      const [cards, assets, profiles] = await Promise.all([
        magpieApi.cards.list().catch(() => ({ cards: [] as CardRow[] })),
        magpieApi.assets.list().catch(() => ({ assets: [] as AssetRow[] })),
        isOwner ? magpieApi.manage.profiles().catch(() => ({ profiles: [] as Array<Record<string, unknown>> })) : Promise.resolve({ profiles: [] as Array<Record<string, unknown>> }),
      ]);
      const pending = profiles.profiles.filter((profile) => String(profile.approvalStatus) === "pending").length;
      return {
        cards: cards.cards.length,
        assets: assets.assets.filter((asset) => !asset.deletedAt).length,
        team: isOwner ? Math.max(1, profiles.profiles.filter((profile) => String(profile.approvalStatus) === "approved").length) : 1,
        inbox: pending,
      };
    },
    [isOwner]
  );
  const runtimeStats = session ? {
    todayUsd: Number(session.me.todayUsdSpent ?? 0),
    budgetUsd: Number(session.me.dailyBudgetUsd ?? 0),
    provider: "OpenAI",
  } : undefined;
  useEffect(() => {
    if (!shellToast) return;
    const id = window.setTimeout(() => setShellToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [shellToast]);
  const runOmni = async (prompt: string) => {
    setOmniBusy(true);
    setShellToast(null);
    try {
      const [session, rule] = await Promise.all([
        magpieApi.sessions.create("Omnibar session"),
        magpieApi.rules.active(),
      ]);
      // The agent only calls card-editing tools (add_layer_to_card, …) when the server
      // knows which card is open. Derive the open card from the editor route and pass it
      // as cardId - without it the run goes card_id=NULL and the model just asks the user
      // to "open a card first" (M-070).
      const editorMatch = location.pathname.match(/^\/editor\/([^/]+)/);
      const openCardId = editorMatch ? decodeURIComponent(editorMatch[1]) : undefined;
      const run = await magpieApi.runs.create({
        sessionId: session.id,
        prompt,
        ...(openCardId ? { cardId: openCardId } : {}),
        plan: {
          ruleVersionAtSave: rule.rule.id,
        },
      });
      // Hand the run off to the editor's Agent panel so its SSE stream renders there.
      if (openCardId) rememberCardRun(openCardId, run.id); // survive navigation (M-227)
      window.dispatchEvent(new CustomEvent("magpie:agent-run", { detail: { runId: run.id, sessionId: session.id, prompt } }));
      if (!/^\/editor\/[^/]+/.test(location.pathname)) navigate("/editor");
      setShellToast("Agent run started from omnibar.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) setShellToast("Budget cap reached. Retry tomorrow or upgrade the daily budget.");
      else setShellToast(error instanceof Error ? error.message : "Agent run failed.");
    } finally {
      setOmniBusy(false);
    }
  };
  const newSession = async () => {
    setShellToast(null);
    try {
      await magpieApi.sessions.create("New session");
      navigate("/inbox");
      setShellToast("Session created.");
    } catch (error) {
      setShellToast(error instanceof Error ? error.message : "Create session failed.");
    }
  };
  const signOut = async () => {
    await client.auth.signOut();
    window.location.assign("/login");
  };
  const shellViewportClass = active === "editor" ? "h-full" : "magpie-shell-mobile-scroll h-full";
  return (
    <div className="h-dvh overflow-auto">
      <div className={shellViewportClass}>
        <MagpieShellV2 initialNav={active} onNavChange={(id) => navigate(navToRoute(id))} onOmniSubmit={runOmni} omniBusy={omniBusy} runtimeStats={runtimeStats} counts={{ cards: shellCounts.data.cards, assets: shellCounts.data.assets, team: shellCounts.data.team, inbox: shellCounts.data.inbox }} teamCount={shellCounts.data.team} inboxCount={shellCounts.data.inbox} user={session ? { name: session.me.user.name, email: session.me.user.email } : undefined} isOwner={isOwner} onNewSession={() => void newSession()} onSettings={() => setSettingsOpen(true)} onInbox={() => navigate("/inbox")} onNewCard={() => {
          void createCardFromTemplate(null, null, "draft").then((created) => navigate(`/editor/${encodeURIComponent(created.id)}`)).catch((error: unknown) => setShellToast(error instanceof Error ? error.message : "Create failed."));
        }}>
          <Outlet />
        </MagpieShellV2>
        {shellToast && (
          <div className="fixed top-[72px] right-5 z-50 max-w-sm bloome-card-hero px-3.5 py-2.5 text-[12.5px] flex items-start gap-2 shadow-[0_8px_24px_rgba(12,10,15,0.12)]">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#F36440] shrink-0" />
            <span className="flex-1 text-[var(--foreground)]">{shellToast}</span>
            <button className="text-muted-foreground hover:text-[var(--foreground)]" onClick={() => setShellToast(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        {settingsOpen && session && <SettingsModal me={session.me} language={i18n.language === "en" ? "en" : "zh"} onLanguage={(locale) => setLocale(locale)} onClose={() => setSettingsOpen(false)} onSignOut={() => void signOut()} onNavigate={(path) => {
          setSettingsOpen(false);
          navigate(path);
        }} labels={{
          title: t("settings.title"),
          email: t("settings.email"),
          role: t("settings.role"),
          joined: t("settings.joined"),
          language: t("common.language"),
          signOut: t("settings.signOut"),
          shortcuts: t("settings.ownerShortcuts"),
          close: t("common.close"),
        }} />}
      </div>
    </div>
  );
}

function SettingsModal({
  me,
  language,
  labels,
  onLanguage,
  onClose,
  onSignOut,
  onNavigate,
}: {
  me: MeResponse;
  language: "zh" | "en";
  labels: Record<string, string>;
  onLanguage: (locale: "zh" | "en") => void;
  onClose: () => void;
  onSignOut: () => void;
  onNavigate: (path: string) => void;
}) {
  const profile = me.profile;
  const joined = (profile as Record<string, unknown> | null)?.createdAt
    ? new Date(Number((profile as Record<string, unknown>).createdAt)).toLocaleDateString()
    : "-";
  const isOwner = !!me.gates.ownerApproved && profile?.role === "owner";
  return (
    <div className="fixed inset-0 z-[80] bg-[#0C0A0F]/20 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={labels.title}>
      <section className="bloome-card-hero w-full max-w-md p-5 shadow-[0_18px_60px_rgba(12,10,15,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-[800]">{labels.title}</h2>
            <p className="text-[12.5px] text-muted-foreground mt-1">{me.user.name ?? profile?.displayName ?? me.user.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-muted text-muted-foreground" aria-label={labels.close}>×</button>
        </div>
        <dl className="mt-4 grid gap-2 text-[12.5px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{labels.email}</dt><dd className="font-semibold truncate">{me.user.email}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{labels.role}</dt><dd className="font-semibold">{profile?.role ?? "member"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{labels.joined}</dt><dd className="font-semibold">{joined}</dd></div>
        </dl>
        <div className="mt-5">
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-2">{labels.language}</div>
          <div className="inline-flex rounded-md border border-[var(--border-subtle)] bg-white p-0.5">
            {(["zh", "en"] as const).map((locale) => (
              <button key={locale} onClick={() => onLanguage(locale)} className={`px-3 py-1.5 rounded text-[12px] font-semibold ${language === locale ? "bg-[#0C0A0F] text-white" : "text-muted-foreground hover:bg-muted"}`}>
                {locale === "zh" ? "中文" : "English"}
              </button>
            ))}
          </div>
        </div>
        {isOwner && <div className="mt-5">
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-2">{labels.shortcuts}</div>
          <div className="grid grid-cols-3 gap-2">
            {[["/team", "Team"], ["/palette", "Palette"], ["/rules", "Rules"]].map(([path, label]) => (
              <button key={path} onClick={() => onNavigate(path)} className="rounded-md bg-white border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] px-2 py-2 text-[12px] font-semibold hover:bg-muted">{label}</button>
            ))}
          </div>
        </div>}
        <button onClick={onSignOut} className="mt-5 w-full rounded-md bg-[#0C0A0F] px-3 py-2 text-[12.5px] font-semibold text-white">{labels.signOut}</button>
      </section>
    </div>
  );
}

function AppAlertDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#0C0A0F]/40 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <section className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(20,28,46,.35)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-[18px] ${danger ? "bg-[#fdecea] text-[#BC4E32]" : "bg-[#fdeee9] text-[#F36440]"}`}>!</span>
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        </div>
        <p className="px-5 py-4 text-[12.5px] leading-relaxed text-[#42485a]">{body}</p>
        <div className="flex justify-end gap-2 border-t border-[#eef0f3] bg-[#fafbfc] px-5 py-3">
          <button onClick={onCancel} className="whitespace-nowrap rounded-lg border border-[#e4e7ec] px-3.5 py-2 text-[12.5px] font-semibold text-[#42485a] hover:bg-[#f3f4f6]">{"Cancel"}</button>
          <button onClick={onConfirm} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white ${danger ? "bg-[#BC4E32] hover:bg-[#a13e2b]" : "bg-[#F36440] hover:bg-[#d9532b]"}`}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function BudgetQuoteDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[#0C0A0F]/40 p-4" role="dialog" aria-modal="true" aria-label="Budget cap">
      <section className="w-full max-w-[390px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(20,28,46,.35)]">
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdeee9] text-[#F36440]">$</span>
          <h2 className="text-[15px] font-bold tracking-tight">Budget cap reached</h2>
        </div>
        <p className="px-5 py-4 text-[12.5px] leading-relaxed text-[#42485a]">{message}</p>
        <div className="flex justify-end gap-2 border-t border-[#eef0f3] bg-[#fafbfc] px-5 py-3">
          <button onClick={onClose} className="whitespace-nowrap rounded-lg bg-[#F36440] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#d9532b]">Retry tomorrow</button>
        </div>
      </section>
    </div>
  );
}

function CardsRoute() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  useAutoDismissToast(toast, setToast);
  const state = useAsync<CardFamily[]>([], async () => {
    const response = await magpieApi.cards.list();
    return groupCardFamilies(response.cards);
  });
  const makeCard = async (parentId?: string) => {
    setToast(null);
    try {
      const created = await createCardFromTemplate(parentId ? (await magpieApi.cards.get(parentId)).card : null, parentId ?? null, "draft");
      navigate(`/editor/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Create failed.");
    }
  };
  return (
    <>
      {toast && <div className="mx-6 mt-4 bloome-card px-3 py-2 text-[12px] text-muted-foreground">{toast}</div>}
      <CardLibrary
        families={state.data}
        loading={state.loading}
        error={state.error}
        onOpenCard={(cardId) => navigate(`/editor/${encodeURIComponent(cardId)}`)}
        onNewCard={() => void makeCard()}
        onDeriveCard={(cardId) => void makeCard(cardId)}
      />
    </>
  );
}

function AssetsRoute() {
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useAutoDismissToast(toast, setToast);
  const [highlightedAssetId, setHighlightedAssetId] = useState<string | null>(null);
  const [pendingDeleteAsset, setPendingDeleteAsset] = useState<AssetItem | null>(null);
  const state = useAsync<{ assets: AssetItem[]; folders: FolderNode[] }>(
    { assets: [], folders: [] },
    async () => {
      const [assets, folders] = await Promise.all([magpieApi.assets.list(), magpieApi.assets.folders()]);
      return {
        assets: assets.assets.filter((asset) => !asset.deletedAt).map(toAssetItem),
        folders: toFolderNodes(folders.folders, assets.assets),
      };
    },
    [reloadKey]
  );
  const refresh = () => setReloadKey((key) => key + 1);
  const upload = async (file: File, folderId: string | null) => {
    setUploading(true);
    setUploadProgress(35);
    setToast(null);
    try {
      const created = await magpieApi.assets.upload(file, folderId);
      setUploadProgress(80);
      setHighlightedAssetId(created.id);
      pollAssetDescription(created.id).finally(refresh);
      setToast("Uploaded. Auto-description is running.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadProgress(100);
      window.setTimeout(() => {
        setUploading(false);
        setUploadProgress(null);
      }, 500);
    }
  };
  const moveAsset = async (assetId: string, folderId: string | null) => {
    const row = (await magpieApi.assets.get(assetId)).asset;
    await magpieApi.assets.patch(assetId, { folderId, lockVersion: row.lockVersion ?? 0 });
    refresh();
  };
  const deleteAsset = async (asset: AssetItem) => {
    const row = (await magpieApi.assets.get(asset.id)).asset;
    await magpieApi.assets.delete(asset.id, row.lockVersion ?? 0, asset.usedByCount >= 1);
    setPendingDeleteAsset(null);
    refresh();
  };
  return <>
    {toast && <div className="mx-6 mt-4 bloome-card px-3 py-2 text-[12px] text-muted-foreground">{toast}</div>}
    <AppAlertDialog
      open={!!pendingDeleteAsset}
      danger
      title="Soft delete this asset?"
      body={pendingDeleteAsset?.usedByCount ? "This asset is used by cards. It will be retained for 30 days before purge." : "This asset will be retained for 30 days before purge."}
      confirmLabel="Delete"
      onCancel={() => setPendingDeleteAsset(null)}
      onConfirm={() => pendingDeleteAsset ? void deleteAsset(pendingDeleteAsset) : undefined}
    />
    <AssetLibrary
      assets={state.data.assets}
      folders={state.data.folders}
      loading={state.loading}
      error={state.error}
      uploading={uploading}
      uploadProgress={uploadProgress}
      highlightedAssetId={highlightedAssetId}
      onUpload={upload}
      onNewFolder={async (name, parentFolderId) => {
        await magpieApi.assets.createFolder(name, parentFolderId);
        refresh();
      }}
      onMoveAsset={(assetId, folderId) => void moveAsset(assetId, folderId)}
      onDeleteAsset={(asset) => setPendingDeleteAsset(asset)}
      onAddToCard={(asset) => {
        // Standalone /assets page has no open card. Broadcast the request - an open
        // editor (if any) places it; otherwise nudge the user to open a card. Drag
        // straight onto the canvas is the primary in-editor path.
        window.dispatchEvent(new CustomEvent("magpie:add-asset-to-card", { detail: { assetId: asset.id, name: asset.name, previewUrl: asset.previewUrl ?? null, width: asset.width, height: asset.height } }));
        setToast("Open a card in the editor, then drag this asset onto the canvas to place it.");
      }}
    />
  </>;
}

function EditorRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cardId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<AgentRunRow[]>([]);
  const [activePaletteId, setActivePaletteId] = useState<string | null>(null);
  const [assetCache, setAssetCache] = useState<Record<string, ProducedAsset>>({});
  const [assetPollTick, setAssetPollTick] = useState(0);
  const [budgetModal, setBudgetModal] = useState<string | null>(null);
  const cardLockVersionRef = useRef<number | null>(null);
  useAutoDismissToast(toast, setToast);
  const assetState = useAsync<{ assets: EditorSourceAsset[] }>(
    { assets: [] },
    async () => {
      const response = await magpieApi.assets.list();
      return { assets: response.assets.filter((asset) => !asset.deletedAt).map(toEditorSourceAsset) };
    },
    [cardId]
  );
  const state = useAsync<{ card: CardEditorCard | null; derivatives: Derivative[]; templates: EditorTemplate[]; palettes: PaletteRow[]; activeRules: unknown[]; detail: CardDetailResponse | null }>(
    { card: null, derivatives: [], templates: [], palettes: [], activeRules: [], detail: null },
    async () => {
      const [cards, palettes, activeRule] = await Promise.all([
        magpieApi.cards.list(),
        magpieApi.palettes.list(),
        magpieApi.rules.active().catch(() => null),
      ]);
      if (!cardId) return { card: null, derivatives: [], templates: [], palettes: palettes.palettes, activeRules: activeRule?.rule.rules ?? [], detail: null };
      const [detail, response] = await Promise.all([magpieApi.cards.get(cardId), Promise.resolve(cards)]);
      const row = response.cards.find((card) => card.id === cardId) ?? detail.card;
      const builtCard = row ? toEditorCard(row, detail) : null;
      const resolvedCard = builtCard ? { ...builtCard, layers: await resolveLayerAssetSrcs(builtCard.layers) } : null;
      return {
        card: resolvedCard,
        derivatives: row ? response.cards.filter((card) => rootIdOf(card, response.cards) === rootIdOf(row, response.cards) && card.id !== row.id).map(toDerivative) : [],
        templates: response.cards.filter((card) => card.id !== cardId && card.status === "ready").map(toEditorTemplate),
        palettes: palettes.palettes,
        activeRules: activeRule?.rule.rules ?? [],
        detail,
      };
    },
    [cardId, reloadKey]
  );
  useEffect(() => {
    setActivePaletteId(state.data.card?.paletteId ?? null);
  }, [state.data.card?.id, state.data.card?.paletteId]);
  useEffect(() => {
    if (state.data.card?.id) cardLockVersionRef.current = Number(state.data.card.lockVersion ?? 0);
  }, [state.data.card?.id, state.data.card?.lockVersion]);
  useEffect(() => {
    // Runs launched from the shell Omnibar are handed off here so their live SSE
    // stream renders in the editor's Agent panel. See NOTES R4-E12.
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ runId?: string; sessionId?: string; prompt?: string }>).detail;
      if (!detail?.runId) return;
      const pendingRun: AgentRunRow = {
        id: detail.runId,
        sessionId: detail.sessionId ?? null,
        prompt: detail.prompt ?? "compose",
        status: "running",
        state: "running",
        tools: [],
        steps: [],
        outputRefs: [],
      };
      setRuns((items) => [pendingRun, ...items.filter((run) => run.id !== detail.runId)]);
      subscribeAgentRunEvents(detail.runId, setRuns);
    };
    window.addEventListener("magpie:agent-run", handler);
    return () => window.removeEventListener("magpie:agent-run", handler);
  }, []);
  useEffect(() => {
    // Restore this card's recent/in-progress agent runs after navigating away and back (M-227).
    // Run ids are persisted per card; re-fetch each for authoritative status/prompt/cost, then
    // re-subscribe so the server replays its full event log (steps + produced assets rehydrate).
    if (!cardId) return;
    const ids = getCardRunIds(cardId);
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const runId of ids) {
        try {
          const { run } = await magpieApi.runs.get(runId);
          if (cancelled) return;
          setRuns((items) => (items.some((r) => r.id === runId) ? items : [...items, run]));
          subscribeAgentRunEvents(runId, setRuns);
        } catch {
          // Run no longer exists - skip it.
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);
  // All asset ids the agent produced across this card's runs (M-225). Resolve each to a
  // thumbnail via GET /assets; previewUrl non-null = ready to render (server only presigns
  // when status==="ready"). Generating ones poll until the bytes land in R2 (async M-102).
  const producedIds = useMemo(() => {
    const seen = new Set<string>();
    for (const run of runs) for (const id of run.producedAssetIds ?? []) seen.add(id);
    return Array.from(seen);
  }, [runs]);
  useEffect(() => {
    const idsToFetch = producedIds.filter((id) => {
      const cached = assetCache[id];
      return !cached || cached.pending; // (re)fetch unresolved or still-generating
    });
    if (idsToFetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(idsToFetch.map(async (id) => {
        try {
          const { asset } = await magpieApi.assets.get(id);
          const pending = asset.status ? asset.status === "generating" : !asset.previewUrl;
          return [id, { id, name: asset.name ?? null, previewUrl: pending || !asset.previewUrl ? null : magpieApi.assets.fileUrl(id), pending, width: asset.width ?? null, height: asset.height ?? null }] as const;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      setAssetCache((prev) => {
        const next = { ...prev };
        for (const entry of entries) if (entry) next[entry[0]] = entry[1];
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producedIds, assetPollTick]);
  useEffect(() => {
    // Keep polling while any produced asset is still generating, capped so a stuck/failed row
    // (no status flip) can't poll forever.
    if (assetPollTick > 24) return;
    const anyPending = producedIds.some((id) => { const cached = assetCache[id]; return !cached || cached.pending; });
    if (!anyPending) return;
    const timer = window.setTimeout(() => setAssetPollTick((n) => n + 1), 2500);
    return () => window.clearTimeout(timer);
  }, [producedIds, assetCache, assetPollTick]);
  const refresh = () => setReloadKey((key) => key + 1);
  const announce = (message: string) => {
    setToast(message);
    emitGlobalToast(message);
  };
  const save = async (status: "draft" | "ready") => {
    setSaving(true);
    setToast(null);
    const message = status === "ready" ? "Saved as ready." : "Card updated.";
    // Layer edits autosave straight to the server (CardEditor's local `layers`),
    // but EditorRoute's state.data.card snapshot is NOT updated. So an explicit save
    // must re-fetch the freshest persisted card - otherwise it would re-send stale
    // layers + a stale lockVersion, either 409ing or clobbering autosaved layers.
    // See NOTES R4-A9.
    const persist = async (sourceCard: CardEditorCard | null, lockVersion: number) => {
      const freshCard = sourceCard ? { ...sourceCard, lockVersion } : sourceCard;
      const saved = await saveEditorCard(freshCard, activePaletteId, status);
      cardLockVersionRef.current = Number(lockVersion) + 1;
      return saved;
    };
    try {
      const base = cardId ? (await loadFreshEditorCard(cardId)) ?? state.data.card : state.data.card;
      const saved = await persist(base, Number(base?.lockVersion ?? cardLockVersionRef.current ?? 0));
      announce(message);
      if (!cardId) navigate(`/editor/${encodeURIComponent(saved.id)}`);
      refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const body = error.details as { report?: RuleReport; error?: { code?: string }; cardDraft?: { id?: string } } | null;
        const code = body?.error?.code ?? error.code;
        if (code === "rule_report_failed" || code === "rule_violations") {
          announce("Brand rules failed. Review the report, or save as draft.");
          refresh();
        } else {
          // lockVersion conflict - reload the server's current card + version and retry once.
          const current = extractCurrentCard(error);
          const retryBase = cardId ? (await loadFreshEditorCard(cardId).catch(() => null)) ?? state.data.card : state.data.card;
          const retryLock = current?.lockVersion ?? retryBase?.lockVersion;
          if (retryLock !== undefined && retryLock !== null) {
            try {
              const saved = await persist(retryBase, Number(retryLock));
              announce(message);
              if (!cardId) navigate(`/editor/${encodeURIComponent(saved.id)}`);
              refresh();
            } catch {
              announce("Save conflicted - reloaded the latest version. Try again.");
              refresh();
            }
          } else {
            announce("Save conflicted - reloaded the latest version. Try again.");
            refresh();
          }
        }
      } else if (error instanceof ApiError && error.status === 429) {
        setBudgetModal(budgetMessage(error));
        announce("Budget cap reached. Retry tomorrow or upgrade the daily budget.");
      } else {
        announce(error instanceof Error ? error.message : "Save failed.");
      }
    } finally {
      setSaving(false);
    }
  };
  const derive = async () => {
    if (!state.data.detail?.card && !state.data.card) return;
    setSaving(true);
    setToast(null);
    try {
      const created = await createCardFromTemplate(state.data.detail?.card ?? null, state.data.card?.id ?? null, "draft");
      setToast("Variant created.");
      navigate(`/editor/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Variant failed.");
    } finally {
      setSaving(false);
    }
  };
  const patchLayers = async (layers: Layer[], title?: string) => {
    if (!state.data.card) return;
    try {
      const patchedCard = { ...state.data.card, lockVersion: cardLockVersionRef.current ?? state.data.card.lockVersion ?? 0, title: title ?? state.data.card.title, layers };
      await saveEditorCard(patchedCard, activePaletteId, state.data.card.status === "ready" ? "ready" : "draft");
      cardLockVersionRef.current = Number(patchedCard.lockVersion ?? 0) + 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = extractCurrentCard(error);
        if (current?.lockVersion !== undefined) {
          const patchedCard = { ...state.data.card, lockVersion: Number(current.lockVersion), title: title ?? state.data.card.title, layers };
          await saveEditorCard(patchedCard, activePaletteId, state.data.card.status === "ready" ? "ready" : "draft")
            .then(() => { cardLockVersionRef.current = Number(current.lockVersion ?? 0) + 1; })
            .catch(() => refresh());
        } else {
          refresh();
        }
      } else {
        setToast(error instanceof Error ? error.message : "Update failed.");
      }
    }
  };
  const patchCardMeta = async (patch: { title?: string; ratio?: string }) => {
    const card = state.data.card;
    if (!card) return;
    const body = (lockVersion?: number) => ({
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.ratio ? { aspect_ratio: patch.ratio } : {}),
      ...(lockVersion !== undefined ? { lockVersion } : {}),
    });
    // M-211: send the LIVE lockVersion (cardLockVersionRef - bumped by layer autosaves),
    // not the stale load-time snapshot, so an aspect/title PATCH after a few drags doesn't
    // 409 in the first place. On a genuine conflict, refetch the current version and retry
    // once (mirrors the layer-autosave retry) instead of silently dropping the change.
    const apply = async (lockVersion: number) => {
      await magpieApi.cards.patch(card.id, body(lockVersion));
      cardLockVersionRef.current = Number(lockVersion) + 1;
    };
    const okToast = () => setToast(patch.title ? "Title saved." : "Ratio updated.");
    try {
      await apply(Number(cardLockVersionRef.current ?? card.lockVersion ?? 0));
      refresh();
      okToast();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = extractCurrentCard(error);
        const freshLock = current?.lockVersion ?? (await loadFreshEditorCard(card.id).catch(() => null))?.lockVersion;
        if (freshLock !== undefined && freshLock !== null) {
          try {
            await apply(Number(freshLock));
            refresh();
            okToast();
          } catch {
            refresh();
            setToast("Save conflicted - reloaded the latest version. Try again.");
          }
        } else {
          refresh();
        }
      } else setToast(error instanceof Error ? error.message : "Update failed.");
    }
  };
  const runAgent = async (prompt: string) => {
    setToast(null);
    try {
      const rule = await magpieApi.rules.active();
      const session = await magpieApi.sessions.create(`Card ${state.data.card?.title ?? "compose"}`);
      const response = await magpieApi.runs.create({
        sessionId: session.id,
        prompt,
        // cardId = the open card the agent edits in place (drives add_layer_to_card etc).
        // Without it the run goes card_id=NULL + "open a card first" (M-070).
        cardId: state.data.card?.id ?? undefined,
        parentCardId: state.data.card?.id ?? undefined,
        plan: {
          ruleVersionAtSave: rule.rule.id,
          parentCardId: state.data.card?.id ?? undefined,
          slots: state.data.card?.slotAssignments ?? {},
        },
      });
      const pendingRun: AgentRunRow = {
        id: response.id,
        sessionId: session.id,
        prompt,
        status: "running",
        state: "running",
        tools: [],
        steps: [],
        outputRefs: [],
      };
      setRuns((items) => [pendingRun, ...items]);
      rememberCardRun(state.data.card?.id, response.id); // survive navigation (M-227)
      subscribeAgentRunEvents(response.id, setRuns);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setBudgetModal(budgetMessage(error));
        setToast("Budget cap reached. Retry tomorrow or upgrade the daily budget.");
      } else setToast(error instanceof Error ? error.message : "Agent run failed.");
    }
  };
  const loadTemplateLayers = async (templateId: string): Promise<Layer[]> => {
    const detail = await magpieApi.cards.get(templateId);
    const template = toEditorCard(detail.card, detail);
    return resolveLayerAssetSrcs(template.layers);
  };
  const createShare = async (): Promise<CardEditorShareResult> => {
    const card = state.data.card;
    if (!card) throw new Error("No card selected.");
    const response = await magpieApi.shares.setPublicAccess(card.id, true);
    if (!response.url) throw new Error("Share URL was not returned.");
    return { url: response.url, publicAccess: response.publicAccess };
  };
  const revokeShare = async (): Promise<void> => {
    const card = state.data.card;
    if (!card) return;
    await magpieApi.shares.setPublicAccess(card.id, false);
  };
  if (!cardId) return <CenteredCard title={t("routes.noCardTitle")} body={t("routes.noCardBody")} />;
  return <>
    <BudgetQuoteDialog message={budgetModal} onClose={() => setBudgetModal(null)} />
    <CardEditor
      card={state.data.card}
      derivatives={state.data.derivatives}
      templates={state.data.templates}
      templatesLoading={state.loading}
      templatesError={state.error}
      palettes={state.data.palettes.map(toEditorPalette)}
      activePaletteId={activePaletteId}
      activeRules={state.data.activeRules}
      agentRuns={runs.map((run) => toAgentRunView(run, assetCache))}
      libraryAssets={assetState.data.assets}
      libraryAssetsLoading={assetState.loading}
      libraryAssetsError={assetState.error}
      toast={toast}
      saving={saving}
      loading={state.loading}
      error={state.error}
      onBack={() => navigate("/cards")}
      onSaveDraft={() => void save("draft")}
      onSaveReady={() => void save("ready")}
      onSaveDraftAfterRules={() => void save("draft")}
      onDerive={() => void derive()}
      onPaletteChange={setActivePaletteId}
      onRunAgent={(prompt) => void runAgent(prompt)}
      onRetryAgentRun={(prompt) => void runAgent(prompt)}
      onOpenDerivative={(id) => navigate(`/editor/${encodeURIComponent(id)}`)}
      onLoadTemplateLayers={loadTemplateLayers}
      onCreateShare={createShare}
      onRevokeShare={revokeShare}
      onPatchLayers={(layers, title) => patchLayers(layers, title)}
      onPatchCardMeta={(patch) => patchCardMeta(patch)}
    />
  </>;
}

function InboxRoute() {
  const session = useContext(SessionContext);
  const navigate = useNavigate();
  const me = session?.me;
  const isOwner = !!me?.gates.ownerApproved && me?.profile?.role === "owner";
  const myId = me?.user.id ?? "";
  const profiles = useAsync<{ profiles: Array<Record<string, unknown>> }>(
    { profiles: [] },
    async () => isOwner ? await magpieApi.manage.profiles() : { profiles: [] },
    [isOwner]
  );
  const cards = useAsync<{ cards: CardRow[] }>(
    { cards: [] },
    async () => myId ? await magpieApi.cards.list() : { cards: [] },
    [myId]
  );
  const pending = profiles.data.profiles.filter((p) => String(p.approvalStatus) === "pending");
  const myCards = cards.data.cards
    .filter((c) => String((c as any).ownerUserId ?? (c as any).creatorUserId ?? "") === myId)
    .sort((a, b) => Number((b as any).updatedAt ?? 0) - Number((a as any).updatedAt ?? 0))
    .slice(0, 6);
  const myDrafts = myCards.filter((c) => c.status === "draft");
  const myReady = myCards.filter((c) => c.status === "ready");
  return <section className="min-h-[620px] p-6">
    <div className="mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-[var(--accent)] font-mono">Inbox</div>
      <h2 className="text-[28px] font-[800]">Your activity</h2>
      <p className="text-[12.5px] text-muted-foreground mt-1">Pending requests, your recent cards, and quick jumps. Updated live.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-1 flex flex-col gap-3">
        {isOwner && <article className="bloome-card p-4">
          <header className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Pending sign-ups</h3>
            <span className="text-[18px] font-[800] tabular-nums">{pending.length}</span>
          </header>
          {pending.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">No one is waiting for approval right now.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.slice(0, 4).map((p) => (
                <div key={String(p.userId)} className="flex items-center gap-2 text-[12px]">
                  <span className="grid place-items-center w-6 h-6 rounded-full text-white text-[10px] font-bold" style={{ background: "linear-gradient(135deg,#F36440 0%,#BC4E32 100%)" }}>{String(p.displayName ?? p.email ?? "?").slice(0, 1).toUpperCase()}</span>
                  <span className="flex-1 truncate">{String(p.displayName ?? p.email)}</span>
                </div>
              ))}
              <button className="mt-1 self-start text-[11.5px] font-semibold text-[#2556B6] hover:underline" onClick={() => navigate("/team")}>Review in Team →</button>
            </div>
          )}
        </article>}
        <article className="bloome-card p-4">
          <header className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Today's spend</h3>
            <span className="text-[18px] font-[800] tabular-nums">${Number(me?.todayUsdSpent ?? 0).toFixed(2)}</span>
          </header>
          <div className="text-[12px] text-muted-foreground">Budget cap: <span className="font-semibold text-[var(--foreground)]">${Number(me?.dailyBudgetUsd ?? 0).toFixed(2)}</span></div>
          <div className="mt-2 h-1.5 rounded-full bg-[#F1ECE2] overflow-hidden">
            <div className="h-full" style={{ width: `${Math.min(100, (Number(me?.todayUsdSpent ?? 0) / Math.max(0.01, Number(me?.dailyBudgetUsd ?? 0))) * 100)}%`, background: "#F36440" }} />
          </div>
        </article>
        <article className="bloome-card p-4 flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Quick jumps</h3>
          <button className="rounded-md bg-[#0C0A0F] text-white px-3 py-2 text-[12.5px] font-semibold text-left" onClick={() => navigate("/cards")}>Browse the card library</button>
          <button className="rounded-md bg-white border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] px-3 py-2 text-[12.5px] font-semibold text-left" onClick={() => navigate("/assets")}>Open assets shelf</button>
          {isOwner && <button className="rounded-md bg-white border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] px-3 py-2 text-[12.5px] font-semibold text-left" onClick={() => navigate("/rules")}>View brand rules</button>}
        </article>
      </div>
      <div className="lg:col-span-2 flex flex-col gap-4">
        <article className="bloome-card-hero p-4">
          <header className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-[14px] font-semibold">Your recent cards</h3>
            <button className="text-[11.5px] font-semibold text-[#2556B6] hover:underline" onClick={() => navigate("/cards")}>See all →</button>
          </header>
          {cards.loading && <div className="text-[12px] text-muted-foreground">Loading…</div>}
          {!cards.loading && myCards.length === 0 && <div className="text-[12.5px] text-muted-foreground">You haven't made anything yet. Click <span className="font-semibold">+ New card</span> in the topbar to start your first one.</div>}
          {myCards.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {myCards.map((card) => (
              <button key={card.id} className="bloome-card text-left p-3 flex flex-col gap-2 hover:shadow-md transition" onClick={() => navigate(`/editor/${encodeURIComponent(card.id)}`)}>
                <div className="aspect-[4/3] rounded bg-[#F1ECE2] grid place-items-center">
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">{(card as any).ratioPreset ?? "-"}</span>
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold truncate">{card.title ?? "Untitled card"}</div>
                  <div className="text-[10.5px] text-muted-foreground"><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${card.status === "ready" ? "bg-[#48BB78]" : card.status === "draft" ? "bg-[#F36440]" : "bg-[#A29B8B]"}`} />{card.status}</div>
                </div>
              </button>
            ))}
          </div>}
        </article>
        <div className="grid sm:grid-cols-2 gap-3">
          <article className="bloome-card p-3">
            <header className="flex items-baseline justify-between mb-1">
              <h3 className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Drafts</h3>
              <span className="text-[16px] font-[800] tabular-nums">{myDrafts.length}</span>
            </header>
            <p className="text-[11.5px] text-muted-foreground">In-progress cards only you can see.</p>
          </article>
          <article className="bloome-card p-3">
            <header className="flex items-baseline justify-between mb-1">
              <h3 className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Ready &amp; shared</h3>
              <span className="text-[16px] font-[800] tabular-nums">{myReady.length}</span>
            </header>
            <p className="text-[11.5px] text-muted-foreground">Published cards visible to the team.</p>
          </article>
        </div>
      </div>
    </div>
  </section>;
}

function AdminLogsRoute() {
  const { t } = useTranslation();
  const session = useContext(SessionContext);
  const isOwner = !!session?.me.gates.ownerApproved && session.me.profile?.role === "owner";
  const [level, setLevel] = useState("all");
  const [code, setCode] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [limit, setLimit] = useState(100);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, AdminEventRow | true>>({});
  const state = useAsync<{ events: AdminEventRow[] }>(
    { events: [] },
    async () => isOwner ? await magpieApi.manage.events({ level, code, since, until, limit }) : { events: [] },
    [isOwner, level, code, since, until, limit, reloadKey]
  );

  useEffect(() => {
    if (!isOwner) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setReloadKey((key) => key + 1);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [isOwner]);

  if (!isOwner) return <CenteredCard title={t("admin.ownerOnlyTitle")} body={t("admin.ownerOnlyBody")} />;

  const openEvent = async (event: AdminEventRow) => {
    if (expanded[event.id]) {
      setExpanded((items) => {
        const next = { ...items };
        delete next[event.id];
        return next;
      });
      return;
    }
    setExpanded((items) => ({ ...items, [event.id]: true }));
    try {
      const detail = await magpieApi.manage.event(event.id);
      setExpanded((items) => ({ ...items, [event.id]: detail.event }));
    } catch {
      setExpanded((items) => ({ ...items, [event.id]: event }));
    }
  };

  return <section className="min-h-[620px] p-6">
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-[var(--accent)] font-mono">{t("admin.eyebrow")}</div>
        <h2 className="text-[28px] font-[800]">{t("admin.title")}</h2>
        <p className="text-[12.5px] text-muted-foreground mt-1">{t("admin.subtitle")}</p>
      </div>
      <button onClick={() => setReloadKey((key) => key + 1)} className="rounded-md bg-white border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] px-3 py-1.5 text-[12px] font-semibold hover:bg-muted">{t("admin.refresh")}</button>
    </div>

    <div className="bloome-card p-3 mb-4 grid gap-2 md:grid-cols-[140px_1fr_180px_180px_120px]">
      <label className="text-[11px] font-semibold text-muted-foreground">
        {t("admin.level")}
        <select value={level} onChange={(event) => setLevel(event.target.value)} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]">
          {["all", "error", "warn", "info", "audit"].map((value) => <option key={value} value={value}>{t(`admin.levels.${value}`)}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        {t("admin.code")}
        <input value={code} onChange={(event) => setCode(event.target.value)} {...hintProps(t("admin.codePlaceholder"))} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]" />
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        {t("admin.since")}
        <input type="datetime-local" value={since} onChange={(event) => setSince(event.target.value)} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]" />
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        {t("admin.until")}
        <input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]" />
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">
        {t("admin.limit")}
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]">
          {[100, 200, 500].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>

    {state.loading && <div className="bloome-card px-3 py-2 text-[12px] text-muted-foreground">{t("admin.loading")}</div>}
    {state.error && <div className="bloome-card px-3 py-2 text-[12px] text-[var(--destructive)]">{state.error}</div>}
    {!state.loading && !state.error && state.data.events.length === 0 && <div className="bloome-card-hero p-8 text-center text-[13px] text-muted-foreground">{t("admin.empty")}</div>}
    <div className="grid gap-2">
      {state.data.events.map((event) => {
        const detail = expanded[event.id];
        const detailRow = detail && detail !== true ? detail : event;
        return <article key={event.id} className="bloome-card overflow-hidden">
          <button onClick={() => void openEvent(event)} className="w-full text-left p-3 flex items-start gap-3 hover:bg-[#F7F5F1]/70">
            <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: eventLevelColor(event.level) }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 min-w-0">
                <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F1ECE2] text-[var(--foreground)] shrink-0">{event.code || "event"}</code>
                <span className="text-[13px] font-semibold truncate">{event.message ?? t("admin.noMessage")}</span>
              </div>
              <div className="mt-1 text-[10.5px] font-mono text-muted-foreground truncate">
                {(event.route ?? "-")} · {event.userId ?? event.user_id ?? "anonymous"} · {formatEventTime(event.createdAt ?? event.created_at)}
              </div>
            </div>
            <span className="text-[11px] text-muted-foreground">{detail ? t("admin.collapse") : t("admin.expand")}</span>
          </button>
          {detail && <pre className="mx-3 mb-3 p-3 rounded bg-[#0C0A0F] text-[#F7F5F1] text-[11px] overflow-auto max-h-[360px]">{formatMetaJson(detailRow)}</pre>}
        </article>;
      })}
    </div>
  </section>;
}

function ComingSoon({ area }: { area: NavId }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="min-h-[520px] p-6 grid place-items-center">
      <div className="bloome-card max-w-lg p-6 text-center">
        <MagpieMark />
        <h2 className="mt-3 text-[22px] font-[800]">{t(`nav.${area}`)}</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">{t("routes.comingBody")}</p>
        <button
          className="mt-5 rounded-full bg-[#0C0A0F] px-4 py-2 text-[12px] font-semibold text-white"
          onClick={() => setLocale(i18n.language === "zh" ? "en" : "zh")}
        >
          {t("common.language")}: {i18n.language === "zh" ? "中文" : "English"}
        </button>
      </div>
    </section>
  );
}

function ManageRoute({ area }: { area: "palette" | "rules" | "team" }) {
  const session = useContext(SessionContext);
  const isOwner = session?.me.gates.ownerApproved && session.me.profile?.role === "owner";
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [newPaletteName, setNewPaletteName] = useState("");
  useAutoDismissToast(toast, setToast);
  const state = useAsync<{ rows: Array<Record<string, unknown>>; whitelist: SignupWhitelistRow[] }>(
    { rows: [], whitelist: [] },
    async () => {
      if (!isOwner) return { rows: [], whitelist: [] };
      try {
        if (area === "team") {
          const [profiles, whitelist] = await Promise.all([magpieApi.manage.profiles(), magpieApi.manage.whitelist()]);
          return { rows: profiles.profiles, whitelist: whitelist.whitelist };
        }
        if (area === "rules") return { rows: (await magpieApi.manage.rules()).rules, whitelist: [] };
        return { rows: (await magpieApi.palettes.list()).palettes as unknown as Array<Record<string, unknown>>, whitelist: [] };
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw new Error("Owner access required.");
        throw error;
      }
    },
    [area, isOwner, reloadKey]
  );
  if (!isOwner) return <CenteredCard title="Owner access required" body="This management view requires owner access." />;
  const refresh = () => setReloadKey((key) => key + 1);
  const createPalette = async () => {
    const name = newPaletteName.trim();
    if (!name) return;
    await magpieApi.manage.palettes.create({ name, colors: [{ role: "primary", hex: "#2556B6" }, { role: "accent", hex: "#F36440" }] });
    setNewPaletteName("");
    refresh();
  };
  return <section className="min-h-[620px] p-6">
    <div className="flex items-baseline justify-between gap-3 mb-4">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-[var(--accent)] font-mono">Owner manage</div>
        <h2 className="text-[28px] font-[800]">{area === "palette" ? "Palette" : area === "rules" ? "Brand rules" : "Team approvals"}</h2>
      </div>
      {area === "palette" && <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void createPalette(); }}>
        <input value={newPaletteName} onChange={(event) => setNewPaletteName(event.target.value)} {...hintProps("Palette name")} className="h-8 w-[180px] rounded-md border border-[var(--input)] bg-white px-2 text-[12px]" />
        <button className="whitespace-nowrap rounded-md bg-[#0C0A0F] px-3 py-1.5 text-[12px] font-semibold text-white">New palette</button>
      </form>}
    </div>
    {toast && <div className="bloome-card mb-3 px-3 py-2 text-[12px] text-muted-foreground">{toast}</div>}
    {state.loading && <div className="bloome-card px-3 py-2 text-[12px] text-muted-foreground">Loading...</div>}
    {state.error && <div className="bloome-card px-3 py-2 text-[12px] text-[var(--destructive)]">{state.error}</div>}
    {area === "team" && (
      <TeamProfilesView rows={state.data.rows} whitelist={state.data.whitelist} loading={state.loading} onAddWhitelist={async (kind, value) => {
        await magpieApi.manage.addWhitelist({ kind, value });
        setToast("Whitelist updated."); refresh();
      }} onDeleteWhitelist={async (id) => {
        await magpieApi.manage.deleteWhitelist(id);
        setToast("Whitelist entry removed."); refresh();
      }} onApprove={async (row) => {
        await magpieApi.manage.updateProfile(String(row.userId), { approvalStatus: "approved", role: "member", lockVersion: Number(row.lockVersion ?? 0) });
        setToast("Approved."); refresh();
      }} onReject={async (row) => {
        await magpieApi.manage.updateProfile(String(row.userId), { approvalStatus: "rejected", reason: "Owner rejected from web manage.", lockVersion: Number(row.lockVersion ?? 0) });
        setToast("Rejected."); refresh();
      }} onSuspend={async (row) => {
        await magpieApi.manage.updateProfile(String(row.userId), { approvalStatus: "suspended", lockVersion: Number(row.lockVersion ?? 0) });
        setToast("Suspended."); refresh();
      }} onRestore={async (row) => {
        await magpieApi.manage.updateProfile(String(row.userId), { approvalStatus: "approved", lockVersion: Number(row.lockVersion ?? 0) });
        setToast("Restored."); refresh();
      }} />
    )}
    {area === "palette" && <PaletteListView rows={state.data.rows} loading={state.loading} />}
    {area === "rules" && <RulesListView rows={state.data.rows} loading={state.loading} onPatchRule={async (id, body) => {
      await magpieApi.manage.patchRule(id, body);
      setToast("Brand rules saved.");
      refresh();
    }} onCreateRule={async () => {
      // Seed a structured Bloome rule version so the owner is never stuck on an empty,
      // input-less /rules with no way in (M-223). Server fills the canonical Bloome baseline.
      await magpieApi.manage.createRule({ family: "bloome", version: 1, status: "draft", active: true });
      setToast("Brand rules created - edit them below.");
      refresh();
    }} />}
  </section>;
}

function PaletteListView({ rows, loading }: { rows: Array<Record<string, unknown>>; loading: boolean }) {
  if (!loading && rows.length === 0) return <div className="bloome-card-hero p-8 text-center">
    <MagpieMark />
    <div className="mt-3 text-[15px] font-semibold">No palette yet</div>
    <div className="text-[12.5px] text-muted-foreground mt-1">Click "+ New palette" above to create one. Bloome canonical is seeded automatically on first agent run.</div>
  </div>;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {rows.map((row) => {
      const colors = (row.colors as Array<{ role?: string; hex?: string }>) ?? (typeof row.colorsJson === "string" ? (() => { try { return JSON.parse(row.colorsJson as string); } catch { return []; } })() : []);
      const name = String(row.name ?? "Untitled");
      const family = String(row.family ?? "-");
      const status = String(row.status ?? "draft");
      return <article key={String(row.id)} className="bloome-card p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[14px] font-semibold leading-tight">{name}</div>
            <div className="text-[10.5px] text-muted-foreground font-mono uppercase tracking-wider">{family} · {status}</div>
          </div>
          {row.canonical === true && <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0C0A0F] text-white shrink-0">canonical</span>}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {(Array.isArray(colors) ? colors : []).slice(0, 12).map((c, i) => (
            <div key={i} className="aspect-square rounded-md border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)]" style={{ background: c.hex ?? "#eee" }} title={`${c.role ?? ""} ${c.hex ?? ""}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Array.isArray(colors) ? colors : []).slice(0, 6).map((c, i) => (
            <span key={i} className="text-[10.5px] font-mono text-muted-foreground"><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: c.hex }} />{c.role}</span>
          ))}
        </div>
      </article>;
    })}
  </div>;
}

function RulesListView({ rows, loading, onPatchRule, onCreateRule }: { rows: Array<Record<string, unknown>>; loading: boolean; onPatchRule: (id: string, body: Record<string, unknown>) => Promise<void>; onCreateRule: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  if (!loading && rows.length === 0) return <div className="bloome-card-hero p-8 text-center">
    <MagpieMark />
    <div className="mt-3 text-[15px] font-semibold">No brand rules yet</div>
    <div className="text-[12.5px] text-muted-foreground mt-1">Create your Bloome brand rules and edit colors, type and spacing right here - no JSON required. (One is also auto-seeded on your first card save or agent run.)</div>
    <button disabled={creating} onClick={() => { setCreating(true); void onCreateRule().finally(() => setCreating(false)); }} className="mt-4 rounded-md bg-[#0C0A0F] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">{creating ? "Creating…" : "Create brand rules"}</button>
  </div>;
  return <div className="flex flex-col gap-3">
    {rows.map((row) => {
      const rules = Array.isArray(row.rules) ? row.rules : (typeof row.rulesJson === "string" ? (() => { try { return JSON.parse(row.rulesJson as string); } catch { return []; } })() : []);
      const palette = Array.isArray(row.canonicalPalette) ? row.canonicalPalette : (typeof row.canonicalPaletteJson === "string" ? (() => { try { return JSON.parse(row.canonicalPaletteJson as string); } catch { return []; } })() : []);
      const isActive = row.active === true || Number(row.active) === 1;
      return <BrandRuleEditor key={String(row.id)} row={row} rules={Array.isArray(rules) ? rules : []} palette={Array.isArray(palette) ? palette : []} isActive={isActive} onSave={(body) => onPatchRule(String(row.id), { ...body, lockVersion: Number(row.lockVersion ?? 0) })} />;
    })}
  </div>;
}

function BrandRuleEditor({ row, rules, palette, isActive, onSave }: {
  row: Record<string, unknown>;
  rules: any[];
  palette: any[];
  isActive: boolean;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const initialColors = palette.length ? palette.map((c, i) => ({ role: String(c.role ?? `color-${i + 1}`), hex: String(c.hex ?? "#2556B6") })) : [
    { role: "primary", hex: "#2556B6" },
    { role: "accent", hex: "#F36440" },
    { role: "ink", hex: "#0C0A0F" },
    { role: "paper", hex: "#F7F5F1" },
  ];
  const typoRule = rules.find((rule) => String(rule.kind ?? rule.id ?? "").includes("type")) ?? {};
  const spacingRule = rules.find((rule) => String(rule.kind ?? rule.id ?? "").includes("spacing")) ?? {};
  const [colors, setColors] = useState(initialColors);
  const [fontFamily, setFontFamily] = useState(String(typoRule.fontFamily ?? "Inter"));
  const [headingSize, setHeadingSize] = useState(Number(typoRule.headingSize ?? 32));
  const [bodySize, setBodySize] = useState(Number(typoRule.bodySize ?? 14));
  const [spacing, setSpacing] = useState(Number(spacingRule.token ?? spacingRule.value ?? 8));
  return <article className="bloome-card p-4 flex flex-col gap-4">
    <header className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <span>{String(row.family ?? "bloome")}</span>
          <span className="text-muted-foreground font-mono text-[11.5px]">v{String(row.version ?? 0)}</span>
          {isActive && <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#48BB78] text-white">active</span>}
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F1ECE2] text-muted-foreground">{String(row.status ?? "draft")}</span>
        </div>
        {row.ownerNotes ? <div className="text-[11.5px] text-muted-foreground mt-1">{String(row.ownerNotes)}</div> : null}
      </div>
      <button onClick={() => void onSave({
        canonicalPalette: colors,
        rules: [
          ...rules.filter((rule) => {
            const kind = String(rule.kind ?? rule.id ?? "");
            return !kind.includes("type") && !kind.includes("spacing") && !kind.includes("palette");
          }),
          { kind: "palette", colors },
          { kind: "typography", fontFamily, headingSize, bodySize },
          { kind: "spacing", token: spacing },
        ],
      })} className="rounded-md bg-[#0C0A0F] px-3 py-1.5 text-[12px] font-semibold text-white">Save rules</button>
    </header>
    <section>
      <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-2">Color palette</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {colors.map((color, index) => <div key={`${color.role}-${index}`} className="flex items-center gap-2">
          <input type="color" value={color.hex} onChange={(event) => setColors((items) => items.map((item, i) => i === index ? { ...item, hex: event.target.value } : item))} className="w-9 h-8 rounded border border-[var(--border-subtle)] bg-white" />
          <input value={color.role} onChange={(event) => setColors((items) => items.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} className="min-w-0 flex-1 rounded border border-[var(--input)] bg-white px-2 py-1.5 text-[12px]" />
          <button onClick={() => setColors((items) => items.filter((_, i) => i !== index))} className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">{"Delete"}</button>
        </div>)}
      </div>
      <button onClick={() => setColors((items) => [...items, { role: `color-${items.length + 1}`, hex: "#F7F5F1" }])} className="mt-2 text-[11.5px] font-semibold text-[#2556B6] hover:underline">Add color</button>
    </section>
    <section className="grid gap-3 md:grid-cols-3">
      <label className="text-[11px] font-semibold text-muted-foreground">Typography
        <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]">
          {["Inter", "Caveat", "JetBrains Mono", "system-ui"].map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">Heading size
        <input type="number" value={headingSize} onChange={(event) => setHeadingSize(Number(event.target.value))} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]" />
      </label>
      <label className="text-[11px] font-semibold text-muted-foreground">Body size
        <input type="number" value={bodySize} onChange={(event) => setBodySize(Number(event.target.value))} className="mt-1 w-full rounded bg-white border border-[var(--input)] px-2 py-1.5 text-[12px] text-[var(--foreground)]" />
      </label>
    </section>
    <section>
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Spacing</div>
        <span className="text-[11px] font-mono text-muted-foreground">{spacing}px</span>
      </div>
      <input type="range" min={4} max={32} step={2} value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} className="w-full accent-[var(--primary)]" />
    </section>
  </article>;
}

function TeamProfilesView({ rows, whitelist, loading, onAddWhitelist, onDeleteWhitelist, onApprove, onReject, onSuspend, onRestore }: {
  rows: Array<Record<string, unknown>>;
  whitelist: SignupWhitelistRow[];
  loading: boolean;
  onAddWhitelist: (kind: "domain" | "email", value: string) => Promise<void>;
  onDeleteWhitelist: (id: string) => Promise<void>;
  onApprove: (row: Record<string, unknown>) => Promise<void>;
  onReject: (row: Record<string, unknown>) => Promise<void>;
  onSuspend: (row: Record<string, unknown>) => Promise<void>;
  onRestore: (row: Record<string, unknown>) => Promise<void>;
}) {
  const buckets = {
    pending: rows.filter((r) => String(r.approvalStatus) === "pending"),
    approved: rows.filter((r) => String(r.approvalStatus) === "approved"),
    suspended: rows.filter((r) => String(r.approvalStatus) === "suspended"),
    rejected: rows.filter((r) => String(r.approvalStatus) === "rejected"),
    hold: rows.filter((r) => String(r.approvalStatus) === "hold"),
  };
  return <div className="flex flex-col gap-5">
    <WhitelistPanel rows={whitelist} onAdd={onAddWhitelist} onDelete={onDeleteWhitelist} />
    {!loading && rows.length === 0 && <div className="bloome-card-hero p-8 text-center">
      <MagpieMark />
      <div className="mt-3 text-[15px] font-semibold">No teammates yet</div>
      <div className="text-[12.5px] text-muted-foreground mt-1">Approved whitelisted members will show up here. Pending sign-ups land at the top.</div>
    </div>}
    {buckets.pending.length > 0 && <TeamBucket title="Pending sign-ups" tone="warn" count={buckets.pending.length}>
      {buckets.pending.map((row) => <TeamRow key={String(row.userId)} row={row} actions={[
        { label: "Approve", primary: true, onClick: () => onApprove(row) },
        { label: "Reject", onClick: () => onReject(row) },
      ]} />)}
    </TeamBucket>}
    {buckets.approved.length > 0 && <TeamBucket title="Active members" tone="ok" count={buckets.approved.length}>
      {buckets.approved.map((row) => <TeamRow key={String(row.userId)} row={row} actions={String(row.role) === "owner" ? [] : [
        { label: "Suspend", onClick: () => onSuspend(row) },
      ]} />)}
    </TeamBucket>}
    {buckets.hold.length > 0 && <TeamBucket title="On hold" tone="info" count={buckets.hold.length}>
      {buckets.hold.map((row) => <TeamRow key={String(row.userId)} row={row} actions={[
        { label: "Approve", primary: true, onClick: () => onApprove(row) },
        { label: "Reject", onClick: () => onReject(row) },
      ]} />)}
    </TeamBucket>}
    {buckets.suspended.length > 0 && <TeamBucket title="Suspended" tone="bad" count={buckets.suspended.length}>
      {buckets.suspended.map((row) => <TeamRow key={String(row.userId)} row={row} actions={[
        { label: "Restore", onClick: () => onRestore(row) },
      ]} />)}
    </TeamBucket>}
    {buckets.rejected.length > 0 && <TeamBucket title="Rejected" tone="bad" count={buckets.rejected.length}>
      {buckets.rejected.map((row) => <TeamRow key={String(row.userId)} row={row} actions={[]} />)}
    </TeamBucket>}
  </div>;
}

function WhitelistPanel({ rows, onAdd, onDelete }: {
  rows: SignupWhitelistRow[];
  onAdd: (kind: "domain" | "email", value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<"domain" | "email">("domain");
  const [value, setValue] = useState("");
  const activeRows = rows.filter((row) => Number(row.active) === 1);
  return <section className="bloome-card p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-[13px] font-semibold">Signup whitelist</h3>
        <p className="mt-1 text-[11.5px] text-muted-foreground">New accounts must match an active domain or email row before owner approval.</p>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(event) => {
        event.preventDefault();
        const next = value.trim();
        if (!next) return;
        void onAdd(kind, next).then(() => setValue(""));
      }}>
        <select className="h-8 rounded-md border border-[color-mix(in_oklab,#0C0A0F_12%,transparent)] bg-white px-2 text-[12px]" value={kind} onChange={(event) => setKind(event.target.value === "email" ? "email" : "domain")}>
          <option value="domain">Domain</option>
          <option value="email">Email</option>
        </select>
        <input className="h-8 min-w-[220px] rounded-md border border-[color-mix(in_oklab,#0C0A0F_12%,transparent)] bg-white px-2 text-[12px]" value={value} onChange={(event) => setValue(event.target.value)} {...hintProps(kind === "domain" ? "@example.com" : "person@example.com")} />
        <button className="h-8 rounded-md bg-[#0C0A0F] px-3 text-[12px] font-semibold text-white">Add</button>
      </form>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {activeRows.map((row) => (
        <span key={row.id} className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] bg-white px-2.5 py-1 text-[11.5px]">
          <span className="font-mono uppercase text-[10px] text-muted-foreground">{row.kind}</span>
          <span className="font-semibold">{row.value}</span>
          <button className="text-muted-foreground hover:text-[var(--destructive)]" onClick={() => void onDelete(row.id)} aria-label={`Remove ${row.value}`}>x</button>
        </span>
      ))}
      {activeRows.length === 0 && <span className="text-[11.5px] text-muted-foreground">No active whitelist rows.</span>}
    </div>
  </section>;
}

function TeamBucket({ title, tone, count, children }: { title: string; tone: "ok" | "warn" | "bad" | "info"; count: number; children: ReactNode }) {
  const dot = tone === "ok" ? "#48BB78" : tone === "warn" ? "#F36440" : tone === "bad" ? "#BC4E32" : "#A29B8B";
  return <section>
    <header className="flex items-center gap-2 mb-2">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      <h3 className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">{title}</h3>
      <span className="text-[11px] tabular-nums text-muted-foreground">· {count}</span>
    </header>
    <div className="grid gap-2">{children}</div>
  </section>;
}

function TeamRow({ row, actions }: { row: Record<string, unknown>; actions: Array<{ label: string; primary?: boolean; onClick: () => Promise<void> }> }) {
  const email = String(row.email ?? "");
  const display = String(row.displayName ?? row.userId ?? "");
  const role = String(row.role ?? "member");
  const initials = (display || email).slice(0, 2).toUpperCase();
  const createdAt = row.createdAt ? new Date(Number(row.createdAt)).toLocaleDateString() : "";
  const lastActive = row.updatedAt ? new Date(Number(row.updatedAt)).toLocaleString() : null;
  const reason = row.rejectionReason ? String(row.rejectionReason) : null;
  return <article className="bloome-card px-4 py-3 flex items-center gap-3">
    <span className="grid place-items-center w-9 h-9 rounded-full text-white text-[12px] font-bold" style={{ background: "linear-gradient(135deg, #F36440 0%, #BC4E32 100%)" }}>{initials}</span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold truncate">
        <span className="truncate">{display}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F1ECE2] text-muted-foreground">{role}</span>
      </div>
      <div className="text-[11.5px] text-muted-foreground truncate">{email}</div>
      <div className="text-[10.5px] text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
        {createdAt && <span>joined {createdAt}</span>}
        {lastActive && <span>· last update {lastActive}</span>}
        {reason && <span className="text-[var(--destructive)]">· {reason}</span>}
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {actions.map((a) => (
        <button key={a.label} className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${a.primary ? "bg-[#0C0A0F] text-white" : "bg-white border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] text-[var(--foreground)]"}`} onClick={() => void a.onClick()}>{a.label}</button>
      ))}
    </div>
  </article>;
}

function CenteredCard({ title, body, mark = false }: { title: string; body?: string; mark?: boolean }) {
  return (
    <main className="min-h-dvh bg-background grid place-items-center px-4">
      <section className="bloome-card-hero w-full max-w-md p-6 text-center">
        {mark && <MagpieMark />}
        <h1 className="text-[24px] font-[800]">{title}</h1>
        {body && <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{body}</p>}
      </section>
    </main>
  );
}

async function loadMeAfterAuthSettles(): Promise<MeResponse> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await magpieApi.me();
    } catch (error) {
      lastError = error;
      if (!(error instanceof ApiError) || error.status !== 401 || !(await hasAuthSession())) break;
      await new Promise((resolve) => window.setTimeout(resolve, 250 + attempt * 150));
    }
  }
  throw lastError instanceof Error ? lastError : new ApiError(401, "Not signed in.");
}

async function hasAuthSession(): Promise<boolean> {
  try {
    const session = await client.auth.getSession();
    return !!session.data;
  } catch {
    return false;
  }
}

function extractCurrentCard(error: ApiError): { lockVersion?: number | null } | null {
  const details = error.details as { current?: { lockVersion?: number | null } } | null;
  return details?.current ?? null;
}

function budgetMessage(error: ApiError): string {
  const details = error.details as { error?: { quote?: { totalMicros?: number; remainingMicros?: number } } } | null;
  const quote = details?.error?.quote;
  if (quote && typeof quote.totalMicros === "number" && typeof quote.remainingMicros === "number") {
    return `This action was quoted at $${(quote.totalMicros / 1_000_000).toFixed(3)}, with $${(quote.remainingMicros / 1_000_000).toFixed(3)} remaining today. Retry tomorrow or upgrade the daily budget.`;
  }
  return `${error.message} Retry tomorrow or upgrade the daily budget.`;
}

function useAsync<T>(initialData: T, load: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initialData, loading: true, error: null });
  const loadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: !loadedRef.current, error: null }));
    load()
      .then((data) => {
        if (!cancelled) {
          loadedRef.current = true;
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          loadedRef.current = true;
          setState({ data: initialData, loading: false, error: error instanceof Error ? error.message : "Request failed." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, deps);
  return state;
}

function useAutoDismissToast(toast: string | null, setToast: (value: string | null) => void) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast, setToast]);
}

function groupCardFamilies(rows: CardRow[]): CardFamily[] {
  const cards = rows.map(toLibraryCard);
  const byRoot = new Map<string, CardFamily>();
  for (const card of cards) {
    const family = byRoot.get(card.rootId) ?? { root: card, derivatives: [] };
    if (card.id === card.rootId || !card.parentId) family.root = card;
    else family.derivatives.push(card);
    byRoot.set(card.rootId, family);
  }
  return Array.from(byRoot.values()).map((family) => ({
    root: family.root,
    derivatives: family.derivatives,
  }));
}

function toLibraryCard(row: CardRow): LibraryCard {
  const width = numeric(row.width, 1080);
  const height = numeric(row.height, 1080);
  const ratio = ratioFrom(row.aspectRatio ?? row.aspect_ratio ?? row.ratioPreset ?? row.ratio_preset, width, height);
  const bg = colorFromJson(row.renderManifestJson ?? row.cardSpecJson ?? row.card_spec_json, "#2556B6");
  return {
    id: row.id,
    rootId: row.cardRootId ?? row.card_root_id ?? row.id,
    parentId: row.parentCardId ?? row.parent_card_id ?? null,
    title: row.title ?? "Untitled card",
    ratio,
    widthPx: width,
    heightPx: height,
    bg,
    fg: "#F36440",
    creator: { name: "Team", initial: "T" },
    createdAtLabel: relativeTime(row.createdAt ?? row.created_at ?? null),
    derivativesCount: 0,
    status: row.status === "ready" ? "ready" : "draft",
  };
}

function toEditorCard(row: CardRow, detail?: CardDetailResponse | null): CardEditorCard {
  const card = toLibraryCard(row);
  const editorRatio = row.aspectRatio ?? row.aspect_ratio ?? card.ratio;
  const cardSpec = detail?.card.cardSpec ?? parseObject(row.cardSpecJson ?? row.card_spec_json) ?? {};
  const slotAssignments = detail?.card.slotAssignments ?? parseObject(row.slotAssignmentsJson) ?? {};
  const copyBlock = detail?.card.copyBlock ?? parseObject(row.copyBlockJson) ?? {};
  const report = detail?.ruleReport ?? null;
  return {
    id: card.id,
    title: detail?.card.name ?? card.title,
    ratio: editorRatio,
    widthPx: card.widthPx,
    heightPx: card.heightPx,
    status: card.status,
    bg: card.bg,
    fg: card.fg,
    layers: layersFromCard(card, cardSpec),
    lockVersion: row.lockVersion ?? detail?.card.lockVersion ?? 0,
    parentCardId: row.parentCardId ?? row.parent_card_id ?? detail?.card.parentCardId ?? null,
    paletteId: row.paletteId ?? detail?.card.paletteId ?? null,
    agentRunId: row.agentRunId ?? row.agent_run_id ?? detail?.agentRun?.id ?? null,
    ruleVersionAtSave: row.ruleVersionAtSave ?? row.rule_version_at_save ?? detail?.ruleReport?.ruleVersionId ?? null,
    cardSpec,
    slotAssignments,
    copyBlock,
    ruleReport: report,
  };
}

function toPublicEditorCard(row: PublicShareCard): CardEditorCard {
  const title = row.title ?? row.name ?? "Shared card";
  const width = numeric(row.width, 1080);
  const height = numeric(row.height, 1080);
  const ratio = ratioFrom(row.ratioPreset, width, height);
  const background = row.background ?? row.cardSpec?.background ?? colorFromJson(JSON.stringify(row.cardSpec ?? {}), "#F7F5F1");
  const publicSpec = {
    ...(row.cardSpec ?? {}),
    layers: (row.cardSpec?.layers ?? []).map((layer, index) => ({ ...layer, id: `public_layer_${index}` })),
  };
  const libraryCard: LibraryCard = {
    id: "public-card",
    rootId: "public-card",
    parentId: null,
    title,
    ratio,
    widthPx: width,
    heightPx: height,
    bg: background,
    fg: "#F36440",
    creator: { name: "Public", initial: "P" },
    createdAtLabel: "",
    derivativesCount: 0,
    status: "ready",
  };
  return {
    id: "public-card",
    title,
    ratio,
    widthPx: width,
    heightPx: height,
    status: "ready",
    bg: background,
    fg: "#F36440",
    layers: layersFromCard(libraryCard, publicSpec),
    cardSpec: publicSpec,
    slotAssignments: {},
    copyBlock: {},
  };
}

function toDerivative(row: CardRow): Derivative {
  const card = toLibraryCard(row);
  return {
    id: card.id,
    title: card.title,
    ratio: card.ratio,
    bg: card.bg,
    fg: card.fg,
    creator: card.creator.name,
    createdAtLabel: card.createdAtLabel,
  };
}

function toEditorTemplate(row: CardRow): EditorTemplate {
  const card = toLibraryCard(row);
  return {
    id: card.id,
    title: card.title,
    ratio: card.ratio,
    bg: card.bg,
    fg: card.fg,
    category: templateCategory(card),
    createdAtLabel: card.createdAtLabel,
  };
}

function templateCategory(card: LibraryCard): "social" | "poster" | "minimal" {
  if (card.ratio === "9:16" || card.ratio === "1:1" || card.ratio === "4:5") return "social";
  if (card.ratio === "16:9" || card.ratio === "1.91:1") return "poster";
  return "minimal";
}

function toAssetItem(row: AssetRow): AssetItem {
  const width = numeric(row.width, 0);
  const height = numeric(row.height, 0);
  const tags = Array.isArray(row.tags) ? row.tags : parseStringArray(row.tagsJson ?? row.tags_json);
  const generating = row.status ? row.status === "generating" : (isImageAsset(row) && !row.previewUrl);
  const readyPreviewUrl = generating || !row.previewUrl ? null : magpieApi.assets.fileUrl(row.id);
  return {
    id: row.id,
    folderId: row.folderId ?? row.folder_id ?? null,
    name: row.name ?? "Untitled asset",
    kind: assetKind(row),
    source: assetSource(row.source),
    transparent: row.transparent === true || row.transparent === 1,
    tags,
    dimsLabel: width && height ? `${width}x${height}` : "unknown",
    byteSizeLabel: byteSize(numeric(row.byteSize, 0)),
    createdAtLabel: relativeTime(row.createdAt ?? null),
    usedByCount: 0,
    previewBg: row.transparent ? "#F7F5F1" : "#2556B6",
    previewFg: row.source === "seed" ? "#0C0A0F" : "#F36440",
    description: row.description ?? (row.descriptionStatus === "pending" ? "Auto-description pending..." : undefined),
    previewUrl: readyPreviewUrl,
    // status==="generating" (or, pre-M-102, an image row with no presigned preview) = bytes
    // not yet in R2, so render a "generating..." fallback instead of a fake Matisse glyph.
    pending: generating,
    width: width || undefined,
    height: height || undefined,
  };
}

function toEditorSourceAsset(row: AssetRow): EditorSourceAsset {
  const width = numeric(row.width, 0);
  const height = numeric(row.height, 0);
  const pending = row.status ? row.status === "generating" : (isImageAsset(row) && !row.previewUrl);
  const readyPreviewUrl = pending || !row.previewUrl ? null : magpieApi.assets.fileUrl(row.id);
  return {
    id: row.id,
    name: row.name ?? "Untitled asset",
    previewUrl: readyPreviewUrl,
    pending,
    width: width || null,
    height: height || null,
  };
}

function isImageAsset(row: AssetRow): boolean {
  const kind = assetKind(row);
  return kind === "image" || kind === "photo" || kind === "transparent_png" || kind === "svg";
}

function toFolderNodes(rows: AssetFolderRow[], assets: AssetRow[]): FolderNode[] {
  return rows.map((row) => {
    const parentFolderId = row.parentFolderId ?? row.parent_folder_id ?? null;
    const childCount = rows.filter((candidate) => (candidate.parentFolderId ?? candidate.parent_folder_id ?? null) === row.id).length;
    const assetCount = assets.filter((asset) => (asset.folderId ?? asset.folder_id ?? null) === row.id && !asset.deletedAt).length;
    return {
      id: row.id,
      name: row.name,
      depth: row.depth === 1 ? 1 : row.depth === 2 ? 2 : 0,
      parentFolderId,
      childCount,
      assetCount,
      kind: row.name.toLowerCase().includes("agent") ? "agent-gen" : "team",
    };
  });
}

function layersFromCard(card: LibraryCard, cardSpec?: Record<string, unknown>): Layer[] {
  const specLayers = (cardSpec?.layers ?? (cardSpec as { composition?: { layers?: unknown } } | undefined)?.composition?.layers) as unknown;
  if (Array.isArray(specLayers)) {
    return specLayers.map((layer, index) => normalizeLayer(layer, card, index)).filter(Boolean) as Layer[];
  }
  return [
    { id: "l_text_1", kind: "text", name: "Headline", textValue: card.title, font: "Inter 800", opacity: 1, visible: true, locked: false, x: 24, y: 500, width: 312, height: 110 },
    { id: "l_asset_bird", kind: "asset", name: "Primary cutout", assetName: "primary asset", thumbFg: card.fg, opacity: 0.95, visible: true, locked: false, x: 80, y: 200, width: 220, height: 220 },
    { id: "l_bg", kind: "bg", name: "Background", thumbBg: card.bg, opacity: 1, visible: true, locked: true },
  ];
}

function normalizeLayer(input: unknown, card: LibraryCard, index: number): Layer | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const kind = String(row.kind ?? "asset") as Layer["kind"];
  if (!["bg", "asset", "text", "group"].includes(kind)) return null;
  return {
    id: String(row.id ?? `layer_${index}`),
    kind,
    name: String(row.name ?? (kind === "text" ? "Headline" : kind === "bg" ? "Background" : "Asset")),
    textValue: typeof row.textValue === "string" ? row.textValue : typeof row.content === "string" ? row.content : kind === "text" ? card.title : undefined,
    assetName: typeof row.assetName === "string" ? row.assetName : undefined,
    // M-225/226: image-layer source - assetId (durable) + src (presigned previewUrl).
    assetId: typeof row.assetId === "string" ? row.assetId : undefined,
    src: typeof row.src === "string" ? row.src : undefined,
    font: typeof row.font === "string" ? row.font : kind === "text" ? "Inter 800" : undefined,
    thumbBg: typeof row.thumbBg === "string" ? row.thumbBg : kind === "bg" ? card.bg : undefined,
    thumbFg: typeof row.thumbFg === "string" ? row.thumbFg : card.fg,
    opacity: typeof row.opacity === "number" ? row.opacity : 1,
    visible: row.visible === false ? false : true,
    locked: row.locked === true,
    x: typeof row.x === "number" ? row.x : undefined,
    y: typeof row.y === "number" ? row.y : undefined,
    // M-214: agent-added layers can arrive with width/height 0 (or absent). Drop a
    // non-positive dimension to undefined so the editor falls back to a usable default
    // instead of rendering a zero-size (invisible) box that needs a resize/reload.
    width: typeof row.width === "number" && row.width > 0 ? row.width : undefined,
    height: typeof row.height === "number" && row.height > 0 ? row.height : undefined,
    rotation: typeof row.rotation === "number" ? row.rotation : undefined,
    lockRatio: row.lockRatio === true ? true : undefined,
    // M-083: persist group membership across reloads (the save path already spreads it).
    groupId: typeof row.groupId === "string" ? row.groupId : undefined,
    // M-220 / M-218: persist per-layer font size + text alignment across reloads.
    fontSize: typeof row.fontSize === "number" && row.fontSize > 0 ? row.fontSize : undefined,
    textAlign: ["left", "center", "right", "justify"].includes(String(row.textAlign))
      ? (row.textAlign as Layer["textAlign"])
      : undefined,
    // R5 (a): persist per-layer text decoration across reloads.
    decoration: ["none", "solid", "wavy", "dashed", "dotted"].includes(String(row.decoration))
      ? (row.decoration as Layer["decoration"])
      : undefined,
    decorationColor: typeof row.decorationColor === "string" ? row.decorationColor : undefined,
    textFill: ["solid", "gradient"].includes(String(row.textFill))
      ? (row.textFill as Layer["textFill"])
      : undefined,
    gradientFrom: typeof row.gradientFrom === "string" ? row.gradientFrom : undefined,
    gradientTo: typeof row.gradientTo === "string" ? row.gradientTo : undefined,
    gradientAngle: typeof row.gradientAngle === "number" ? row.gradientAngle : undefined,
    blendMode: ["normal", "multiply", "screen", "overlay", "darken", "lighten"].includes(String(row.blendMode))
      ? (row.blendMode as Layer["blendMode"])
      : undefined,
    shadowEnabled: row.shadowEnabled === true ? true : undefined,
    shadowColor: typeof row.shadowColor === "string" ? row.shadowColor : undefined,
    shadowBlur: typeof row.shadowBlur === "number" ? row.shadowBlur : undefined,
    shadowOffsetX: typeof row.shadowOffsetX === "number" ? row.shadowOffsetX : undefined,
    shadowOffsetY: typeof row.shadowOffsetY === "number" ? row.shadowOffsetY : undefined,
    strokeEnabled: row.strokeEnabled === true ? true : undefined,
    strokeColor: typeof row.strokeColor === "string" ? row.strokeColor : undefined,
    strokeWidth: typeof row.strokeWidth === "number" ? row.strokeWidth : undefined,
    cropMode: ["contain", "cover", "fill"].includes(String(row.cropMode))
      ? (row.cropMode as Layer["cropMode"])
      : undefined,
    filter: ["none", "warm", "cool", "mono", "high-contrast"].includes(String(row.filter))
      ? (row.filter as Layer["filter"])
      : undefined,
    cornerRadius: typeof row.cornerRadius === "number" ? row.cornerRadius : undefined,
  };
}

// Image layers persist a durable assetId; their `src` is refreshed at card load so it points to
// the same-origin asset-file route. That keeps browser export readable without exposing raw R2
// URIs. Layers without an assetId (or whose asset is gone / still generating) keep whatever src
// they had.
async function resolveLayerAssetSrcs(layers: Layer[]): Promise<Layer[]> {
  return Promise.all(layers.map(async (layer) => {
    if (layer.kind !== "asset" || !layer.assetId) return layer;
    try {
      const { asset } = await magpieApi.assets.get(layer.assetId);
      return asset.previewUrl ? { ...layer, src: magpieApi.assets.fileUrl(layer.assetId) } : layer;
    } catch {
      return layer;
    }
  }));
}

async function createCardFromTemplate(template: (CardRow & { cardSpec?: Record<string, unknown>; slotAssignments?: Record<string, unknown>; copyBlock?: Record<string, unknown> }) | null, parentCardId: string | null, status: "draft" | "ready") {
  const rule = await magpieApi.rules.active();
  const session = await magpieApi.sessions.create(parentCardId ? "Derive card" : "New card");
  const run = await magpieApi.runs.create({
    sessionId: session.id,
    prompt: parentCardId ? "Derive a new card from this template." : "Create a new Bloome card draft.",
    parentCardId: parentCardId ?? undefined,
    plannedParentCardId: parentCardId ?? undefined,
    plan: {
      ruleVersionAtSave: rule.rule.id,
      parentCardId: parentCardId ?? undefined,
      steps: ["copy.draft", "compose", "rules.check"],
    },
  });
  const title = parentCardId ? `${cardTitle(template)} variant` : "Untitled Magpie card";
  return magpieApi.cards.create(cardPayload({
    source: template,
    title,
    status,
    parentCardId,
    agentRunId: run.id,
    ruleVersionAtSave: rule.rule.id,
  }));
}

async function loadFreshEditorCard(cardId: string): Promise<CardEditorCard | null> {
  // Pull the authoritative persisted card (incl. autosaved cardSpec.layers + lockVersion)
  // so an explicit save reflects the latest server state, not a stale in-memory snapshot.
  const [detail, list] = await Promise.all([magpieApi.cards.get(cardId), magpieApi.cards.list()]);
  const row = list.cards.find((card) => card.id === cardId) ?? detail.card;
  return row ? toEditorCard(row, detail) : null;
}

async function saveEditorCard(card: CardEditorCard | null, paletteId: string | null, status: "draft" | "ready") {
  const agentRunId = card?.agentRunId;
  if (card?.id && card.id !== "sample" && !agentRunId) throw new Error("Cannot save: missing original provenance for this card.");
  // R5.5 (2): fetch the active rule lazily - an existing card already carries its
  // ruleVersionAtSave + agentRunId, so the common autosave path skips this GET.
  let activeRuleId: string | null = null;
  const ensureRuleId = async (): Promise<string> => {
    if (activeRuleId == null) activeRuleId = (await magpieApi.rules.active()).rule.id;
    return activeRuleId;
  };
  const ruleVersionAtSave = card?.ruleVersionAtSave ?? await ensureRuleId();
  const body = cardPayload({
    source: card,
    title: card?.title ?? "Untitled Magpie card",
    status,
    parentCardId: card?.parentCardId ?? null,
    agentRunId: agentRunId ?? await createProvenanceRun(card, await ensureRuleId(), status),
    ruleVersionAtSave,
    paletteId,
    lockVersion: card?.lockVersion ?? 0,
  });
  if (!card?.id || card.id === "sample") return magpieApi.cards.create(body);
  return magpieApi.cards.patch(card.id, body);
}

async function createProvenanceRun(card: CardEditorCard | null, ruleVersionAtSave: string, status: "draft" | "ready"): Promise<string> {
  const session = await magpieApi.sessions.create(card?.parentCardId ? "Derive card" : "New card");
  const run = await magpieApi.runs.create({
    sessionId: session.id,
    prompt: card?.parentCardId ? "Derive a new card from this template." : `Create a new Bloome card ${status}.`,
    parentCardId: card?.parentCardId ?? undefined,
    plannedParentCardId: card?.parentCardId ?? undefined,
    plan: {
      ruleVersionAtSave,
      parentCardId: card?.parentCardId ?? undefined,
      steps: ["copy.draft", "compose", "rules.check"],
    },
  });
  return run.id;
}

function cardPayload(input: {
  source?: (Partial<CardRow> & { cardSpec?: Record<string, unknown>; slotAssignments?: Record<string, unknown>; copyBlock?: Record<string, unknown>; widthPx?: number; heightPx?: number; layers?: Layer[] }) | null;
  title: string;
  status: "draft" | "ready";
  parentCardId: string | null;
  agentRunId: string;
  ruleVersionAtSave: string;
  paletteId?: string | null;
  lockVersion?: number;
}): Record<string, unknown> {
  const source = input.source;
  const cardSpec = { ...(source?.cardSpec ?? parseObject(source?.cardSpecJson ?? source?.card_spec_json) ?? defaultCardSpec(input.title)) };
  const sourceLayers = (source as { layers?: Layer[] } | null)?.layers;
  if (sourceLayers?.length) {
    cardSpec.layers = sourceLayers.map((layer) => ({
      ...layer,
      content: layer.textValue,
    }));
  }
  const slotAssignments = source?.slotAssignments ?? parseObject(source?.slotAssignmentsJson) ?? {};
  const copyBlock = source?.copyBlock ?? parseObject(source?.copyBlockJson) ?? { headline: input.title, sub: "Bloome brand-material draft", cta: "Start" };
  const width = numeric((source as { widthPx?: number } | null)?.widthPx ?? source?.width, 1080);
  const height = numeric((source as { heightPx?: number } | null)?.heightPx ?? source?.height, 1080);
  const colors = colorsFromSpec(cardSpec);
  return {
    title: input.title,
    status: input.status,
    ratioPreset: source?.ratioPreset ?? source?.ratio_preset ?? (width === height ? "ig-post" : "custom"),
    width,
    height,
    paletteId: input.paletteId ?? source?.paletteId ?? null,
    parentCardId: input.parentCardId,
    agentRunId: input.agentRunId,
    ruleVersionAtSave: input.ruleVersionAtSave,
    cardSpec,
    slotAssignments,
    copyBlock,
    draftForRules: {
      colors,
      slots: [
        { id: "wordmark", x: 72, y: 72, width: 180, height: 64, kind: "wordmark" },
        { id: "headline", x: 72, y: height - 260, width: width - 144, height: 140, kind: "text" },
      ],
      wordmark: { slotId: "wordmark", height: 64 },
      letterforms: [{ key: "bloome-b", transformDeviationPct: 0 }],
    },
    lockVersion: input.lockVersion,
  };
}

function defaultCardSpec(title: string): Record<string, unknown> {
  return { title, colors: ["#2556B6", "#F36440", "#0C0A0F", "#F7F5F1"], layout: "bloome-editorial" };
}

function colorsFromSpec(spec: Record<string, unknown>): string[] {
  const text = JSON.stringify(spec);
  const matches = text.match(/#[0-9a-fA-F]{6}/g);
  return matches?.length ? Array.from(new Set(matches)) : ["#2556B6", "#F36440", "#0C0A0F", "#F7F5F1"];
}

function cardTitle(row: Partial<CardRow> | null): string {
  return row?.title ?? "Untitled card";
}

async function pollAgentRun(id: string): Promise<AgentRunRow> {
  for (let i = 0; i < 8; i += 1) {
    const { run } = await magpieApi.runs.get(id);
    if (run.status === "completed" || run.state === "completed" || run.status === "failed" || run.state === "failed") return run;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  return (await magpieApi.runs.get(id)).run;
}

function subscribeAgentRunEvents(id: string, setRuns: Dispatch<SetStateAction<AgentRunRow[]>>) {
  const source = new EventSource(magpieApi.runs.eventsUrl(id));
  // The server resets its cursor on every (re)connect and replays the whole event
  // log, so dedupe by event id to keep output deltas from being appended twice.
  const seen = new Set<string>();
  let done = false;
  const apply = (eventName: string, raw: string) => {
    const payload = parseRunEvent(eventName, raw);
    if (payload.id) {
      if (seen.has(payload.id)) return;
      seen.add(payload.id);
    }
    setRuns((items) => items.map((run) => run.id === id ? applyRunEvent(run, payload) : run));
    const type = payload.type ?? payload.event ?? eventName;
    if (type === "final" || type === "done" || type === "run_done" || type === "error" || type === "failed") {
      done = true;
      source.close();
      void finalizeRun(id, setRuns);
    }
  };
  source.onmessage = (event) => apply("message", event.data);
  // tool_call_start / tool_call_result are NAMED SSE events; EventSource routes named events
  // ONLY to matching listeners (onmessage sees just unnamed "message" events). Before R9 these
  // two were never registered, so the agent's tool calls + produced assets were dropped on the
  // floor - the root cause of M-225 (generated assets invisible). Register them here.
  for (const name of ["step_start", "step_end", "output", "done", "final", "error", "run_done", "tool_call_start", "tool_call_result"]) {
    source.addEventListener(name, (event) => apply(name, (event as MessageEvent).data));
  }
  source.onerror = () => {
    // EventSource auto-retries while the run is mid-flight; only surface a lost
    // stream once it has actually given up (CLOSED) before completing.
    if (done) return;
    if (source.readyState === EventSource.CLOSED) {
      setRuns((items) => items.map((run) => run.id === id ? { ...run, status: run.status === "running" ? "stream-lost" : run.status } : run));
    }
  };
}

async function finalizeRun(id: string, setRuns: Dispatch<SetStateAction<AgentRunRow[]>>): Promise<void> {
  try {
    const { run } = await magpieApi.runs.get(id);
    const refText = Array.isArray(run.outputRefs)
      ? (run.outputRefs.find((ref) => ref && typeof ref === "object" && typeof (ref as { text?: unknown }).text === "string") as { text?: string } | undefined)?.text ?? null
      : null;
    setRuns((items) => items.map((item) => item.id === id ? {
      ...item,
      costMicros: run.costMicros ?? item.costMicros ?? 0,
      outputText: item.outputText ?? run.outputText ?? refText ?? null,
      outputRefs: Array.isArray(run.outputRefs) ? run.outputRefs : item.outputRefs,
      status: run.status ?? run.state ?? item.status,
      state: run.state ?? item.state,
    } : item));
  } catch {
    // Keep the streamed state if the authoritative fetch fails.
  }
}

function parseRunEvent(eventName: string, raw: string): AgentRunEvent {
  if (!raw) return { type: eventName };
  try {
    const parsed = JSON.parse(raw) as AgentRunEvent;
    return { ...parsed, type: parsed.type ?? parsed.event ?? eventName };
  } catch {
    return { type: eventName, outputText: raw };
  }
}

function applyRunEvent(run: AgentRunRow, event: AgentRunEvent): AgentRunRow {
  const type = event.type ?? event.event ?? "message";
  // Server labels steps by stepId/label (not step/name/tool) and streams text via `delta`.
  const stepName = event.label ?? event.stepId ?? event.step ?? event.name ?? event.tool;
  if (event.run) return { ...run, ...event.run, steps: event.run.steps ?? run.steps ?? [] };
  if (type === "step_start" && stepName) return upsertRunStep(run, stepName, "running");
  if (type === "step_end" && stepName) return upsertRunStep(run, stepName, event.status === "error" ? "error" : "done");
  // R6 tool-use events. tool_call_start → show the tool as a running step. tool_call_result →
  // mark it done/error AND harvest any assetIds the tool produced/selected (M-225). assetIds
  // are deduped + order-preserved so "generate 6 people" surfaces all 6 thumbnails even though
  // the steps collapse to a single generate_asset row.
  if (type === "tool_call_start") return upsertRunStep(run, event.tool ?? stepName ?? "tool", "running");
  if (type === "tool_call_result") {
    const stepped = upsertRunStep(run, event.tool ?? stepName ?? "tool", event.success === false ? "error" : "done");
    const ids = assetIdsFromResultPreview(event.resultPreview);
    if (!ids.length) return stepped;
    const existing = stepped.producedAssetIds ?? [];
    const merged = [...existing];
    for (const id of ids) if (!merged.includes(id)) merged.push(id);
    return { ...stepped, producedAssetIds: merged };
  }
  if (type === "output") {
    const delta = typeof event.delta === "string" ? event.delta
      : typeof event.outputText === "string" ? event.outputText
      : typeof event.output === "string" ? event.output
      : typeof event.data === "string" ? event.data : "";
    if (!delta) return { ...run, status: "running" };
    return { ...run, outputText: `${run.outputText ?? ""}${delta}`, status: "running" };
  }
  if (type === "final" || type === "done" || type === "run_done") return { ...run, outputText: finalTextFromEvent(event) ?? run.outputText ?? null, status: "completed", state: "completed" };
  if (type === "error" || type === "failed") return { ...run, outputText: finalTextFromEvent(event) ?? run.outputText ?? null, status: "failed", state: "failed" };
  return run;
}

// Pull asset ids out of a tool_call_result.resultPreview (the tool's meta). generate_asset →
// { assetId }, search_asset → { assetIds: [...] }. Harvested generically so any future tool that
// returns assetId/assetIds surfaces its assets too. Only well-formed asset ids are kept.
function assetIdsFromResultPreview(preview: Record<string, unknown> | undefined): string[] {
  if (!preview) return [];
  const out: string[] = [];
  const single = preview.assetId;
  if (typeof single === "string" && single.startsWith("asset")) out.push(single);
  const many = preview.assetIds;
  if (Array.isArray(many)) for (const id of many) if (typeof id === "string" && id.startsWith("asset")) out.push(id);
  return out;
}

function finalTextFromEvent(event: AgentRunEvent): string | null {
  const output = event.output ?? event.data;
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const text = (output as { text?: unknown }).text;
    if (typeof text === "string") return text;
    const code = (output as { code?: unknown }).code;
    if (typeof code === "string") return `Error: ${code}`;
  }
  if (typeof event.delta === "string") return event.delta;
  if (typeof event.outputText === "string") return event.outputText;
  return null;
}

function upsertRunStep(run: AgentRunRow, name: string, status: "running" | "done" | "error", output?: string): AgentRunRow {
  const steps = [...(run.steps ?? [])];
  const index = steps.findIndex((step) => step.name === name);
  const next = { name, status, output };
  if (index >= 0) steps[index] = { ...steps[index], ...next };
  else steps.push(next);
  return { ...run, steps, status: status === "error" ? "failed" : "running" };
}

async function pollAssetDescription(id: string): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    const { asset } = await magpieApi.assets.get(id);
    if (asset.description || asset.descriptionStatus === "ready") return;
    await new Promise((resolve) => window.setTimeout(resolve, 600));
  }
}

function toEditorPalette(row: PaletteRow) {
  return {
    id: row.id,
    name: row.name,
    colors: parsePaletteColors(row.colorsJson ?? row.colors_json),
    lockVersion: row.lockVersion ?? 0,
  };
}

function toAgentRunView(row: AgentRunRow, assetCache: Record<string, ProducedAsset> = {}) {
  const ids = Array.isArray(row.producedAssetIds) ? row.producedAssetIds : [];
  // Map produced asset ids to resolved thumbnails (or a pending fallback while we fetch /
  // poll). Order preserved so "generate 6 people" shows all 6 in call order.
  const producedAssets: ProducedAsset[] = ids.map((id) => assetCache[id] ?? { id, pending: true });
  return {
    id: row.id,
    status: row.status ?? row.state ?? "running",
    prompt: row.prompt ?? "compose",
    tools: Array.isArray(row.tools) ? row.tools : [],
    steps: Array.isArray(row.steps) ? row.steps : [],
    outputRefs: Array.isArray(row.outputRefs) ? row.outputRefs : [],
    outputText: row.outputText ?? null,
    costMicros: row.costMicros ?? 0,
    producedAssets,
  };
}

function redactEmail(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  if (typeof copy.email === "string") copy.email = copy.email.replace(/^(.).+(@.+)$/, "$1***$2");
  return copy;
}

function rootIdOf(row: CardRow, rows: CardRow[]): string {
  const provided = row.cardRootId ?? row.card_root_id;
  if (provided) return provided;
  const parentId = row.parentCardId ?? row.parent_card_id;
  if (!parentId) return row.id;
  const parent = rows.find((candidate) => candidate.id === parentId);
  return parent ? rootIdOf(parent, rows) : row.id;
}

function eventLevelColor(level: string): string {
  if (level === "error") return "#BC4E32";
  if (level === "warn") return "#F36440";
  if (level === "audit") return "#2556B6";
  return "#A29B8B";
}

function formatEventTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const numericValue = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatMetaJson(event: AdminEventRow): string {
  const raw = event.metaJson ?? event.meta_json;
  if (!raw) return JSON.stringify({ id: event.id, level: event.level, code: event.code }, null, 2);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function routeToNav(pathname: string): NavId {
  if (pathname.startsWith("/assets")) return "assets";
  if (pathname.startsWith("/editor")) return "editor";
  if (pathname.startsWith("/palette")) return "palette";
  if (pathname.startsWith("/rules")) return "rules";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/admin")) return "admin";
  return "cards";
}

function dimsForRatio(ratio: string): { width: number; height: number } {
  if (ratio === "16:9") return { width: 1920, height: 1080 };
  if (ratio === "9:16") return { width: 1080, height: 1920 };
  if (ratio === "4:5") return { width: 1080, height: 1350 };
  if (ratio === "3:4") return { width: 1080, height: 1440 };
  return { width: 1080, height: 1080 };
}

function ratioPresetFor(ratio: string): string {
  if (ratio === "16:9") return "wechat-banner";
  if (ratio === "9:16") return "ig-story";
  if (ratio === "4:5") return "poster";
  if (ratio === "3:4") return "3:4";
  return "ig-post";
}

function readonlyActualSize(ratio: string, widthPx: number, heightPx: number): { width: number; height: number } {
  if (ratio === "1:1") return { width: 1080, height: 1080 };
  if (ratio === "16:9") return { width: 1920, height: 1080 };
  if (ratio === "9:16") return { width: 1080, height: 1920 };
  if (ratio === "4:5") return { width: 1080, height: 1350 };
  if (ratio === "3:4") return { width: 1080, height: 1440 };
  if (ratio === "1.91:1") return { width: 1200, height: 628 };
  return { width: widthPx, height: heightPx };
}

function readonlyLayerBox(layer: Layer, canvasW: number, canvasH: number, sourceW = canvasW, sourceH = canvasH): { x: number; y: number; w: number; h: number } {
  const fallbackW = layer.kind === "text" ? canvasW - 48 : 220;
  const fallbackH = layer.kind === "text" ? 110 : 220;
  const scaleX = sourceW > 0 ? canvasW / sourceW : 1;
  const scaleY = sourceH > 0 ? canvasH / sourceH : 1;
  return {
    x: typeof layer.x === "number" ? layer.x * scaleX : (layer.kind === "text" ? 24 : 80),
    y: typeof layer.y === "number" ? layer.y * scaleY : (layer.kind === "text" ? canvasH - 150 : 200),
    w: typeof layer.width === "number" && layer.width > 0 ? layer.width * scaleX : fallbackW,
    h: typeof layer.height === "number" && layer.height > 0 ? layer.height * scaleY : fallbackH,
  };
}

function navToRoute(id: NavId): string {
  if (id === "editor") return "/editor";
  return `/${id === "cards" ? "cards" : id}`;
}

function ratioFrom(preset: string | null | undefined, width: number, height: number): Ratio {
  if (preset === "1:1" || preset === "9:16" || preset === "16:9" || preset === "4:5" || preset === "1.91:1") return preset;
  if (preset === "3:4") return "custom";
  if (preset === "ig-story") return "9:16";
  if (preset === "ig-post") return "1:1";
  if (preset === "wechat-banner") return "16:9";
  if (preset === "poster") return "4:5";
  if (preset === "x-card") return "1.91:1";
  if (width === height) return "1:1";
  return "custom";
}

function assetKind(row: AssetRow): AssetKind {
  if (row.kind === "font") return "font";
  if (row.kind === "palette") return "palette";
  if (row.contentType?.includes("svg")) return "svg";
  if (row.transparent) return "transparent_png";
  if (row.contentType?.startsWith("image/")) return "image";
  return "image";
}

function assetSource(source: string | null | undefined): AssetSource {
  if (source === "renoise" || source === "agent-gen" || source === "seed") return source;
  return "upload";
}

function colorFromJson(text: string | null | undefined, fallback: string): string {
  if (!text) return fallback;
  const match = text.match(/#[0-9a-fA-F]{6}/);
  return match?.[0] ?? fallback;
}

function numeric(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function parseStringArray(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseObject(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parsePaletteColors(text: string | null | undefined): Record<string, string> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.reduce<Record<string, string>>((acc, item) => {
        if (item && typeof item === "object" && "role" in item && "hex" in item) {
          acc[String((item as { role: unknown }).role)] = String((item as { hex: unknown }).hex);
        }
        return acc;
      }, {});
    }
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function byteSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(timestamp: number | null): string {
  if (!timestamp) return "recent";
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// DEV-only: render the CardEditor standalone against an in-memory sample card so the
// editor flows (font-size, text-align, off-canvas locate, aspect switch, zero-size
// defaults) can be Playwright-verified without a backend. Never bundled in production.
function DevEditorHarness() {
  const devState = new URLSearchParams(window.location.search).get("state");
  const devTemplateLayers: Record<string, Layer[]> = {
    "dev-template-social": [
      { id: "tpl_social_bg", kind: "bg", name: "Coral editorial bg", thumbBg: "#F7F5F1", opacity: 1, visible: true, locked: true },
      { id: "tpl_social_asset", kind: "asset", name: "Coral bird", assetName: "coral bird · paper-cut", thumbFg: "#F36440", opacity: 0.95, visible: true, locked: false, x: 92, y: 270, width: 140, height: 140 },
      { id: "tpl_social_text", kind: "text", name: "Headline", textValue: "Ready template", font: "Inter 800", fontSize: 30, opacity: 1, visible: true, locked: false, x: 34, y: 120, width: 280, height: 74 },
    ],
    "dev-template-poster": [
      { id: "tpl_poster_bg", kind: "bg", name: "Ink bg", thumbBg: "#0C0A0F", opacity: 1, visible: true, locked: true },
      { id: "tpl_poster_mark", kind: "asset", name: "Paper cut mark", assetName: "paper-cut mark", thumbFg: "#F36440", opacity: 1, visible: true, locked: false, x: 72, y: 240, width: 180, height: 180 },
      { id: "tpl_poster_title", kind: "text", name: "Poster title", textValue: "Magpie Studio", font: "Inter 800", fontSize: 32, opacity: 1, visible: true, locked: false, x: 36, y: 96, width: 288, height: 84 },
    ],
  };
  const devTemplates: EditorTemplate[] = [
    { id: "dev-template-social", title: "Ready social template", ratio: "9:16", bg: "#F7F5F1", fg: "#F36440", category: "社媒", createdAtLabel: "DEV" },
    { id: "dev-template-poster", title: "Ink poster template", ratio: "9:16", bg: "#0C0A0F", fg: "#F36440", category: "海报", createdAtLabel: "DEV" },
  ];
  const [card, setCard] = useState<CardEditorCard>(() => ({
    id: "dev-sample",
    title: "Arena Olympics · Season 2",
    ratio: "9:16",
    widthPx: 1080,
    heightPx: 1920,
    status: "draft",
    bg: "#2556B6",
    fg: "#F36440",
    lockVersion: 0,
    layers: devState === "empty" ? [] : [
      { id: "l_text_1", kind: "text", name: "Headline", textValue: "Arena Olympics", font: "Inter 800", opacity: 1, visible: true, locked: false, x: 40, y: 120, width: 260, height: 70 },
      { id: "l_text_off", kind: "text", name: "Off-canvas tagline", textValue: "Season 2 is live", font: "Inter 800", opacity: 1, visible: true, locked: false, x: 400, y: -110, width: 220, height: 70 },
      { id: "l_asset_zero", kind: "asset", name: "Agent sticker (0px)", assetName: "sticker.png", thumbFg: "#FFFFFF", opacity: 1, visible: true, locked: false, x: 60, y: 240, width: 0, height: 0 },
      { id: "l_asset_bird", kind: "asset", name: "Coral bird", assetName: "coral bird · paper-cut", thumbFg: "#F36440", opacity: 0.95, visible: true, locked: false, x: 110, y: 300, width: 120, height: 120 },
      { id: "l_bg", kind: "bg", name: "Bloome Navy bg", thumbBg: "#2556B6", opacity: 1, visible: true, locked: true },
    ],
  }));
  const [agentRuns, setAgentRuns] = useState<AgentRunView[]>(() => devState === "ai-error" ? [{
    id: "dev-run-error",
    status: "failed",
    prompt: "生成一组贴纸",
    tools: ["imagegen"],
    steps: [{ name: "imagegen", status: "error", output: "上游工具失败，可重试。" }],
    outputRefs: [],
    outputText: "上游工具失败，可重试。",
    producedAssets: [],
  }] : []);
  const patchLayers = (layers: Layer[], title?: string) =>
    setCard((prev) => ({ ...prev, layers, title: title ?? prev.title }));
  const patchCardMeta = (patch: { title?: string; ratio?: string }) =>
    setCard((prev) => {
      const ratio = patch.ratio ?? prev.ratio;
      const dims = dimsForRatio(ratio);
      return { ...prev, title: patch.title ?? prev.title, ratio, widthPx: dims.width, heightPx: dims.height, lockVersion: Number(prev.lockVersion ?? 0) + 1 };
    });
  const runAgent = (prompt: string) => {
    setAgentRuns((prev) => [{
      id: `dev-run-${Date.now()}`,
      status: "completed",
      prompt,
      tools: ["search_asset", "imagegen"],
      steps: [
        { name: "理解需求", status: "done", output: "已解析品牌、构图和素材约束。" },
        { name: "生成素材", status: "done", output: "已产出 2 个素材候选。" },
        { name: "回填画布", status: "done", output: "素材可拖入当前卡片。" },
      ],
      outputRefs: [],
      outputText: "已生成 coral 纸剪风格素材候选。",
      costMicros: 12000,
      producedAssets: [
        { id: "dev-produced-1", name: "Coral bird sticker", previewUrl: null, width: 512, height: 512 },
        { id: "dev-produced-2", name: "Paper-cut badge", previewUrl: null, width: 512, height: 512 },
      ],
    }, ...prev]);
  };
  return (
    <CardEditor
      card={card}
      loading={devState === "loading"}
      templates={devState === "no-templates" ? [] : devTemplates}
      agentRuns={agentRuns}
      onLoadTemplateLayers={(id) => Promise.resolve(devTemplateLayers[id] ?? [])}
      onRunAgent={runAgent}
      onRetryAgentRun={runAgent}
      onCreateShare={() => Promise.resolve({ url: `${window.location.origin}/share/dev-token`, publicAccess: true } satisfies CardEditorShareResult)}
      onRevokeShare={() => Promise.resolve()}
      onPatchLayers={patchLayers}
      onPatchCardMeta={patchCardMeta}
      onBack={() => undefined}
    />
  );
}

function MagpieMark() {
  return (
    <svg width="54" height="54" viewBox="0 0 48 48" aria-hidden className="mx-auto">
      <path d="M6 24 C 6 12, 18 6, 26 8 C 38 10, 44 18, 42 28 C 40 38, 28 42, 20 40 C 10 38, 6 32, 6 24 Z" fill="#F36440" opacity="0.92" />
      <path d="M16 30 C 14 26, 16 22, 20 21 C 22 20, 24 18, 26 19 C 30 20, 33 24, 33 28 C 33 32, 30 35, 26 35 C 22 35, 18 33, 16 30 Z" fill="#0C0A0F" />
      <path d="M33 26 L 39 25 L 33 28 Z" fill="#0C0A0F" />
      <circle cx="29" cy="25" r="1.2" fill="#F7F5F1" />
    </svg>
  );
}
