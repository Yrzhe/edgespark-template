import { useState } from 'react';
import { Key, Plus, Copy, Check, Trash2, FileText, ExternalLink, Bot, Sparkles, AlertCircle } from 'lucide-react';
type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdLabel: string;
  lastUsedLabel: string | null;
  revoked: boolean;
};
const SAMPLE_KEYS: ApiKey[] = import.meta.env.DEV ? [{
  id: 'k1',
  name: 'Personal Claude Code',
  prefix: 'mb_live_aZ8k…',
  createdLabel: '3d ago',
  lastUsedLabel: '12m ago',
  revoked: false
}, {
  id: 'k2',
  name: 'Magicpath helper',
  prefix: 'mb_live_qP7m…',
  createdLabel: '1d ago',
  lastUsedLabel: '2h ago',
  revoked: false
}, {
  id: 'k3',
  name: 'Old throwaway',
  prefix: 'mb_live_xT2c…',
  createdLabel: '2w ago',
  lastUsedLabel: '10d ago',
  revoked: true
}] : [];
const EXAMPLE_PROMPT = `You're managing my Mockingbird site at https://yrzhe.mb.app.
Use the API key in MB_KEY (Bearer). The agent docs are at:
  https://yrzhe.mb.app/api/public/llms.txt
  https://yrzhe.mb.app/api/public/agent.md

Tasks:
1. Read the existing themes and bio_blurbs.
2. Add a new bio_blurb in a casual voice for late-night returning visitors.
3. Create a draft theme called "Night letters" that uses the letter layout,
   matches hour_band==late_night AND is_returning==true, and uses that new
   blurb in its copy prompt.
4. Set its priority to 80, status=draft. Don't publish — I'll review.

Privacy rules (from llms.txt): only coarse visitor signals (country, lang,
device, referrer root, hour band, returning) ever appear in prompts.
Never reference precise city, ASN, IP, or full referrer URL.`;
type Props = {
  keys?: ApiKey[];
  loading?: boolean;
  error?: Error | null;
  onCreateKey?: (name: string) => Promise<string | null>;
  onRevokeKey?: (id: string) => void;
};
export const ConnectAIAdmin = ({ keys = [], loading = false, error = null, onCreateKey, onRevokeKey }: Props) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('Personal agent');
  const copy = (id: string, _text: string) => {
    setCopiedTarget(id);
    setTimeout(() => setCopiedTarget(null), 1400);
  };
  return <div className="w-full max-w-[1100px] mx-auto px-4 md:px-8 py-6 font-sans text-foreground space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Connect AI</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Hand your agent an API key + the docs URL. It can CRUD themes, content, and rules.
            Layouts and palettes remain code.
          </p>
        </div>
      </div>

      {/* docs panel */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <FileText className="w-4 h-4 self-center text-muted-foreground" />
            <span className="text-[14px] font-semibold">Agent docs</span>
            <span className="text-[11px] text-muted-foreground">— hand these URLs to your agent</span>
          </div>
        </div>
        <ul className="divide-y divide-border">
          <DocsRow label="LLM-friendly summary" url="/api/public/llms.txt" copyId="llms" copied={copiedTarget === 'llms'} onCopy={() => copy('llms', '/api/public/llms.txt')} />
          
          <DocsRow label="Full agent guide (markdown)" url="/api/public/agent.md" copyId="agent" copied={copiedTarget === 'agent'} onCopy={() => copy('agent', '/api/public/agent.md')} />
          
        </ul>
      </div>

      {/* keys panel */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <Key className="w-4 h-4 self-center text-muted-foreground" />
            <span className="text-[14px] font-semibold">API keys</span>
            <span className="text-[11px] text-muted-foreground">
              — Bearer token; mutating routes require it
            </span>
          </div>
          <button type="button" onClick={async () => {
          setCreateOpen(true);
          const plaintext = onCreateKey ? await onCreateKey(keyName) : import.meta.env.DEV ? `mb_live_${Math.random().toString(36).slice(2, 30)}` : null;
          if (plaintext) setRevealedKey(plaintext);
        }} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded font-medium hover:opacity-90 transition-opacity">
            
            <Plus className="w-4 h-4" />
            New key
          </button>
        </div>
        {createOpen && <div className="px-4 py-3 border-b border-border bg-[var(--warning)]/5">
            <label className="block text-[11px] font-bold text-muted-foreground mb-1">Key name</label>
            <input value={keyName} onChange={e => setKeyName(e.target.value)} className="mb-3 w-full max-w-sm text-sm px-2.5 py-1.5 rounded border border-border bg-card" />
            {revealedKey && <>
            <div className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--warning)] inline-flex items-center gap-1 mb-1.5">
              <AlertCircle className="w-3 h-3" />
              Plaintext shown ONCE — copy now, you cannot see it again
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[12px] font-mono bg-background border border-border rounded px-2.5 py-1.5 truncate">
                {revealedKey}
              </code>
              <button onClick={() => copy('reveal', revealedKey)} className="text-[12px] px-2.5 py-1.5 rounded border border-border bg-card hover:bg-muted inline-flex items-center gap-1.5">
              
                {copiedTarget === 'reveal' ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedTarget === 'reveal' ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => {
            setCreateOpen(false);
            setRevealedKey(null);
          }} className="text-[12px] px-2.5 py-1.5 rounded border border-border bg-card hover:bg-muted">
              
                Done
              </button>
            </div>
            </>}
          </div>}
        {loading && <div className="px-4 py-8 text-sm text-muted-foreground">Loading keys...</div>}
        {error && <div className="px-4 py-8 text-sm text-destructive">{error.message}</div>}
        {!loading && !error && <ul className="divide-y divide-border">
          {(keys.length ? keys : SAMPLE_KEYS).map(k => <li key={k.id} className="px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded grid place-items-center shrink-0 ${k.revoked ? 'bg-muted' : 'bg-primary/10'}`}>
              
                <Key className={`w-4 h-4 ${k.revoked ? 'text-muted-foreground' : 'text-primary'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold">{k.name}</span>
                  {k.revoked && <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                      revoked
                    </span>}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {k.prefix} · created {k.createdLabel}
                  {k.lastUsedLabel && ` · last used ${k.lastUsedLabel}`}
                </div>
              </div>
              {!k.revoked && <button onClick={() => onRevokeKey?.(k.id)} className="text-[12px] px-2.5 py-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 inline-flex items-center gap-1.5" title="Revoke key">
              
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Revoke</span>
                </button>}
            </li>)}
        </ul>}
        {!loading && !error && keys.length === 0 && SAMPLE_KEYS.length === 0 && <div className="px-4 py-8 text-sm text-muted-foreground">No API keys yet.</div>}
        <p className="px-4 py-2.5 border-t border-border text-[11px] text-muted-foreground bg-muted/30">
          v1 keys are unscoped (Perch-compatible). Scoped keys (`content:*`, `themes:*`, `publish`)
          arrive in v1.1.
        </p>
      </div>

      {/* example agent prompt */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <Bot className="w-4 h-4 self-center text-muted-foreground" />
            <span className="text-[14px] font-semibold">Example: hand-off prompt</span>
            <span className="text-[11px] text-muted-foreground">
              — paste this into Claude / GPT / your agent
            </span>
          </div>
          <button onClick={() => copy('prompt', EXAMPLE_PROMPT)} className="text-[12px] px-2.5 py-1.5 rounded border border-border bg-card hover:bg-muted inline-flex items-center gap-1.5">
            
            {copiedTarget === 'prompt' ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedTarget === 'prompt' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="px-4 py-3 text-[12px] font-mono text-foreground bg-background whitespace-pre-wrap leading-relaxed overflow-x-auto">
{EXAMPLE_PROMPT}
        </pre>
      </div>

      {/* capability summary */}
      <div className="bg-card border border-border rounded p-4">
        <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-3 inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Agent can do
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <CapItem>Read &amp; CRUD themes, match rules, content (bio/projects/socials)</CapItem>
          <CapItem>Presign + confirm image uploads (R2)</CapItem>
          <CapItem>Read aggregate analytics (no precise visitor data)</CapItem>
          <CapItem>Trigger preview-as-visitor with fake signals</CapItem>
        </ul>
        <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mt-4 mb-2">
          Agent cannot
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
          <li>· Create new layouts (those live in code)</li>
          <li>· Read raw visitor IP, city, ASN, or full referrer URL</li>
          <li>· Bypass schema validation on LLM output</li>
          <li>· Mutate without a Bearer key</li>
        </ul>
      </div>
    </div>;
};
const DocsRow = ({
  label,
  url,
  copyId,
  copied,
  onCopy
}: {
  label: string;
  url: string;
  copyId: string;
  copied: boolean;
  onCopy: () => void;
}) => <li className="px-4 py-3 flex items-center gap-3">
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-semibold">{label}</div>
      <code className="text-[11.5px] font-mono text-muted-foreground truncate block mt-0.5">
        {url}
      </code>
    </div>
    <a href={url} className="text-[12px] text-primary hover:underline inline-flex items-center gap-1">
    
      <ExternalLink className="w-3 h-3" />
      <span className="hidden sm:inline">Open</span>
    </a>
    <button onClick={onCopy} className="text-[12px] px-2.5 py-1.5 rounded border border-border bg-card hover:bg-muted inline-flex items-center gap-1.5">
    
      {copied ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy URL'}
    </button>
  </li>;
const CapItem = ({
  children
}: {
  children: React.ReactNode;
}) => <li className="inline-flex items-baseline gap-1.5">
    <Check className="w-3 h-3 text-[var(--success)] mt-0.5 shrink-0" />
    <span>{children}</span>
  </li>;
