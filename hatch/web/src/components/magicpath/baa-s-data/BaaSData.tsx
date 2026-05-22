// Hatch — BaaS Data (refined light, Linear/Neon-grounded). Design artifact; API-wired.
// Collections list (counts + rule badges) -> records table (real <table>) -> row-detail panel.

import { useEffect, useMemo, useState } from "react";

import { manage } from "@/lib/api";

type Rule = "public-append" | "public" | "private";

interface SiteRow {
  id: string;
  name: string;
  slug: string;
}

interface Collection {
  id: string;
  name: string;
  read: "public" | "private";
  write: Rule;
  maxRecords: number | null;
  maxBytes: number;
}

interface Rec {
  id: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  plus: "M12 5v14M5 12h14",
  filter: "M3 5h18l-7 8v5l-4 2v-7L3 5Z",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h6l1-13",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
};

function RuleBadge({ rule }: { rule: Rule | "public" | "private" }) {
  const map: Record<string, string> = {
    "public-append": "text-sky-700 bg-sky-50 ring-sky-200",
    public: "text-amber-700 bg-amber-50 ring-amber-200",
    private: "text-neutral-600 bg-neutral-100 ring-neutral-200",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${map[rule]}`}>{rule}</span>;
}

export const BaaSData = () => {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeName, setActiveName] = useState<string>("");
  const [records, setRecords] = useState<Rec[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const site = sites.find((item) => item.id === siteId) ?? null;
  const filteredCollections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return collections;
    return collections.filter((collection) => collection.name.toLowerCase().includes(needle));
  }, [collections, query]);
  const active = collections.find((collection) => collection.name === activeName) ?? collections[0] ?? null;
  const sel = records.find((record) => record.id === selectedRecordId) ?? records[0] ?? null;

  useEffect(() => {
    void loadSites();
  }, []);

  useEffect(() => {
    if (!siteId) return;
    void loadCollections(siteId);
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !activeName) return;
    void loadRecords(siteId, activeName, null);
  }, [siteId, activeName]);

  async function loadSites() {
    setLoading(true);
    setError(null);
    try {
      const data = await manage<{ sites: SiteRow[] }>("/sites");
      setSites(data.sites);
      setSiteId((current) => current || data.sites[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCollections(nextSiteId: string) {
    setError(null);
    try {
      const data = await manage<{ collections: Collection[] }>(`/sites/${nextSiteId}/collections`);
      setCollections(data.collections);
      setActiveName((current) => (data.collections.some((collection) => collection.name === current) ? current : data.collections[0]?.name || ""));
      if (data.collections.length === 0) {
        setRecords([]);
        setSelectedRecordId("");
        setNextCursor(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collections.");
    }
  }

  async function loadRecords(nextSiteId: string, collection: string, cursor: string | null) {
    setBusy(cursor ? "load-more" : "records");
    setError(null);
    try {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await manage<{ records: Rec[]; nextCursor: string | null }>(`/sites/${nextSiteId}/collections/${collection}/records${suffix}`);
      setRecords((current) => (cursor ? [...current, ...data.records] : data.records));
      setSelectedRecordId((current) => current || data.records[0]?.id || "");
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records.");
    } finally {
      setBusy(null);
    }
  }

  async function createCollection() {
    if (!siteId) return;
    const name = window.prompt("Collection name");
    if (!name) return;
    setBusy("create");
    setError(null);
    try {
      await manage(`/sites/${siteId}/collections`, {
        method: "POST",
        json: { name, read: "private", write: "public-append", maxRecords: null, maxBytes: 10240 },
      });
      await loadCollections(siteId);
      setActiveName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection.");
    } finally {
      setBusy(null);
    }
  }

  async function editRules() {
    if (!siteId || !active) return;
    const read = window.prompt("Read rule: public or private", active.read);
    if (read !== "public" && read !== "private") return;
    const write = window.prompt("Write rule: public-append, public, or private", active.write);
    if (write !== "public-append" && write !== "public" && write !== "private") return;
    setBusy("rules");
    setError(null);
    try {
      await manage(`/sites/${siteId}/collections/${active.name}`, { method: "PATCH", json: { read, write } });
      await loadCollections(siteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rules.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteCollection() {
    if (!siteId || !active || !window.confirm(`Delete collection ${active.name}?`)) return;
    setBusy("delete-collection");
    setError(null);
    try {
      await manage(`/sites/${siteId}/collections/${active.name}`, { method: "DELETE" });
      await loadCollections(siteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete collection.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRecord(record: Rec) {
    if (!siteId || !active || !window.confirm(`Delete record ${record.id}?`)) return;
    setBusy(`delete-record:${record.id}`);
    setError(null);
    try {
      await manage(`/sites/${siteId}/collections/${active.name}/records/${record.id}`, { method: "DELETE" });
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setSelectedRecordId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete record.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex items-center justify-between px-4 py-3.5">
          <h2 className="text-[13px] font-semibold text-neutral-900">Collections</h2>
          <button className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50" title="New collection" onClick={() => void createCollection()} disabled={busy === "create"}>
            <Icon d={ICONS.plus} className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 pb-2">
          <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="mb-2 h-8 w-full rounded-lg border border-neutral-200 bg-white px-2 text-[12px] text-neutral-700 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20">
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Icon d={ICONS.search} className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-8 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-[12px] placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
          </div>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          {filteredCollections.map((c) => (
            <button key={c.name} className={`mb-0.5 flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors ${c.name === active?.name ? "bg-amber-50" : "hover:bg-neutral-50"}`} onClick={() => setActiveName(c.name)}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] text-neutral-900">{c.name}</span>
                <span className="text-[12px] tabular-nums text-neutral-400">{c.maxRecords ?? "∞"}</span>
              </div>
              <div className="flex gap-1">
                <RuleBadge rule={c.read === "public" ? "public" : "private"} />
                <RuleBadge rule={c.write} />
              </div>
            </button>
          ))}
          {!loading && filteredCollections.length === 0 && <div className="px-3 py-2 text-[12px] text-neutral-400">No collections.</div>}
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col bg-neutral-50">
        <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h1 className="font-mono text-[15px] font-semibold tracking-tight text-neutral-900">{active?.name ?? "collections"}</h1>
            <span className="text-[13px] text-neutral-400">{records.length} records</span>
          </div>
          {active && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-400">read</span>
              <RuleBadge rule={active.read} />
              <span className="ml-1 text-[11px] text-neutral-400">write</span>
              <RuleBadge rule={active.write} />
              <button className="ml-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-50" onClick={() => void editRules()} disabled={busy === "rules"}>
                Edit rules
              </button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {site && <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-[12px] text-neutral-500">/{site.slug}</span>}
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50">
              <Icon d={ICONS.filter} className="h-3.5 w-3.5" /> Filter
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-[12px] font-medium text-white hover:bg-amber-600" onClick={() => void deleteCollection()} disabled={!active || busy === "delete-collection"}>
              <Icon d={ICONS.trash} className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </header>

        {error && <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-[13px] text-rose-700">{error}</div>}

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[24%]" />
                <col className="w-[26%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="px-5 py-2.5">id</th>
                  <th className="px-3 py-2.5">name</th>
                  <th className="px-3 py-2.5">email</th>
                  <th className="px-3 py-2.5">message</th>
                  <th className="px-3 py-2.5">created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {records.map((r) => {
                  const data = recordObject(r.data);
                  return (
                    <tr key={r.id} className={`hover:bg-neutral-50 ${r.id === sel?.id ? "bg-amber-50/50" : ""}`} onClick={() => setSelectedRecordId(r.id)}>
                      <td className="truncate px-5 py-3 align-middle font-mono text-[12px] text-neutral-400">{shortId(r.id)}</td>
                      <td className="truncate px-3 py-3 align-middle text-neutral-900">{stringField(data, "name")}</td>
                      <td className="truncate px-3 py-3 align-middle font-mono text-[12px] text-neutral-500">{stringField(data, "email")}</td>
                      <td className="truncate px-3 py-3 align-middle text-neutral-500">{stringField(data, "message") || JSON.stringify(data)}</td>
                      <td className="px-3 py-3 align-middle text-neutral-400">{relativeTime(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-neutral-100 bg-white px-5 py-3 text-[12px] text-neutral-400">
              <span>Showing {records.length} records</span>
              <button className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-neutral-600 hover:bg-neutral-50" disabled={!nextCursor || busy === "load-more" || !siteId || !active} onClick={() => active && void loadRecords(siteId, active.name, nextCursor)}>
                Load more
              </button>
            </div>
          </div>

          <aside className="hidden w-80 shrink-0 flex-col border-l border-neutral-200 bg-white xl:flex">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="text-[13px] font-semibold text-neutral-900">Record</h3>
              {sel && (
                <button className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] text-rose-600 hover:bg-rose-50" onClick={() => void deleteRecord(sel)} disabled={busy === `delete-record:${sel.id}`}>
                  <Icon d={ICONS.trash} className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto px-4 py-4">
              {sel ? (
                <>
                  <Field label="id" value={sel.id} mono />
                  {Object.entries(recordObject(sel.data)).map(([key, value]) => (
                    <Field key={key} label={key} value={formatValue(value)} mono={typeof value !== "string"} />
                  ))}
                  <Field label="created_at" value={new Date(sel.createdAt).toLocaleString()} mono />
                  <Field label="updated_at" value={new Date(sel.updatedAt).toLocaleString()} mono />
                  <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">Public-append records are immutable. The owner can delete for moderation; visitors can’t read or edit.</p>
                </>
              ) : (
                <p className="text-[13px] text-neutral-400">Select a record.</p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
};

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <div className={`rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-neutral-800 ${mono ? "font-mono text-[12px]" : "text-[13px]"}`}>{value}</div>
    </div>
  );
}

function recordObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id;
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
