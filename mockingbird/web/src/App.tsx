import { Navigate, Outlet, RouterProvider, createBrowserRouter, useNavigate, useParams } from "react-router-dom";
import type { AuthSession } from "@edgespark/web";
import { AuthGate } from "@/components/AuthGate";
import { ConnectAIAdmin } from "@/components/magicpath/connect-aiadmin/ConnectAIAdmin";
import { ContentLibrary } from "@/components/magicpath/content-library/ContentLibrary";
import { GalleryThemePage } from "@/components/magicpath/gallery-theme-page/GalleryThemePage";
import { LetterThemePage } from "@/components/magicpath/letter-theme-page/LetterThemePage";
import { MagazineThemePage } from "@/components/magicpath/magazine-theme-page/MagazineThemePage";
import { MockingbirdAdminShell } from "@/components/magicpath/mockingbird-admin-shell/MockingbirdAdminShell";
import { MockingbirdAnalytics } from "@/components/magicpath/mockingbird-analytics/MockingbirdAnalytics";
import { SignalPreviewLab } from "@/components/magicpath/signal-preview-lab/SignalPreviewLab";
import { TerminalThemePage } from "@/components/magicpath/terminal-theme-page/TerminalThemePage";
import { ThemeEditorSplit } from "@/components/magicpath/theme-editor-split/ThemeEditorSplit";
import { ThemeListManager, type ThemeListItem } from "@/components/magicpath/theme-list-manager/ThemeListManager";
import { useAsync } from "@/hooks/useAsync";
import { client } from "@/lib/edgespark";
import { mockingbirdApi } from "@/lib/api";
import type { AnalyticsResponse, BioBlurb, ImageRow, LayoutKey, ProjectRow, SocialRow, ThemeRow } from "@/lib/types";

const router = createBrowserRouter([
  { path: "/", element: null },
  { path: "/login", element: <LoginRoute /> },
  {
    path: "/admin",
    element: <AuthGate>{(session) => <AdminLayout session={session} />}</AuthGate>,
    children: [
      { index: true, element: <Navigate to="/admin/themes-list" replace /> },
      { path: "themes-list", element: <ThemesListRoute /> },
      { path: "themes/:id", element: <ThemeEditorRoute /> },
      { path: "content", element: <ContentRoute /> },
      { path: "preview", element: <PreviewRoute /> },
      { path: "analytics", element: <AnalyticsRoute /> },
      { path: "connect", element: <ConnectRoute /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

function LoginRoute() {
  return <AuthGate>{() => <Navigate to="/admin/themes-list" replace />}</AuthGate>;
}

function AdminLayout({ session }: { session: AuthSession }) {
  const navigate = useNavigate();
  const path = window.location.pathname;
  const active = path.includes("/content") ? "content" : path.includes("/preview") ? "preview" : path.includes("/analytics") ? "analytics" : path.includes("/connect") ? "connect" : "themes";
  return (
    <MockingbirdAdminShell
      active={active}
      ownerName={session.user.name ?? session.user.email ?? "Owner"}
      ownerEmail={session.user.email ?? ""}
      onSignOut={() => void client.auth.signOut().then(() => navigate("/login"))}
      onNavigate={(key) => navigate(key === "themes" ? "/admin/themes-list" : `/admin/${key}`)}
    >
      <Outlet />
    </MockingbirdAdminShell>
  );
}

function ThemesListRoute() {
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => mockingbirdApi.themes.list(), []);
  return <ThemeListManager themes={(data?.themes ?? []).map(toThemeListItem)} loading={loading} error={error} onEditTheme={(id) => navigate(`/admin/themes/${id}`)} />;
}

function ThemeEditorRoute() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const themeState = useAsync(() => mockingbirdApi.themes.get(id), [id]);
  const rulesState = useAsync(() => mockingbirdApi.themes.rules(id), [id]);
  const theme = themeState.data?.theme;
  if (themeState.loading) return <div className="p-8 text-sm text-muted-foreground">Loading theme...</div>;
  if (!theme) return <div className="p-8 text-sm text-destructive">{themeState.error?.message ?? "Theme not found."}</div>;
  return (
    <ThemeEditorSplit
      theme={theme}
      rules={rulesState.data?.rules}
      error={themeState.error ?? rulesState.error}
      onBack={() => navigate("/admin/themes-list")}
      preview={renderThemePage(theme)}
      onSave={(patch) => void mockingbirdApi.themes.update(theme.id, patch).then((res) => themeState.setData(res))}
    />
  );
}

function ContentRoute() {
  const state = useAsync(async () => {
    const [bio, projects, socials, images] = await Promise.all([
      mockingbirdApi.content.bioBlurbs(),
      mockingbirdApi.content.projects(),
      mockingbirdApi.content.socials(),
      mockingbirdApi.content.images(),
    ]);
    return { bioBlurbs: bio.bioBlurbs, projects: projects.projects, socials: socials.socials, images: images.images };
  }, []);
  return <ContentLibrary loading={state.loading} error={state.error} bioBlurbs={(state.data?.bioBlurbs ?? []).map(toBio)} projects={(state.data?.projects ?? []).map(toProject)} socials={(state.data?.socials ?? []).map(toSocial)} images={(state.data?.images ?? []).map(toImage)} />;
}

function PreviewRoute() {
  return <SignalPreviewLab />;
}

function AnalyticsRoute() {
  const state = useAsync(() => mockingbirdApi.analytics(), []);
  return <MockingbirdAnalytics loading={state.loading} error={state.error} data={toAnalytics(state.data)} />;
}

function ConnectRoute() {
  const state = useAsync(() => mockingbirdApi.keys.list(), []);
  return (
    <ConnectAIAdmin
      loading={state.loading}
      error={state.error}
      keys={(state.data?.keys ?? []).map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        createdLabel: ago(key.createdAt),
        lastUsedLabel: key.lastUsedAt ? ago(key.lastUsedAt) : null,
        revoked: Boolean(key.revokedAt),
      }))}
      onCreateKey={async (name) => {
        const res = await mockingbirdApi.keys.create(name);
        await state.refresh();
        return res.plaintext;
      }}
      onRevokeKey={(keyId) => void mockingbirdApi.keys.revoke(keyId).then(() => state.refresh())}
    />
  );
}

