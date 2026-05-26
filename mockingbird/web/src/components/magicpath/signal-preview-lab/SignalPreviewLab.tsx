import { useState } from 'react';
import { AlertCircle, Check, ChevronRight, Clock, Copy, Eye, Globe, Languages, Link2, MonitorSmartphone, RotateCw } from 'lucide-react';
import { mockingbirdApi } from '@/lib/api';
import { useAsync } from '@/hooks/useAsync';
import type { LayoutKey, PreviewResponse, PreviewShareResponse } from '@/lib/types';

type Device = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
type Referrer = 'direct' | 'github' | 'hn' | 'x' | 'xiaohongshu' | 'instagram' | 'substack' | 'medium' | 'search' | 'email' | 'other';
type HourBand = 'morning' | 'day' | 'evening' | 'late_night' | 'unknown';
type Mode = 'matched' | 'force' | 'text';
type Signal = {
  country: string;
  langRoot: string;
  device: Device;
  referrerRoot: Referrer;
  hourBand: HourBand;
  isReturning: boolean;
  isWeekend: boolean;
  urlSource: string;
};

const DEFAULT_SIGNAL: Signal = {
  country: 'CN',
  langRoot: 'zh',
  device: 'mobile',
  referrerRoot: 'xiaohongshu',
  hourBand: 'evening',
  isReturning: false,
  isWeekend: false,
  urlSource: '',
};

