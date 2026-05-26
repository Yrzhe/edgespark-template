import { useMemo, useState } from 'react';
import { FileText, Briefcase, Link2, Image as ImageIcon, Plus, Search, Star, EyeOff, Eye, Trash2, Mail, Globe } from 'lucide-react';
import { siX } from 'simple-icons';
type TabKey = 'bio' | 'projects' | 'socials' | 'images';
type BioBlurb = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  usedByThemes: number;
  updatedAtLabel: string;
};
type Project = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  url: string;
  tags: string[];
  status: 'active' | 'draft' | 'paused' | 'archived';
  featured?: boolean;
  imageThumbColor?: string;
};
type Social = {
  id: string;
  platform: 'github' | 'twitter' | 'email' | 'website';
  label: string;
  handle: string;
  active: boolean;
};
type Img = {
  id: string;
  alt: string;
  kind: 'avatar' | 'cover' | 'project' | 'inline';
  dims: string;
  byteSize: string;
  usedIn: number;
  thumbColor: string;
};
const BIO_SAMPLES: BioBlurb[] = import.meta.env.DEV ? [{
  id: 'b1',
  title: 'Builder one-liner',
  body: 'I build agent-native systems, templates, and small internet tools.',
  tags: ['builder', 'agents'],
  usedByThemes: 4,
  updatedAtLabel: '2d ago'
}, {
  id: 'b2',
  title: 'Long-form about',
  body: 'Based in Shanghai. I write at 心知 AI in Chinese and as Adrian in English. Most of what I ship lately is small templates for AI agents to host things on.',
  tags: ['about', 'long'],
  usedByThemes: 2,
  updatedAtLabel: '4d ago'
}, {
  id: 'b3',
  title: 'Current work note',
  body: 'Right now: Mockingbird — a visitor-adaptive personal site template.',
  tags: ['now'],
  usedByThemes: 3,
  updatedAtLabel: '15m ago'
}] : [];
const PROJECT_SAMPLES: Project[] = import.meta.env.DEV ? [{
  id: 'p1',
  title: 'Mockingbird',
  subtitle: 'Adaptive personal site template',
  description: 'Visitor-adaptive personal site, configurable themes, agent-native API.',
  url: 'https://github.com/Yrzhe/edgespark-template/tree/main/mockingbird',
  tags: ['template', 'edgespark', 'agent-native'],
  status: 'draft',
  featured: true,
  imageThumbColor: '#2556B6'
}, {
  id: 'p2',
  title: 'Arena',
  subtitle: 'Live trading arena',
  description: 'Spectator + voting front-end for any AI agent competition.',
  url: 'https://github.com/Yrzhe/edgespark-template/tree/main/arena',
  tags: ['template', 'live'],
  status: 'active',
  imageThumbColor: '#F36440'
}, {
  id: 'p3',
  title: 'Perch',
  subtitle: 'Agent-native link-in-bio',
  description: 'Multi-page link-in-bio with click + view analytics. SSR public pages.',
  url: 'https://github.com/Yrzhe/edgespark-template/tree/main/perch',
  tags: ['template'],
  status: 'active',
  imageThumbColor: '#48BB78'
}, {
  id: 'p4',
  title: 'Hatch',
  subtitle: 'Static-site host + BaaS',
  description: 'One-command static site host with a built-in backend.',
  url: 'https://github.com/Yrzhe/edgespark-template/tree/main/hatch',
  tags: ['template', 'foundation'],
  status: 'active',
  imageThumbColor: '#BC4E32'
}] : [];
const SOCIAL_SAMPLES: Social[] = import.meta.env.DEV ? [{
  id: 's1',
  platform: 'github',
  label: 'GitHub',
  handle: 'Yrzhe',
  active: true
}, {
  id: 's2',
  platform: 'twitter',
  label: 'X / Twitter',
  handle: 'yrzhe_top',
  active: true
}, {
  id: 's3',
  platform: 'email',
  label: 'Email',
  handle: 'love@yrzhe.space',
  active: true
}, {
  id: 's4',
  platform: 'website',
  label: '心知 AI (公众号)',
  handle: 'xinzhi-ai',
  active: false
}] : [];
const IMAGE_SAMPLES: Img[] = import.meta.env.DEV ? [{
  id: 'i1',
  alt: 'Owner portrait',
  kind: 'avatar',
  dims: '512×512',
  byteSize: '38 KB',
  usedIn: 2,
  thumbColor: '#F36440'
}, {
  id: 'i2',
  alt: 'Mockingbird cover',
  kind: 'cover',
  dims: '1600×900',
  byteSize: '210 KB',
  usedIn: 1,
  thumbColor: '#2556B6'
}, {
  id: 'i3',
  alt: 'Arena screenshot',
  kind: 'project',
  dims: '1200×800',
  byteSize: '156 KB',
  usedIn: 1,
  thumbColor: '#BC4E32'
}, {
  id: 'i4',
  alt: 'Perch screenshot',
  kind: 'project',
  dims: '1200×800',
  byteSize: '142 KB',
  usedIn: 1,
  thumbColor: '#48BB78'
}] : [];
const TABS: {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  count: number;
}[] = [];
type Props = {
  bioBlurbs?: BioBlurb[];
  projects?: Project[];
  socials?: Social[];
  images?: Img[];
  loading?: boolean;
  error?: Error | null;
};
export const ContentLibrary = ({
  bioBlurbs = [],
  projects = [],
  socials = [],
  images = [],
  loading = false,
  error = null
}: Props) => {
  const [tab, setTab] = useState<TabKey>('bio');
  const [query, setQuery] = useState('');
  const tabs = [{
    key: 'bio' as const,
    label: 'Bio blurbs',
    icon: FileText,
    count: bioBlurbs.length
  }, {
    key: 'projects' as const,
    label: 'Projects',
    icon: Briefcase,
    count: projects.length
  }, {
    key: 'socials' as const,
    label: 'Socials',
    icon: Link2,
    count: socials.length
  }, {
    key: 'images' as const,
    label: 'Images',
    icon: ImageIcon,
    count: images.length
  }];
  return <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 font-sans text-foreground">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Content</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Theme-agnostic source material. Themes pull from this pool — the LLM never invents
            facts outside of it.
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded font-medium hover:opacity-90 transition-opacity shrink-0">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New {tab === 'images' ? 'upload' : tab.slice(0, -1)}</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mt-5 mb-4 overflow-x-auto -mx-1 px-1">
        {tabs.map(t => {
        const Icon = t.icon;
        const isOn = tab === t.key;
        return <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={isOn ? 'page' : undefined} className={`relative px-3 py-2 text-[13px] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${isOn ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              
              <Icon className="w-3.5 h-3.5" />
              <span className="font-medium">{t.label}</span>
              <span className="text-[10.5px] font-mono opacity-70">{t.count}</span>
              {isOn && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
            </button>;
      })}
        <div className="flex-1" />
        <div className="relative hidden md:block w-56 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" className="w-full text-[12px] pl-7 pr-2 py-1 rounded border border-border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40" />
          
        </div>
      </div>

      {/* Tab body */}
      {loading && <div className="bg-card border border-border rounded p-8 text-sm text-muted-foreground">Loading content...</div>}
      {error && <div className="bg-card border border-border rounded p-8 text-sm text-destructive">{error.message}</div>}
      {!loading && !error && tab === 'bio' && <BioTab query={query} items={bioBlurbs.length ? bioBlurbs : BIO_SAMPLES} />}
      {!loading && !error && tab === 'projects' && <ProjectsTab query={query} items={projects.length ? projects : PROJECT_SAMPLES} />}
      {!loading && !error && tab === 'socials' && <SocialsTab items={socials.length ? socials : SOCIAL_SAMPLES} />}
      {!loading && !error && tab === 'images' && <ImagesTab items={images.length ? images : IMAGE_SAMPLES} />}
    </div>;
};

/* ─────────────────────────────────────── BIO TAB ─────────────────────────────────────── */

const BioTab = ({
  query,
  items
}: {
  query: string;
  items: BioBlurb[];
}) => {
  const list = useMemo(() => items.filter(b => !query || b.title.toLowerCase().includes(query.toLowerCase()) || b.body.toLowerCase().includes(query.toLowerCase())), [query, items]);
  if (list.length === 0) return <EmptyContent label="bio blurbs" />;
  return <ul className="space-y-2">
      {list.map(b => <li key={b.id} className="px-4 py-3 bg-card border border-border rounded hover:border-foreground/20 hover:shadow-sm transition-all">
        
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-semibold text-[14px]">{b.title}</div>
            <span className="text-[11px] text-muted-foreground font-mono shrink-0">
              used by {b.usedByThemes} themes · {b.updatedAtLabel}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{b.body}</p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {b.tags.map(t => <span key={t} className="text-[10.5px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {t}
              </span>)}
            <div className="flex-1" />
            <button className="text-[11.5px] text-primary hover:underline">Edit</button>
            <button className="text-[11.5px] text-destructive hover:underline">Delete</button>
          </div>
        </li>)}
    </ul>;
};

/* ─────────────────────────────────────── PROJECTS TAB ─────────────────────────────────────── */

const ProjectsTab = ({
  query,
  items
}: {
  query: string;
  items: Project[];
}) => {
  const list = useMemo(() => items.filter(p => !query || p.title.toLowerCase().includes(query.toLowerCase()) || p.description.toLowerCase().includes(query.toLowerCase())), [query, items]);
  if (list.length === 0) return <EmptyContent label="projects" />;
  return <ul className="space-y-2">
      {list.map(p => <li key={p.id} className="px-3.5 py-3 bg-card border border-border rounded hover:border-foreground/20 hover:shadow-sm transition-all flex items-start gap-3">
        
          <div className="w-14 h-14 rounded shrink-0 grid place-items-center text-card font-bold text-[20px] font-mono" style={{
        background: p.imageThumbColor ?? '#706B75'
      }}>
          
            {p.title.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                <span className="text-[14px] font-semibold">{p.title}</span>
                {p.featured && <span className="text-[10px] uppercase tracking-wider text-[var(--warning)] font-bold inline-flex items-center gap-1">
                    <Star className="w-3 h-3" /> featured
                  </span>}
                <StatusChip status={p.status} />
              </div>
              <span className="text-[11px] text-muted-foreground font-mono shrink-0 hidden sm:inline truncate max-w-[200px]">
                {p.url.replace(/^https?:\/\//, '')}
              </span>
            </div>
            {p.subtitle && <div className="text-[12px] text-muted-foreground italic mt-0.5">{p.subtitle}</div>}
            <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {p.tags.map(t => <span key={t} className="text-[10.5px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {t}
                </span>)}
              <div className="flex-1" />
              <button className="text-[11.5px] text-primary hover:underline">Edit</button>
              <button className="text-[11.5px] text-destructive hover:underline">Delete</button>
            </div>
          </div>
        </li>)}
    </ul>;
};
const StatusChip = ({
  status
}: {
  status: Project['status'];
}) => {
  const map: Record<Project['status'], {
    bg: string;
    fg: string;
  }> = {
    active: {
      bg: 'color-mix(in oklab, var(--success) 18%, transparent)',
      fg: '#1f7a45'
    },
    draft: {
      bg: 'color-mix(in oklab, var(--warning) 18%, transparent)',
      fg: 'var(--warning)'
    },
    paused: {
      bg: 'var(--muted)',
      fg: 'var(--muted-foreground)'
    },
    archived: {
      bg: 'var(--muted)',
      fg: 'var(--muted-foreground)'
    }
  };
  const {
    bg,
    fg
  } = map[status];
  return <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
    background: bg,
    color: fg
  }}>
      
      {status}
    </span>;
};

/* ─────────────────────────────────────── SOCIALS TAB ─────────────────────────────────────── */

const XIcon = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 24 24" role="img" aria-label="X"><path fill="currentColor" d={siX.path} /></svg>;
const SOCIAL_ICON: Record<Social['platform'], React.ComponentType<{ className?: string }>> = {
  github: Globe,
  twitter: XIcon,
  email: Mail,
  website: Globe
};
const SocialsTab = ({ items }: { items: Social[] }) => items.length === 0 ? <EmptyContent label="social links" /> : <ul className="space-y-2">
    {items.map(s => {
    const Icon = SOCIAL_ICON[s.platform];
    return <li key={s.id} className="px-3.5 py-3 bg-card border border-border rounded flex items-center gap-3 hover:border-foreground/20 transition-colors">
        
          <div className="w-9 h-9 rounded grid place-items-center bg-muted shrink-0">
            <Icon className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold">{s.label}</div>
            <div className="text-[11.5px] text-muted-foreground font-mono truncate">{s.handle}</div>
          </div>
          {s.active ? <span className="text-[10.5px] px-1.5 py-0.5 rounded font-medium" style={{
        background: 'color-mix(in oklab, var(--success) 18%, transparent)',
        color: '#1f7a45'
      }}>
              shown
            </span> : <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              hidden
            </span>}
          <button className="p-1 rounded hover:bg-muted" title={s.active ? 'Hide' : 'Show'}>
            {s.active ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <button className="text-[11.5px] text-primary hover:underline">Edit</button>
        </li>;
  })}
  </ul>;

/* ─────────────────────────────────────── IMAGES TAB ─────────────────────────────────────── */

const ImagesTab = ({ items }: { items: Img[] }) => <div>
    {items.length === 0 && <EmptyContent label="images" />}
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map(img => <div key={img.id} className="bg-card border border-border rounded overflow-hidden hover:border-foreground/20 transition-colors group">
      
          <div className="aspect-square w-full grid place-items-center text-card font-bold text-[28px] font-mono" style={{
        background: img.thumbColor
      }}>
        
            {img.alt.charAt(0).toUpperCase()}
          </div>
          <div className="p-2.5">
            <div className="text-[12.5px] font-semibold truncate">{img.alt}</div>
            <div className="text-[10.5px] text-muted-foreground font-mono mt-0.5 flex items-center justify-between">
              <span>{img.kind} · {img.dims}</span>
              <span>{img.byteSize}</span>
            </div>
            <div className="text-[10.5px] text-muted-foreground mt-1 flex items-center justify-between">
              <span>used in {img.usedIn}</span>
              <button className="hover:text-destructive" title="Delete" aria-label="Delete image">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>)}
      <button type="button" className="aspect-square border-2 border-dashed border-border rounded grid place-items-center text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors group">
      
        <div className="flex flex-col items-center gap-1.5">
          <Plus className="w-5 h-5" />
          <span className="text-[11px]">Upload</span>
        </div>
      </button>
    </div>
    <p className="mt-4 text-[11px] text-muted-foreground font-mono">
      R2 bucket: <span className="text-foreground">mockingbird-media</span> · presigned PUT/GET · max 5 MB each
    </p>
  </div>;
const EmptyContent = ({ label }: { label: string }) => <div className="bg-card border border-dashed border-border rounded p-8 text-sm text-muted-foreground">No {label} yet.</div>;
