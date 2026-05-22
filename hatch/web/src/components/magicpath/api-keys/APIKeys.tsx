// Hatch — API Keys (refined light, Linear/OpenAI-grounded). Design artifact; API-wired.
// Real <table> for alignment. Neutral base + amber accent. Reveal-once modal (Resend pattern).

import { useEffect, useState } from "react";

import { manage, type ApiKeyRow } from "@/lib/api";

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h10v10H9zM5 15H4V4h11v1",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 12h.01",
  key: "M15 7a4 4 0 1 0-3.9 5l-1.6 1.6v2h-2v2H5l-1 1H2v-3l6.1-6.1A4 4 0 0 0 15 7Zm1 0h.01",
  warn: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
};

export const APIKeys = () => {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadKeys();
  }, []);

  async function loadKeys() {
    setLoading(true);
    setError(null);
    try {
      const data = await manage<{ keys: ApiKeyRow[] }>("/keys");
      setKeys(data.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    const name = window.prompt("Key name", `agent-${new Date().toISOString().slice(0, 10)}`);
    if (!name) return;
    setBusy("create");
    setError(null);
    try {
      const data = await manage<{ key: ApiKeyRow; plaintext: string }>("/keys", { method: "POST", json: { name } });
      setKeys((current) => [data.key, ...current]);
      setPlaintext(data.plaintext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(key: ApiKeyRow) {
    if (!window.confirm(`Revoke ${key.name}?`)) return;
    setBusy(`revoke:${key.id}`);
    setError(null);
    try {
      await manage(`/keys/${key.id}`, { method: "DELETE" });
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key.");
    } finally {
      setBusy(null);
    }
  }

  async function copyAndClose() {
    if (!plaintext) return;
    await navigator.clipboard.writeText(plaintext);
    setPlaintext(null);
  }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">API Keys</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">Agent keys for the management API · stored hashed, secret shown once</p>
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-amber-600" onClick={() => void createKey()} disabled={busy === "create"}>
          <Icon d={ICONS.plus} className="h-4 w-4" /> New key
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <th className="px-5 py-2.5">Name</th>
                <th className="px-3 py-2.5">Key</th>
                <th className="px-3 py-2.5">Created</th>
                <th className="px-3 py-2.5">Last used</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {keys.map((k) => (
                <tr key={k.prefix} className="group hover:bg-neutral-50">
                  <td className="px-5 py-3 align-middle font-medium text-neutral-900">{k.name}</td>
                  <td className="px-3 py-3 align-middle">
                    <code className="font-mono text-[12px] text-neutral-500">
                      {k.prefix}
                      {"·".repeat(12)}
                    </code>
                  </td>
                  <td className="px-3 py-3 align-middle text-neutral-500">{formatDate(k.createdAt)}</td>
                  <td className="px-3 py-3 align-middle text-neutral-500">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}</td>
                  <td className="px-5 py-3 align-middle">
                    <div className="flex items-center justify-end gap-3">
                      {k.revokedAt ? (
                        <span className="text-[13px] font-medium text-neutral-400">Revoked</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                      {!k.revokedAt && (
                        <button className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] font-medium text-rose-600 opacity-0 transition-opacity hover:bg-rose-50 group-hover:opacity-100" onClick={() => void revokeKey(k)} disabled={busy === `revoke:${k.id}`}>
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && keys.length === 0 && (
                <tr>
                  <td className="px-5 py-4 text-[13px] text-neutral-400" colSpan={5}>
                    No API keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-neutral-400">Never paste a key-creation response into agent logs or third-party LLM context.</p>
      </div>

      {plaintext && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Icon d={ICONS.key} className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <h2 className="text-[14px] font-semibold text-neutral-900">Your new API key</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  Copy it now — for security this is the <span className="font-medium text-neutral-900">only time</span> it’s shown.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <code className="flex-1 truncate font-mono text-[13px] text-neutral-800">{plaintext}</code>
              <button className="text-neutral-400 hover:text-neutral-700" title="Reveal">
                <Icon d={ICONS.eye} className="h-4 w-4" />
              </button>
              <button className="text-neutral-400 hover:text-neutral-700" title="Copy" onClick={() => void navigator.clipboard.writeText(plaintext)}>
                <Icon d={ICONS.copy} className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
              <Icon d={ICONS.warn} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Store it in a secret manager. Don’t commit it or paste it into agent / LLM context.</span>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3.5 text-[13px] font-medium text-white hover:bg-amber-600" onClick={() => void copyAndClose()}>
                <Icon d={ICONS.copy} className="h-4 w-4" /> Copy &amp; close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
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
