import { useState, type ReactNode } from 'react';
import { Palette, FileText, Eye, BarChart3, Bot, ChevronDown, Menu, X } from 'lucide-react';
type NavKey = 'themes' | 'content' | 'preview' | 'analytics' | 'connect';
const NAV: {
  key: NavKey;
  label: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
}[] = [{
  key: 'themes',
  label: 'Themes',
  icon: Palette
}, {
  key: 'content',
  label: 'Content',
  icon: FileText
}, {
  key: 'preview',
  label: 'Preview',
  icon: Eye
}, {
  key: 'analytics',
  label: 'Analytics',
  icon: BarChart3
}, {
  key: 'connect',
  label: 'Connect AI',
  icon: Bot
}];
type Props = {
  /** Active nav key (controlled). Defaults to 'themes' for canvas preview. */
  active?: NavKey;
  onNavigate?: (key: NavKey) => void;
  ownerName?: string;
  ownerEmail?: string;
  onSignOut?: () => void;
  children?: ReactNode;
};
export const MockingbirdAdminShell = ({
  active: activeProp,
  onNavigate,
  ownerName = 'yrzhe',
  ownerEmail = 'love@yrzhe.space',
  onSignOut,
  children
}: Props) => {
  const [activeInner, setActiveInner] = useState<NavKey>('themes');
  const active = activeProp ?? activeInner;
  const setActive = (key: NavKey) => {
    if (onNavigate) onNavigate(key);else setActiveInner(key);
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountInitial = ownerName.trim().charAt(0).toUpperCase() || 'A';
  return <div className="min-h-screen w-full bg-background text-foreground flex flex-col font-sans">
      {/* Topbar */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 relative z-30 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" aria-label="Toggle menu" aria-expanded={mobileOpen} className="md:hidden p-2 -ml-2 rounded hover:bg-muted active:bg-muted/70 transition-colors" onClick={() => setMobileOpen(o => !o)}>
            
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none" aria-hidden>🪶</span>
            <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
              Mockingbird
            </span>
            <span className="hidden sm:inline-block text-[11px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono">
              admin
            </span>
          </div>
        </div>

        <div className="relative">
          <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(o => !o)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded hover:bg-muted text-sm transition-colors">
            
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
              {accountInitial}
            </div>
            <span className="hidden sm:inline font-medium">{ownerName}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          {accountOpen && <>
              <div className="fixed inset-0 z-20" onClick={() => setAccountOpen(false)} aria-hidden />
            
              <div role="menu" className="absolute right-0 top-full mt-1 w-60 bg-card border border-border rounded-md shadow-sm py-1 text-sm z-30">
              
                <div className="px-3 py-2 border-b border-border">
                  <div className="font-medium leading-tight">{ownerName}</div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{ownerEmail}</div>
                </div>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted">Display name</button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted">Avatar</button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted">Change password</button>
                <div className="border-t border-border my-1" />
                <button onClick={onSignOut} className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive">
                  Logout
                </button>
              </div>
            </>}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar — desktop */}
        <aside className="hidden md:flex w-[228px] shrink-0 flex-col border-r border-border bg-sidebar">
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {NAV.map(item => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return <button key={item.key} type="button" onClick={() => setActive(item.key)} aria-current={isActive ? 'page' : undefined} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] text-left transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`}>
                  
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                  {isActive && <span className="ml-auto w-1 h-4 rounded-full bg-sidebar-primary" />}
                </button>;
          })}
          </nav>
          <div className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground font-mono leading-relaxed">
            <div className="text-foreground/70">v0.1.0 · Phase 1</div>
            <div className="mt-1 truncate">/api/public/llms.txt</div>
          </div>
        </aside>

        {/* Sidebar — mobile drawer */}
        {mobileOpen && <>
            <div className="md:hidden fixed inset-0 bg-foreground/30 z-20" onClick={() => setMobileOpen(false)} aria-hidden />
          
            <aside className="md:hidden fixed left-0 top-14 bottom-0 w-[260px] z-30 bg-sidebar border-r border-border flex flex-col shadow-lg">
              <nav className="flex-1 py-3 px-2 space-y-0.5">
                {NAV.map(item => {
              const Icon = item.icon;
              const isActive = active === item.key;
              return <button key={item.key} type="button" onClick={() => {
                setActive(item.key);
                setMobileOpen(false);
              }} aria-current={isActive ? 'page' : undefined} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`}>
                    
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>;
            })}
              </nav>
              <div className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground font-mono">
                v0.1.0 · Phase 1
              </div>
            </aside>
          </>}

        {/* Content slot */}
        <main className="flex-1 overflow-auto min-w-0">
          <div className="px-4 md:px-8 py-6 max-w-[1200px]">
            {children}
          </div>
        </main>
      </div>
    </div>;
};
