import { useMemo, useState } from "react";
import { BookOpen, Check, Copy, KeyRound, Plus } from "lucide-react";

import { useApiKeys } from "@/hooks/useApiKeys";

const AGENTS = ["Claude Code", "Codex", "Cursor", "Generic"] as const;

export function ConnectAI() {
  const { keys, createKey, loading, error } = useApiKeys();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [agent, setAgent] = useState<(typeof AGENTS)[number]>("Claude Code");
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const activeKey = keys.find((key) => !key.revokedAt) ?? null;
  const promptKey = plaintext ?? "${PERCH_API_KEY}";
  const prompt = useMemo(() => buildPrompt(agent, origin, promptKey), [agent, origin, promptKey]);

  async function handleCreateKey() {
    const response = await createKey({ name: `agent-${new Date().toISOString().slice(0, 10)}` });
    setPlaintext(response.plaintext);
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Connect your AI</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">Give Claude Code, Codex, or Cursor access to manage Perch pages and analytics.</p>
      </header>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</div>}
          <ol className="relative space-y-7 before:absolute before:left-3 before:top-2 before:h-[calc(100%-2rem)] before:w-px before:bg-zinc-200">
            <li className="relative pl-10">
              <Step done={!!activeKey || !!plaintext} n={1} />
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold text-zinc-900">Your API key</h2><button className="inline-flex h-7 items-center gap-1.5 rounded-md bg-zinc-900 px-2.5 text-[12px] font-medium text-white" onClick={() => void handleCreateKey()}><Plus className="h-3.5 w-3.5" /> New key</button></div>
              <p className="mt-0.5 text-[13px] text-zinc-500">Shown once on creation. Store it outside chat logs.</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"><code className="flex-1 truncate font-mono text-[13px] text-zinc-700">{loading ? "loading..." : plaintext ?? (activeKey ? `${activeKey.prefix}····················` : "${PERCH_API_KEY}")}</code>{plaintext && <button className="text-zinc-400 hover:text-zinc-900" onClick={() => void copy(plaintext)}><Copy className="h-4 w-4" /></button>}</div>
            </li>
            <li className="relative pl-10">
              <Step n={2} />
              <h2 className="text-[14px] font-semibold text-zinc-900">Paste this to your agent</h2>
              <p className="mt-0.5 text-[13px] text-zinc-500">It teaches the agent page, link, asset, key, and analytics endpoints.</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">{AGENTS.map((name) => <button key={name} className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${name === agent ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`} onClick={() => setAgent(name)}>{name}</button>)}<button className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-2.5 py-1 text-[12px] font-medium text-white" onClick={() => void copy(prompt)}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy for AI"}</button></div>
                <pre className="overflow-x-auto bg-zinc-950 px-4 py-3.5 font-mono text-[12px] leading-relaxed text-zinc-200"><code>{prompt}</code></pre>
              </div>
            </li>
            <li className="relative pl-10">
              <Step n={3} />
              <h2 className="text-[14px] font-semibold text-zinc-900">Reference for the agent</h2>
              <a href={`${origin}/api/public/llms.txt`} className="mt-3 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 hover:border-zinc-900"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"><BookOpen className="h-4 w-4" /></span><div><p className="text-[13px] font-medium text-zinc-900">Perch llms.txt</p><p className="font-mono text-[11px] text-zinc-400">/api/public/llms.txt</p></div></a>
            </li>
          </ol>
        </div>
      </div>
      {plaintext && <RevealModal plaintext={plaintext} onCopy={() => void copy(plaintext)} onClose={() => setPlaintext(null)} />}
    </main>
  );
}

function Step({ n, done = false }: { n: number; done?: boolean }) {
  return <span className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full ${done ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-[12px] font-semibold text-zinc-500"}`}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>;
}
function RevealModal({ plaintext, onCopy, onClose }: { plaintext: string; onCopy: () => void; onClose: () => void }) {
  return <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-[1px]"><div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900"><KeyRound className="h-4 w-4" /></span><div><h2 className="text-[14px] font-semibold text-zinc-900">Your new API key</h2><p className="mt-0.5 text-[13px] text-zinc-500">Copy it now. This is the only time it is shown.</p></div></div><div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5"><code className="block truncate font-mono text-[13px] text-zinc-800">{plaintext}</code></div><div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700" onClick={onClose}>Close</button><button className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white" onClick={onCopy}><Copy className="h-4 w-4" /> Copy</button></div></div></div>;
}
function buildPrompt(agent: (typeof AGENTS)[number], origin: string, key: string) {
  const core = `Base URL: ${origin}
Auth: Authorization: Bearer ${key}
Docs: ${origin}/api/public/llms.txt

Manage Perch:
- GET/POST /api/public/manage/pages
- PATCH/DELETE /api/public/manage/pages/:pageId
- GET/POST /api/public/manage/pages/:pageId/links
- PATCH/DELETE /api/public/manage/pages/:pageId/links/:linkId
- POST /api/public/manage/pages/:pageId/links/reorder
- POST /api/public/manage/pages/:pageId/assets/presign then confirm
- GET /api/public/manage/pages/:pageId/analytics`;
  return `${agent}: use this Perch deployment to manage link-in-bio pages and analytics.\n\n${core}`;
}
