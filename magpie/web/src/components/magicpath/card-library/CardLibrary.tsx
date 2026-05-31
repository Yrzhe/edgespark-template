import { useMemo, useState } from 'react';
import { Search, Plus, Grid3x3, Layers } from 'lucide-react';
export type Ratio = '9:16' | '1:1' | '16:9' | '4:5' | '1.91:1' | 'custom';
export type LibraryCard = {
  id: string;
  rootId: string; // family root id (== id for roots)
  parentId: string | null;
  title: string;
  ratio: Ratio;
  widthPx: number;
  heightPx: number;
  bg: string; // preview bg color from card's primary
  fg: string; // accent color
  creator: {
    name: string;
    initial: string;
  };
  createdAtLabel: string;
  derivativesCount: number; // direct + transitive (for roots only)
  status: 'draft' | 'ready' | 'pinned';
  description?: string; // hidden from main card chrome, used for search
};

// One family root + its derivatives form a folder. Roots show as big tiles; derivatives shown
// as small stacked thumbs in the lower-right corner.
export type CardFamily = {
  root: LibraryCard;
  derivatives: LibraryCard[]; // direct descendants (showing up to 4 in the stack)
};
const SAMPLE_FAMILIES: CardFamily[] = [{
  root: {
    id: 'c_arena_olympics',
    rootId: 'c_arena_olympics',
    parentId: null,
    title: 'Arena Olympics · Season 2',
    ratio: '9:16',
    widthPx: 1080,
    heightPx: 1920,
    bg: '#2556B6',
    fg: '#F36440',
    creator: {
      name: 'Jin',
      initial: 'J'
    },
    createdAtLabel: '2m ago',
    derivativesCount: 4,
    status: 'pinned'
  },
  derivatives: [{
    id: 'c_ao_2',
    rootId: 'c_arena_olympics',
    parentId: 'c_arena_olympics',
    title: 'Tighter text',
    ratio: '9:16',
    widthPx: 1080,
    heightPx: 1920,
    bg: '#2556B6',
    fg: '#F36440',
    creator: {
      name: 'Jin',
      initial: 'J'
    },
    createdAtLabel: '3m',
    derivativesCount: 0,
    status: 'ready'
  }, {
    id: 'c_ao_3',
    rootId: 'c_arena_olympics',
    parentId: 'c_arena_olympics',
    title: 'IG 1:1 crop',
    ratio: '1:1',
    widthPx: 1080,
    heightPx: 1080,
    bg: '#2556B6',
    fg: '#F36440',
    creator: {
      name: 'Marco',
      initial: 'M'
    },
    createdAtLabel: '5m',
    derivativesCount: 0,
    status: 'ready'
  }, {
    id: 'c_ao_4',
    rootId: 'c_arena_olympics',
    parentId: 'c_ao_2',
    title: 'Season 2 · navy',
    ratio: '9:16',
    widthPx: 1080,
    heightPx: 1920,
    bg: '#0C0A0F',
    fg: '#F36440',
    creator: {
      name: 'Ana',
      initial: 'A'
    },
    createdAtLabel: '8m',
    derivativesCount: 0,
    status: 'draft'
  }, {
    id: 'c_ao_5',
    rootId: 'c_arena_olympics',
    parentId: 'c_ao_3',
    title: 'IG cream variant',
    ratio: '1:1',
    widthPx: 1080,
    heightPx: 1080,
    bg: '#F7F5F1',
    fg: '#F36440',
    creator: {
      name: 'Ren',
      initial: 'R'
    },
    createdAtLabel: '11m',
    derivativesCount: 0,
    status: 'ready'
  }]
}, {
  root: {
    id: 'c_bloome_mobile',
    rootId: 'c_bloome_mobile',
    parentId: null,
    title: 'Bloome on Mobile · hero',
    ratio: '1:1',
    widthPx: 1080,
    heightPx: 1080,
    bg: '#F7F5F1',
    fg: '#F36440',
    creator: {
      name: 'Marco',
      initial: 'M'
    },
    createdAtLabel: '1h ago',
    derivativesCount: 2,
    status: 'ready'
  },
  derivatives: [{
    id: 'c_bm_2',
    rootId: 'c_bloome_mobile',
    parentId: 'c_bloome_mobile',
    title: 'Story crop',
    ratio: '9:16',
    widthPx: 1080,
    heightPx: 1920,
    bg: '#F7F5F1',
    fg: '#F36440',
    creator: {
      name: 'Marco',
      initial: 'M'
    },
    createdAtLabel: '50m',
    derivativesCount: 0,
    status: 'ready'
  }, {
    id: 'c_bm_3',
    rootId: 'c_bloome_mobile',
    parentId: 'c_bloome_mobile',
    title: 'Wechat banner',
    ratio: '16:9',
    widthPx: 1200,
    heightPx: 675,
    bg: '#F7F5F1',
    fg: '#F36440',
    creator: {
      name: 'Ana',
      initial: 'A'
    },
    createdAtLabel: '40m',
    derivativesCount: 0,
    status: 'ready'
  }]
}, {
  root: {
    id: 'c_bull_run',
    rootId: 'c_bull_run',
    parentId: null,
    title: 'Bull Run or Bust',
    ratio: '9:16',
    widthPx: 1080,
    heightPx: 1920,
    bg: '#0C0A0F',
    fg: '#F36440',
    creator: {
      name: 'Marco',
      initial: 'M'
    },
    createdAtLabel: '4h ago',
    derivativesCount: 0,
    status: 'draft'
  },
  derivatives: []
}, {
  root: {
    id: 'c_ai_trading',
    rootId: 'c_ai_trading',
    parentId: null,
    title: 'AI Trading Competition · X card',
    ratio: '16:9',
    widthPx: 1200,
    heightPx: 675,
    bg: '#BC4E32',
    fg: '#FFF8EF',
    creator: {
      name: 'Ana',
      initial: 'A'
    },
    createdAtLabel: '3h ago',
    derivativesCount: 1,
    status: 'ready'
  },
  derivatives: [{
    id: 'c_ait_2',
    rootId: 'c_ai_trading',
    parentId: 'c_ai_trading',
    title: 'WeChat banner',
    ratio: '16:9',
    widthPx: 1200,
    heightPx: 675,
    bg: '#BC4E32',
    fg: '#FFF8EF',
    creator: {
      name: 'Ana',
      initial: 'A'
    },
    createdAtLabel: '3h',
    derivativesCount: 0,
    status: 'ready'
  }]
}];
type RatioFilter = 'all' | Ratio;
type StatusFilter = 'all' | 'draft' | 'ready' | 'pinned';
type View = 'families' | 'flat';
export type CardLibraryProps = {
  families: CardFamily[];
  loading?: boolean;
  error?: string | null;
  onOpenCard?: (cardId: string) => void;
  onNewCard?: () => void;
  onDeriveCard?: (cardId: string) => void;
};
export const CardLibrary = ({
  families: sourceFamilies,
  loading = false,
  error = null,
  onOpenCard,
  onNewCard,
  onDeriveCard
}: CardLibraryProps) => {
  const [query, setQuery] = useState('');
  const [ratio, setRatio] = useState<RatioFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [view, setView] = useState<View>('families');
  const allFamilies = sourceFamilies.length > 0 ? sourceFamilies : import.meta.env.DEV ? SAMPLE_FAMILIES : [];
  const families = useMemo(() => {
    return allFamilies.filter(f => {
      if (query) {
        const q = query.toLowerCase();
        if (!f.root.title.toLowerCase().includes(q) && !f.derivatives.some(d => d.title.toLowerCase().includes(q))) return false;
      }
      if (ratio !== 'all' && f.root.ratio !== ratio) return false;
      if (status !== 'all' && f.root.status !== status) return false;
      return true;
    });
  }, [allFamilies, query, ratio, status]);
  const totalCards = allFamilies.reduce((s, f) => s + 1 + f.derivatives.length, 0);
  return <div className="w-full min-h-dvh bg-background text-foreground font-sans relative">
      {/* paper-grain backdrop */}
      <PaperBackdrop />

      <div className="relative w-full max-w-[1280px] mx-auto px-5 md:px-8 py-6">

        {/* Editorial header — dense product chrome, not a marketing hero (M-222) */}
        <header className="mb-5">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-[var(--accent)] font-mono">
              ◐ Library
            </span>
            <span className="text-[10.5px] text-muted-foreground/70 font-mono">
              · {allFamilies.length} families · {totalCards} cards total
            </span>
          </div>
          <h1 className="text-[22px] md:text-[26px] font-[800] leading-[1.1] tracking-tight text-balance">
            What the team made
            <span className="inline-block ml-2 relative">
              <span className="italic font-light">today.</span>
              <UnderlineSquiggle />
            </span>
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-[60ch] text-pretty">
            Cards group by family. Derive from any card and your version sits next to it.
            Make something new and it starts its own family.
          </p>
        </header>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a card by title…" className="w-full text-[13px] pl-8 pr-3 py-1.5 rounded bg-card border border-[var(--input)] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-ring/30" />
            
          </div>

          <select value={ratio} onChange={e => setRatio(e.target.value as RatioFilter)} className="text-[12.5px] px-2.5 py-1.5 rounded bg-card border border-[var(--input)] font-mono">
            <option value="all">all ratios</option>
            <option value="9:16">9:16 story</option>
            <option value="1:1">1:1 post</option>
            <option value="16:9">16:9 banner</option>
            <option value="4:5">4:5 poster</option>
            <option value="1.91:1">1.91:1 X card</option>
            <option value="custom">custom</option>
          </select>

          <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)} className="text-[12.5px] px-2.5 py-1.5 rounded bg-card border border-[var(--input)] font-mono">
            <option value="all">any status</option>
            <option value="pinned">pinned</option>
            <option value="ready">ready</option>
            <option value="draft">draft</option>
          </select>

          <div className="flex-1" />

          {/* View toggle */}
          <div className="inline-flex rounded-md overflow-hidden bg-card border border-[var(--border-subtle)]">
            <button onClick={() => setView('families')} className={`px-2.5 py-1.5 text-[12px] inline-flex items-center gap-1 ${view === 'families' ? 'bg-[var(--primary)] text-primary-foreground' : 'hover:bg-muted'}`}>
              <Layers className="w-3 h-3" /> Families
            </button>
            <button onClick={() => setView('flat')} className={`px-2.5 py-1.5 text-[12px] inline-flex items-center gap-1 ${view === 'flat' ? 'bg-[var(--primary)] text-primary-foreground' : 'hover:bg-muted'}`}>
              <Grid3x3 className="w-3 h-3" /> All cards
            </button>
          </div>

          <button onClick={onNewCard} className="inline-flex items-center gap-1.5 bg-[var(--primary)] text-primary-foreground text-[13px] px-3.5 py-1.5 rounded-md font-semibold hover:opacity-90 transition-opacity shadow-[0_1px_2px_rgba(12,10,15,0.08)]">
            <Plus className="w-3.5 h-3.5" />
            New card
          </button>
        </div>

        {loading && <div className="bloome-card px-4 py-3 mb-4 text-[12.5px] text-muted-foreground">Loading cards...</div>}
        {error && <div className="bloome-card px-4 py-3 mb-4 text-[12.5px] text-[var(--destructive)]">{error}</div>}

        {/* Families grid — masonry-ish 3 wide */}
        {families.length === 0 ? <EmptyState onClear={() => {
        setQuery('');
        setRatio('all');
        setStatus('all');
      }} /> : view === 'families' ? <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {families.map(f => <li key={f.root.id}>
                <FamilyTile family={f} onOpenCard={onOpenCard} onDeriveCard={onDeriveCard} />
              </li>)}
          </ul> : <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {families.flatMap(f => [f.root, ...f.derivatives]).map(c => <li key={c.id}>
                <FlatCardTile card={c} onOpenCard={onOpenCard} onDeriveCard={onDeriveCard} />
              </li>)}
          </ul>}

        <FooterScribble />
      </div>
    </div>;
};
const FamilyTile = ({
  family,
  onOpenCard,
  onDeriveCard
}: {
  family: CardFamily;
  onOpenCard?: (cardId: string) => void;
  onDeriveCard?: (cardId: string) => void;
}) => {
  const {
    root,
    derivatives
  } = family;
  // pick up to 4 derivative thumbs to stack
  const stack = derivatives.slice(0, 4);
  return <article className="group relative">
      {/* Stacked derivative shadows behind */}
      {stack.slice(0, 3).map((d, i) => <div key={d.id} aria-hidden className="absolute rounded-lg transition-transform" style={{
      inset: 0,
      background: d.bg,
      transform: `translate(${(i + 1) * 5}px, ${(i + 1) * 5}px) rotate(${(i + 1) * 0.5}deg)`,
      zIndex: -(i + 1),
      opacity: (1 - i * 0.22) * 0.85,
      boxShadow: '0 1px 3px rgba(12,10,15,0.08)'
    }} />)}
      {/* Root card */}
      <button onClick={() => onOpenCard?.(root.id)} onContextMenu={e => {
        e.preventDefault();
        if (window.confirm('Derive a new card from this family root?')) onDeriveCard?.(root.id);
      }} className="relative bloome-card-hero overflow-hidden hover:translate-y-[-2px] transition-transform w-full text-left">
        
        <RootPreview card={root} />
        <div className="px-3.5 py-2.5 bg-card">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <div className="text-[13px] font-bold leading-tight truncate min-w-0">{root.title}</div>
            <StatusDot status={root.status} />
          </div>
          <div className="flex items-baseline justify-between text-[10.5px] text-muted-foreground font-mono">
            <div className="flex items-baseline gap-2 min-w-0 truncate">
              <span className="inline-grid place-items-center w-3.5 h-3.5 rounded-full bg-[var(--primary)] text-primary-foreground text-[8px] font-bold">{root.creator.initial}</span>
              <span>{root.createdAtLabel}</span>
              <span>·</span>
              <span>{root.ratio}</span>
            </div>
            {derivatives.length > 0 && <span className="text-[var(--accent)] font-semibold inline-flex items-center gap-0.5 whitespace-nowrap">
                +{derivatives.length} derivatives
              </span>}
          </div>
        </div>
      </button>
    </article>;
};
const FlatCardTile = ({
  card,
  onOpenCard,
  onDeriveCard
}: {
  card: LibraryCard;
  onOpenCard?: (cardId: string) => void;
  onDeriveCard?: (cardId: string) => void;
}) => <button onClick={() => onOpenCard?.(card.id)} onContextMenu={e => {
  e.preventDefault();
  if (window.confirm('Derive a new card from this card?')) onDeriveCard?.(card.id);
}} className="bloome-card overflow-hidden hover:translate-y-[-1px] transition-all w-full text-left">
    <div className="relative" style={{
    background: card.bg,
    aspectRatio: '4 / 5'
  }}>
      <CardPreviewArt card={card} compact />
      <span className="absolute top-1.5 left-1.5 text-[9.5px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-[#FFF8EF] text-[#0C0A0F] border border-[#0C0A0F]">
        {card.ratio}
      </span>
      {card.parentId && <span className="absolute top-1.5 right-1.5 text-[9.5px] font-mono px-1 py-0.5 rounded bg-[#FFF8EF] text-[#0C0A0F] border border-[#0C0A0F]">
          derived
        </span>}
    </div>
    <div className="px-2.5 py-2">
      <div className="text-[12px] font-semibold truncate">{card.title}</div>
      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{card.creator.name} · {card.createdAtLabel}</div>
    </div>
  </button>;
