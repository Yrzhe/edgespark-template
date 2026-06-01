import * as React from 'react';
import { Sparkles, LayoutGrid, Folder, Palette, ShieldCheck, Users, Plus, Bell, ChevronDown, Inbox, Settings, HelpCircle, Wand2, GalleryThumbnails, Pencil, ArrowUpRight, PanelLeftClose, PanelLeftOpen, Activity, type LucideIcon } from 'lucide-react';

/**
 * MagpieShell v2 — soft Bloome editorial admin shell.
 *
 * Replaces the original chrome-heavy shell with the same paper-cut + cream
 * editorial register used by CardLibrary, AssetLibrary and CardEditor.
 *
 *   • cream paper backdrop (no purple gradients, no glassmorphism)
 *   • paper-cut Magpie mark in the sidebar header (ink on coral)
 *   • lighter nav: no thick selection bars; ink dot + bold label for the active item
 *   • centered omnibar with kbd hint
 *   • soft hairline + drop-shadow chrome via .bloome-card / .bloome-card-hero
 *   • workspace area is a single bloome-card-hero "paper sheet" the inner view paints on
 *
 * The shell is layout-only: the inner workspace is `children` so the real
 * surfaces (CardLibrary, AssetLibrary, CardEditor) plug in unchanged.
 */

// ---------------------------------------------------------------------------
// Brand mark — Matisse paper-cut magpie head
// ---------------------------------------------------------------------------
const MagpieMark: React.FC<{
  size?: number;
}> = ({
  size = 36
}) => <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="select-none">
  
    {/* warm coral paper patch behind the bird */}
    <path d="M6 24 C 6 12, 18 6, 26 8 C 38 10, 44 18, 42 28 C 40 38, 28 42, 20 40 C 10 38, 6 32, 6 24 Z" fill="#F36440" opacity="0.92" />
  
    {/* tiny cream paper flake */}
    <path d="M34 11 C 38 11, 40 13, 38 16 C 36 18, 33 17, 33 14 Z" fill="#F7F5F1" opacity="0.85" />
    {/* magpie silhouette (paper-cut) */}
    <path d="M16 30 C 14 26, 16 22, 20 21 C 22 20, 24 18, 26 19 C 30 20, 33 24, 33 28 C 33 32, 30 35, 26 35 C 22 35, 18 33, 16 30 Z" fill="#0C0A0F" />
  
    {/* beak */}
    <path d="M33 26 L 39 25 L 33 28 Z" fill="#0C0A0F" />
    {/* eye dot */}
    <circle cx="29" cy="25" r="1.2" fill="#F7F5F1" />
    {/* hand-drawn squiggle whisker */}
    <path d="M14 33 C 16 34, 19 34, 21 33" stroke="#0C0A0F" strokeWidth="1.3" strokeLinecap="round" fill="none" />
  
  </svg>;

// ---------------------------------------------------------------------------
// Sidebar primitives
// ---------------------------------------------------------------------------

