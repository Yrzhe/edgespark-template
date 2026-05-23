// Hatch — Sites (refined light, Linear/Render-grounded). Master-detail: the table lists
// sites (paginated + sortable); clicking a row opens a right slide-over drawer with that
// site's versions, deploy, and rollback. The "Live" badge follows currentVersionId — after
// a rollback it sits on an older version, and every other ready version offers Rollback.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { manage } from "@/lib/api";

type Status = "ready" | "building" | "failed";
type SortKey = "updatedAt" | "createdAt" | "name";

interface SiteRow {
  id: string;
  name: string;
  slug: string;
  currentVersionId: string | null;
  updatedAt: number;
}

interface VersionRow {
  id: string;
  status: Status;
  note: string | null;
  fileCount: number;
  totalBytes: number;
  createdAt: number;
  committedAt: number | null;
}

interface ManifestEntry {
  path: string;
  hash: string;
  size: number;
  contentType: string;
}

interface DeployResponse {
  deployId: string;
  uploads: Record<string, { uploadUrl: string; requiredHeaders?: Record<string, string> }>;
}

const PAGE_SIZE = 20;

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h10v10H9zM5 15H4V4h11v1",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  external: "M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",
  upload: "M12 16V4m0 0L7 9m5-5 5 5M20 17v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2",
  close: "M18 6 6 18M6 6l12 12",
  chevronL: "M15 18l-6-6 6-6",
  chevronR: "M9 18l6-6-6-6",
  rotate: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
  arrow: "M12 5v14M5 12l7 7 7-7",
};

