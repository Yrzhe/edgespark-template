import type { BlockKey } from '@/lib/types';

export const blockSchema: BlockKey[] = ['hero-greeting', 'hero-intro', 'about-body', 'project-<id>', 'returning-note', 'sign-off-line', 'sign-off-name'];

/**
 * LetterThemePage — public theme page (Letter layout).
 * Triggers: direct OR returning OR late_night.
 * Visual: narrow text column, serif (Crimson Pro), cream background,
 * handwritten Caveat sign-off. Quiet, intimate, almost no chrome.
 * Stable text containers — LLM rewrites slots, layout never shifts.
 */

type Project = {
  id: string;
  title: string;
  context: string;
  url: string;
};
type Props = {
  ownerName?: string;
  greeting?: string;
  intro?: string;
  about?: string;
  projects?: Project[];
  returningNote?: string;
  isReturning?: boolean;
  signOff?: string;
  email?: string;
  socials?: {
    label: string;
    url: string;
  }[];
  bg?: string;
  fg?: string;
  accent?: string;
};
const DEFAULTS = {
  ownerName: 'yrzhe',
  greeting: 'Hi —',
  intro: "You came here directly, which probably means you know me, or you saw a tweet. So this version is short.",
  about: "I make small agent-native systems. Each one ships as a one-command EdgeSpark template. Right now I’m building mockingbird, which is the thing you’re reading — a personal site where every visitor sees a different version, picked by passive signals and rewritten by an LLM in the right tone.",
  projects: [{
    id: 'p1',
    title: 'mockingbird',
    context: 'adaptive personal site, agent-native admin',
    url: '/projects/mockingbird'
  }, {
    id: 'p2',
    title: 'arena',
    context: 'spectator + voting for AI competitions',
    url: '/projects/arena'
  }, {
    id: 'p3',
    title: 'perch',
    context: 'agent-native link-in-bio with first-party analytics',
    url: '/projects/perch'
  }, {
    id: 'p4',
    title: 'hatch',
    context: 'static-site host + BaaS in one command',
    url: '/projects/hatch'
  }] as Project[],
  returningNote: "If you’ve been here before, thanks for coming back. The page changes a little every time — that’s the point.",
  signOff: 'Warmly,',
  email: 'love@yrzhe.space',
  socials: [{
    label: 'email',
    url: 'love@yrzhe.space'
  }, {
    label: 'x',
    url: 'x.com/yrzhe_top'
  }, {
    label: 'github',
    url: 'github.com/Yrzhe'
  }, {
    label: 'rss',
    url: '/feed.xml'
  }]
};
export const LetterThemePage = ({
  ownerName = DEFAULTS.ownerName,
  greeting = DEFAULTS.greeting,
  intro = DEFAULTS.intro,
  about = DEFAULTS.about,
  projects = DEFAULTS.projects,
  returningNote = DEFAULTS.returningNote,
  isReturning = true,
  // shown as default on canvas for preview
  signOff = DEFAULTS.signOff,
  email = DEFAULTS.email,
  socials = DEFAULTS.socials,
  bg = '#FBFAF6',
  fg = '#1A1715',
  accent = '#2556B6'
}: Props) => {
  const muted = `${fg}AA`;
  const subtle = `${fg}55`;
  return <main className="min-h-screen w-full" style={{
    background: bg,
    color: fg,
    fontFamily: "'Crimson Pro', Georgia, serif"
  }}>
      
      <article className="max-w-[640px] mx-auto px-5 md:px-7 py-12 md:py-20 text-[16px] md:text-[17px] leading-[1.78]">
        {/* salutation */}
        <header>
          <h1 data-block-id="hero-greeting" className="text-[22px] md:text-[26px] font-medium tracking-tight mb-5" style={{
          color: fg,
          fontFeatureSettings: '"liga","calt"'
        }}>
            
            {greeting}
          </h1>
          <p data-block-id="hero-intro" className="mb-5" style={{
          color: fg
        }}>
            {intro}
          </p>
        </header>

        {/* about */}
        <section className="mb-8">
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2" style={{
          color: muted,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.18em'
        }}>
            
            About
          </h2>
          <p data-block-id="about-body" className="mb-3" style={{
          color: fg
        }}>
            {about}
          </p>
        </section>

        {/* projects — list */}
        <section className="mb-8">
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-3" style={{
          color: muted,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.18em'
        }}>
            
            A few things worth opening
          </h2>
          <ul className="space-y-2.5">
            {projects.map(p => <li key={p.id} data-block-id={`project-${p.id}`} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
              
                <a href={p.url} className="inline-block font-semibold underline-offset-[3px] hover:underline" style={{
              color: accent
            }}>
                
                  {p.title}
                </a>
                <span className="hidden sm:inline" style={{
              color: subtle
            }}>—</span>
                <span style={{
              color: muted
            }}>{p.context}</span>
              </li>)}
          </ul>
        </section>

        {/* returning visitor note (only if cookie says so) */}
        {isReturning && <section className="mb-8">
            <div className="border-l-2 pl-4 py-1" style={{
          borderColor: accent
        }}>
            
              <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-1.5" style={{
            color: muted,
            fontFamily: "'Inter', sans-serif"
          }}>
              
                If you came back
              </h2>
              <p data-block-id="returning-note" className="italic" style={{
            color: fg
          }}>
                {returningNote}
              </p>
            </div>
          </section>}

        {/* sign-off */}
        <section className="mt-12">
          <div data-block-id="sign-off-line" style={{
          color: fg
        }}>
            {signOff}
          </div>
          <div data-block-id="sign-off-name" className="text-[34px] md:text-[40px] leading-none mt-1.5" style={{
          fontFamily: "'Caveat', cursive",
          color: fg,
          letterSpacing: '0.005em'
        }}>
            
            {ownerName}
          </div>
        </section>

        {/* contact line */}
        <footer className="mt-10 pt-4 border-t" style={{
        borderColor: subtle
      }}>
          <div className="text-[12px] flex flex-wrap items-center gap-x-3 gap-y-1" style={{
          color: muted,
          fontFamily: "'Inter', sans-serif"
        }}>
            
            {socials.map((s, i) => <span key={s.label} className="inline-flex items-center gap-3">
                {i > 0 && <span style={{
              color: subtle
            }}>·</span>}
                <a href={s.url.startsWith('http') ? s.url : `#${s.label}`} className="underline-offset-[3px] hover:underline" style={{
              color: fg
            }}>
                
                  {s.label}
                </a>
              </span>)}
            <span style={{
            color: subtle
          }}>·</span>
            <span>{email}</span>
          </div>
        </footer>
      </article>
    </main>;
};
