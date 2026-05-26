import { useMemo, useState } from 'react';
import { Check, AlertCircle, BookOpen, Lightbulb, X } from 'lucide-react';
const RULE_EXAMPLES: {
  rule: string;
  gloss: string;
}[] = [{
  rule: 'referrer~/github|hn/ AND device==desktop',
  gloss: 'Terminal-flavored visitors'
}, {
  rule: 'referrer~/substack|medium|x/ OR is_weekend==true',
  gloss: 'Magazine readers'
}, {
  rule: 'referrer~/xiaohongshu|instagram/ OR device==mobile',
  gloss: 'Gallery / social-mobile'
}, {
  rule: 'country in [US,CA,GB] AND lang==en',
  gloss: 'English-speaking core'
}, {
  rule: 'hour_band==late_night AND is_returning==true',
  gloss: 'Late-night returning'
}, {
  rule: 'referrer==direct AND is_returning==true',
  gloss: 'Friends / inner circle'
}, {
  rule: 'from==tw AND device!=bot',
  gloss: 'From a tagged twitter campaign'
}, {
  rule: '* (fallback)',
  gloss: 'Default — when no other rule wins'
}];
const GRAMMAR_FIELDS = [{
  name: 'referrer',
  kind: 'enum',
  values: 'direct, github, hn, x, xiaohongshu, instagram, substack, medium, search, email, other'
}, {
  name: 'country',
  kind: 'string',
  values: 'ISO code, e.g. US, CN, GB'
}, {
  name: 'lang',
  kind: 'enum',
  values: 'en, zh, ja, ko, …'
}, {
  name: 'device',
  kind: 'enum',
  values: 'desktop, mobile, tablet, bot, unknown'
}, {
  name: 'hour_band',
  kind: 'enum',
  values: 'morning, day, evening, late_night, unknown'
}, {
  name: 'is_returning',
  kind: 'bool',
  values: 'true, false'
}, {
  name: 'is_weekend',
  kind: 'bool',
  values: 'true, false'
}, {
  name: 'from',
  kind: 'string',
  values: 'URL ?from= value (allowlisted)'
}];
type Props = {
  value?: string;
  onChange?: (next: string) => void;
  showGrammar?: boolean;
  inEditor?: boolean;
};
type ParseResult = {
  ok: true;
  gloss: string;
} | {
  ok: false;
  error: string;
  at?: number;
};
export const MatchRuleInput = ({
  value: controlled,
  onChange,
  showGrammar = false,
  inEditor = true
}: Props) => {
  const [inner, setInner] = useState('referrer~/github|hn/ AND device==desktop');
  const value = controlled ?? inner;
  const setValue = (v: string) => {
    if (onChange) onChange(v);else setInner(v);
  };
  const [showExamples, setShowExamples] = useState(false);
  const [showGrammarPanel, setShowGrammarPanel] = useState(showGrammar);
  const parsed = useMemo(() => parseRule(value), [value]);
  return <div className={`font-sans ${inEditor ? '' : 'max-w-2xl mx-auto px-4 py-6'}`}>
      <div className="space-y-2">
        {/* Input */}
        <div className="relative">
          <input type="text" value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. referrer~/github|hn/ AND device==desktop" className={`w-full text-[13px] px-3 py-2 rounded border bg-background font-mono focus:outline-none focus:ring-2 ${parsed.ok ? 'border-border focus:ring-ring/40' : 'border-destructive/60 focus:ring-destructive/30'}`} aria-invalid={!parsed.ok} />
          
          {!parsed.ok && parsed.at !== undefined && <div className="absolute -bottom-1 left-3 right-3 flex">
              <div className="h-0.5 bg-destructive/40" style={{
            marginLeft: `${parsed.at * 7.2}px`,
            width: '7.2px'
          }} />
            
            </div>}
        </div>

        {/* Parse summary */}
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <ParseHint result={parsed} />
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={() => setShowExamples(s => !s)} className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">
              
              <Lightbulb className="w-3 h-3" />
              {showExamples ? 'hide examples' : 'examples'}
            </button>
            <button type="button" onClick={() => setShowGrammarPanel(s => !s)} className="text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              
              <BookOpen className="w-3 h-3" />
              {showGrammarPanel ? 'hide grammar' : 'grammar'}
            </button>
          </div>
        </div>
      </div>

      {/* Examples drawer */}
      {showExamples && <div className="mt-2 border border-border rounded bg-background overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center justify-between">
            <span>Examples — click to use</span>
            <button onClick={() => setShowExamples(false)} aria-label="Close examples" className="p-0.5 rounded hover:bg-muted">
            
              <X className="w-3 h-3" />
            </button>
          </div>
          <ul className="divide-y divide-border">
            {RULE_EXAMPLES.map(ex => <li key={ex.rule}>
                <button type="button" onClick={() => {
            setValue(ex.rule);
            setShowExamples(false);
          }} className="w-full text-left px-3 py-2 hover:bg-muted group transition-colors">
              
                  <code className="text-[11.5px] font-mono text-foreground block truncate">
                    {ex.rule}
                  </code>
                  <span className="text-[10.5px] text-muted-foreground">{ex.gloss}</span>
                </button>
              </li>)}
          </ul>
        </div>}

      {/* Grammar drawer */}
      {showGrammarPanel && <div className="mt-2 border border-border rounded bg-background overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center justify-between">
            <span>DSL grammar</span>
            <button onClick={() => setShowGrammarPanel(false)} aria-label="Close grammar" className="p-0.5 rounded hover:bg-muted">
            
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="px-3 py-2.5 text-[11.5px] space-y-2">
            <p className="text-muted-foreground leading-relaxed">
              Boolean expression over coarse visitor fields. Parsed to AST on save; runtime evaluates the AST, never the raw string.
            </p>
            <code className="block bg-muted px-2 py-1.5 rounded font-mono text-[11px] overflow-x-auto whitespace-pre">
{`expression  := or
or          := and ( "OR" and )*
and         := not ( "AND" not )*
not         := "NOT"? primary
primary     := comparison | "(" expression ")"
comparison  := field op value
op          := "==" | "!=" | "~/regex/" | "in"
field       := ${GRAMMAR_FIELDS.map(f => f.name).join(' | ')}`}
            </code>
            <div className="mt-2 border-t border-border pt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
              {GRAMMAR_FIELDS.map(f => <div key={f.name} className="text-[11px] flex gap-2">
                  <code className="font-mono text-primary shrink-0">{f.name}</code>
                  <span className="text-muted-foreground truncate">{f.values}</span>
                </div>)}
            </div>
            <p className="text-[10.5px] text-muted-foreground border-t border-border pt-2">
              Caps: ≤1KB string · ≤6 AST depth · ≤120 char regex (no lookaround / backreferences).
            </p>
          </div>
        </div>}
    </div>;
};

