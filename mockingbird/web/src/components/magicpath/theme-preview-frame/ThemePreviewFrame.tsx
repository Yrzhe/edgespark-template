import { useState, type ReactNode } from 'react';
import { Monitor, Smartphone, Type, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
type Layout = 'terminal' | 'magazine' | 'gallery' | 'letter';
type Viewport = 'desktop' | 'mobile' | 'text';
type Theme = {
  name: string;
  layout: Layout;
  bg: string;
  fg: string;
  accent: string;
  bodyFont: string;
  headingFont: string;
};
type Visitor = {
  country?: string;
  lang?: string;
  device?: string;
  referrer?: string;
  hourBand?: string;
  isReturning?: boolean;
};
type Meta = {
  cacheStatus?: 'hit' | 'miss' | 'streaming';
  cachedAt?: string;
  costPerGen?: string;
  modelKey?: string;
};
const DEFAULT_THEME: Theme = {
  name: 'Terminal',
  layout: 'terminal',
  bg: '#0C0A0F',
  fg: '#EDEAE3',
  accent: '#7DDC8B',
  bodyFont: 'IBM Plex Mono',
  headingFont: 'JetBrains Mono'
};
const DEFAULT_VISITOR: Visitor = {
  country: 'US',
  lang: 'en',
  device: 'desktop',
  referrer: 'github',
  hourBand: 'day',
  isReturning: false
};
const DEFAULT_META: Meta = {
  cacheStatus: 'hit',
  cachedAt: '18m ago',
  costPerGen: '$0.0003',
  modelKey: 'gpt-4o-mini'
};
type Props = {
  theme?: Theme;
  visitor?: Visitor;
  meta?: Meta;
  watermark?: 'preview' | null;
  children?: ReactNode;
};
export const ThemePreviewFrame = ({
  theme = DEFAULT_THEME,
  visitor = DEFAULT_VISITOR,
  meta = DEFAULT_META,
  watermark = null,
  children
}: Props) => {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const bucket = `${theme.layout}:${visitor.country ?? 'xx'}:${visitor.device ?? 'unknown'}:${visitor.referrer ?? 'direct'}:${visitor.hourBand ?? 'unknown'}:${visitor.lang ?? 'xx'}`;
  return <div className="w-full h-full flex flex-col bg-muted/30 border border-border rounded overflow-hidden font-sans">
      {/* Top control bar */}
      <div className="px-3 md:px-4 py-2 border-b border-border bg-card flex items-center gap-2 text-[12px]">
        <span className="text-muted-foreground hidden sm:inline">Viewport:</span>
        <div className="inline-flex rounded border border-border overflow-hidden">
          <ViewportButton current={viewport} value="desktop" onClick={setViewport} icon={<Monitor className="w-3.5 h-3.5" />}>
            Desktop
          </ViewportButton>
          <ViewportButton current={viewport} value="mobile" onClick={setViewport} icon={<Smartphone className="w-3.5 h-3.5" />}>
            Mobile
          </ViewportButton>
          <ViewportButton current={viewport} value="text" onClick={setViewport} icon={<Type className="w-3.5 h-3.5" />}>
            Text
          </ViewportButton>
        </div>

        <button className="ml-1 p-1.5 rounded hover:bg-muted" title="Regenerate copy" aria-label="Regenerate">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
          <span>winner:</span>
          <span className="text-foreground font-semibold">{theme.name}</span>
          <span className="opacity-50">·</span>
          <span>{theme.layout}</span>
        </div>

        <button className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 ml-2">
          <ExternalLink className="w-3 h-3" />
          <span className="hidden sm:inline">Open in new tab</span>
        </button>
      </div>

      {/* Viewport body */}
      <div className="flex-1 overflow-auto p-3 md:p-5 flex justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(0,0,0,0.015)_8px,rgba(0,0,0,0.015)_16px)] relative">
        {watermark === 'preview' && <div className="absolute top-2 right-3 px-2 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/40 z-10">
            preview
          </div>}

        <div className={`${viewport === 'mobile' ? 'w-[360px]' : viewport === 'text' ? 'w-full max-w-[640px]' : 'w-full max-w-[900px]'} transition-all`}>
          
          {children ?? <LayoutBody layout={theme.layout} viewport={viewport} theme={theme} />}
        </div>
      </div>

      {/* Metadata strip */}
      <div className="px-3 md:px-4 py-2 border-t border-border bg-card text-[11px] text-muted-foreground font-mono flex items-center gap-x-3 gap-y-1 flex-wrap">
        <span className="inline-flex items-center gap-1 min-w-0">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span>cache:</span>
          <span className="text-foreground truncate">{bucket}</span>
        </span>
        <span className="opacity-50">·</span>
        <CacheStatus status={meta.cacheStatus ?? 'hit'} />
        {meta.cachedAt && <>
            <span className="opacity-50">·</span>
            <span>cached {meta.cachedAt}</span>
          </>}
        {meta.costPerGen && <>
            <span className="opacity-50">·</span>
            <span>cost/gen {meta.costPerGen}</span>
          </>}
        {meta.modelKey && <>
            <span className="opacity-50">·</span>
            <span>model: <span className="text-foreground">{meta.modelKey}</span></span>
          </>}
      </div>
    </div>;
};
const ViewportButton = ({
  current,
  value,
  onClick,
  icon,
  children
}: {
  current: Viewport;
  value: Viewport;
  onClick: (v: Viewport) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => {
  const isOn = current === value;
  return <button type="button" onClick={() => onClick(value)} className={`px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5 transition-colors ${isOn ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted text-foreground'}`}>
      
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>;
};
const CacheStatus = ({
  status
}: {
  status: NonNullable<Meta['cacheStatus']>;
}) => {
  if (status === 'hit') {
    return <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
        <span>hit</span>
      </span>;
  }
  if (status === 'streaming') {
    return <span className="inline-flex items-center gap-1 text-[var(--warning)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
        <span>streaming</span>
      </span>;
  }
  return <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      <span>miss · default copy</span>
    </span>;
};
const LayoutBody = ({
  layout,
  viewport,
  theme
}: {
  layout: Layout;
  viewport: Viewport;
  theme: Theme;
}) => {
  if (viewport === 'text') {
    return <pre className="bg-card border border-border rounded p-4 text-[12px] font-mono whitespace-pre-wrap leading-relaxed">
{`# yrzhe

A builder of agent-native systems, templates, and small
internet tools.

## projects
- mockingbird — adaptive personal site (this template)
- arena — spectator + voting for AI competitions
- perch — agent-native link-in-bio

## contact
github · x · email
`}
      </pre>;
  }
  const {
    bg,
    fg,
    accent,
    bodyFont,
    headingFont
  } = theme;
  if (layout === 'terminal') {
    return <div className="rounded shadow-sm border border-border overflow-hidden" style={{
      background: bg,
      color: fg,
      fontFamily: bodyFont
    }}>
        
        <div className="px-5 pt-4 pb-6 text-[13px] leading-relaxed">
          <div className="opacity-60 mb-1">/home/owner</div>
          <div><span style={{
            color: accent
          }}>$</span> whoami</div>
          <div className="opacity-90 ml-3 mb-3" style={{
          fontFamily: headingFont,
          fontSize: 18
        }}>
            yrzhe — builds agent-native systems, templates, and odd little internet tools.
          </div>
          <div className="opacity-80">[projects/]</div>
          <div className="ml-3 mt-1 space-y-0.5">
            <div><span style={{
              color: accent
            }}>&gt;</span> mockingbird.template <span className="opacity-50">· adaptive site</span></div>
            <div><span style={{
              color: accent
            }}>&gt;</span> perch.link <span className="opacity-50">· agent-native bio</span></div>
            <div><span style={{
              color: accent
            }}>&gt;</span> arena.vote <span className="opacity-50">· AI competition</span></div>
          </div>
          <div className="mt-4"><span style={{
            color: accent
          }}>$</span><span className="ml-1 animate-pulse">_</span></div>
        </div>
      </div>;
  }
  if (layout === 'magazine') {
    return <div className="rounded shadow-sm border border-border overflow-hidden" style={{
      background: bg,
      color: fg,
      fontFamily: bodyFont
    }}>
        <div className="px-6 pt-5 pb-7">
          <div className="text-[10px] uppercase tracking-[0.2em] mb-4 opacity-70" style={{
          fontFamily: headingFont
        }}>
            Mockingbird · Issue 12
          </div>
          <div className="text-[28px] leading-tight font-bold max-w-[80%]" style={{
          fontFamily: headingFont,
          letterSpacing: '-0.01em'
        }}>
            The version of me you probably came for.
          </div>
          <div className="text-[13px] mt-2 italic opacity-80 max-w-[70%]">
            — a builder writing from Shanghai, on agents and the templates they need.
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 text-[12.5px] leading-relaxed">
            <p>I build small, opinionated systems for AI agents to use. Each one ships as a one-command EdgeSpark template.</p>
            <p>The piece you're reading is generated for your visit by a model whose only inputs are coarse — country, device, the kind of link you came from.</p>
          </div>
        </div>
      </div>;
  }
  if (layout === 'gallery') {
    return <div className="rounded shadow-sm border border-border overflow-hidden p-3" style={{
      background: bg,
      color: fg,
      fontFamily: bodyFont
    }}>
        <div className="text-[24px] font-bold mb-1" style={{
        fontFamily: headingFont
      }}>yrzhe!</div>
        <div className="text-[13px] opacity-80 mb-3">A playful version, made for you.</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded p-3 border" style={{
          background: '#FFFFFF',
          borderColor: '#D8D0C3'
        }}>
            <div className="text-[11px] font-semibold opacity-70">ABOUT</div>
            <div className="text-[12px] mt-1">A builder in Shanghai.</div>
          </div>
          <div className="rounded p-3 border" style={{
          background: '#FFFFFF',
          borderColor: '#D8D0C3'
        }}>
            <div className="text-[11px] font-semibold opacity-70">NOW</div>
            <div className="text-[12px] mt-1">Mockingbird template.</div>
          </div>
          <div className="col-span-2 rounded p-3 border" style={{
          background: accent,
          color: bg,
          borderColor: '#D8D0C3'
        }}>
            <div className="text-[11px] font-bold opacity-90">FEATURED</div>
            <div className="text-[13px] font-semibold mt-0.5">Arena — vote on AI agents.</div>
          </div>
        </div>
      </div>;
  }

  // letter
  return <div className="rounded shadow-sm border border-border overflow-hidden" style={{
    background: bg,
    color: fg,
    fontFamily: bodyFont
  }}>
      <div className="px-7 py-8 max-w-[560px] mx-auto">
        <div className="text-[16px] mb-3">Hi —</div>
        <p className="text-[14px] leading-relaxed mb-3">
          You came here directly, which means you probably know me, or you saw a tweet. So this version is short.
        </p>
        <p className="text-[14px] leading-relaxed mb-3">
          I make small agent-native systems. Each one ships as a template.
          If you'd like to chat: <span style={{
          color: accent
        }}>love@yrzhe.space</span>.
        </p>
        <div className="text-[15px] mt-6" style={{
        fontFamily: '"Caveat", cursive',
        letterSpacing: '0.01em'
      }}>
          — yrzhe
        </div>
      </div>
    </div>;
};