const RootPreview = ({
  card
}: {
  card: LibraryCard;
}) => <div className="relative" style={{
  background: card.bg,
  aspectRatio: '4 / 3'
}}>
    <CardPreviewArt card={card} />
    <span className="absolute top-2 left-2 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FFF8EF] text-[#0C0A0F] border border-[#0C0A0F]">
      {card.ratio} · {card.widthPx}×{card.heightPx}
    </span>
  </div>;
const StatusDot = ({
  status
}: {
  status: LibraryCard['status'];
}) => {
  if (status === 'pinned') {
    return <span className="text-[9.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded text-[var(--primary)] border border-[var(--primary)] bg-[var(--primary)]/[0.05]">pinned</span>;
  }
  if (status === 'draft') {
    return <span className="text-[9.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded text-[var(--accent)] bg-[var(--accent)]/[0.12]">draft</span>;
  }
  return <span className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--success)]">● ready</span>;
};
const CardPreviewArt = ({
  card,
  compact = false
}: {
  card: LibraryCard;
  compact?: boolean;
}) => {
  const isLight = card.bg === '#F7F5F1' || card.bg === '#FFFFFF' || card.bg === '#FFF8EF';
  const wordmarkOpacity = isLight ? 0.08 : 0.12;
  return <svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice" className="w-full h-full" aria-hidden>
      {/* Big BLOOME letter */}
      <text x="160" y="220" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="220" fill={isLight ? '#0C0A0F' : '#FFFFFF'} opacity={wordmarkOpacity} letterSpacing="-10">B</text>
      {/* Matisse coral cutout figures */}
      <g transform={`translate(70, ${compact ? 60 : 70})`}>
        <circle cx="0" cy="0" r={compact ? 12 : 18} fill={card.fg} stroke="#0C0A0F" strokeWidth="2" />
        <path d={compact ? "M -16 16 Q 0 28 16 16 L 16 50 L -16 50 Z" : "M -22 22 Q 0 38 22 22 L 22 70 L -22 70 Z"} fill={card.fg} stroke="#0C0A0F" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <g transform={`translate(160, ${compact ? 80 : 90})`}>
        <circle cx="0" cy="0" r={compact ? 12 : 18} fill={card.fg} stroke="#0C0A0F" strokeWidth="2" />
        <path d={compact ? "M -16 16 Q 0 28 16 16 L 16 50 L -16 50 Z" : "M -22 22 Q 0 38 22 22 L 22 70 L -22 70 Z"} fill={card.fg} stroke="#0C0A0F" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <g transform={`translate(250, ${compact ? 60 : 70})`}>
        <circle cx="0" cy="0" r={compact ? 12 : 18} fill={card.fg} stroke="#0C0A0F" strokeWidth="2" />
        <path d={compact ? "M -16 16 Q 0 28 16 16 L 16 50 L -16 50 Z" : "M -22 22 Q 0 38 22 22 L 22 70 L -22 70 Z"} fill={card.fg} stroke="#0C0A0F" strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* sprouts scribble */}
      <path d={compact ? "M 30 200 Q 35 188 44 196" : "M 30 215 Q 38 200 50 208"} fill="none" stroke={isLight ? '#0C0A0F' : '#FFFFFF'} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d={compact ? "M 280 200 Q 286 188 296 196" : "M 270 215 Q 280 200 290 208"} fill="none" stroke={isLight ? '#0C0A0F' : '#FFFFFF'} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>;
};
const UnderlineSquiggle = () => <svg className="absolute left-0 right-0 -bottom-1" height="10" width="100%" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden>
    <path d="M 2 6 Q 25 1, 50 6 T 100 6 T 150 6 T 198 6" fill="none" stroke="#F36440" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
