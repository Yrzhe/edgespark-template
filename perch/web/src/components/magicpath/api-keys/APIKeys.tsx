import { useState, type FormEvent } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";

import { Field, MonoModal, inputClass } from "@/components/MonoModal";
import { useApiKeys } from "@/hooks/useApiKeys";
import type { ApiKey } from "@/lib/types";

export function APIKeys() {
  const { keys, loading, error, createKey, revokeKey } = useApiKeys();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(`agent-${new Date().toISOString().slice(0, 10)}`);
  const [formError, setFormError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const response = await createKey({ name });
      setPlaintext(response.plaintext);
      setCreating(false);
      setName(`agent-${new Date().toISOString().slice(0, 10)}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create API key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex-1"><h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">API Keys</h1><p className="mt-0.5 text-[13px] text-zinc-500">Agent keys for Perch management API. Stored hashed; secret shown once.</p></div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-[13px] font-medium text-white shadow-sm disabled:opacity-50" onClick={() => setCreating(true)} disabled={busy}><Plus className="h-4 w-4" /> New key</button>
      </header>
      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</div>}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full table-fixed border-collapse text-[13px]"><colgroup><col className="w-[26%]" /><col className="w-[28%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[16%]" /></colgroup><thead><tr className="border-b border-zinc-200 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400"><th className="px-5 py-2.5">Name</th><th className="px-3 py-2.5">Key</th><th className="px-3 py-2.5">Created</th><th className="px-3 py-2.5">Last used</th><th className="px-5 py-2.5 text-right">Status</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{keys.map((key) => <KeyRow key={key.id} item={key} onRevoke={() => void revokeKey(key.id)} />)}{!loading && keys.length === 0 && <tr><td className="px-5 py-4 text-[13px] text-zinc-400" colSpan={5}>No API keys yet.</td></tr>}</tbody></table>
        </div>
        <p className="mt-3 text-[12px] text-zinc-400">Never paste a key-creation response into agent logs or third-party LLM context.</p>
      </div>
      {creating && (
        <MonoModal title="New API key" onClose={() => setCreating(false)}>
          <form className="space-y-4 p-5" onSubmit={(event) => void create(event)}>
            {formError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{formError}</div>}
            <Field label="Name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700" onClick={() => setCreating(false)}>Cancel</button>
              <button className="rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white" disabled={busy}>Create key</button>
            </div>
          </form>
        </MonoModal>
      )}
      {plaintext && <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-[1px]"><div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900"><KeyRound className="h-4 w-4" /></span><div><h2 className="text-[14px] font-semibold text-zinc-900">Your new API key</h2><p className="mt-0.5 text-[13px] text-zinc-500">Copy it now. This is the only time it is shown.</p></div></div><div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5"><code className="block truncate font-mono text-[13px] text-zinc-800">{plaintext}</code></div><div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700" onClick={() => setPlaintext(null)}>Close</button><button className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white" onClick={() => void navigator.clipboard.writeText(plaintext)}><Copy className="h-4 w-4" /> Copy</button></div></div></div>}
    </main>
  );
}

function KeyRow({ item, onRevoke }: { item: ApiKey; onRevoke: () => void }) {
  return <tr className="group hover:bg-zinc-50"><td className="px-5 py-3 align-middle font-medium text-zinc-900">{item.name}</td><td className="px-3 py-3 align-middle"><code className="font-mono text-[12px] text-zinc-500">{item.prefix}{"·".repeat(12)}</code></td><td className="px-3 py-3 align-middle text-zinc-500">{formatDate(item.createdAt)}</td><td className="px-3 py-3 align-middle text-zinc-500">{item.lastUsedAt ? relativeTime(item.lastUsedAt) : "Never"}</td><td className="px-5 py-3 align-middle"><div className="flex items-center justify-end gap-3">{item.revokedAt ? <span className="text-[13px] font-medium text-zinc-400">Revoked</span> : <><span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-800"><span className="h-1.5 w-1.5 rounded-full bg-zinc-900" /> Active</span><button className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-rose-600 opacity-0 transition-opacity hover:bg-rose-50 group-hover:opacity-100" onClick={onRevoke}>Revoke</button></>}</div></td></tr>;
}
function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}
function relativeTime(timestamp: number): string {
  const hours = Math.floor(Math.max(1, Date.now() - timestamp) / 3_600_000);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
