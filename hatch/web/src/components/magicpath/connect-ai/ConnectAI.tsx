// Hatch — Connect AI (refined light, Resend/OpenAI-grounded). Design artifact; API-wired.
// Headline AI-first screen: API key + copy-paste agent prompt ("Copy for AI") + raw API ref.

import { useEffect, useMemo, useState } from "react";

import { manage, type ApiKeyRow } from "@/lib/api";

const AGENTS = ["Claude Code", "Codex", "Cursor", "Generic"] as const;

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  copy: "M9 9h10v10H9zM5 15H4V4h11v1",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 12h.01",
  check: "M20 6 9 17l-5-5",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z M19 17H6",
  key: "M15 7a4 4 0 1 0-3.9 5l-1.6 1.6v2h-2v2H5l-1 1H2v-3l6.1-6.1A4 4 0 0 0 15 7Zm1 0h.01",
  plus: "M12 5v14M5 12h14",
  warn: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
};

function StepDot({ n, done = false }: { n: number; done?: boolean }) {
  return done ? (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
      <Icon d={ICONS.check} className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 bg-white text-[12px] font-semibold text-neutral-500">{n}</span>
  );
}

function buildPrompt(agent: (typeof AGENTS)[number], origin: string, key: string) {
  const reference = `${origin}/api/public/llms.txt`;
  const core = `You can build & host static sites on Hatch via its HTTP API.

Base URL:  ${origin}
Auth:      Authorization: Bearer ${key}   (all /api/public/manage/* calls)

Deploy a folder as a site (one command):
  node scripts/deploy-site.ts ./dist my-site --key ${key}

…or drive the API directly:
  1. POST /api/public/manage/sites             { "name": "My Site", "slug": "my-site" }
  2. POST /api/public/manage/sites/:id/deploys { "manifest":[{"path":"/index.html","hash":"sha256...","size":123,"contentType":"text/html"}] }
     → PUT each returned presigned URL with the file bytes
  3. POST /api/public/manage/sites/:id/deploys/:deployId/finalize

Edit one file:  PUT /api/public/manage/sites/:id/files/<path>   (raw body)
Roll back:      POST /api/public/manage/sites/:id/rollback       { "versionId": "..." }

Give the site a backend (BaaS) — the site's client JS calls:
  POST /api/public/baas/:siteId/collections/<name>/records   (per collection rules)

Full machine-readable reference: ${reference}`;

  if (agent === "Codex") return `Use this Hatch host for static site deploys and BaaS work:\n\n${core}`;
  if (agent === "Cursor") return `Project hosting context for the coding agent:\n\n${core}`;
  if (agent === "Generic") return core;
  return `Claude Code: use this Hatch host when asked to deploy or manage static sites.\n\n${core}`;
}