export const SignalPreviewLab = () => {
  const [signal, setSignal] = useState<Signal>(DEFAULT_SIGNAL);
  const [mode, setMode] = useState<Mode>('matched');
  const [forceThemeId, setForceThemeId] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [share, setShare] = useState<PreviewShareResponse | null>(null);
  const [shareError, setShareError] = useState<Error | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const preview = useAsync<PreviewResponse>(() => mockingbirdApi.preview(buildPreviewPayload(signal, mode, forceThemeId)), [requestVersion]);
  const winner = preview.data?.winnerTheme ?? preview.data?.theme ?? preview.data?.winner ?? null;
  const candidates = preview.data?.candidates ?? [];
  const shareUrl = share?.shareUrl ?? share?.url ?? '';

  async function createShareUrl() {
    setSharing(true);
    setShareError(null);
    try {
      setShare(await mockingbirdApi.previewShare(buildPreviewPayload(signal, mode, forceThemeId)));
    } catch (err) {
      setShareError(err instanceof Error ? err : new Error('Failed to create share URL.'));
    } finally {
      setSharing(false);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 font-sans text-foreground">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Preview</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Pick fake visitor signals, then ask the server matcher which theme wins. Shared previews are signed by the server.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-4 mb-4">
        <ModePill current={mode} value="matched" onClick={setMode}>Matched</ModePill>
        <ModePill current={mode} value="force" onClick={setMode}>Force theme</ModePill>
        <ModePill current={mode} value="text" onClick={setMode}>Text only</ModePill>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <div className="bg-card border border-border rounded p-4 space-y-3">
          <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Fake signals</div>
          <SignalField icon={<Globe className="w-3.5 h-3.5" />} label="Country">
            <select value={signal.country} onChange={e => setSignal({ ...signal, country: e.target.value })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background">
              {['US', 'CN', 'GB', 'SG', 'JP', 'DE', 'FR', 'BR', 'IN'].map(country => <option key={country}>{country}</option>)}
            </select>
          </SignalField>
          <SignalField icon={<Languages className="w-3.5 h-3.5" />} label="Language">
            <select value={signal.langRoot} onChange={e => setSignal({ ...signal, langRoot: e.target.value })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background">
              {['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'].map(lang => <option key={lang}>{lang}</option>)}
            </select>
          </SignalField>
          <SignalField icon={<MonitorSmartphone className="w-3.5 h-3.5" />} label="Device">
            <select value={signal.device} onChange={e => setSignal({ ...signal, device: e.target.value as Device })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background">
              {['desktop', 'mobile', 'tablet', 'bot', 'unknown'].map(device => <option key={device}>{device}</option>)}
            </select>
          </SignalField>
          <SignalField icon={<Link2 className="w-3.5 h-3.5" />} label="Referrer root">
            <select value={signal.referrerRoot} onChange={e => setSignal({ ...signal, referrerRoot: e.target.value as Referrer })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background">
              {['direct', 'github', 'hn', 'x', 'xiaohongshu', 'instagram', 'substack', 'medium', 'search', 'email', 'other'].map(referrer => <option key={referrer} value={referrer}>{referrer}</option>)}
            </select>
          </SignalField>
          <SignalField icon={<Clock className="w-3.5 h-3.5" />} label="Hour band">
            <select value={signal.hourBand} onChange={e => setSignal({ ...signal, hourBand: e.target.value as HourBand })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background">
              {['morning', 'day', 'evening', 'late_night', 'unknown'].map(hour => <option key={hour}>{hour}</option>)}
            </select>
          </SignalField>
          <label className="flex items-center gap-2 text-[13px] pt-1">
            <input type="checkbox" checked={signal.isReturning} onChange={e => setSignal({ ...signal, isReturning: e.target.checked })} className="rounded border-border" />
            <RotateCw className="w-3.5 h-3.5 text-muted-foreground" />
            Returning visitor
          </label>
          <label className="flex items-center gap-2 text-[13px] pt-1">
            <input type="checkbox" checked={signal.isWeekend} onChange={e => setSignal({ ...signal, isWeekend: e.target.checked })} className="rounded border-border" />
            Weekend
          </label>
          <SignalField label="URL ?from=" hint="Allowlisted tag from a shared link">
            <input type="text" value={signal.urlSource} onChange={e => setSignal({ ...signal, urlSource: e.target.value })} placeholder="e.g. tw" className="w-full text-sm px-2.5 py-1.5 rounded border border-border bg-background font-mono" />
          </SignalField>
          {mode === 'force' && <SignalField label="Force theme ID" hint="Server Phase 2 may honor this for preview only">
              <input type="text" value={forceThemeId} onChange={e => setForceThemeId(e.target.value)} placeholder="theme uuid" className="w-full text-sm px-2.5 py-1.5 rounded border border-border bg-background font-mono" />
            </SignalField>}
          <button type="button" onClick={() => setRequestVersion(v => v + 1)} className="w-full bg-primary text-primary-foreground text-sm px-3 py-2 rounded font-medium hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5">
            <Eye className="w-4 h-4" /> Run server preview
          </button>
        </div>

        <div className="space-y-3">
          {preview.loading && <Panel>Loading server preview...</Panel>}
          {preview.error && <Panel tone="danger">{preview.error.message}</Panel>}
          {winner && <WinnerCard winner={winner} cacheLabel={preview.data?.cacheBucketLabel ?? preview.data?.cacheKey} mode={mode} />}
          <CandidatesList candidates={candidates} />
          <ShareCard
            shareUrl={shareUrl}
            expiresAt={share?.expiresAt}
            ttlSec={share?.ttlSec}
            loading={sharing}
            error={shareError}
            copied={copied}
            onCreate={() => void createShareUrl()}
            onCopy={() => void copyShareUrl()}
          />
        </div>
      </div>
    </div>;
};

function buildPreviewPayload(signal: Signal, mode: Mode, forceThemeId: string) {
  const fakeSignals = { ...signal, urlSource: signal.urlSource || null };
  return {
    signals: fakeSignals,
    fakeSignals,
    mode,
    forceThemeId: mode === 'force' && forceThemeId ? forceThemeId : undefined,
  };
}

const ModePill = ({ current, value, onClick, children }: { current: Mode; value: Mode; onClick: (m: Mode) => void; children: React.ReactNode }) => {
  const isOn = current === value;
  return <button type="button" onClick={() => onClick(value)} className={`px-3 py-1.5 text-[12.5px] rounded border transition-colors ${isOn ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}>{children}</button>;
};

const SignalField = ({ icon, label, hint, children }: { icon?: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) => <label className="block">
    <div className="text-[11.5px] font-semibold mb-1 inline-flex items-center gap-1 text-foreground">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      {label}
    </div>
    {children}
    {hint && <div className="text-[10.5px] text-muted-foreground mt-0.5">{hint}</div>}
  </label>;

const Panel = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' }) => <div className={`bg-card border border-border rounded p-4 text-sm ${tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}`}>{children}</div>;

const WinnerCard = ({ winner, cacheLabel, mode }: { winner: { id: string; name?: string; slug?: string; layoutKey?: LayoutKey; layout?: LayoutKey; priority?: number }; cacheLabel?: string; mode: Mode }) => {
  const layout = winner.layoutKey ?? winner.layout ?? 'letter';
  return <div className="bg-card border border-border rounded overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-baseline gap-2 flex-wrap">
        <span className="text-[10.5px] uppercase tracking-wider font-bold text-muted-foreground">{mode === 'force' ? 'Requested preview' : 'Server winner'}</span>
        <span className="text-[16px] font-semibold">{winner.name ?? winner.slug ?? winner.id}</span>
        <span className="text-[11.5px] text-muted-foreground font-mono">layout: {layout}</span>
        {winner.priority !== undefined && <span className="text-[10.5px] text-muted-foreground font-mono">P{winner.priority}</span>}
      </div>
      <div className="px-4 py-3 text-[12.5px] text-muted-foreground space-y-1.5">
        <div><span className="text-foreground font-semibold">Source:</span> `/api/public/manage/preview`</div>
        <div className="text-[11px] font-mono text-muted-foreground">cache bucket: <span className="text-foreground">{cacheLabel ?? 'not returned'}</span></div>
      </div>
    </div>;
};

const CandidatesList = ({ candidates }: { candidates: NonNullable<PreviewResponse['candidates']> }) => <div className="bg-card border border-border rounded overflow-hidden">
    <div className="px-4 py-2.5 border-b border-border text-[10.5px] uppercase tracking-wider font-bold text-muted-foreground">Candidate ranking</div>
    {candidates.length === 0 ? <div className="px-4 py-5 text-sm text-muted-foreground">No candidates returned yet.</div> : <ul>
      {candidates.map(candidate => <li key={candidate.id} className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3">
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[13.5px] font-semibold">{candidate.name ?? candidate.id}</span>
              {candidate.layoutKey && <span className="text-[10.5px] text-muted-foreground font-mono">{candidate.layoutKey}</span>}
              {candidate.ruleMatched === false && <span className="text-[10.5px] text-muted-foreground inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> rule did not match</span>}
            </div>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground shrink-0">score <span className="text-foreground">{candidate.score}</span></span>
        </li>)}
    </ul>}
  </div>;

const ShareCard = ({ shareUrl, expiresAt, ttlSec, loading, error, copied, onCreate, onCopy }: { shareUrl: string; expiresAt?: number; ttlSec?: number; loading: boolean; error: Error | null; copied: boolean; onCreate: () => void; onCopy: () => void }) => <div className="bg-card border border-border rounded p-4">
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-muted-foreground">Share preview URL</div>
      <span className="text-[10.5px] px-1.5 py-0.5 rounded font-mono bg-[var(--warning)]/15 text-[var(--warning)]">server-signed · noindex</span>
    </div>
    <div className="flex items-center gap-2">
      <code className="flex-1 text-[11.5px] font-mono text-muted-foreground truncate bg-background px-2 py-1.5 rounded border border-border">{shareUrl || 'No share URL yet.'}</code>
      <button type="button" onClick={shareUrl ? onCopy : onCreate} disabled={loading} className="text-[12px] px-2.5 py-1.5 rounded border border-border bg-card hover:bg-muted inline-flex items-center gap-1.5">
        {shareUrl ? copied ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {shareUrl ? copied ? 'Copied' : 'Copy' : loading ? 'Signing...' : 'Create'}
      </button>
    </div>
    {error && <p className="text-[11px] text-destructive mt-2">{error.message}</p>}
    {(expiresAt || ttlSec) && <p className="text-[11px] text-muted-foreground mt-2">Expires {expiresAt ? new Date(expiresAt).toLocaleString() : `in ${ttlSec} seconds`}.</p>}
    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">The shared URL comes from `/api/public/manage/preview/share`; the client no longer fabricates preview tokens.</p>
  </div>;
