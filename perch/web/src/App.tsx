import { useState, type FormEvent } from "react";
import { Navigate, RouterProvider, createBrowserRouter, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AuthGate } from "@/components/AuthGate";
import { Field, MonoModal, inputClass } from "@/components/MonoModal";
import { APIKeys } from "@/components/magicpath/api-keys/APIKeys";
import { Analytics } from "@/components/magicpath/analytics/Analytics";
import { Appearance } from "@/components/magicpath/appearance/Appearance";
import { ConnectAI } from "@/components/magicpath/connect-ai/ConnectAI";
import { PageEditor, type EditorTab } from "@/components/magicpath/page-editor/PageEditor";
import { PagesDashboard } from "@/components/magicpath/pages-dashboard/PagesDashboard";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAssets } from "@/hooks/useAssets";
import { useLinks } from "@/hooks/useLinks";
import { usePage } from "@/hooks/usePage";
import { usePages } from "@/hooks/usePages";
import { Layout } from "@/layouts/Layout";
import type { AnalyticsQuery, CreateLinkRequest, Link, LinkKind, Page, UpdateLinkRequest } from "@/lib/types";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthGate>{(session) => <Layout user={session.user} />}</AuthGate>,
    children: [
      { index: true, element: <Navigate to="/pages" replace /> },
      { path: "pages", element: <PagesRoute /> },
      { path: "pages/:id", element: <PageEditorRoute /> },
      { path: "connect", element: <ConnectAI /> },
      { path: "keys", element: <APIKeys /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

function PagesRoute() {
  const navigate = useNavigate();
  const { pages, loading, error, createPage } = usePages();
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreatePage(input: PageFormValue) {
    setFormError(null);
    try {
      const page = await createPage({
        slug: input.slug,
        title: input.title,
        displayName: input.displayName,
        bio: input.bio,
        published: input.published,
        isDefault: input.isDefault,
        theme: { background: "#ffffff", foreground: "#18181b", card: "#ffffff", accent: "#18181b", radius: "18px" },
      });
      setCreating(false);
      navigate(`/pages/${page.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create page.");
    }
  }

  return (
    <>
      <PagesDashboard pages={pages.map((page) => ({ page }))} loading={loading} error={error} onCreatePage={() => setCreating(true)} />
      {creating && (
        <PageFormModal
          title="New page"
          error={formError}
          onClose={() => setCreating(false)}
          onSubmit={(input) => void handleCreatePage(input)}
        />
      )}
    </>
  );
}

function PageEditorRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const range = parseRange(searchParams.get("range"));
  const query = rangeToQuery(range);
  const { page, loading: pageLoading, error: pageError, updatePage, setData: setPage } = usePage(id);
  const { links, loading: linksLoading, error: linksError, createLink, updateLink, deleteLink, reorderLinks } = useLinks(id);
  const { analytics, loading: analyticsLoading, error: analyticsError } = useAnalytics(id, query);
  const assets = useAssets(id);
  const [pageModal, setPageModal] = useState(false);
  const [linkModal, setLinkModal] = useState<{ mode: "create" | "edit"; kind: LinkKind; link?: Link } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (pageLoading || linksLoading) return <main className="flex flex-1 items-center justify-center text-[13px] text-zinc-400">Loading page...</main>;
  if (!page) return <main className="flex flex-1 items-center justify-center text-[13px] text-zinc-400">{pageError?.message ?? "Page not found."}</main>;
  const currentPage = page;

  async function handleSaveLink(input: LinkFormValue) {
    setFormError(null);
    try {
      if (linkModal?.mode === "edit" && linkModal.link) {
        await handleUpdateLink(linkModal.link, input);
      } else {
        const payload: CreateLinkRequest = {
          title: input.title,
          url: input.linkKind === "section" ? undefined : input.url,
          description: input.description,
          position: Date.now(),
          isActive: input.isActive,
          isFeatured: input.isFeatured,
          linkKind: input.linkKind,
        };
        await createLink(payload);
      }
      setLinkModal(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save link.");
    }
  }
  async function handleSavePage(input: PageFormValue) {
    setFormError(null);
    try {
      await updatePage({
        slug: input.slug,
        title: input.title,
        displayName: input.displayName,
        bio: input.bio,
        published: input.published,
        isDefault: input.isDefault,
        lockVersion: currentPage.lockVersion,
      });
      setPageModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save page.");
    }
  }
  async function handleUpdateLink(link: Link, input: Partial<Link>) {
    const payload: UpdateLinkRequest = {
      title: input.title,
      url: input.url,
      description: input.description ?? undefined,
      position: input.position,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      linkKind: input.linkKind,
      lockVersion: link.lockVersion,
    };
    await updateLink(link.id, compact(payload));
  }
  async function handleReorder(nextLinks: Link[]) {
    await reorderLinks({ items: nextLinks.map((link, index) => ({ id: link.id, position: (index + 1) * 1000 })) });
  }
  async function handleUpload(kind: "avatar" | "cover") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void assets.upload(file, kind).then((result) => {
        if ("page" in result) setPage(result.page);
      });
    };
    input.click();
  }

  return (
    <>
      <PageEditor
        page={page}
        links={links}
        activeTab={tab}
        error={pageError ?? linksError}
        onBack={() => navigate("/pages")}
        onTabChange={(next) => setSearchParams(next === "links" ? {} : { tab: next })}
        onEditPage={() => {
          setFormError(null);
          setPageModal(true);
        }}
        onAddLink={() => {
          setFormError(null);
          setLinkModal({ mode: "create", kind: "link" });
        }}
        onAddSection={() => {
          setFormError(null);
          setLinkModal({ mode: "create", kind: "section" });
        }}
        onEditLink={(link) => {
          setFormError(null);
          setLinkModal({ mode: "edit", kind: link.linkKind, link });
        }}
        onToggleLink={(link) => void handleUpdateLink(link, { isActive: !link.isActive })}
        onToggleFeatured={(link) => void handleUpdateLink(link, { isFeatured: !link.isFeatured })}
        onDeleteLink={(link) => void deleteLink(link.id)}
        onReorder={(nextLinks) => void handleReorder(nextLinks)}
      >
        {tab === "appearance" ? (
          <Appearance page={page} links={links} onSaveTheme={(theme) => void updatePage({ theme, lockVersion: currentPage.lockVersion })} onUpload={(kind) => void handleUpload(kind)} />
        ) : (
          <Analytics page={page} analytics={analytics} range={range} loading={analyticsLoading} error={analyticsError} onRangeChange={(nextRange) => setSearchParams({ tab: "analytics", range: nextRange })} />
        )}
      </PageEditor>
      {pageModal && (
        <PageFormModal
          title="Edit page"
          page={page}
          error={formError}
          onClose={() => setPageModal(false)}
          onSubmit={(input) => void handleSavePage(input)}
        />
      )}
      {linkModal && (
        <LinkFormModal
          title={linkModal.mode === "edit" ? "Edit link" : linkModal.kind === "section" ? "New section" : "New link"}
          link={linkModal.link}
          kind={linkModal.kind}
          error={formError}
          onClose={() => setLinkModal(null)}
          onSubmit={(input) => void handleSaveLink(input)}
        />
      )}
    </>
  );
}

type PageFormValue = {
  slug: string;
  title: string;
  displayName: string;
  bio: string;
  published: boolean;
  isDefault: boolean;
};

function PageFormModal({
  title,
  page,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  page?: Page;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: PageFormValue) => void;
}) {
  const [value, setValue] = useState<PageFormValue>({
    slug: page?.slug ?? "",
    title: page?.title ?? "",
    displayName: page?.displayName ?? "",
    bio: page?.bio ?? "",
    published: !!page?.publishedAt,
    isDefault: !!page?.isDefault,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const displayName = value.displayName.trim();
    const titleText = (value.title || displayName).trim();
    onSubmit({ ...value, displayName, title: titleText, slug: slugify(value.slug || displayName), bio: value.bio.trim() });
  }

  return (
    <MonoModal title={title} onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={submit}>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        <Field label="Display name"><input className={inputClass} value={value.displayName} onChange={(event) => setValue({ ...value, displayName: event.target.value })} required /></Field>
        <Field label="Slug"><input className={inputClass} value={value.slug} onChange={(event) => setValue({ ...value, slug: event.target.value })} placeholder="your-page" required /></Field>
        <Field label="Title"><input className={inputClass} value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} placeholder="Defaults to display name" /></Field>
        <Field label="Bio"><textarea className={`${inputClass} min-h-20 resize-none`} value={value.bio} onChange={(event) => setValue({ ...value, bio: event.target.value })} /></Field>
        <div className="flex items-center gap-4 text-[13px] text-zinc-700">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={value.published} onChange={(event) => setValue({ ...value, published: event.target.checked })} /> Published</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={value.isDefault} onChange={(event) => setValue({ ...value, isDefault: event.target.checked })} /> Default</label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700" onClick={onClose}>Cancel</button>
          <button className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white">Save</button>
        </div>
      </form>
    </MonoModal>
  );
}

type LinkFormValue = {
  title: string;
  url: string;
  description: string;
  linkKind: LinkKind;
  isActive: boolean;
  isFeatured: boolean;
};

function LinkFormModal({
  title,
  link,
  kind,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  link?: Link;
  kind: LinkKind;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: LinkFormValue) => void;
}) {
  const [value, setValue] = useState<LinkFormValue>({
    title: link?.title ?? "",
    url: link?.url ?? "https://",
    description: link?.description ?? "",
    linkKind: link?.linkKind ?? kind,
    isActive: link?.isActive ?? true,
    isFeatured: link?.isFeatured ?? false,
  });
  const isSection = value.linkKind === "section";

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ ...value, title: value.title.trim(), url: isSection ? "" : value.url.trim(), description: value.description.trim() });
  }

  return (
    <MonoModal title={title} onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={submit}>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        <Field label="Type">
          <div className="grid grid-cols-2 gap-2">
            {(["link", "section"] as const).map((nextKind) => (
              <button key={nextKind} type="button" className={`rounded-xl border px-3 py-2 text-[13px] capitalize ${value.linkKind === nextKind ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600"}`} onClick={() => setValue({ ...value, linkKind: nextKind })}>{nextKind}</button>
            ))}
          </div>
        </Field>
        <Field label="Title"><input className={inputClass} value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} required /></Field>
        {!isSection && <Field label="URL"><input className={inputClass} value={value.url} onChange={(event) => setValue({ ...value, url: event.target.value })} required /></Field>}
        {!isSection && <Field label="Description"><textarea className={`${inputClass} min-h-20 resize-none`} value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} /></Field>}
        <div className="flex items-center gap-4 text-[13px] text-zinc-700">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={value.isActive} onChange={(event) => setValue({ ...value, isActive: event.target.checked })} /> Active</label>
          {!isSection && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={value.isFeatured} onChange={(event) => setValue({ ...value, isFeatured: event.target.checked })} /> Featured</label>}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700" onClick={onClose}>Cancel</button>
          <button className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white">Save</button>
        </div>
      </form>
    </MonoModal>
  );
}

function parseTab(value: string | null): EditorTab {
  return value === "appearance" || value === "analytics" ? value : "links";
}
function parseRange(value: string | null): "7d" | "30d" | "90d" {
  return value === "7d" || value === "90d" ? value : "30d";
}
function rangeToQuery(range: "7d" | "30d" | "90d"): AnalyticsQuery {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return { from: Date.now() - days * 24 * 60 * 60 * 1000, to: Date.now() };
}
function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `page-${Date.now()}`;
}
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export default App;