export const ConnectAI = () => {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<(typeof AGENTS)[number]>("Claude Code");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const activeKey = keys.find((key) => !key.revokedAt) ?? keys[0] ?? null;
  const promptKey = plaintext ?? "${HATCH_API_KEY}";
  const prompt = useMemo(() => buildPrompt(activeAgent, origin, promptKey), [activeAgent, origin, promptKey]);

  useEffect(() => {
    let cancelled = false;
    manage<{ keys: ApiKeyRow[] }>("/keys")
      .then((data) => {
        if (!cancelled) setKeys(data.keys);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load API keys.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createKey() {
    setError(null);
    const data = await manage<{ key: ApiKeyRow; plaintext: string }>("/keys", {
      method: "POST",
      json: { name: `agent-${new Date().toISOString().slice(0, 10)}` },
    });
    setKeys((current) => [data.key, ...current]);
    setPlaintext(data.plaintext);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">Connect your AI</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">Hand this to Claude Code, Codex, or Cursor — your agent can deploy &amp; manage sites for you.</p>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</div>}
          <ol className="relative space-y-7 before:absolute before:left-3 before:top-2 before:h-[calc(100%-2rem)] before:w-px before:bg-neutral-200">
            <li className="relative pl-10">
              <span className="absolute left-0 top-0">
                <StepDot n={1} done={!!activeKey || !!plaintext} />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-semibold text-neutral-900">Your API key</h2>
                <button className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-500 px-2.5 text-[12px] font-medium text-white hover:bg-amber-600" onClick={() => void createKey()}>
                  <Icon d={ICONS.plus} className="h-3.5 w-3.5" /> New key
                </button>
              </div>
              <p className="mt-0.5 text-[13px] text-neutral-500">Authenticates your agent. Shown once on creation — store it safely.</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <code className="flex-1 truncate font-mono text-[13px] text-neutral-700">
                  {loading ? "loading…" : plaintext ?? (activeKey ? `${activeKey.prefix}··········································` : "${HATCH_API_KEY}")}
                </code>
                {plaintext && (
                  <button className="text-neutral-400 hover:text-neutral-700" title="Copy" onClick={() => void copy(plaintext)}>
                    <Icon d={ICONS.copy} className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>

            <li className="relative pl-10">
              <span className="absolute left-0 top-0">
                <StepDot n={2} />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-semibold text-neutral-900">Paste this to your agent</h2>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">recommended</span>
              </div>
              <p className="mt-0.5 text-[13px] text-neutral-500">It teaches the agent how to deploy, edit, roll back, and use the BaaS.</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="flex items-center gap-1 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5">
                  {AGENTS.map((agent) => (
                    <button
                      key={agent}
                      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                        agent === activeAgent ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200" : "text-neutral-500 hover:text-neutral-800"
                      }`}
                      onClick={() => setActiveAgent(agent)}
                    >
                      {agent}
                    </button>
                  ))}
                  <button className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-amber-600" onClick={() => void copy(prompt)}>
                    <Icon d={copied ? ICONS.check : ICONS.copy} className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy for AI"}
                  </button>
                </div>
                <pre className="overflow-x-auto bg-neutral-950 px-4 py-3.5 font-mono text-[12px] leading-relaxed text-neutral-200">
                  <code>{prompt}</code>
                </pre>
              </div>
            </li>

            <li className="relative pl-10">
              <span className="absolute left-0 top-0">
                <StepDot n={3} />
              </span>
              <h2 className="text-[14px] font-semibold text-neutral-900">Reference for the agent</h2>
              <p className="mt-0.5 text-[13px] text-neutral-500">Machine-readable docs your agent can fetch directly.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <a href={`${origin}/api/public/llms.txt`} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 hover:border-amber-300 hover:bg-amber-50/40">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                    <Icon d={ICONS.book} className="h-4 w-4" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-[13px] font-medium text-neutral-900">llms.txt</p>
                    <p className="font-mono text-[11px] text-neutral-400">/api/public/llms.txt</p>
                  </div>
                </a>
                <a href="https://github.com/" className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 hover:border-amber-300 hover:bg-amber-50/40">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                    <Icon d={ICONS.copy} className="h-4 w-4" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-[13px] font-medium text-neutral-900">deploy-site.ts</p>
                    <p className="font-mono text-[11px] text-neutral-400">scripts/deploy-site.ts</p>
                  </div>
                </a>
              </div>
            </li>
          </ol>
        </div>
      </div>

      {plaintext && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-[1px]">
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
              <button className="text-neutral-400 hover:text-neutral-700" title="Copy" onClick={() => void copy(plaintext)}>
                <Icon d={ICONS.copy} className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
              <Icon d={ICONS.warn} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Store it in a secret manager. Don’t commit it or paste it into agent / LLM context.</span>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3.5 text-[13px] font-medium text-white hover:bg-amber-600" onClick={() => void copy(plaintext)}>
                <Icon d={ICONS.copy} className="h-4 w-4" /> Copy
              </button>
              <button className="ml-2 inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50" onClick={() => setPlaintext(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