function renderThemePage(theme: ThemeRow) {
  const palette = theme.palette ?? {};
  const copy = theme.fallbackCopy ?? {};
  const common = {
    ownerName: theme.name,
    bg: palette.bg,
    fg: palette.fg,
    accent: palette.accent,
  };
  if (theme.layoutKey === "terminal") return <TerminalThemePage {...common} intro={String(copy.intro ?? theme.defaultTone)} bio={String(copy.about ?? theme.copyPrompt)} />;
  if (theme.layoutKey === "magazine") return <MagazineThemePage {...common} headline={String(copy.headline ?? theme.name)} deck={String(copy.intro ?? theme.defaultTone)} />;
  if (theme.layoutKey === "gallery") return <GalleryThemePage {...common} intro={String(copy.intro ?? theme.defaultTone)} />;
  return <LetterThemePage {...common} greeting={String(copy.headline ?? "Hi -")} intro={String(copy.intro ?? theme.defaultTone)} />;
}

function toThemeListItem(theme: ThemeRow): ThemeListItem {
  const palette = theme.palette ?? {};
  return {
    id: theme.id,
    name: theme.name,
    layout: theme.layoutKey,
    status: titleStatus(theme.status),
    priority: theme.priority,
    hits7d: 0,
    rule: theme.isDefault ? "* (fallback)" : theme.copyPrompt || "rules in editor",
    swatches: [palette.bg ?? "#F7F5F1", palette.fg ?? "#0C0A0F", palette.accent ?? "#2556B6"],
    isDefault: theme.isDefault,
    updatedAtLabel: ago(theme.updatedAt),
  };
}

