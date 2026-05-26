import type { BlockKey } from '@/lib/types';

export const blockSchema: BlockKey[] = ['hero-name', 'hero-intro', 'about-short', 'now-short', 'featured-title', 'featured-blurb', 'project-<id>-title', 'project-<id>-blurb'];

/**
 * GalleryThemePage — public theme page (Gallery layout).
 * Triggers: referrer~/xiaohongshu|instagram/ OR device==mobile.
 * Visual: mobile-first card grid · Bloome palette (coral + navy border + cream)
 * + handwritten heading (Gaegu/Caveat) + Inter body. Editorial, hand-made.
 * Stable text containers — LLM rewrites slots, layout never shifts.
 */

type Project = {
  id: string;
  title: string;
  blurb: string;
  emoji?: string;
  badge?: string;
};
type Props = {
  ownerName?: string;
  intro?: string;
  aboutShort?: string;
  nowShort?: string;
  featured?: Project;
  projects?: Project[];
  socials?: {
    label: string;
    url: string;
    emoji?: string;
  }[];
  bg?: string;
  fg?: string;
  accent?: string;
  border?: string;
};
const DEFAULTS = {
  ownerName: 'yrzhe',
  intro: 'A playful version, made for you 🪶',
  aboutShort: 'Builder in Shanghai. I make small AI-agent-native templates.',
  nowShort: 'Shipping Mockingbird — adaptive personal site you’re looking at.',
  featured: {
    id: 'feat',
    title: 'Arena — vote on AI agents',
    blurb: 'Live trading arena with crowd voting + comments. Real-time, real money agents.',
    badge: 'shipped'
  } as Project,
  projects: [{
    id: 'p1',
    title: 'Mockingbird',
    blurb: 'adaptive personal site',
    emoji: '🪶'
  }, {
    id: 'p2',
    title: 'Perch',
    blurb: 'agent-native link-in-bio',
    emoji: '🐦'
  }, {
    id: 'p3',
    title: 'Hatch',
    blurb: 'one-command site host + BaaS',
    emoji: '🐣'
  }, {
    id: 'p4',
    title: '心知 AI',
    blurb: '我的中文 AI 内容专栏',
    emoji: '✍️'
  }] as Project[],
  socials: [{
    label: 'email',
    url: 'love@yrzhe.space',
    emoji: '✉️'
  }, {
    label: 'x',
    url: '@yrzhe_top',
    emoji: '🐦'
  }, {
    label: 'github',
    url: '@Yrzhe',
    emoji: '👾'
  }, {
    label: '小红书',
    url: 'yrzhe',
    emoji: '📕'
  }]
};
export const GalleryThemePage = ({
  ownerName = DEFAULTS.ownerName,
  intro = DEFAULTS.intro,
  aboutShort = DEFAULTS.aboutShort,
  nowShort = DEFAULTS.nowShort,
  featured = DEFAULTS.featured,
  projects = DEFAULTS.projects,
  socials = DEFAULTS.socials,
  bg = '#F7F5F1',
  fg = '#0C0A0F',
  accent = '#F36440',
  border = '#2556B6'
}: Props) => {
  const muted = `${fg}99`;
  return <main className="min-h-screen w-full" style={{
    background: bg,
    color: fg,
    fontFamily: "'Inter', system-ui, sans-serif"
  }}>
      
      <div className="max-w-[520px] md:max-w-[860px] mx-auto px-3.5 md:px-6 py-6 md:py-10">
        {/* Hero */}
        <header className="mb-5">
          <div className="flex items-baseline justify-between mb-2">
            <h1 data-block-id="hero-name" className="text-[44px] md:text-[60px] leading-[0.95] font-bold" style={{
            fontFamily: "'Gaegu', 'Caveat', cursive",
            color: fg,
            letterSpacing: '-0.005em'
          }}>
              
              {ownerName}!
            </h1>
            <div className="hidden md:flex items-center gap-2 text-[12px]" style={{
            color: muted
          }}>
              <span className="font-mono">made-for-you</span>
              <span className="w-2 h-2 rounded-full" style={{
              background: accent
            }} aria-hidden />
            </div>
          </div>
          <p data-block-id="hero-intro" className="text-[15px] md:text-[17px] leading-relaxed" style={{
          color: fg
        }}>
            
            {intro}
          </p>
        </header>

        {/* Top 2-up cards: ABOUT / NOW */}
        <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-3">
          <Card label="ABOUT" accent={accent} border={border} fg={fg} bg="#FFFFFF">
            <p data-block-id="about-short" className="text-[13px] md:text-[14px] leading-snug">
              {aboutShort}
            </p>
          </Card>
          <Card label="NOW" accent={accent} border={border} fg={fg} bg="#FFFFFF">
            <p data-block-id="now-short" className="text-[13px] md:text-[14px] leading-snug">
              {nowShort}
            </p>
          </Card>
        </div>

        {/* Featured card */}
        <div className="rounded-md border-2 p-4 md:p-5 mb-3 relative overflow-hidden" style={{
        borderColor: border,
        background: accent,
        color: '#FFFFFF'
      }}>
          
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold opacity-90 mb-1.5 inline-flex items-center gap-2">
            <span>FEATURED</span>
            {featured.badge && <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider" style={{
            background: '#FFFFFF22',
            color: '#FFFFFF'
          }}>
              
                {featured.badge}
              </span>}
          </div>
          <div data-block-id="featured-title" className="text-[20px] md:text-[24px] font-bold leading-tight" style={{
          fontFamily: "'Gaegu', 'Caveat', cursive",
          letterSpacing: '-0.005em'
        }}>
            
            {featured.title}
          </div>
          <p data-block-id="featured-blurb" className="text-[13.5px] md:text-[14.5px] mt-2 leading-relaxed opacity-95">
            
            {featured.blurb}
          </p>
          <div className="absolute -bottom-3 -right-2 text-[64px] leading-none opacity-20" aria-hidden>
            
            🪶
          </div>
        </div>

        {/* Projects 2-up grid */}
        <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-3">
          {projects.map(p => <Card key={p.id} data-block-id={`project-${p.id}`} label={p.emoji ? p.emoji : '·'} labelKind="emoji" accent={accent} border={border} fg={fg} bg="#FFFFFF">
            
              <div data-block-id={`project-${p.id}-title`} className="text-[15px] md:text-[16px] font-bold leading-tight">
              
                {p.title}
              </div>
              <p data-block-id={`project-${p.id}-blurb`} className="text-[12.5px] md:text-[13px] mt-1 leading-snug" style={{
            color: muted
          }}>
              
                {p.blurb}
              </p>
            </Card>)}
        </div>

        {/* Contact strip */}
        <div className="rounded-md border p-3 md:p-3.5 mt-3" style={{
        borderColor: border,
        background: '#FFFFFF'
      }}>
          
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold mb-2" style={{
          color: muted
        }}>
            
            COME SAY HI
          </div>
          <div className="flex flex-wrap gap-2">
            {socials.map(s => <a key={s.label} href="#" className="inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-full hover:scale-[1.02] active:scale-[0.98] transition-transform" style={{
            background: bg,
            border: `1.5px solid ${fg}`,
            color: fg
          }}>
              
                {s.emoji && <span>{s.emoji}</span>}
                <span className="font-semibold">{s.label}</span>
                <span className="text-[11px] font-mono" style={{
              color: muted
            }}>
                  {s.url}
                </span>
              </a>)}
          </div>
        </div>

        {/* Tiny doodle footer */}
        <div className="mt-4 text-center text-[11px]" style={{
        color: muted
      }}>
          <span style={{
          fontFamily: "'Caveat', cursive",
          fontSize: 18
        }}>
            ◯◯◯ — drawn for {ownerName}'s mobile / xhs / ig visitors
          </span>
        </div>
      </div>
    </main>;
};
const Card = ({
  label,
  labelKind = 'text',
  accent,
  border,
  fg,
  bg,
  children,
  ...rest
}: {
  label: string;
  labelKind?: 'text' | 'emoji';
  accent: string;
  border: string;
  fg: string;
  bg: string;
  children: React.ReactNode;
  [k: string]: unknown;
}) => <div className="rounded-md border p-3 md:p-3.5" style={{
  borderColor: border,
  background: bg,
  color: fg
}} {...rest}>
  
    <div className={`mb-1.5 ${labelKind === 'text' ? 'text-[10.5px] uppercase tracking-[0.18em] font-bold' : 'text-[20px]'}`} style={labelKind === 'text' ? {
    color: accent
  } : undefined} aria-hidden={labelKind === 'emoji' ? true : undefined}>
    
      {label}
    </div>
    {children}
  </div>;
