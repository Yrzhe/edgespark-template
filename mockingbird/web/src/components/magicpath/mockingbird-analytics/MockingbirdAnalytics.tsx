import { useState, type ComponentType, type ReactNode } from 'react';
import { TrendingUp, Clock, DollarSign, Zap, Filter, AlertCircle, ShieldOff } from 'lucide-react';
type Range = '7d' | '30d' | '90d';
const KPI = [{
  label: 'Hits',
  value: '24,847',
  delta: '+18%',
  icon: TrendingUp,
  tone: 'pos' as const
}, {
  label: 'Avg dwell',
  value: '00:41',
  delta: '+3s',
  icon: Clock,
  tone: 'pos' as const
}, {
  label: 'LLM cost',
  value: '$3.18',
  delta: '74% of cap',
  icon: DollarSign,
  tone: 'warn' as const
}, {
  label: 'Cache hit',
  value: '84%',
  delta: '+2pp',
  icon: Zap,
  tone: 'pos' as const
}];
const THEME_DIST = [{
  name: 'Letter',
  share: 41,
  hits: 10187,
  color: '#2556B6'
}, {
  name: 'Gallery',
  share: 28,
  hits: 6957,
  color: '#F36440'
}, {
  name: 'Terminal',
  share: 19,
  hits: 4721,
  color: '#0C0A0F'
}, {
  name: 'Magazine',
  share: 9,
  hits: 2237,
  color: '#BC4E32'
}, {
  name: 'Friday night',
  share: 3,
  hits: 745,
  color: '#706B75'
}];
const SIGNAL_DIST = {
  country: [{
    label: 'US',
    share: 38
  }, {
    label: 'CN',
    share: 27
  }, {
    label: 'GB',
    share: 9
  }, {
    label: 'JP',
    share: 6
  }, {
    label: 'DE',
    share: 4
  }, {
    label: 'other',
    share: 16
  }],
  device: [{
    label: 'desktop',
    share: 52
  }, {
    label: 'mobile',
    share: 44
  }, {
    label: 'tablet',
    share: 3
  }, {
    label: 'bot',
    share: 1
  }],
  referrer: [{
    label: 'direct',
    share: 31
  }, {
    label: 'x',
    share: 19
  }, {
    label: 'github',
    share: 14
  }, {
    label: 'xiaohongshu',
    share: 12
  }, {
    label: 'search',
    share: 10
  }, {
    label: 'substack',
    share: 5
  }, {
    label: 'other',
    share: 9
  }],
  lang: [{
    label: 'en',
    share: 58
  }, {
    label: 'zh',
    share: 32
  }, {
    label: 'ja',
    share: 5
  }, {
    label: 'other',
    share: 5
  }]
};
const COST_TREND = [0.18, 0.22, 0.15, 0.28, 0.31, 0.4, 0.36, 0.42, 0.5, 0.55, 0.48, 0.6, 0.62, 0.58];
type Props = {
  data?: {
    kpis?: Array<{ label: string; value: string; delta: string; icon?: ComponentType<{ className?: string }>; tone: 'pos' | 'warn' }>;
    themeDistribution?: typeof THEME_DIST;
    signalDistribution?: typeof SIGNAL_DIST;
    costTrend?: number[];
  } | null;
  loading?: boolean;
  error?: Error | null;
  onRangeChange?: (range: Range) => void;
};
export const MockingbirdAnalytics = ({ data = null, loading = false, error = null, onRangeChange }: Props) => {
  const [range, setRange] = useState<Range>('30d');
  const [excludeBots, setExcludeBots] = useState(true);
  const [excludeOwner, setExcludeOwner] = useState(true);
  const useDevFallback = Boolean(error && import.meta.env.DEV);
  const kpis = data?.kpis ?? (useDevFallback ? KPI : []);
  const themeDistribution = data?.themeDistribution ?? (useDevFallback ? THEME_DIST : []);
  const signalDistribution = data?.signalDistribution ?? (useDevFallback ? SIGNAL_DIST : { country: [], device: [], referrer: [], lang: [] });
  const costTrend = data?.costTrend ?? (useDevFallback ? COST_TREND : []);
  return <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 font-sans text-foreground">
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Analytics</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Aggregate dimensions only — country, device class, referrer class, language root.
            Never city, ASN, or IP.
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(['7d', '30d', '90d'] as Range[]).map(r => <button key={r} type="button" onClick={() => {
          setRange(r);
          onRangeChange?.(r);
        }} className={`px-2.5 py-1 text-[12px] rounded border ${range === r ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
            
              {r}
            </button>)}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mt-3 mb-5 text-[12px]">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <FilterChip on={excludeBots} onToggle={() => setExcludeBots(v => !v)}>
          Exclude bots
        </FilterChip>
        <FilterChip on={excludeOwner} onToggle={() => setExcludeOwner(v => !v)}>
          Exclude owner traffic
        </FilterChip>
        <span className="text-muted-foreground font-mono text-[11px] ml-auto">
          last updated 2m ago
        </span>
      </div>
      {loading && <div className="bg-card border border-border rounded p-8 text-sm text-muted-foreground">Loading analytics...</div>}
      {error && <div className="bg-card border border-border rounded p-8 text-sm text-destructive">{error.message}</div>}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => {
        const Icon = k.icon;
        const toneColor = k.tone === 'warn' ? 'var(--warning)' : 'var(--success)';
        return <div key={k.label} className="bg-card border border-border rounded p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 inline-flex items-center gap-1">
                {Icon && <Icon className="w-3 h-3" />}
                {k.label}
              </div>
              <div className="text-[22px] font-semibold leading-tight tabular-nums">
                {k.value}
              </div>
              <div className="text-[11px] mt-0.5" style={{
            color: toneColor
          }}>
                {k.delta}
              </div>
            </div>;
      })}
        {!loading && !error && kpis.length === 0 && <div className="col-span-full bg-card border border-border rounded p-8 text-sm text-muted-foreground">No analytics events in this range.</div>}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        {/* Theme distribution */}
        <Card title="Theme distribution" subtitle="Share of public hits">
          <ul className="space-y-2 mt-1">
            {themeDistribution.map(t => <li key={t.name}>
                <div className="flex items-baseline justify-between text-[12px] mb-1">
                  <span className="font-medium inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{
                  background: t.color
                }} aria-hidden />
                  
                    {t.name}
                  </span>
                  <span className="text-muted-foreground font-mono tabular-nums">
                    {t.share}% · {t.hits.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded overflow-hidden">
                  <div className="h-full rounded transition-all" style={{
                width: `${t.share}%`,
                background: t.color
              }} />
                
                </div>
              </li>)}
          </ul>
        </Card>

        {/* Signal distribution */}
        <Card title="Signal distribution" subtitle="Coarse dimensions only">
          <div className="space-y-2 mt-1 text-[12px]">
            <SignalGroup label="Country" rows={signalDistribution.country} />
            <SignalGroup label="Device" rows={signalDistribution.device} />
            <SignalGroup label="Referrer" rows={signalDistribution.referrer} />
            <SignalGroup label="Lang" rows={signalDistribution.lang} />
          </div>
        </Card>

        {/* Cost trend */}
        <Card title="LLM cost (per day)" subtitle="USD · current cap $2/day">
          <div className="h-[120px] mt-2 mb-1 flex items-end gap-[3px]">
            {costTrend.map((v, i) => <div key={i} className="flex-1 rounded-sm" style={{
            height: `${Math.max(8, v * 160)}%`,
            background: v > 0.5 ? 'var(--warning)' : 'var(--primary)'
          }} title={`day ${i + 1}: $${v.toFixed(2)}`} />)}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono mt-1 flex justify-between">
            <span>30d ago</span>
            <span>today: $0.58</span>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title="Default copy served" subtitle="Cache miss + no LLM">
          <div className="text-[20px] font-semibold tabular-nums mt-1">3,142</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">~12.6% of hits</div>
        </Card>
        <Card title="LLM rewrite failed" subtitle="Validation rejected">
          <div className="text-[20px] font-semibold tabular-nums mt-1 inline-flex items-baseline gap-1.5">
            12
            <AlertCircle className="w-3.5 h-3.5 text-[var(--warning)]" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">last in 4h ago</div>
        </Card>
        <Card title="Bots blocked" subtitle="No LLM call">
          <div className="text-[20px] font-semibold tabular-nums mt-1 inline-flex items-baseline gap-1.5">
            418
            <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">stable default copy served</div>
        </Card>
        <Card title="Avg latency" subtitle="SSR + edge">
          <div className="text-[20px] font-semibold tabular-nums mt-1">87ms</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">p95 142ms</div>
        </Card>
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground font-mono leading-relaxed">
        Privacy note: raw IP, city, ASN, and full referrer URL never enter the analytics pipeline.
        Daily rollups retained 13 months · raw event rows 30 days.
      </p>
    </div>;
};
const Card = ({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) => <div className="bg-card border border-border rounded p-3.5">
    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-bold">
      {title}
    </div>
    {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
    {children}
  </div>;
const FilterChip = ({
  on,
  onToggle,
  children
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => <button type="button" onClick={onToggle} className={`px-2 py-1 rounded text-[11.5px] border inline-flex items-center gap-1.5 transition-colors ${on ? 'bg-primary/[0.06] border-primary/40 text-primary' : 'bg-card border-border text-muted-foreground'}`}>
  
    <span className={`w-2 h-2 rounded-full ${on ? 'bg-primary' : 'bg-muted-foreground/40'}`} aria-hidden />
  
    {children}
  </button>;
const SignalGroup = ({
  label,
  rows
}: {
  label: string;
  rows: {
    label: string;
    share: number;
  }[];
}) => <div>
    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
      {label}
    </div>
    <div className="flex h-3 rounded overflow-hidden border border-border">
      {rows.map((r, i) => <div key={r.label} className="h-full" style={{
      width: `${r.share}%`,
      background: `color-mix(in oklab, var(--primary) ${80 - i * 12}%, white)`
    }} title={`${r.label}: ${r.share}%`} />)}
    </div>
    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[10.5px] font-mono text-muted-foreground">
      {rows.map(r => <span key={r.label}>
          {r.label} <span className="text-foreground">{r.share}%</span>
        </span>)}
    </div>
  </div>;
