import type { BlockKey } from '@/lib/types';

export const blockSchema: BlockKey[] = ['hero-headline', 'hero-deck', 'body-p1', 'body-p2', 'body-p3', 'pull-quote', 'project-<id>', 'contact-note'];

/**
 * MagazineThemePage — public theme page (Magazine layout).
 * Triggers: referrer~/substack|medium|x/ OR is_weekend==true.
 * Visual: editorial cover-story — Fraunces display hero + Source Serif body,
 * cream bg + dark-orange accent + ink ruled lines, multi-column on desktop,
 * cover image left + headline right. Single column on mobile.
 * Stable text containers — LLM rewrites slots, layout never shifts.
 */

type Project = {
  id: string;
  title: string;
  blurb: string;
  tag?: string;
};
type Props = {
  publication?: string;
  issueLabel?: string;
  ownerName?: string;
  headline?: string;
  deck?: string;
  bodyP1?: string;
  bodyP2?: string;
  bodyP3?: string;
  pullQuote?: string;
  projects?: Project[];
  contactNote?: string;
  email?: string;
  socials?: {
    label: string;
    url: string;
  }[];
  bg?: string;
  fg?: string;
  accent?: string;
  border?: string;
  coverColor?: string;
};
const DEFAULTS = {
  publication: 'MOCKINGBIRD',
  issueLabel: 'No. 12 · Saturday Edition',
  ownerName: 'yrzhe',
  headline: 'The version of me you probably came for.',
  deck: "A builder in Shanghai, writing about agents and the templates they need. One page, four faces — this is the one made for people who arrive at the end of a long article.",
  bodyP1: "I make small, opinionated systems for AI agents to use. Each one ships as a one-command EdgeSpark template — Hatch, then Perch, then Arena, and now Mockingbird, the site you’re reading.",
  bodyP2: "What’s happening here is not personalisation in the usual sense. There is no profile of you. Nothing about your location reaches the model. Only a handful of coarse signals — country, the kind of link you came from, the time of day where you are — pick a layout. Then a language model rewrites the text inside that layout, in a tone the owner set.",
  bodyP3: "If you came from a long-form publication, the site assumes you came to read. So you got serif, two columns, a margin for breath, no ornament. That’s what this version is for.",
  pullQuote: "Layouts are code. Themes are data. The model only rewrites words inside a frame the owner built.",
  projects: [{
    id: 'p1',
    title: 'Mockingbird',
    blurb: 'Adaptive personal site, agent-native admin, 4 layouts in code.',
    tag: 'in flight'
  }, {
    id: 'p2',
    title: 'Arena',
    blurb: 'Spectator + voting for AI agent competitions.',
    tag: 'shipped'
  }, {
    id: 'p3',
    title: 'Perch',
    blurb: 'Agent-native link-in-bio + first-party analytics.',
    tag: 'shipped'
  }, {
    id: 'p4',
    title: 'Hatch',
    blurb: 'Static-site host + BaaS, in one command.',
    tag: 'shipped'
  }] as Project[],
  contactNote: "If you want to talk shop about agents, templates, or weekend essays —",
  email: 'love@yrzhe.space',
  socials: [{
    label: 'Newsletter',
    url: '心知 AI'
  }, {
    label: 'X',
    url: '@yrzhe_top'
  }, {
    label: 'GitHub',
    url: '@Yrzhe'
  }, {
    label: 'RSS',
    url: '/feed.xml'
  }]
};
export const MagazineThemePage = ({
  publication = DEFAULTS.publication,
  issueLabel = DEFAULTS.issueLabel,
  ownerName = DEFAULTS.ownerName,
  headline = DEFAULTS.headline,
  deck = DEFAULTS.deck,
  bodyP1 = DEFAULTS.bodyP1,
  bodyP2 = DEFAULTS.bodyP2,
  bodyP3 = DEFAULTS.bodyP3,
  pullQuote = DEFAULTS.pullQuote,
  projects = DEFAULTS.projects,
  contactNote = DEFAULTS.contactNote,
  email = DEFAULTS.email,
  socials = DEFAULTS.socials,
  bg = '#F7F5F1',
  fg = '#0C0A0F',
  accent = '#BC4E32',
  border = '#0C0A0F',
  coverColor = '#BC4E32'
}: Props) => {
  const muted = `${fg}AA`;
  const subtle = `${fg}55`;
  return <main className="min-h-screen w-full" style={{
    background: bg,
    color: fg,
    fontFamily: "'Source Serif 4', Georgia, serif"
  }}>
      
      <div className="max-w-[1180px] mx-auto px-5 md:px-10 py-6 md:py-10">
        {/* Masthead */}
        <header className="mb-6 md:mb-10">
          <div className="flex items-baseline justify-between gap-3 pb-2 border-b" style={{
          borderColor: border,
          borderBottomWidth: 2
        }}>
            
            <div className="text-[18px] md:text-[22px] font-extrabold tracking-[0.04em]" style={{
            fontFamily: "'Fraunces', Georgia, serif",
            color: fg
          }}>
              
              {publication}
            </div>
            <div className="text-[10px] md:text-[11.5px] uppercase tracking-[0.22em] font-semibold" style={{
            color: muted,
            fontFamily: "'Inter', sans-serif"
          }}>
              
              {issueLabel}
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mt-2" style={{
          color: accent,
          fontFamily: "'Inter', sans-serif"
        }}>
            
            BY {ownerName.toUpperCase()} · ESSAY · 4 MIN
          </div>
        </header>

        {/* Cover + Hero */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 mb-8 md:mb-12">
          <div className="md:col-span-5 order-1 md:order-1">
            <div className="relative w-full aspect-[4/5] rounded-sm overflow-hidden border" style={{
            borderColor: border,
            background: coverColor
          }}>
              
              {/* Typographic cover */}
              <div className="absolute inset-0 flex flex-col justify-between p-5">
                <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold" style={{
                color: '#FFFFFFAA',
                fontFamily: "'Inter', sans-serif"
              }}>
                  
                  COVER · NO. 12
                </div>
                <div className="text-[64px] md:text-[88px] leading-[0.85] font-black" style={{
                fontFamily: "'Fraunces', Georgia, serif",
                color: '#FFF8EF',
                letterSpacing: '-0.02em'
              }}>
                  
                  {ownerName}.
                </div>
                <div className="text-[13px] italic font-medium" style={{
                color: '#FFF8EFCC',
                fontFamily: "'Source Serif 4', serif"
              }}>
                  
                  on agents, templates, and small internet tools.
                </div>
              </div>
              {/* Corner mark */}
              <div className="absolute top-3 right-3 w-12 h-12 rounded-full border-2 grid place-items-center" style={{
              borderColor: '#FFF8EF99',
              color: '#FFF8EF'
            }}>
                
                <span className="text-[10px] font-mono" style={{
                fontFamily: "'Inter', sans-serif"
              }}>
                  
                  ¥/$
                </span>
              </div>
            </div>
            <div className="text-[11px] mt-2 italic" style={{
            color: muted,
            fontFamily: "'Source Serif 4', serif"
          }}>
              
              Cover composition — typographic. Owner can upload a photo to replace.
            </div>
          </div>

          <div className="md:col-span-7 order-2 md:order-2">
            <h1 data-block-id="hero-headline" className="text-[36px] md:text-[58px] leading-[1.02] font-black mb-3 md:mb-4" style={{
            fontFamily: "'Fraunces', Georgia, serif",
            color: fg,
            letterSpacing: '-0.018em'
          }}>
              
              {headline}
            </h1>
            <div data-block-id="hero-deck" className="text-[16px] md:text-[19px] italic font-medium mb-5 max-w-[52ch]" style={{
            color: muted,
            fontFamily: "'Source Serif 4', serif",
            lineHeight: 1.4
          }}>
              
              {deck}
            </div>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] font-semibold" style={{
            color: subtle,
            fontFamily: "'Inter', sans-serif"
          }}>
              <span>YRZHE</span>
              <span style={{
              color: subtle
            }}>·</span>
              <span>Shanghai</span>
              <span style={{
              color: subtle
            }}>·</span>
              <span>Saturday</span>
            </div>
          </div>
        </section>

        {/* Body — two-column on desktop, single on mobile */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 mb-8 md:mb-12">
          <div className="md:col-span-8 columns-1 md:columns-2 md:gap-x-8 text-[15.5px] md:text-[16px] leading-[1.7]">
            <p data-block-id="body-p1" className="mb-4" style={{
            color: fg,
            textIndent: 0
          }}>
              
              <span className="float-left mr-2.5 leading-[0.9] font-black" style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: '52px',
              color: accent,
              marginTop: '4px'
            }}>
                
                {bodyP1.charAt(0)}
              </span>
              {bodyP1.slice(1)}
            </p>
            <p data-block-id="body-p2" className="mb-4" style={{
            color: fg
          }}>
              {bodyP2}
            </p>
            <p data-block-id="body-p3" className="mb-4" style={{
            color: fg
          }}>
              {bodyP3}
            </p>
          </div>

          {/* Right rail: pull quote + projects */}
          <aside className="md:col-span-4">
            <div className="border-l-2 pl-4 py-2 mb-6" style={{
            borderColor: accent
          }}>
              
              <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold mb-1.5" style={{
              color: accent,
              fontFamily: "'Inter', sans-serif"
            }}>
                
                Pull quote
              </div>
              <blockquote data-block-id="pull-quote" className="text-[17px] md:text-[19px] italic font-medium leading-[1.4]" style={{
              fontFamily: "'Source Serif 4', serif",
              color: fg
            }}>
                
                &ldquo;{pullQuote}&rdquo;
              </blockquote>
            </div>

            <div>
              <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold mb-2" style={{
              color: muted,
              fontFamily: "'Inter', sans-serif"
            }}>
                
                Current projects
              </div>
              <ul className="space-y-3">
                {projects.map((p, i) => <li key={p.id} data-block-id={`project-${p.id}`} className="border-t pt-2.5" style={{
                borderColor: subtle
              }}>
                  
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-mono" style={{
                    color: subtle,
                    fontFamily: "'Inter', sans-serif"
                  }}>
                      
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {p.tag && <span className="text-[9.5px] uppercase tracking-wider font-bold" style={{
                    color: accent,
                    fontFamily: "'Inter', sans-serif"
                  }}>
                      
                          {p.tag}
                        </span>}
                    </div>
                    <div className="text-[16px] md:text-[18px] font-extrabold mt-0.5" style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  color: fg,
                  letterSpacing: '-0.005em'
                }}>
                    
                      {p.title}
                    </div>
                    <p className="text-[13px] mt-1" style={{
                  color: muted
                }}>
                      {p.blurb}
                    </p>
                  </li>)}
              </ul>
            </div>
          </aside>
        </section>

        {/* Contact strip */}
        <footer className="border-t-2 pt-4 md:pt-5" style={{
        borderColor: border
      }}>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-baseline">
            <div className="md:col-span-7">
              <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold mb-1" style={{
              color: accent,
              fontFamily: "'Inter', sans-serif"
            }}>
                
                Letters
              </div>
              <p data-block-id="contact-note" className="text-[15px] italic" style={{
              color: fg,
              fontFamily: "'Source Serif 4', serif"
            }}>
                
                {contactNote}{' '}
                <a href="#" className="not-italic font-semibold underline-offset-[3px] underline" style={{
                color: accent
              }}>
                  
                  {email}
                </a>
                .
              </p>
            </div>
            <div className="md:col-span-5 md:text-right">
              <div className="flex flex-wrap md:justify-end gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.18em] font-semibold" style={{
              color: fg,
              fontFamily: "'Inter', sans-serif"
            }}>
                {socials.map(s => <a key={s.label} href="#" className="hover:underline underline-offset-[3px]">
                    {s.label} <span style={{
                  color: subtle
                }}>· {s.url}</span>
                  </a>)}
              </div>
            </div>
          </div>
          <div className="mt-4 text-[10.5px] uppercase tracking-[0.18em] font-mono" style={{
          color: subtle,
          fontFamily: "'Inter', sans-serif"
        }}>
            
            © {ownerName.toUpperCase()} · WRITTEN FOR THIS VISIT · LAYOUT IS CODE · TEXT IS DATA
          </div>
        </footer>
      </div>
    </main>;
};
