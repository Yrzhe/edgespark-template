import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, Send } from "lucide-react";

import { ContestantAvatar } from "@/components/ContestantAvatar";
import { Panel } from "@/components/ui";
import { arenaApi } from "@/lib/api";
import { INK, NAVY, ORANGE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Comment, CommentCreateResponse, CompetitionStatus, ContestantSummary } from "@/lib/types";

export function CommentComposer({
  contestants,
  enabled,
  authenticated,
  onLogin,
  onSent,
  defaultText = "",
  status = "live",
}: {
  contestants: ContestantSummary[];
  enabled: boolean;
  authenticated: boolean;
  onLogin: () => void;
  onSent: (comment: Comment, result: CommentCreateResponse) => void;
  defaultText?: string;
  status?: CompetitionStatus;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(defaultText);
  const [cursor, setCursor] = useState(defaultText.length);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mention = useMemo(() => currentMention(text, cursor), [text, cursor]);
  const suggestions = useMemo(() => mention ? mentionSuggestions(mention.query, contestants) : [], [mention, contestants]);
  const showSuggestions = suggestions.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!authenticated) return onLogin();
    if (!enabled || !text.trim()) return;
    const result = await arenaApi.comment(text.trim());
    const latest = await arenaApi.comments({ limit: 20 });
    const created = latest.comments.find((comment) => comment.id === result.id);
    if (created) onSent(created, result);
    setText("");
    setCursor(0);
  }

  function replaceMention(contestant: ContestantSummary) {
    if (!mention) return;
    const next = `${text.slice(0, mention.start)}@${contestant.id} ${text.slice(mention.end)}`;
    const nextCursor = mention.start + contestant.id.length + 2;
    setText(next);
    setCursor(nextCursor);
    setHighlighted(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      replaceMention(suggestions[highlighted]);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setCursor(-1);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="relative">
      {showSuggestions && (
        <div className="thin-scrollbar absolute bottom-full z-30 mb-2 max-h-56 w-full overflow-auto rounded-xl border-2 bg-white p-2 shadow-lg" style={{ borderColor: INK }}>
          {suggestions.map((c, index) => <button type="button" key={c.id} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-100" style={{ background: index === highlighted ? "#0C0A0F0B" : "#fff" }} onMouseDown={(event) => { event.preventDefault(); replaceMention(c); }}>
            <ContestantAvatar name={c.displayName} company={`${c.company ?? c.tagline} ${c.displayName}`} avatarUrl={c.avatarUrl} color={c.accentColor} size="sm" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{c.displayName}</span><span className="block truncate text-[11px] font-semibold text-zinc-500">@{c.id}</span></span>
          </button>)}
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-2 px-3 py-2" style={{ borderColor: INK }}>
          <AtSign size={16} />
          <input ref={inputRef} disabled={!enabled} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:opacity-50" value={text} onChange={(e) => { setText(e.target.value); setCursor(e.target.selectionStart ?? e.target.value.length); setHighlighted(0); }} onClick={(event) => setCursor(event.currentTarget.selectionStart ?? text.length)} onKeyUp={(event) => setCursor(event.currentTarget.selectionStart ?? text.length)} onKeyDown={onKeyDown} placeholder={enabled ? t("dashboard.commentPlaceholder") : t("dashboard.commentsClosed")} />
        </div>
        <button className="rounded-lg px-4 py-2 text-sm font-black text-white disabled:opacity-50" disabled={!enabled} style={{ background: ORANGE }} type="submit">
          <Send size={16} />
        </button>
      </div>
      {status === "draft" && <div className="mt-2 text-[11px] font-bold" style={{ color: "#4A4A4F" }}>{t("dashboard.draftMentionHint")}</div>}
    </form>
  );
}

export function Danmaku({ comments, contestants }: { comments: Comment[]; contestants: ContestantSummary[] }) {
  const { t } = useTranslation();
  return (
    <Panel>
      <div className="relative h-[220px] overflow-hidden rounded-lg" style={{ background: INK }}>
        <img src="/brand/bloome-mark-white.png" alt={t("app.bloomeAlt")} className="absolute right-3 top-3 h-8 w-8 rounded-md object-contain opacity-80" />
        {comments.map((comment, index) => {
          const color = contestants.find((c) => comment.mentions.includes(c.id))?.accentColor ?? ORANGE;
          return (
            <div key={comment.id} className="absolute whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold text-white" style={{ left: `${8 + (index % 3) * 12}%`, top: `${12 + index * 23}px`, background: color }}>
              {comment.displayName}: {comment.text}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function CommentList({ comments, contestants }: { comments: Comment[]; contestants: ContestantSummary[] }) {
  const { t } = useTranslation();
  if (!comments.length) return <div className="py-6 text-center text-sm font-bold text-zinc-500">{t("app.empty")}</div>;
  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="rounded-lg bg-zinc-50 p-3">
          <div className="text-xs font-black text-zinc-500">{comment.displayName} · {formatDate(comment.createdAt)}</div>
          <p className="mt-1 text-sm font-semibold">{highlightMentions(comment.text, contestants)}</p>
        </div>
      ))}
    </div>
  );
}

export function dedupeComments(comments: Comment[]) {
  return [...new Map(comments.map((comment) => [comment.id, comment])).values()].sort((a, b) => b.createdAt - a.createdAt);
}

function currentMention(text: string, cursor: number) {
  if (cursor < 0) return null;
  const before = text.slice(0, cursor);
  const match = before.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
  if (!match) return null;
  return { start: cursor - match[2].length - 1, end: cursor, query: match[2].toLowerCase() };
}

function mentionSuggestions(query: string, contestants: ContestantSummary[]) {
  const q = query.trim().toLowerCase();
  return contestants
    .filter((c) => !q || c.id.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q))
    .slice(0, 8);
}

function highlightMentions(text: string, contestants: ContestantSummary[]) {
  return text.split(/(@[a-zA-Z0-9_-]+)/g).map((part, index) => (
    part.startsWith("@") ? <span key={index} className="font-black" style={{ color: contestants.find((c) => `@${c.id}` === part)?.accentColor ?? NAVY }}>{part}</span> : part
  ));
}
