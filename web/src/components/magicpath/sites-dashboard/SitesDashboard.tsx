// EdgeSpark Host — Sites (refined light, Linear/Render-grounded). Design artifact; API-wired.
// Real <table> for column alignment. Neutral base + amber (EdgeSpark) accent + semantic status.

import { useEffect, useMemo, useRef, useState } from "react";

import { manage } from "@/lib/api";

type Status = "ready" | "building" | "failed";

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
  dots: "M12 6h.01M12 12h.01M12 18h.01",
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
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteRow | null>(null);
  const [deploySite, setDeploySite] = useState<SiteRow | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = window.location.origin;

  const filteredSites = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter((site) => `${site.name} ${site.slug}`.toLowerCase().includes(needle));
  }, [query, sites]);

  useEffect(() => {
    void loadSites();
  }, []);

  async function loadSites() {
    setLoading(true);
    setError(null);
    try {
      const data = await manage<{ sites: SiteRow[] }>("/sites");
      setSites(data.sites);
      setSelectedSite((current) => current ?? data.sites[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }

  async function loadVersions(site: SiteRow) {
    setSelectedSite(site);
    setVersions([]);
    setError(null);
    try {
      const data = await manage<{ versions: VersionRow[] }>(`/sites/${site.id}/versions`);
      setVersions(data.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions.");
    }
  }

  async function createSite() {
    const name = window.prompt("Site name");
    if (!name) return;
    const slug = window.prompt("Slug", slugify(name)) ?? undefined;
    setBusy("create");
    setError(null);
    try {
      await manage("/sites", { method: "POST", json: { name, slug } });
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
      await manage(`/sites/${site.id}/rollback`, { method: "POST", json: { versionId } });
      await loadSites();
      await loadVersions(site);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed.");
    } finally {
      setBusy(null);
    }
  }

  function chooseDeploy(site: SiteRow) {
    setDeploySite(site);
    fileInputRef.current?.click();
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
      await loadSites();
      await loadVersions(site);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setBusy(null);
    }
  }

  function onFilesPicked(files: FileList | null) {
    const site = deploySite;
    if (!site || !files) return;
    void deployFiles(site, Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">Sites</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">{loading ? "Loading static sites…" : `${sites.length} static sites on the edge · deploy from a folder`}</p>
        </div>
        <div className="relative hidden sm:block">
          <Icon d={ICONS.search} className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sites" className="h-8 w-56 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-amber-600" onClick={() => void createSite()} disabled={busy === "create"}>
          <Icon d={ICONS.plus} className="h-4 w-4" /> New site
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => onFilesPicked(event.currentTarget.files)} {...{ webkitdirectory: "" }} />

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Sites", value: String(sites.length), sub: loading ? "loading" : "active" },
            { label: "Deploys · 7d", value: "—", sub: "versions available per site" },
            { label: "Storage", value: formatBytes(sites.reduce((sum) => sum, 0)), sub: "content-addressed" },
            { label: "API keys", value: "—", sub: "managed on API Keys" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{s.label}</p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-neutral-900">{s.value}</p>
              <p className="mt-0.5 text-[12px] text-neutral-500">{s.sub}</p>
            </div>
          ))}
        </div>

        <div
          className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const site = selectedSite ?? sites[0];
            if (site) void deployFiles(site, Array.from(event.dataTransfer.files));
          }}
        >
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[24%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
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
              {filteredSites.map((s) => (
                <tr key={s.slug} className="group hover:bg-neutral-50">
                  <td className="px-5 py-3 align-middle">
                    <div className="truncate font-medium text-neutral-900">{s.name}</div>
                    <div className="truncate font-mono text-[12px] text-neutral-400">/{s.slug}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <code className="truncate rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[12px] text-neutral-600">…/s/{s.slug}/</code>
                      <button className="shrink-0 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 group-hover:opacity-100" title="Copy URL" onClick={() => void navigator.clipboard.writeText(publicUrl(origin, s.slug))}>
                        <Icon d={ICONS.copy} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <StatusChip s={s.currentVersionId ? "ready" : "building"} />
                  </td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums text-neutral-500">—</td>
                  <td className="px-3 py-3 align-middle text-neutral-500">{relativeTime(s.updatedAt)}</td>
                  <td className="px-5 py-3 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50" title="Open" onClick={() => window.open(publicUrl(origin, s.slug), "_blank", "noopener,noreferrer")}>
                        <Icon d={ICONS.external} className="h-3.5 w-3.5" /> Open
                      </button>
                      <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50" title="Deploy" onClick={() => chooseDeploy(s)} disabled={busy === `deploy:${s.id}`}>
                        <Icon d={ICONS.upload} className="h-3.5 w-3.5" /> Deploy
                      </button>
                      <button className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title="Versions" onClick={() => void loadVersions(s)}>
                        <Icon d={ICONS.dots} className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-[12px] text-neutral-400">Drag a folder onto the table to deploy to the selected site · instant rollback</p>

        {selectedSite && (
          <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-neutral-900">{selectedSite.name} versions</h2>
                <p className="font-mono text-[11px] text-neutral-400">{selectedSite.id}</p>
              </div>
              <button className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12px] text-neutral-600 hover:bg-neutral-50" onClick={() => void loadVersions(selectedSite)}>
                Refresh
              </button>
            </div>
            <div className="divide-y divide-neutral-100">
              {versions.map((version) => (
                <div key={version.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <code className="w-40 truncate font-mono text-[12px] text-neutral-500">{version.id}</code>
                  <StatusChip s={version.status} />
                  <span className="text-neutral-500">{version.fileCount} files</span>
                  <span className="text-neutral-400">{formatBytes(version.totalBytes)}</span>
                  <span className="flex-1 truncate text-neutral-400">{version.note ?? relativeTime(version.createdAt)}</span>
                  {version.status === "ready" && version.id !== selectedSite.currentVersionId && (
                    <button className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50" disabled={busy === `rollback:${version.id}`} onClick={() => void rollback(selectedSite, version.id)}>
                      Rollback
                    </button>
                  )}
                </div>
              ))}
              {versions.length === 0 && <div className="px-5 py-4 text-[13px] text-neutral-400">No versions loaded.</div>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

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
