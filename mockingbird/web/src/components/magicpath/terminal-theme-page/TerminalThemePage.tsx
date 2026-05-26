import type { BlockKey } from '@/lib/types';

export const blockSchema: BlockKey[] = ['hero-headline', 'hero-intro', 'about-body', 'project-<id>', 'note-<i>'];

/**
 * TerminalThemePage — public theme page (Terminal layout).
 * Triggers: referrer ~/github|hn/ AND device==desktop.
 * Visual: dark single-column, mono fonts, accent green-orange, dotfiles vibe.
 * Stable text containers — LLM rewrites the data-block-id slots, layout never shifts.
 */

type Project = {
  id: string;
  title: string;
  description: string;
  url: string;
  status?: string;
};
type Props = {
  ownerName?: string;
  intro?: string;
  bio?: string;
  notes?: string[];
  projects?: Project[];
  socials?: {
    label: string;
    url: string;
  }[];
  accent?: string;
  bg?: string;
  fg?: string;
};
const DEFAULTS = {
  ownerName: 'yrzhe',
  intro: 'builds agent-native systems, templates, and odd little internet tools.',
  bio: "Based in Shanghai. Writes at 心知 AI in Chinese and as Adrian in English. Ships small templates for AI agents to host things on.",
  notes: ['mockingbird is the fourth in a row — Hatch then Perch then Arena then this.', 'Each one is a one-command EdgeSpark template.', 'You\'re reading the Terminal version because you came from github / hn / desktop.'],
  projects: [{
    id: 'p1',
    title: 'mockingbird.template',
    description: 'adaptive personal site (you\'re looking at it)',
    url: 'github.com/Yrzhe/edgespark-template/tree/main/mockingbird',
    status: 'WIP'
  }, {
    id: 'p2',
    title: 'arena.vote',
    description: 'spectator + voting front-end for AI competitions',
    url: 'github.com/Yrzhe/edgespark-template/tree/main/arena'
  }, {
    id: 'p3',
    title: 'perch.link',
    description: 'agent-native link-in-bio + analytics, SSR public',
    url: 'github.com/Yrzhe/edgespark-template/tree/main/perch'
  }, {
    id: 'p4',
    title: 'hatch.host',
    description: 'static-site host + BaaS, one-command template',
    url: 'github.com/Yrzhe/edgespark-template/tree/main/hatch'
  }] as Project[],
  socials: [{
    label: 'github',
    url: 'github.com/Yrzhe'
  }, {
    label: 'x',
    url: 'x.com/yrzhe_top'
  }, {
    label: 'email',
    url: 'love@yrzhe.space'
  }, {
    label: 'rss',
    url: '/feed.xml'
  }]
};
export const TerminalThemePage = ({
  ownerName = DEFAULTS.ownerName,
  intro = DEFAULTS.intro,
  bio = DEFAULTS.bio,
  notes = DEFAULTS.notes,
  projects = DEFAULTS.projects,
  socials = DEFAULTS.socials,
  accent = '#7DDC8B',
  bg = '#0C0A0F',
  fg = '#EDEAE3'
}: Props) => {
  const muted = `${fg}99`;
  const subtle = `${fg}55`;
  return <main className="min-h-screen w-full" style={{
    background: bg,
    color: fg,
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
  }}>
      
      <div className="max-w-[980px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[13.5px] md:text-[14px] leading-[1.7]">
        {/* Top crumb */}
        <div className="text-[11px] md:text-[12px] mb-6 md:mb-8 flex items-center gap-2" style={{
        color: muted
      }}>
          <span>/home/{ownerName}</span>
          <span style={{
          color: subtle
        }}>·</span>
          <span style={{
          color: subtle
        }}>$ uname -a</span>
        </div>

        {/* Hero — $ whoami */}
        <section className="mb-10 md:mb-12">
          <div className="text-[12px] md:text-[13px]" style={{
          color: muted
        }}>
            <span style={{
            color: accent
          }}>$</span> whoami
          </div>
          <h1 data-block-id="hero-headline" className="font-bold leading-[1.15] mt-2 text-[28px] md:text-[40px]" style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: '-0.01em',
          color: fg
        }}>
            
            {ownerName} — <span data-block-id="hero-intro">{intro}</span>
          </h1>
        </section>

        {/* about.log */}
        <section className="mb-10 md:mb-12">
          <div className="text-[12px] md:text-[13px] uppercase tracking-[0.1em]" style={{
          color: muted
        }}>
            [about.log]
          </div>
          <p data-block-id="about-body" className="mt-3 max-w-[60ch] text-[14px] md:text-[15px]" style={{
          color: fg
        }}>
            
            {bio}
          </p>
        </section>

        {/* projects/ */}
        <section className="mb-10 md:mb-12">
          <div className="text-[12px] md:text-[13px] uppercase tracking-[0.1em] mb-3" style={{
          color: muted
        }}>
            [projects/]
          </div>
          <ul className="space-y-2">
            {projects.map(p => <li key={p.id} data-block-id={`project-${p.id}`} className="grid grid-cols-[14px_1fr] md:grid-cols-[14px_220px_1fr_auto] gap-x-3 items-baseline">
              
                <span style={{
              color: accent
            }}>&gt;</span>
                <span style={{
              color: fg
            }} className="font-semibold">
                  {p.title}
                </span>
                <span style={{
              color: muted
            }} className="col-span-2 md:col-span-1 md:max-w-none truncate">
                  {p.description}
                </span>
                {p.status && <span className="hidden md:inline text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono" style={{
              color: accent,
              border: `1px solid ${accent}55`
            }}>
                
                    {p.status}
                  </span>}
              </li>)}
          </ul>
          <div className="text-[12px] mt-3" style={{
          color: subtle
        }}>
            <span style={{
            color: accent
          }}>$</span> ls ./projects | wc -l
            <span style={{
            color: fg
          }}> {projects.length}</span>
          </div>
        </section>

        {/* notes */}
        <section className="mb-10 md:mb-12">
          <div className="text-[12px] md:text-[13px] uppercase tracking-[0.1em] mb-3" style={{
          color: muted
        }}>
            [notes]
          </div>
          <ul className="space-y-1.5 max-w-[60ch]">
            {notes.map((n, i) => <li key={i} data-block-id={`note-${i}`} className="grid grid-cols-[20px_1fr] gap-x-2 items-baseline">
              
                <span style={{
              color: subtle
            }} className="text-[12px] font-mono">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{
              color: fg
            }}>{n}</span>
              </li>)}
          </ul>
        </section>

        {/* contact.sh */}
        <section className="mb-6">
          <div className="text-[12px] md:text-[13px] uppercase tracking-[0.1em] mb-3" style={{
          color: muted
        }}>
            [contact.sh]
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {socials.map(s => <a key={s.label} href="#" className="inline-flex items-baseline gap-1.5 hover:underline" style={{
            color: fg,
            textUnderlineOffset: '3px'
          }}>
              
                <span style={{
              color: accent
            }}>&gt;</span>
                <span className="font-semibold">{s.label}</span>
                <span style={{
              color: muted
            }} className="text-[12px]">
                  {s.url}
                </span>
              </a>)}
          </div>
        </section>

        {/* prompt */}
        <div className="mt-8 pt-4 border-t" style={{
        borderColor: subtle,
        color: muted
      }}>
          <span style={{
          color: accent
        }}>$</span>
          <span className="inline-block w-2 h-4 ml-1.5 align-middle animate-pulse" style={{
          background: fg
        }} aria-hidden />
        </div>
      </div>
    </main>;
};