function StatusChip({ s }: { s: Status }) {
  const map: Record<Status, { label: string; text: string; dot: string }> = {
    ready: { label: "Ready", text: "text-emerald-700", dot: "bg-emerald-500" },
    building: { label: "Building", text: "text-amber-700", dot: "bg-amber-500 animate-pulse" },
    failed: { label: "Failed", text: "text-rose-700", dot: "bg-rose-500" },
  };
  const v = map[s];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${v.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

export const SitesDashboard = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<SiteRow | null>(null);
  const [liveVersionId, setLiveVersionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = window.location.origin;

  const filteredSites = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter((site) => `${site.name} ${site.slug}`.toLowerCase().includes(needle));
  }, [query, sites]);

  const loadSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort, order });
      const data = await manage<{ sites: SiteRow[]; total: number }>(`/sites?${qs.toString()}`);
      setSites(data.sites);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }, [offset, sort, order]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  async function loadVersions(siteId: string) {
    setVersionsLoading(true);
    try {
      const data = await manage<{ versions: VersionRow[] }>(`/sites/${siteId}/versions`);
      setVersions(data.versions);
      return data.versions;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions.");
      return [];
    } finally {
      setVersionsLoading(false);
    }
  }

  function openDrawer(site: SiteRow) {
    setSelected(site);
    setLiveVersionId(site.currentVersionId);
    setVersions([]);
    void loadVersions(site.id);
  }

  function closeDrawer() {
    setSelected(null);
    setVersions([]);
  }

  async function createSite() {
    const name = window.prompt("Site name");
    if (!name) return;
    const slug = window.prompt("Slug", slugify(name)) ?? undefined;
    setBusy("create");
    setError(null);
    try {
      await manage("/sites", { method: "POST", json: { name, slug } });
      setOffset(0);
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site.");
    } finally {
      setBusy(null);
    }
  }

  async function rollback(site: SiteRow, versionId: string) {
    setBusy(`rollback:${versionId}`);
    setError(null);
    try {
      const res = await manage<{ currentVersionId: string }>(`/sites/${site.id}/rollback`, { method: "POST", json: { versionId } });
      setLiveVersionId(res.currentVersionId);
      await loadVersions(site.id);
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deployFiles(site: SiteRow, files: File[]) {
    if (files.length === 0) return;
    setBusy(`deploy:${site.id}`);
    setError(null);
    try {
      const prepared = await Promise.all(files.map((file) => fileToManifest(file)));
      const manifest = prepared.map(({ entry }) => entry);
      const deploy = await manage<DeployResponse>(`/sites/${site.id}/deploys`, {
        method: "POST",
        json: { manifest, note: `Dashboard deploy: ${files.length} files` },
      });
      await Promise.all(
        prepared
          .filter(({ entry }) => deploy.uploads[entry.hash])
          .map(async ({ file, entry }) => {
            const upload = deploy.uploads[entry.hash];
            const headers = new Headers(upload.requiredHeaders ?? {});
            if (!headers.has("Content-Type")) headers.set("Content-Type", entry.contentType);
            const res = await fetch(upload.uploadUrl, { method: "PUT", headers, body: file });
            if (!res.ok) throw new Error(`Upload failed for ${entry.path}.`);
          })
      );
      await manage(`/sites/${site.id}/deploys/${deploy.deployId}/finalize`, { method: "POST" });
      const fresh = await loadVersions(site.id);
      if (fresh[0]) setLiveVersionId(fresh[0].id); // a fresh deploy becomes the live version
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setBusy(null);
    }
  }

  function onFilesPicked(files: FileList | null) {
    const site = selected;
    if (!site || !files) return;
    void deployFiles(site, Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function changeSort(next: SortKey) {
    setOffset(0);
    if (next === sort) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(next);
      setOrder(next === "name" ? "asc" : "desc");
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">Sites</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">{loading ? "Loading static sites…" : `${total} ${total === 1 ? "site" : "sites"} on the edge`}</p>
        </div>
        <SortControl sort={sort} order={order} onChange={changeSort} />
        <div className="relative hidden sm:block">
          <Icon d={ICONS.search} className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this page" className="h-8 w-44 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-amber-600" onClick={() => void createSite()} disabled={busy === "create"}>
          <Icon d={ICONS.plus} className="h-4 w-4" /> New site
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[30%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <th className="px-5 py-2.5 font-semibold">Site</th>
                <th className="px-3 py-2.5 font-semibold">Public URL</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Updated</th>
                <th className="px-5 py-2.5 text-right font-semibold">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredSites.map((s) => (
                <tr
                  key={s.id}
                  className={`group cursor-pointer hover:bg-amber-50/40 ${selected?.id === s.id ? "bg-amber-50/60" : ""}`}
                  onClick={() => openDrawer(s)}
                >
                  <td className="px-5 py-3 align-middle">
                    <div className="truncate font-medium text-neutral-900">{s.name}</div>
                    <div className="truncate font-mono text-[12px] text-neutral-400">/{s.slug}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <code className="truncate rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[12px] text-neutral-600">…/s/{s.slug}/</code>
                      <button
                        className="shrink-0 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 group-hover:opacity-100"
                        title="Copy URL"
                        onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(publicUrl(origin, s.slug)); }}
                      >
                        <Icon d={ICONS.copy} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <StatusChip s={s.currentVersionId ? "ready" : "building"} />
                  </td>
                  <td className="px-3 py-3 align-middle text-neutral-500">{relativeTime(s.updatedAt)}</td>
                  <td className="px-5 py-3 align-middle">
                    <div className="flex items-center justify-end">
                      <button
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                        title="Open live site"
                        onClick={(e) => { e.stopPropagation(); window.open(publicUrl(origin, s.slug), "_blank", "noopener,noreferrer"); }}
                      >
                        <Icon d={ICONS.external} className="h-3.5 w-3.5" /> Open
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredSites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-neutral-400">
                    {query ? "No sites match your search on this page." : "No sites yet — create one to deploy."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-[12px] text-neutral-500">
          <span>{total === 0 ? "—" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}</span>
          <div className="flex items-center gap-1">
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-medium text-neutral-700 disabled:opacity-40 enabled:hover:bg-neutral-50"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              <Icon d={ICONS.chevronL} className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2 tabular-nums">Page {page} / {pageCount}</span>
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-medium text-neutral-700 disabled:opacity-40 enabled:hover:bg-neutral-50"
              disabled={page >= pageCount || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next <Icon d={ICONS.chevronR} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Per-site drawer */}
      {selected && (
        <SiteDrawer
          site={selected}
          origin={origin}
          versions={versions}
          versionsLoading={versionsLoading}
          liveVersionId={liveVersionId}
          busy={busy}
          onClose={closeDrawer}
          onDeploy={() => fileInputRef.current?.click()}
          onRollback={(vid) => void rollback(selected, vid)}
        />
      )}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => onFilesPicked(event.currentTarget.files)} {...{ webkitdirectory: "" }} />
    </main>
  );
};

function SortControl({ sort, order, onChange }: { sort: SortKey; order: "asc" | "desc"; onChange: (k: SortKey) => void }) {
  const labels: Record<SortKey, string> = { updatedAt: "Updated", createdAt: "Created", name: "Name" };
  return (
    <div className="hidden items-center gap-1 rounded-lg border border-neutral-200 bg-white p-0.5 md:flex">
      {(Object.keys(labels) as SortKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium transition-colors ${sort === key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
          title={`Sort by ${labels[key]}${sort === key ? (order === "desc" ? " (descending)" : " (ascending)") : ""}`}
        >
          {labels[key]}
          {sort === key && <Icon d={ICONS.arrow} className={`h-3 w-3 transition-transform ${order === "asc" ? "rotate-180" : ""}`} />}
        </button>
      ))}
    </div>
  );
}

function SiteDrawer({
  site, origin, versions, versionsLoading, liveVersionId, busy, onClose, onDeploy, onRollback,
}: {
  site: SiteRow;
  origin: string;
  versions: VersionRow[];
  versionsLoading: boolean;
  liveVersionId: string | null;
  busy: string | null;
  onClose: () => void;
  onDeploy: () => void;
  onRollback: (versionId: string) => void;
}) {
  const url = publicUrl(origin, site.slug);
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-neutral-900/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-neutral-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-neutral-900">{site.name}</h2>
            <p className="truncate font-mono text-[12px] text-neutral-400">/{site.slug}</p>
          </div>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" onClick={onClose} title="Close">
            <Icon d={ICONS.close} className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[12px] text-neutral-600">{url}</code>
            <button className="shrink-0 rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-500 hover:bg-neutral-50" title="Copy" onClick={() => void navigator.clipboard.writeText(url)}>
              <Icon d={ICONS.copy} className="h-3.5 w-3.5" />
            </button>
            <button className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              <Icon d={ICONS.external} className="h-3.5 w-3.5" /> Open
            </button>
          </div>
          <button
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
            onClick={onDeploy}
            disabled={busy === `deploy:${site.id}`}
          >
            <Icon d={ICONS.upload} className="h-4 w-4" />
            {busy === `deploy:${site.id}` ? "Deploying…" : "Deploy new version (pick a folder)"}
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Versions</h3>
          <span className="text-[11px] text-neutral-400">newest first · the Live one is what visitors see</span>
        </div>
        <div className="flex-1 overflow-auto px-3 pb-4">
          {versionsLoading && <p className="px-2 py-3 text-[13px] text-neutral-400">Loading versions…</p>}
          {!versionsLoading && versions.length === 0 && <p className="px-2 py-3 text-[13px] text-neutral-400">No versions yet.</p>}
          <ol className="space-y-1.5">
            {versions.map((v, i) => {
              const isLive = v.id === liveVersionId;
              return (
                <li key={v.id} className={`rounded-lg border px-3 py-2.5 ${isLive ? "border-emerald-300 bg-emerald-50/50" : "border-neutral-200 bg-white"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {isLive ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">{i === 0 ? "Latest" : `v·${versions.length - i}`}</span>
                      )}
                      <code className="truncate font-mono text-[12px] text-neutral-500">{v.id.slice(0, 8)}</code>
                    </div>
                    {isLive ? (
                      <span className="shrink-0 text-[11px] text-emerald-700">current live version</span>
                    ) : (
                      v.status === "ready" && (
                        <button
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          disabled={busy === `rollback:${v.id}`}
                          onClick={() => onRollback(v.id)}
                          title="Make this the live version"
                        >
                          <Icon d={ICONS.rotate} className="h-3.5 w-3.5" />
                          {busy === `rollback:${v.id}` ? "Switching…" : i === 0 ? "Restore latest" : "Roll back here"}
                        </button>
                      )
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 pl-0.5 text-[12px] text-neutral-400">
                    <StatusChip s={v.status} />
                    <span>{v.fileCount} files</span>
                    <span>{formatBytes(v.totalBytes)}</span>
                    <span className="ml-auto">{relativeTime(v.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </div>
  );
}

async function fileToManifest(file: File): Promise<{ file: File; entry: ManifestEntry }> {
  const buffer = await file.arrayBuffer();
  return {
    file,
    entry: {
      path: normalizeFilePath(file),
      hash: await sha256Hex(buffer),
      size: file.size,
      contentType: file.type || contentTypeFor(file.name),
    },
  };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeFilePath(file: File): string {
  const withDirectory = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  const raw = withDirectory || file.name;
  return `/${raw.replace(/^\/+/, "")}`;
}

function contentTypeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html;charset=utf-8";
  if (path.endsWith(".css")) return "text/css;charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript;charset=utf-8";
  if (path.endsWith(".json")) return "application/json;charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function publicUrl(origin: string, slug: string): string {
  return `${origin}/api/public/s/${slug}/`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