function toBio(row: BioBlurb) {
  return { id: row.id, title: row.title, body: row.body, tags: parseTags(row.tagsJson), usedByThemes: 0, updatedAtLabel: ago(row.updatedAt) };
}
function toProject(row: ProjectRow) {
  return { id: row.id, title: row.title, subtitle: row.subtitle ?? undefined, description: row.description, url: row.url ?? "", tags: parseTags(row.tagsJson), status: row.status, featured: row.position === 0, imageThumbColor: "#2556B6" };
}
function toSocial(row: SocialRow) {
  const platform = row.platform === "github" || row.platform === "twitter" || row.platform === "email" ? row.platform : "website";
  return { id: row.id, platform: platform as "github" | "twitter" | "email" | "website", label: row.label, handle: row.handle ?? row.url, active: Boolean(row.isActive) };
}
function toImage(row: ImageRow) {
  return { id: row.id, alt: row.alt, kind: row.kind as "avatar" | "cover" | "project" | "inline", dims: row.width && row.height ? `${row.width}x${row.height}` : "-", byteSize: `${Math.round(row.byteSize / 1024)} KB`, usedIn: 0, thumbColor: "#F36440" };
}
function toAnalytics(data: AnalyticsResponse | null) {
  if (!data) return null;
  const views = data.kpis?.views ?? 0;
  const llmRequests = data.kpis?.llmRequests ?? 0;
  const cacheHits = data.kpis?.cacheHits ?? 0;
  const costMicros = data.kpis?.costMicros ?? 0;
  const themeDistribution = toThemeDistribution(data.themeDistribution);
  return {
    kpis: [
      { label: "Hits", value: views.toLocaleString(), delta: `${data.filters?.ownerTrafficExcluded ? "owner excluded" : "owner included"}`, tone: "pos" as const },
      { label: "LLM requests", value: llmRequests.toLocaleString(), delta: `${cacheHits.toLocaleString()} cache hits`, tone: "pos" as const },
      { label: "LLM cost", value: `$${(costMicros / 1_000_000).toFixed(2)}`, delta: `${(data.kpis?.tokenIn ?? 0).toLocaleString()} in / ${(data.kpis?.tokenOut ?? 0).toLocaleString()} out`, tone: "warn" as const },
      { label: "Cache hit", value: `${Math.round((data.kpis?.cacheHitRate ?? 0) * 100)}%`, delta: "rewrite cache", tone: "pos" as const },
    ],
    themeDistribution,
    signalDistribution: {
      country: toShareRows(data.signals?.country ?? data.signalDistribution?.country),
      device: toShareRows(data.signals?.device ?? data.signalDistribution?.device),
      referrer: toShareRows(data.signals?.referrer ?? data.signalDistribution?.referrer),
      lang: toShareRows(data.signals?.language ?? data.signals?.lang ?? data.signalDistribution?.lang),
    },
    costTrend: data.costTrend,
  };
}
function toThemeDistribution(raw: AnalyticsResponse["themeDistribution"]) {
  if (!raw) return [];
  const entries = Object.entries(raw);
  const total = entries.reduce((sum, [, value]) => sum + (typeof value === "number" ? value : value.hits ?? value.share ?? 0), 0);
  return entries.map(([id, value], index) => {
    if (typeof value === "number") {
      return {
        name: id === "none" ? "None" : id,
        color: paletteColor(index),
        hits: value,
        share: total > 0 ? Math.round((value / total) * 100) : 0,
      };
    }
    const hits = value.hits ?? value.share ?? 0;
    return {
      name: value.name ?? id,
      color: value.color ?? paletteColor(index),
      hits,
      share: value.share ?? (total > 0 ? Math.round((hits / total) * 100) : 0),
    };
  });
}
function paletteColor(index: number) {
  return ["#2556B6", "#F36440", "#BC4E32", "#7DDC8B", "#706B75"][index % 5];
}
function toShareRows(raw?: Record<string, number>) {
  if (!raw) return [];
  const total = Object.values(raw).reduce((sum, count) => sum + count, 0);
  return Object.entries(raw).map(([label, count]) => ({ label, share: total > 0 ? Math.round((count / total) * 100) : 0 }));
}
function parseTags(raw?: string) {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
function titleStatus(status: ThemeRow["status"]): ThemeListItem["status"] {
  return (status.slice(0, 1).toUpperCase() + status.slice(1)) as ThemeListItem["status"];
}
function ago(ts: number) {
  const delta = Math.max(0, Date.now() - ts);
  const min = Math.round(delta / 60000);
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