type NavId = 'cards' | 'assets' | 'editor' | 'palette' | 'rules' | 'team' | 'inbox' | 'admin';
type NavItem = {
  id: NavId;
  label: string;
  icon: LucideIcon;
  count?: number;
};
const NAV_PRIMARY: NavItem[] = [{
  id: 'cards',
  label: 'Cards',
  icon: LayoutGrid
}, {
  id: 'assets',
  label: 'Assets',
  icon: Folder
}, {
  id: 'editor',
  label: 'Editor',
  icon: Pencil
}];
const NAV_SECONDARY: NavItem[] = [{
  id: 'palette',
  label: 'Palette',
  icon: Palette
}, {
  id: 'rules',
  label: 'Brand rules',
  icon: ShieldCheck
}, {
  id: 'team',
  label: 'Team',
  icon: Users
}, {
  id: 'inbox',
  label: 'Requests',
  icon: Inbox
}, {
  id: 'admin',
  label: 'Admin',
  icon: Activity
}];
interface NavButtonProps {
  item: NavItem;
  active: boolean;
  onSelect: (id: NavId) => void;
  collapsed?: boolean;
}
const NavButton: React.FC<NavButtonProps> = ({
  item,
  active,
  onSelect,
  collapsed = false
}) => {
  const Icon = item.icon;
  return <button title={collapsed ? item.label : undefined} onClick={() => onSelect(item.id)} className={['group relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors', collapsed ? 'justify-center' : '', active ? 'bg-[#EEEAE0] text-[var(--foreground)]' : 'text-[#3C3742] hover:bg-[#F1ECE2] hover:text-[var(--foreground)]'].join(' ')}>
      
      <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      
      {!collapsed && <span className={['flex-1 text-left truncate', active ? 'font-semibold' : 'font-medium'].join(' ')}>
        
        {item.label}
      </span>}
      {!collapsed && typeof item.count === 'number' && <span className={['text-[10.5px] font-semibold tabular-nums px-1.5 py-0.5 rounded', active ? 'bg-white text-[var(--foreground)]' : 'bg-[#EEEAE0] text-[#706B75] group-hover:bg-white'].join(' ')}>
        
          {item.count}
        </span>}
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r bg-[#F36440]" aria-hidden />}
    </button>;
};

// ---------------------------------------------------------------------------
// Topbar omnibar
// ---------------------------------------------------------------------------

const Omnibar: React.FC<{ onSubmit?: (value: string) => void; busy?: boolean }> = ({ onSubmit, busy = false }) => {
  const [value, setValue] = React.useState('');
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = value.trim();
    if (!prompt || busy) return;
    onSubmit?.(prompt);
    setValue('');
  };
  return <form onSubmit={submit} className="w-full max-w-[560px]">
    <label htmlFor="magpie-omni" className="flex items-center gap-2 h-9 px-3 rounded-full bg-white border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] shadow-[0_1px_2px_rgba(12,10,15,0.04)] focus-within:border-[#2556B6] focus-within:shadow-[0_0_0_3px_rgba(37,86,182,0.12)] transition-all cursor-text">
      
      <Sparkles className="w-3.5 h-3.5 text-[#F36440] shrink-0" />
      <input id="magpie-omni" value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} placeholder={busy ? "Magpie is composing…" : "Ask Magpie to compose, derive, or find an asset…"} className="flex-1 bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[#A29B8B] outline-none" />
      
      <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-[#A29B8B] shrink-0">
        <kbd className="px-1.5 py-0.5 rounded border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] bg-[#F7F5F1]">
          ⌘
        </kbd>
        <kbd className="px-1.5 py-0.5 rounded border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] bg-[#F7F5F1]">
          K
        </kbd>
      </span>
    </label>
  </form>;
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  active: NavId;
  onSelect: (id: NavId) => void;
  runtimeStats?: { todayUsd: number; budgetUsd: number; provider?: string };
  counts?: Partial<Record<NavId, number>>;
  teamCount?: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSettings: () => void;
  isOwner?: boolean;
}
const Sidebar: React.FC<SidebarProps> = ({
  active,
  onSelect,
  runtimeStats,
  counts = {},
  teamCount = 1,
  collapsed,
  onToggleCollapsed,
  onSettings,
  isOwner = false
}) => {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const ratio = runtimeStats && runtimeStats.budgetUsd > 0
    ? Math.min(1, runtimeStats.todayUsd / runtimeStats.budgetUsd)
    : 0;
  const dotColor = ratio < 0.7 ? '#48BB78' : ratio < 0.9 ? '#F36440' : '#BC4E32';
  const dotShadow = ratio < 0.7
    ? '0 0 0 3px rgba(72, 187, 120, 0.18)'
    : ratio < 0.9
      ? '0 0 0 3px rgba(243, 100, 64, 0.18)'
      : '0 0 0 3px rgba(188, 78, 50, 0.18)';
  const statusLabel = ratio < 0.7 ? 'Runtime healthy' : ratio < 0.9 ? 'Approaching cap' : 'Cap nearly hit';
  const primary = NAV_PRIMARY.map((item) => ({ ...item, count: counts[item.id] }));
  const secondary = NAV_SECONDARY.filter((item) => item.id !== 'admin' || isOwner).map((item) => ({ ...item, count: counts[item.id] }));
  return <aside className={`${collapsed ? 'w-[56px]' : 'w-[228px]'} shrink-0 h-full flex flex-col bg-[#F7F5F1] border-r border-[color-mix(in_oklab,#0C0A0F_6%,transparent)] transition-[width] duration-200`}>
      {/* brand block */}
      <div className={`${collapsed ? 'px-2' : 'px-3.5'} pt-4 pb-3`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <button onClick={() => onSelect('cards')} className="rounded-md focus:outline-none focus:ring-2 focus:ring-[#2556B6]/30" aria-label="Open cards">
            <MagpieMark size={34} />
          </button>
          {!collapsed && <div className="flex flex-col leading-tight">
            <span className="text-[15px] text-[var(--foreground)]" style={{
            fontFamily: 'Inter, system-ui',
            fontWeight: 800,
            letterSpacing: '-0.01em'
          }}>
              
              Magpie
            </span>
            <span className="text-[10.5px] text-[#706B75]" style={{
            fontFamily: 'Caveat, cursive',
            fontWeight: 600,
            fontStyle: 'italic',
            fontSize: '13px',
            marginTop: '-2px'
          }}>
              
              brand-materials workbench
            </span>
          </div>}
        </div>
        {/* workspace switcher */}
        {!collapsed && <button className="mt-3 w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] hover:border-[color-mix(in_oklab,#0C0A0F_16%,transparent)] transition-colors text-left shadow-[0_1px_2px_rgba(12,10,15,0.04)]" aria-label="Switch workspace">
          
          <span className="w-5 h-5 rounded bg-[#0C0A0F] flex items-center justify-center text-[10px] text-white font-semibold">
            Y
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-[var(--foreground)] truncate">
              YouWare · Bloome
            </div>
            <div className="text-[10px] text-[#A29B8B] truncate">
              {teamCount} {teamCount === 1 ? 'member' : 'members'}
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-[#706B75]" />
        </button>}
        <button onClick={onToggleCollapsed} className={`${collapsed ? 'mt-3 mx-auto' : 'mt-2 ml-auto'} flex items-center justify-center w-8 h-8 rounded-md text-[#706B75] hover:bg-[#F1ECE2] hover:text-[var(--foreground)]`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* primary nav */}
      <div className="px-2.5">
        {!collapsed && <div className="px-1.5 pb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-[#A29B8B]">
          Workspace
        </div>}
        <nav className="flex flex-col gap-0.5">
          {primary.map(item => <NavButton key={item.id} item={item} active={active === item.id} onSelect={onSelect} collapsed={collapsed} />)}
        </nav>
      </div>

      <div className="px-2.5 mt-5">
        {!collapsed && <div className="px-1.5 pb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-[#A29B8B]">
          Brand &amp; team
        </div>}
        <nav className="flex flex-col gap-0.5">
          {secondary.map(item => <NavButton key={item.id} item={item} active={active === item.id} onSelect={onSelect} collapsed={collapsed} />)}
        </nav>
      </div>

      {/* spacer */}
      <div className="flex-1" />

      {/* AI runtime status */}
      {!collapsed && <div className="px-2.5 pb-3">
        <div className="bloome-card px-3 py-2.5 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{
            background: dotColor,
            boxShadow: dotShadow
          }} />

          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-[var(--foreground)]">
              {statusLabel}
            </div>
            <div className="text-[10px] text-[#706B75] truncate">
              {runtimeStats
                ? `${runtimeStats.provider ?? 'OpenAI'} · ${fmt(runtimeStats.todayUsd)} / ${fmt(runtimeStats.budgetUsd)} today`
                : 'OpenAI · loading…'}
            </div>
          </div>
          <ArrowUpRight className="w-3 h-3 text-[#A29B8B]" />
        </div>
      </div>}

      {/* footer utility */}
      <div className="px-2.5 pb-3 flex items-center gap-1">
        <button onClick={onSettings} className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-[#706B75] hover:bg-[#F1ECE2] hover:text-[var(--foreground)]" aria-label="Settings">
          <Settings className="w-3.5 h-3.5" />
          {!collapsed && 'Settings'}
        </button>
        {!collapsed && <button onClick={() => window.open('/llms.txt', '_blank', 'noopener,noreferrer')} className="flex items-center justify-center w-7 h-7 rounded-md text-[#706B75] hover:bg-[#F1ECE2] hover:text-[var(--foreground)]" aria-label="Help">
          <HelpCircle className="w-3.5 h-3.5" />
        </button>}
      </div>
    </aside>;
};

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

interface TopbarProps {
  active: NavId;
  onOmniSubmit?: (value: string) => void;
  omniBusy?: boolean;
  onNewCard?: () => void;
  onNewSession?: () => void;
  onSettings: () => void;
  onInbox?: () => void;
  inboxCount?: number;
  user?: { name: string | null; email: string };
  isOwner?: boolean;
}
const NAV_TITLES: Record<NavId, {
  title: string;
  sub: string;
}> = {
  cards: {
    title: 'Cards',
    sub: 'every card is a template — derive to start a family'
  },
  assets: {
    title: 'Assets',
    sub: 'central library · 30-day soft delete'
  },
  editor: {
    title: 'Editor',
    sub: 'compose layers, run agent, save with provenance'
  },
  palette: {
    title: 'Palette',
    sub: 'Bloome canonical seeded · agent imagegen defaults'
  },
  rules: {
    title: 'Brand rules',
    sub: 'palette · clearspace · letterform fidelity'
  },
  team: {
    title: 'Team',
    sub: '@youware.com + owner approval'
  },
  inbox: {
    title: 'Requests',
    sub: 'derive · approve · publish'
  },
  admin: {
    title: 'Admin',
    sub: 'events · audits · errors'
  }
};
const Topbar: React.FC<TopbarProps> = ({
  active,
  onOmniSubmit,
  omniBusy,
  onNewCard,
  onNewSession,
  onSettings,
  onInbox,
  inboxCount = 0,
  user
}) => {
  const meta = NAV_TITLES[active];
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'me';
  const initials = (() => {
    const src = (user?.name?.trim() || user?.email || '').replace(/[^a-zA-Z一-龥]/g, '');
    return src ? src.slice(0, 2).toUpperCase() : 'M';
  })();
  return <header className="shrink-0 h-[60px] flex items-center gap-4 px-5 bg-[#F7F5F1]/85 backdrop-blur-[6px] border-b border-[color-mix(in_oklab,#0C0A0F_6%,transparent)]">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col leading-tight min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[18px] text-[var(--foreground)] truncate" style={{
            fontFamily: 'Inter, system-ui',
            fontWeight: 800,
            letterSpacing: '-0.012em'
          }}>
              
              {meta.title}
            </h1>
            <span className="text-[14px] text-[#F36440]" style={{
            fontFamily: 'Caveat, cursive',
            fontWeight: 700,
            fontStyle: 'italic'
          }}>
              
              {active === 'cards' && 'a flock of templates'}
              {active === 'assets' && 'shelves of paper'}
              {active === 'editor' && 'paint &amp; paste'}
              {active === 'palette' && 'the family colors'}
              {active === 'rules' && 'gentle guardrails'}
              {active === 'team' && 'the magpies'}
              {active === 'inbox' && 'today’s asks'}
              {active === 'admin' && 'clear signals'}
            </span>
          </div>
          <span className="text-[11.5px] text-[#706B75] truncate">{meta.sub}</span>
        </div>
      </div>

      {/* omnibar */}
      <div className="flex-1 flex justify-center">
        <Omnibar onSubmit={onOmniSubmit} busy={omniBusy} />
      </div>

      {/* right cluster */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onNewSession} className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-full bg-white border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] hover:border-[color-mix(in_oklab,#0C0A0F_18%,transparent)] text-[12px] font-semibold text-[var(--foreground)] shadow-[0_1px_2px_rgba(12,10,15,0.04)] transition-colors">
          <Wand2 className="w-3.5 h-3.5 text-[#2556B6]" />
          New session
        </button>
        <button onClick={onNewCard} className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#0C0A0F] hover:bg-[#1c1820] text-white text-[12px] font-semibold shadow-[0_2px_6px_rgba(12,10,15,0.18)] transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New card
        </button>
        {inboxCount > 0 && <button onClick={onInbox} aria-label="Notifications" className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] hover:border-[color-mix(in_oklab,#0C0A0F_18%,transparent)] text-[var(--foreground)] shadow-[0_1px_2px_rgba(12,10,15,0.04)]">
          
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#F36440] text-white text-[9px] font-bold grid place-items-center">{inboxCount}</span>
        </button>}
        {/* avatar */}
        <button onClick={onSettings} className="flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-full bg-white border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] hover:border-[color-mix(in_oklab,#0C0A0F_18%,transparent)] shadow-[0_1px_2px_rgba(12,10,15,0.04)]" aria-label="Account">
          
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]" style={{
          background: 'linear-gradient(135deg,#F36440 0%,#BC4E32 100%)'
        }}>
            {initials}
          </span>
          <span className="hidden lg:inline text-[12px] font-semibold text-[var(--foreground)] max-w-[120px] truncate">
            {displayName}
          </span>
          <ChevronDown className="hidden lg:inline w-3 h-3 text-[#706B75]" />
        </button>
      </div>
    </header>;
};

