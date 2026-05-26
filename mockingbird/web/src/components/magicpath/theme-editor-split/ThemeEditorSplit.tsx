import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, Save, Send } from 'lucide-react';
import { MatchRuleInput } from '@/components/magicpath/match-rule-input/MatchRuleInput';
import { ThemePreviewFrame } from '@/components/magicpath/theme-preview-frame/ThemePreviewFrame';
import type { LayoutKey, MatchRule, ThemeRow } from '@/lib/types';

type Props = {
  theme: ThemeRow;
  rules?: MatchRule[];
  loading?: boolean;
  error?: Error | null;
  preview: ReactNode;
  onBack: () => void;
  onSave: (patch: {
    name: string;
    status: ThemeRow['status'];
    priority: number;
    palette: Record<string, string>;
    font: Record<string, string>;
    copyPrompt: string;
    lockVersion: number;
  }) => void;
};

const FONT_OPTIONS = ['IBM Plex Mono', 'JetBrains Mono', 'Inter', 'Source Serif 4', 'Fraunces', 'Crimson Pro', 'Gaegu', 'Caveat'];

export const ThemeEditorSplit = ({ theme, rules = [], loading = false, error = null, preview, onBack, onSave }: Props) => {
  const [name, setName] = useState(theme.name);
  const [status, setStatus] = useState(theme.status);
  const [priority, setPriority] = useState(theme.priority);
  const [bodyFont, setBodyFont] = useState(theme.font?.body ?? defaultBodyFont(theme.layoutKey));
  const [headingFont, setHeadingFont] = useState(theme.font?.heading ?? defaultHeadingFont(theme.layoutKey));
  const [bg, setBg] = useState(theme.palette?.bg ?? defaultPalette(theme.layoutKey).bg);
  const [fg, setFg] = useState(theme.palette?.fg ?? defaultPalette(theme.layoutKey).fg);
  const [accent, setAccent] = useState(theme.palette?.accent ?? defaultPalette(theme.layoutKey).accent);
  const [copyPrompt, setCopyPrompt] = useState(theme.copyPrompt ?? '');
  const dirty = useMemo(() => {
    return name !== theme.name || status !== theme.status || priority !== theme.priority || bg !== (theme.palette?.bg ?? defaultPalette(theme.layoutKey).bg) || fg !== (theme.palette?.fg ?? defaultPalette(theme.layoutKey).fg) || accent !== (theme.palette?.accent ?? defaultPalette(theme.layoutKey).accent) || copyPrompt !== (theme.copyPrompt ?? '');
  }, [accent, bg, copyPrompt, fg, name, priority, status, theme]);

  useEffect(() => {
    setName(theme.name);
    setStatus(theme.status);
    setPriority(theme.priority);
    setBodyFont(theme.font?.body ?? defaultBodyFont(theme.layoutKey));
    setHeadingFont(theme.font?.heading ?? defaultHeadingFont(theme.layoutKey));
    setBg(theme.palette?.bg ?? defaultPalette(theme.layoutKey).bg);
    setFg(theme.palette?.fg ?? defaultPalette(theme.layoutKey).fg);
    setAccent(theme.palette?.accent ?? defaultPalette(theme.layoutKey).accent);
    setCopyPrompt(theme.copyPrompt ?? '');
  }, [theme]);

  const save = () => onSave({
    name,
    status,
    priority,
    palette: { ...(theme.palette ?? {}), bg, fg, accent },
    font: { ...(theme.font ?? {}), body: bodyFont, heading: headingFont },
    copyPrompt,
    lockVersion: theme.lockVersion,
  });

  return <div className="w-full min-h-[calc(100vh-7rem)] flex flex-col font-sans text-foreground bg-background">
      <header className="h-14 bg-card border border-border rounded-t flex items-center px-4 md:px-5 gap-3 sticky top-0 z-20">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" />
          <span>Themes</span>
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold tracking-tight truncate">{theme.name}</span>
        {dirty ? <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-[var(--warning)]/15 text-[var(--warning)]">unsaved</span> : <span className="text-[11px] text-muted-foreground">saved</span>}
        <div className="flex-1" />
        <button onClick={save} disabled={loading} className="text-sm px-3 py-1.5 rounded border border-border bg-card hover:bg-muted inline-flex items-center gap-1.5">
          <Save className="w-4 h-4" />
          Save
        </button>
        <button onClick={save} disabled={loading} className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1.5 font-medium">
          <Send className="w-4 h-4" />
          Publish
        </button>
      </header>
      {error && <div className="border-x border-border bg-destructive/10 text-destructive px-4 py-2 text-sm">{error.message}</div>}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row border-x border-b border-border rounded-b overflow-hidden">
        <div className="lg:w-[460px] xl:w-[520px] shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card overflow-auto">
          <div className="px-5 py-5 space-y-6">
            <Section title="Basics">
              <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className="w-full text-sm px-2.5 py-1.5 rounded border border-border bg-background" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value as ThemeRow['status'])} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background"><option value="active">active</option><option value="paused">paused</option><option value="draft">draft</option><option value="archived">archived</option></select></Field>
                <Field label="Priority"><input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} className="w-full text-sm px-2.5 py-1.5 rounded border border-border bg-background font-mono" /></Field>
              </div>
              <Field label="Layout"><div className="text-sm px-2.5 py-1.5 rounded border border-border bg-muted font-mono">{theme.layoutKey}</div></Field>
            </Section>
            <Section title="Typography">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Body font"><FontSelect value={bodyFont} onChange={setBodyFont} /></Field>
                <Field label="Heading font"><FontSelect value={headingFont} onChange={setHeadingFont} /></Field>
              </div>
            </Section>
            <Section title="Palette">
              <ColorField label="bg" value={bg} onChange={setBg} />
              <ColorField label="fg" value={fg} onChange={setFg} />
              <ColorField label="accent" value={accent} onChange={setAccent} />
            </Section>
            <Section title="Copy tone prompt">
              <textarea value={copyPrompt} onChange={e => setCopyPrompt(e.target.value)} rows={5} className="w-full text-[13px] px-3 py-2 rounded border border-border bg-background leading-relaxed resize-y" />
              <div className="text-[11px] text-muted-foreground">{new TextEncoder().encode(copyPrompt).length} / 2048 bytes</div>
            </Section>
            <Section title="Match rules">
              <div className="space-y-3">
                {(rules.length ? rules : [{ id: 'empty', expression: 'No rules yet. Default theme handles fallback.', enabled: false, score: 0, lockVersion: 0, themeId: theme.id }]).map(rule => <MatchRuleInput key={rule.id} value={rule.expression} />)}
              </div>
            </Section>
          </div>
        </div>
        <div className="flex-1 min-h-[620px] bg-background p-4 md:p-5">
          <ThemePreviewFrame theme={{ name: theme.name, layout: theme.layoutKey, bg, fg, accent, bodyFont, headingFont }} watermark="preview">
            {preview}
          </ThemePreviewFrame>
        </div>
      </div>
    </div>;
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="space-y-3"><h2 className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">{title}</h2>{children}</section>;
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block space-y-1.5"><span className="text-[12px] font-bold text-muted-foreground">{label}</span>{children}</label>;
const FontSelect = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <select value={value} onChange={e => onChange(e.target.value)} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background">{FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}</select>;
const ColorField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <label className="grid grid-cols-[54px_1fr_28px] items-center gap-2 text-sm"><span className="font-mono text-muted-foreground">{label}</span><input value={value} onChange={e => onChange(e.target.value)} className="px-2 py-1.5 rounded border border-border bg-background font-mono text-[12px]" /><span className="w-7 h-7 rounded border border-border" style={{ background: value }} /></label>;

function defaultPalette(layout: LayoutKey) {
  if (layout === 'terminal') return { bg: '#0C0A0F', fg: '#EDEAE3', accent: '#7DDC8B' };
  if (layout === 'magazine') return { bg: '#F7F5F1', fg: '#0C0A0F', accent: '#BC4E32' };
  if (layout === 'gallery') return { bg: '#F7F5F1', fg: '#0C0A0F', accent: '#F36440' };
  return { bg: '#FBFAF6', fg: '#1A1715', accent: '#2556B6' };
}
function defaultBodyFont(layout: LayoutKey) {
  if (layout === 'terminal') return 'IBM Plex Mono';
  if (layout === 'magazine') return 'Source Serif 4';
  if (layout === 'letter') return 'Crimson Pro';
  return 'Inter';
}
function defaultHeadingFont(layout: LayoutKey) {
  if (layout === 'terminal') return 'JetBrains Mono';
  if (layout === 'magazine') return 'Fraunces';
  if (layout === 'letter') return 'Crimson Pro';
  return 'Gaegu';
}
