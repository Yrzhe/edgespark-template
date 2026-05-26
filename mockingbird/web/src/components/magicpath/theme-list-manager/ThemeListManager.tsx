import { useMemo, useState } from 'react';
import { Search, Plus, Pencil, MoreHorizontal, Copy, Pause, Play, Trash2, ChevronsUpDown, Sparkles, Layers } from 'lucide-react';
type Status = 'Active' | 'Paused' | 'Draft' | 'Archived';
type Layout = 'terminal' | 'magazine' | 'gallery' | 'letter';
export type ThemeListItem = {
  id: string;
  name: string;
  layout: Layout;
  status: Status;
  priority: number;
  hits7d: number;
  rule: string;
  swatches: [string, string, string];
  ab?: {
    vsThemeId: string;
    vsName: string;
    weight: number;
  };
  isDefault?: boolean;
  updatedAtLabel: string;
};
const SAMPLE: ThemeListItem[] = [{
  id: 't_letter',
  name: 'Letter',
  layout: 'letter',
  status: 'Active',
  priority: 50,
  hits7d: 1204,
  rule: '* (fallback)',
  swatches: ['#FBFAF6', '#1A1715', '#2556B6'],
  isDefault: true,
  updatedAtLabel: '2d ago'
}, {
  id: 't_terminal',
  name: 'Terminal',
  layout: 'terminal',
  status: 'Paused',
  priority: 90,
  hits7d: 0,
  rule: 'referrer~/github|hn/ AND device==desktop',
  swatches: ['#0C0A0F', '#EDEAE3', '#7DDC8B'],
  updatedAtLabel: '2d ago'
}, {
  id: 't_magazine',
  name: 'Magazine',
  layout: 'magazine',
  status: 'Paused',
  priority: 70,
  hits7d: 0,
  rule: 'referrer~/substack|medium|x/ OR is_weekend==true',
  swatches: ['#F7F5F1', '#0C0A0F', '#BC4E32'],
  updatedAtLabel: '2d ago'
}, {
  id: 't_gallery',
  name: 'Gallery',
  layout: 'gallery',
  status: 'Paused',
  priority: 60,
  hits7d: 0,
  rule: 'referrer~/xiaohongshu|instagram/ OR device==mobile',
  swatches: ['#F7F5F1', '#F36440', '#2556B6'],
  updatedAtLabel: '2d ago'
}, {
  id: 't_investor',
  name: 'Investor mode',
  layout: 'magazine',
  status: 'Draft',
  priority: 75,
  hits7d: 0,
  rule: 'country in [US,SG] AND referrer~/linkedin|crunchbase/',
  swatches: ['#FFFFFF', '#0C0A0F', '#BC4E32'],
  updatedAtLabel: '6h ago'
}, {
  id: 't_late',
  name: 'Friday night',
  layout: 'letter',
  status: 'Active',
  priority: 65,
  hits7d: 312,
  rule: 'hour_band==late_night AND is_weekend==true',
  swatches: ['#1A1715', '#FBFAF6', '#F36440'],
  ab: {
    vsThemeId: 't_letter',
    vsName: 'Letter',
    weight: 50
  },
  updatedAtLabel: '15m ago'
}];
type SortKey = 'priority' | 'hits' | 'updated' | 'name';
type StatusFilter = 'all' | Status;
type AbFilter = 'all' | 'inAb';
type Props = {
  themes?: ThemeListItem[];
  loading?: boolean;
  error?: Error | null;
  onEditTheme?: (id: string) => void;
  onCreateTheme?: () => void;
  onDuplicateTheme?: (id: string) => void;
  onDeleteTheme?: (id: string) => void;
};
export const ThemeListManager = ({
  themes: themeRows,
  loading = false,
  error = null,
  onEditTheme,
  onCreateTheme,
  onDuplicateTheme,
  onDeleteTheme
}: Props) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [abFilter, setAbFilter] = useState<AbFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const themes = useMemo(() => {
    let list = (themeRows ?? SAMPLE).filter(t => {
      if (query) {
        const q = query.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.rule.toLowerCase().includes(q) && !t.layout.includes(q)) {
          return false;
        }
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (abFilter === 'inAb' && !t.ab) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'priority':
          return b.priority - a.priority;
        case 'hits':
          return b.hits7d - a.hits7d;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'updated':
        default:
          return 0;
      }
    });
    return list;
  }, [query, statusFilter, abFilter, sortKey, themeRows]);
  const allThemes = themeRows ?? SAMPLE;
  const totalCount = allThemes.length;
  const activeCount = allThemes.filter(t => t.status === 'Active').length;
  const pausedCount = allThemes.filter(t => t.status === 'Paused').length;
  const draftCount = allThemes.filter(t => t.status === 'Draft').length;
  return <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 font-sans text-foreground">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Themes</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Each theme pins a layout + palette + fonts + copy tone + match rules.
            The deterministic matcher picks one per visitor; the LLM rewrites text inside.
          </p>
        </div>
        <button onClick={onCreateTheme} className="hidden sm:inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded font-medium hover:opacity-90 transition-opacity shrink-0">
          <Plus className="w-4 h-4" />
          <span>New theme</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground font-mono mt-3 mb-5">
        <span><span className="text-foreground font-semibold">{totalCount}</span> total</span>
        <span className="opacity-50">·</span>
        <span><span className="text-foreground font-semibold">{activeCount}</span> active</span>
        <span className="opacity-50">·</span>
        <span><span className="text-foreground font-semibold">{pausedCount}</span> paused</span>
        <span className="opacity-50">·</span>
        <span><span className="text-foreground font-semibold">{draftCount}</span> draft</span>
        <span className="opacity-50">·</span>
        <span>last 7d hits column</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, layout, or rule…" className="w-full text-sm pl-8 pr-3 py-1.5 rounded border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40" />
          
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="text-sm px-2 py-1.5 rounded border border-border bg-card">
          
          <option value="all">All status</option>
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
          <option value="Draft">Draft</option>
          <option value="Archived">Archived</option>
        </select>
        <select value={abFilter} onChange={e => setAbFilter(e.target.value as AbFilter)} className="text-sm px-2 py-1.5 rounded border border-border bg-card">
          
          <option value="all">All A/B</option>
          <option value="inAb">In A/B test</option>
        </select>
        <div className="flex-1" />
        <button type="button" onClick={() => {
        const next: SortKey = sortKey === 'priority' ? 'hits' : sortKey === 'hits' ? 'name' : 'priority';
        setSortKey(next);
      }} className="text-sm px-2.5 py-1.5 rounded border border-border bg-card hover:bg-muted inline-flex items-center gap-1.5 transition-colors">
          
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">sort:</span>
          <span className="font-medium">{sortKey}</span>
        </button>
        <button onClick={onCreateTheme} className="sm:hidden inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded font-medium">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {loading ? <div className="bg-card border border-border rounded p-8 text-sm text-muted-foreground">Loading themes...</div> : error ? <div className="bg-card border border-border rounded p-8 text-sm text-destructive">{error.message}</div> : themes.length === 0 ? <EmptyState onClear={() => {
      setQuery('');
      setStatusFilter('all');
      setAbFilter('all');
    }} /> : <ul className="space-y-2">
          {themes.map(t => <li key={t.id} className="group flex items-center gap-3 px-3.5 py-3 bg-card border border-border rounded hover:border-foreground/20 hover:shadow-sm transition-all relative">
          
              <StatusRail status={t.status} />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                  <span className="text-[14px] font-semibold leading-tight">{t.name}</span>
                  {t.isDefault && <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                      default
                    </span>}
                  <span className="text-[11px] text-muted-foreground font-mono inline-flex items-center gap-1">
                    <Layers className="w-3 h-3" /> layout: {t.layout}
                  </span>
                  {t.ab && <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[var(--warning)]/15 text-[var(--warning)] inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      A/B {t.ab.weight}% vs {t.ab.vsName}
                    </span>}
                </div>
                <code className="text-[11.5px] text-muted-foreground font-mono truncate block max-w-full">
                  {t.rule}
                </code>
              </div>

              <div className="hidden md:flex items-center gap-1 shrink-0" aria-label="palette">
                {t.swatches.map((c, i) => <div key={i} className="w-4 h-4 rounded border border-border" style={{
            background: c
          }} title={c} aria-hidden />)}
              </div>

              <StatusPill status={t.status} />

              <span className="hidden sm:inline text-[12px] text-muted-foreground font-mono shrink-0 w-9 text-right">
                P{t.priority}
              </span>

              <span className="hidden md:inline text-[12px] text-muted-foreground shrink-0 w-16 text-right tabular-nums">
                {t.hits7d.toLocaleString()} hits
              </span>

              <span className="hidden lg:inline text-[11px] text-muted-foreground/80 shrink-0 w-20 text-right">
                {t.updatedAtLabel}
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => onEditTheme?.(t.id)} className="text-[12px] text-primary hover:underline px-2 py-1 inline-flex items-center gap-1" title="Edit theme">
              
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <div className="relative">
                  <button type="button" onClick={e => {
              e.stopPropagation();
              setOpenMenu(openMenu === t.id ? null : t.id);
            }} aria-label={`More actions for ${t.name}`} aria-expanded={openMenu === t.id} className="p-1 rounded hover:bg-muted">
                
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {openMenu === t.id && <>
                      <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} aria-hidden />
                
                      <div role="menu" className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-md shadow-md py-1 text-[13px] z-30">
                  
                        <MenuItem onClick={() => onDuplicateTheme?.(t.id)} icon={<Copy className="w-3.5 h-3.5" />}>Duplicate</MenuItem>
                        {t.status === 'Active' ? <MenuItem icon={<Pause className="w-3.5 h-3.5" />}>Pause</MenuItem> : <MenuItem icon={<Play className="w-3.5 h-3.5" />}>Activate</MenuItem>}
                        <MenuItem icon={<Sparkles className="w-3.5 h-3.5" />}>
                          Set as default
                        </MenuItem>
                        <div className="border-t border-border my-1" />
                        <MenuItem onClick={() => onDeleteTheme?.(t.id)} icon={<Trash2 className="w-3.5 h-3.5" />} tone="danger">
                          Delete
                        </MenuItem>
                      </div>
                    </>}
                </div>
              </div>
            </li>)}
        </ul>}

      <p className="mt-6 text-[11px] text-muted-foreground font-mono">
        Drag to reorder priority · default theme is used when no rule matches
      </p>
    </div>;
};
const StatusRail = ({
  status
}: {
  status: Status;
}) => {
  const color = status === 'Active' ? 'var(--success)' : status === 'Draft' ? 'var(--warning)' : status === 'Archived' ? 'var(--muted-foreground)' : 'var(--border)';
  return <div className="w-1 self-stretch rounded" style={{
    background: color
  }} aria-hidden />;
};
const StatusPill = ({
  status
}: {
  status: Status;
}) => {
  let bg: string;
  let fg: string;
  switch (status) {
    case 'Active':
      bg = 'color-mix(in oklab, var(--success) 18%, transparent)';
      fg = '#1f7a45';
      break;
    case 'Draft':
      bg = 'color-mix(in oklab, var(--warning) 18%, transparent)';
      fg = 'var(--warning)';
      break;
    case 'Archived':
      bg = 'var(--muted)';
      fg = 'var(--muted-foreground)';
      break;
    case 'Paused':
    default:
      bg = 'var(--muted)';
      fg = 'var(--muted-foreground)';
  }
  return <span className="text-[11px] px-1.5 py-0.5 rounded font-medium shrink-0 w-16 text-center" style={{
    background: bg,
    color: fg
  }}>
      
      {status}
    </span>;
};
const MenuItem = ({
  icon,
  onClick,
  tone,
  children
}: {
  icon: React.ReactNode;
  onClick?: () => void;
  tone?: 'danger';
  children: React.ReactNode;
}) => <button type="button" onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left ${tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}>
  
    {icon}
    {children}
  </button>;
const EmptyState = ({
  onClear
}: {
  onClear: () => void;
}) => <div className="border border-dashed border-border rounded py-14 text-center bg-card/40">
    <div className="text-[14px] font-medium">No themes match your filters</div>
    <p className="text-[12px] text-muted-foreground mt-1">
      Try clearing the search or filters — or start a new theme.
    </p>
    <button type="button" onClick={onClear} className="mt-4 text-[12px] text-primary hover:underline">
    
      Clear filters
    </button>
  </div>;