/* ─────────────────────────── parse-preview (visual-only, not the real parser) ─────────────────── */

function parseRule(input: string): ParseResult {
  const s = input.trim();
  if (!s) return {
    ok: false,
    error: 'rule is empty'
  };
  if (s.length > 1024) return {
    ok: false,
    error: 'rule exceeds 1KB cap'
  };
  if (s === '*' || s === '* (fallback)') return {
    ok: true,
    gloss: 'fallback — always matches when no other rule wins'
  };
  if (/===|!==/.test(s)) {
    const at = s.search(/===|!==/);
    return {
      ok: false,
      error: "invalid operator — use '==' or '!='",
      at
    };
  }
  // very lightweight visual gloss
  const tokens = s.replace(/~\/([^/]+)\//g, ' matches /$1/').replace(/==/g, ' equals ').replace(/!=/g, ' not equals ').replace(/\bAND\b/g, ' AND ').replace(/\bOR\b/g, ' OR ').replace(/\bin\b/g, ' in ').replace(/\s+/g, ' ').trim();
  // detect unknown fields
  const unknownField = s.match(/\b(?!referrer|country|lang|device|hour_band|is_returning|is_weekend|from|true|false|AND|OR|NOT|in)([a-z_]{3,})\b/);
  if (unknownField && unknownField.index !== undefined) {
    const word = unknownField[1];
    if (!/^[A-Z]/.test(word)) {
      return {
        ok: false,
        error: `unknown field "${word}"`,
        at: unknownField.index
      };
    }
  }
  return {
    ok: true,
    gloss: tokens
  };
}
const ParseHint = ({
  result
}: {
  result: ParseResult;
}) => {
  if (result.ok) {
    return <div className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1.5 min-w-0">
        <Check className="w-3 h-3 text-[var(--success)] shrink-0" />
        <span className="truncate" title={result.gloss}>
          {result.gloss}
        </span>
      </div>;
  }
  return <div className="text-[11.5px] text-destructive inline-flex items-center gap-1.5">
      <AlertCircle className="w-3 h-3 shrink-0" />
      <span>{result.error}</span>
    </div>;
};