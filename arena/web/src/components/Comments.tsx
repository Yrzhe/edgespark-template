import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, Send } from "lucide-react";

import { Panel } from "@/components/ui";
import { arenaApi } from "@/lib/api";
import { INK, NAVY, ORANGE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Comment, ContestantSummary } from "@/lib/types";

export function CommentComposer({
  contestants,
  enabled,
  authenticated,
  onLogin,
  onSent,
  defaultText = "",
}: {
  contestants: ContestantSummary[];
  enabled: boolean;
  authenticated: boolean;
  onLogin: () => void;
  onSent: (comment: Comment) => void;
  defaultText?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(defaultText);
  const suggestions = useMemo(() => mentionSuggestions(text, contestants), [text, contestants]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!authenticated) return onLogin();
    if (!enabled || !text.trim()) return;
    const result = await arenaApi.comment(text.trim());
    const latest = await arenaApi.comments({ limit: 20 });
    const created = latest.comments.find((comment) => comment.id === result.id);
    if (created) onSent(created);
    setText("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="relative">
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-2 px-3 py-2" style={{ borderColor: INK }}>
          <AtSign size={16} />
          <input disabled={!enabled} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:opacity-50" value={text} onChange={(e) => setText(e.target.value)} placeholder={enabled ? t("dashboard.commentPlaceholder") : t("dashboard.commentsClosed")} />
        </div>
        <button className="rounded-lg px-4 py-2 text-sm font-black text-white disabled:opacity-50" disabled={!enabled} style={{ background: ORANGE }} type="submit">
          <Send size={16} />
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-44 w-full overflow-auto rounded-lg border-2 bg-white p-2 shadow" style={{ borderColor: INK }}>
          {suggestions.map((c) => <button type="button" key={c.id} className="block w-full rounded px-2 py-1 text-left text-sm font-bold hover:bg-zinc-100" onClick={() => setText(replaceMentionToken(text, c.id))}>@{c.id} · {c.displayName}</button>)}
        </div>
      )}
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

function mentionSuggestions(text: string, contestants: ContestantSummary[]) {
  const match = text.match(/@([a-zA-Z0-9_-]*)$/);
  if (!match) return [];
  const q = match[1].toLowerCase();
  return contestants.filter((c) => c.id.toLowerCase().startsWith(q)).slice(0, 8);
}

function replaceMentionToken(text: string, id: string) {
  return text.replace(/@([a-zA-Z0-9_-]*)$/, `@${id} `);
}

function highlightMentions(text: string, contestants: ContestantSummary[]) {
  return text.split(/(@[a-zA-Z0-9_-]+)/g).map((part, index) => (
    part.startsWith("@") ? <span key={index} className="font-black" style={{ color: contestants.find((c) => `@${c.id}` === part)?.accentColor ?? NAVY }}>{part}</span> : part
  ));
}