const PaperBackdrop = () => <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" aria-hidden>
    <defs>
      <pattern id="paper-dot" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.8" fill="#0C0A0F" fillOpacity="0.06" />
      </pattern>
      <radialGradient id="paper-warm" cx="20%" cy="0%" r="80%">
        <stop offset="0%" stopColor="#FFF8E7" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#FFF8E7" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#paper-dot)" />
    <rect width="100%" height="100%" fill="url(#paper-warm)" />
  </svg>;
const EmptyState = ({
  onClear
}: {
  onClear: () => void;
}) => <div className="relative bg-card border-2 border-dashed border-[var(--border)] rounded-md py-14 text-center">
    {/* Matisse bird */}
    <svg width="80" height="80" viewBox="0 0 200 200" className="mx-auto mb-3" aria-hidden>
      <path d="M 30 100 Q 50 60 110 70 L 150 50 L 165 75 Q 175 80 165 95 L 170 110 L 150 130 Q 110 140 80 130 L 50 145 Z" fill="#F36440" stroke="#0C0A0F" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="148" cy="78" r="2.5" fill="#0C0A0F" />
      <path d="M 70 165 Q 85 155 100 165 M 110 175 Q 125 165 138 175" fill="none" stroke="#0C0A0F" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <div className="text-[16px] font-bold">Nothing to show yet</div>
    <p className="text-[12.5px] text-muted-foreground mt-1 max-w-[36ch] mx-auto">
      No cards match your filters. Adjust the search, or start a brand new card.
    </p>
    <button onClick={onClear} className="mt-3 text-[12px] text-[var(--primary)] hover:underline">
      Clear filters
    </button>
  </div>;
const FooterScribble = () => <div className="mt-8 text-center text-[11px] text-muted-foreground font-mono inline-flex items-center gap-2 justify-center w-full">
    <span>—</span>
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden>
      <path d="M 2 7 Q 7 2 14 7 T 26 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <span>cards group by family · derivatives sit beside the root</span>
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden>
      <path d="M 2 7 Q 7 2 14 7 T 26 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <span>—</span>
  </div>;