// ---------------------------------------------------------------------------
// Workspace "paper sheet" — placeholder content used only when no children passed
// ---------------------------------------------------------------------------

const PLACEHOLDER_TILES: Array<{
  title: string;
  hint: string;
  icon: LucideIcon;
}> = [{
  title: 'IG story · Bloome teaser',
  hint: 'derived · 3h ago',
  icon: GalleryThumbnails
}, {
  title: 'Poster · cheese 4:5',
  hint: 'family · 6 children',
  icon: LayoutGrid
}, {
  title: 'WeChat banner · spring',
  hint: 'draft · failing palette',
  icon: Pencil
}, {
  title: 'X card · launch line',
  hint: 'agent run · pending review',
  icon: Sparkles
}];
const WorkspacePlaceholder: React.FC = () => <div className="p-6">
    {/* hero banner */}
    <div className="bloome-card-hero p-6 flex items-stretch gap-5 mb-5 overflow-hidden relative">
      <div className="flex-1 min-w-0 relative z-10">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[#706B75]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F36440]" />
          today · 2026-05-28
        </div>
        <h2 className="mt-1.5 text-[26px] text-[var(--foreground)] leading-[1.1]" style={{
        fontFamily: 'Inter, system-ui',
        fontWeight: 800,
        letterSpacing: '-0.018em'
      }}>
        
          Welcome back —
          <span className="ml-2 text-[#F36440]" style={{
          fontFamily: 'Caveat, cursive',
          fontWeight: 700,
          fontStyle: 'italic'
        }}>
          
            let&rsquo;s collage.
          </span>
        </h2>
        <p className="mt-1.5 text-[13px] text-[#3C3742] max-w-[460px] leading-relaxed">
          12 cards waiting on review, 3 derive requests from teammates, and the
          spring family is one banner away from done.
        </p>
        <div className="mt-3.5 flex items-center gap-2">
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#0C0A0F] text-white text-[12px] font-semibold hover:bg-[#1c1820]">
            <Sparkles className="w-3.5 h-3.5 text-[#F36440]" />
            Compose with agent
          </button>
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-[color-mix(in_oklab,#0C0A0F_10%,transparent)] text-[12px] font-semibold text-[var(--foreground)] hover:border-[color-mix(in_oklab,#0C0A0F_22%,transparent)]">
            <Folder className="w-3.5 h-3.5" />
            Open library
          </button>
        </div>
      </div>
      {/* paper-cut decoration */}
      <div className="relative w-[200px] hidden md:block">
        <svg viewBox="0 0 200 160" className="absolute inset-0 w-full h-full" aria-hidden>
        
          <path d="M30 80 C 30 50, 60 30, 90 32 C 130 36, 160 60, 158 100 C 156 130, 130 142, 100 138 C 60 132, 30 110, 30 80 Z" fill="#F36440" opacity="0.92" />
        
          <path d="M70 90 C 68 78, 78 68, 92 68 C 110 68, 124 80, 122 96 C 120 110, 104 116, 90 112 C 78 108, 72 100, 70 90 Z" fill="#0C0A0F" />
        
          <path d="M120 86 L 142 82 L 122 92 Z" fill="#0C0A0F" />
          <circle cx="110" cy="84" r="2" fill="#F7F5F1" />
          <path d="M50 120 C 70 124, 100 126, 130 122" stroke="#0C0A0F" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        
          <path d="M160 40 C 170 42, 174 48, 172 56" stroke="#0C0A0F" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        
        </svg>
      </div>
    </div>

    {/* recent tiles */}
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-[14px] text-[var(--foreground)]" style={{
      fontFamily: 'Inter, system-ui',
      fontWeight: 700,
      letterSpacing: '-0.005em'
    }}>
      
        Recent &amp; in-flight
      </h3>
      <button className="text-[11.5px] font-semibold text-[#2556B6] hover:underline">
        View all →
      </button>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {PLACEHOLDER_TILES.map((t, i) => {
      const Icon = t.icon;
      return <div key={i} className="bloome-card p-3.5 flex flex-col gap-2.5 hover:shadow-[0_4px_12px_rgba(12,10,15,0.08)] transition-shadow cursor-pointer">
          
            <div className="aspect-[4/3] rounded-md bg-[#F1ECE2] flex items-center justify-center relative overflow-hidden">
              <Icon className="w-6 h-6 text-[#A29B8B]" />
              <span className="absolute bottom-1.5 left-1.5 text-[9.5px] font-mono uppercase tracking-wider text-[#706B75] bg-white/70 px-1.5 py-0.5 rounded">
              
                {['9:16', '4:5', '16:9', '1.91:1'][i]}
              </span>
            </div>
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--foreground)] truncate">
                {t.title}
              </div>
              <div className="text-[10.5px] text-[#706B75] truncate">{t.hint}</div>
            </div>
          </div>;
    })}
    </div>
  </div>;

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export interface MagpieShellV2Props {
  /** Inner workspace content; falls back to a soft placeholder. */
  children?: React.ReactNode;
  /** Initial active nav id. */
  initialNav?: NavId;
  /** Notify parent when nav changes (so parent can swap children). */
  onNavChange?: (id: NavId) => void;
  onOmniSubmit?: (value: string) => void;
  omniBusy?: boolean;
  onNewCard?: () => void;
  onNewSession?: () => void;
  onSettings: () => void;
  onInbox?: () => void;
  runtimeStats?: { todayUsd: number; budgetUsd: number; provider?: string };
  counts?: Partial<Record<NavId, number>>;
  teamCount?: number;
  inboxCount?: number;
  user?: { name: string | null; email: string };
  isOwner?: boolean;
}
export const MagpieShellV2: React.FC<MagpieShellV2Props> = ({
  children,
  initialNav = 'cards',
  onNavChange,
  onOmniSubmit,
  omniBusy = false,
  onNewCard,
  onNewSession,
  onSettings,
  onInbox,
  runtimeStats,
  counts,
  teamCount = 1,
  inboxCount = 0,
  user,
  isOwner = false
}) => {
  const [active, setActive] = React.useState<NavId>(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [compactViewport, setCompactViewport] = React.useState(false);
  React.useEffect(() => setActive(initialNav), [initialNav]);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(max-width: 1180px)');
    const sync = () => setCompactViewport(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const handleSelect = React.useCallback((id: NavId) => {
    setActive(id);
    onNavChange?.(id);
  }, [onNavChange]);
  const effectiveCollapsed = collapsed || compactViewport;
  return <div className="h-screen w-full flex bg-[#F7F5F1] text-[var(--foreground)] overflow-hidden" style={{
    fontFamily: 'Inter, system-ui'
  }}>
      
      <Sidebar active={active} onSelect={handleSelect} runtimeStats={runtimeStats} counts={counts} teamCount={teamCount} collapsed={effectiveCollapsed} onToggleCollapsed={() => setCollapsed((value) => !value)} onSettings={onSettings} isOwner={isOwner} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar active={active} onOmniSubmit={onOmniSubmit} omniBusy={omniBusy} onNewCard={onNewCard} onNewSession={onNewSession} onSettings={onSettings} onInbox={onInbox} inboxCount={inboxCount} user={user} />

        {/* workspace paper sheet — children render here */}
        <main className={`flex-1 min-h-0 ${active === 'editor' ? 'overflow-hidden p-0' : 'overflow-auto px-5 pb-5 pt-4'}`}>
          <div className={`${active === 'editor' ? 'h-full overflow-hidden' : 'bloome-card-hero min-h-full overflow-hidden'}`}>
            {children ?? <WorkspacePlaceholder />}
          </div>
        </main>
      </div>
    </div>;
};
export default MagpieShellV2;
