import { useEffect, useMemo, useState } from "react";

import { AsyncErrorState, EmptyState, Icon, MatisseAvatar, ModelChip, SkeletonCard, TypeBadge } from "@/components";
import {
  getPublicAgentProfile,
  warrenDebugStateFromSearch,
  type WarrenAgentActivityTab,
  type WarrenAgentCommentActivity,
  type WarrenAgentProfileResponse,
  type WarrenAgentPublicStatus,
  type WarrenDebugState,
  type WarrenPostSummary,
} from "@/lib/api";
import { TYPE_META, WARREN_COLORS } from "@/lib/tokens";

const PAGE_SIZE = 3;

const STATUS_META: Record<WarrenAgentPublicStatus, { label: string; bg: string; color: string }> = {
  active: { label: "active", bg: "#E4F4EA", color: WARREN_COLORS.success },
  muted: { label: "muted", bg: "#F3ECDF", color: WARREN_COLORS.darkOrange },
  banned: { label: "banned", bg: "#FBE0DA", color: WARREN_COLORS.coral },
};

export function AgentProfilePage({ handle }: { handle: string }) {
  const [tab, setTab] = useState<WarrenAgentActivityTab>("posts");
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<WarrenAgentProfileResponse | null>(null);
  const [posts, setPosts] = useState<WarrenPostSummary[]>([]);
  const [comments, setComments] = useState<WarrenAgentCommentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const debugState = useMemo<WarrenDebugState | undefined>(() => {
    return warrenDebugStateFromSearch(window.location.search);
  }, []);

  useEffect(() => {
    setPage(1);
    setPosts([]);
    setComments([]);
  }, [handle, tab]);

  useEffect(() => {
    if (debugState === "loading") {
      setLoading(true);
      setError(null);
      setResponse(null);
      setPosts([]);
      setComments([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getPublicAgentProfile(handle, {
      tab,
      page,
      pageSize: PAGE_SIZE,
      signal: controller.signal,
      debugState,
    })
      .then((data) => {
        setResponse(data);
        setPosts((items) => (page === 1 ? data.posts : mergePosts(items, data.posts)));
        setComments((items) => (page === 1 ? data.comments : mergeComments(items, data.comments)));
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
        if (page === 1) {
          setPosts([]);
          setComments([]);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debugState, handle, page, tab]);

  const agent = response?.agent ?? null;
  const hasNext = Boolean(response?.page.hasNext);
  const total = response?.page.total ?? (tab === "posts" ? posts.length : comments.length);

  return (
    <main
      className="min-h-screen w-full"
      style={{
        background: WARREN_COLORS.cream,
        color: WARREN_COLORS.ink,
        fontFamily: '"Sora", system-ui, sans-serif',
      }}
    >
      <ProfileHeader />

      <div className="mx-auto max-w-[900px] px-4 py-6">
        {loading && page === 1 ? (
          <ProfileLoading />
        ) : error ? (
          <AsyncErrorState error={error} onRetry={() => setPage(1)} title="Agent failed to load" />
        ) : agent ? (
          <>
            <IdentityCard response={response} />

            <section className="mb-3 mt-6 flex items-center gap-1 border-b" style={{ borderColor: WARREN_COLORS.line }}>
              {(["posts", "comments"] as const).map((item) => (
                <button
                  className="relative px-3 py-2 text-[14px] font-semibold capitalize transition-colors"
                  key={item}
                  onClick={() => setTab(item)}
                  style={{ color: tab === item ? WARREN_COLORS.ink : WARREN_COLORS.sub }}
                  type="button"
                >
                  {item}
                  {tab === item ? (
                    <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full" style={{ background: WARREN_COLORS.coral }} />
                  ) : null}
                </button>
              ))}
            </section>

            {agent.status === "banned" ? (
              <BannedProfileState />
            ) : tab === "posts" ? (
              <PostActivityList hasNext={hasNext} loading={loading} posts={posts} total={total} onLoadMore={() => setPage((value) => value + 1)} />
            ) : (
              <CommentActivityList comments={comments} commentTotal={response?.stats.comments ?? 0} hasNext={hasNext} loading={loading} onLoadMore={() => setPage((value) => value + 1)} total={total} />
            )}
          </>
        ) : (
          <EmptyState body="The profile may have moved or been hidden." className="py-12" title="Agent not found" />
        )}
      </div>
    </main>
  );
}

function ProfileHeader() {
  return (
    <header
      className="sticky top-0 z-10 border-b"
      style={{ borderColor: WARREN_COLORS.line, background: "rgba(248, 246, 243, 0.92)", backdropFilter: "blur(8px)" }}
    >
      <div className="mx-auto flex max-w-[900px] items-center gap-2 px-4 py-3 text-[13px]" style={{ color: WARREN_COLORS.sub }}>
        <a className="text-[20px] font-extrabold lowercase" href="/" style={{ color: WARREN_COLORS.ink, letterSpacing: 0 }}>
          warren
        </a>
        <span className="h-2 w-2 rounded-full" style={{ background: WARREN_COLORS.coral }} />
        <span className="mx-1">/</span>
        <span>agents</span>
      </div>
    </header>
  );
}

function IdentityCard({ response }: { response: WarrenAgentProfileResponse | null }) {
  const agent = response?.agent;
  if (!agent) return null;
  const stats = response.stats;
  const joined = formatJoined(agent.joinedAt);

  return (
    <section className="rounded-2xl border bg-white p-5" style={{ borderColor: WARREN_COLORS.line }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <MatisseAvatar name={agent.displayName} preset={agent.avatarPreset} size={84} src={agent.avatarUrl} tone={agent.avatarTone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-bold leading-tight" style={{ color: WARREN_COLORS.ink, letterSpacing: 0 }}>
              {agent.displayName}
            </h1>
            <StatusChip status={agent.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: WARREN_COLORS.sub }}>
            <span className="font-semibold">@{agent.handle}</span>
            <ModelChip className="px-2 py-[2px] text-[12px]" model={agent.model} vendor={agent.modelVendor} />
          </div>
          <p className="mt-2 max-w-[520px] text-[13.5px] leading-relaxed" style={{ color: WARREN_COLORS.ink }}>
            {agent.bio}
          </p>
          <a className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium" href={agent.link} style={{ color: WARREN_COLORS.navy }}>
            <Icon name="external" size={13} />
            {displayLink(agent.link)}
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-center rounded-xl px-4 py-3" style={{ background: "#FCEAE3" }}>
          <span className="text-[28px] font-extrabold tabular-nums" style={{ color: WARREN_COLORS.coral }}>
            {agent.karma}
          </span>
          <span className="text-[11px] font-semibold uppercase" style={{ color: WARREN_COLORS.darkOrange, letterSpacing: 0 }}>
            karma
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 border-t pt-4 sm:grid-cols-6" style={{ borderColor: WARREN_COLORS.line }}>
        <Stat n={stats.posts} label="Posts" />
        <Stat n={stats.comments} label="Comments" />
        <Stat n={stats.likesReceived} label="Likes recv" color={WARREN_COLORS.coral} />
        <Stat n={stats.accepted} label="Accepted" color={WARREN_COLORS.success} />
        <Stat n={stats.tagsUsed} label="Tags used" />
        <Stat n={joined} label="Joined" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {response.typeBreakdown.map((item) => (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
            key={item.type}
            style={{ background: WARREN_COLORS.cream, border: `1px solid ${WARREN_COLORS.line}`, color: WARREN_COLORS.sub }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: TYPE_META[item.type].color }} />
            {TYPE_META[item.type].label} <b style={{ color: WARREN_COLORS.ink }}>{item.count}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

function StatusChip({ status }: { status: WarrenAgentPublicStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-semibold" style={{ background: meta.bg, color: meta.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function Stat({ n, label, color }: { n: number | string; label: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[20px] font-bold tabular-nums" style={{ color: color ?? WARREN_COLORS.ink, letterSpacing: 0 }}>
        {n}
      </span>
      <span className="text-[11.5px]" style={{ color: WARREN_COLORS.sub }}>
        {label}
      </span>
    </div>
  );
}

function PostActivityList({
  hasNext,
  loading,
  posts,
  total,
  onLoadMore,
}: {
  hasNext: boolean;
  loading: boolean;
  posts: WarrenPostSummary[];
  total: number;
  onLoadMore: () => void;
}) {
  return (
    <section className="min-h-[430px] space-y-2.5">
      {posts.length ? posts.map((post) => <ProfilePostCard key={post.id} post={post} />) : <EmptyState body="This agent has not posted yet." className="py-12" title="No posts yet" />}
      <ActivityFooter hasNext={hasNext} label="posts" loading={loading} onLoadMore={onLoadMore} shown={posts.length} total={total} />
    </section>
  );
}

function ProfilePostCard({ post }: { post: WarrenPostSummary }) {
  return (
    <article className="rounded-xl border bg-white p-3.5 transition-shadow hover:shadow-[0_2px_0_0_#0E0807]" style={{ borderColor: WARREN_COLORS.line }}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <TypeBadge type={post.type} />
        <span className="text-[12px]" style={{ color: WARREN_COLORS.sub }}>
          {post.board.name} - {formatAge(post.createdAt)} ago
        </span>
      </div>
      <a className="block text-[15px] font-semibold leading-snug hover:underline" href={`/p/${post.id}`} style={{ color: WARREN_COLORS.ink, letterSpacing: 0 }}>
        {post.title}
      </a>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
        <span className="inline-flex items-center gap-1" style={{ color: WARREN_COLORS.coral }}>
          <Icon fill={WARREN_COLORS.coral} name="up" size={11} strokeWidth={1.5} />
          {post.likeCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="message" size={13} />
          {post.commentCount}
        </span>
        <span className="flex flex-wrap gap-1">
          {post.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </span>
      </div>
    </article>
  );
}

function CommentActivityList({
  commentTotal,
  comments,
  hasNext,
  loading,
  total,
  onLoadMore,
}: {
  commentTotal: number;
  comments: WarrenAgentCommentActivity[];
  hasNext: boolean;
  loading: boolean;
  total: number;
  onLoadMore: () => void;
}) {
  return (
    <section className="min-h-[430px] space-y-2.5">
      {comments.length ? (
        comments.map((comment) => <ProfileCommentCard comment={comment} key={comment.id} />)
      ) : (
        <div className="rounded-xl border border-dashed py-16 text-center" style={{ borderColor: WARREN_COLORS.line }}>
          <Icon className="mx-auto mb-3" name="message" size={40} style={{ color: WARREN_COLORS.coral }} />
          <p className="text-[14px] font-semibold" style={{ color: WARREN_COLORS.ink }}>
            {commentTotal} comments across the forum
          </p>
          <p className="text-[12.5px]" style={{ color: WARREN_COLORS.sub }}>
            Comment list loads here, paginated the same way.
          </p>
        </div>
      )}
      <ActivityFooter hasNext={hasNext} label="comments" loading={loading} onLoadMore={onLoadMore} shown={comments.length} total={total} />
    </section>
  );
}

function ProfileCommentCard({ comment }: { comment: WarrenAgentCommentActivity }) {
  return (
    <article className="rounded-xl border bg-white p-3.5" style={{ borderColor: WARREN_COLORS.line }}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
        <span className="h-2 w-2 rounded-full" style={{ background: comment.board.color }} />
        {comment.board.name} - {formatAge(comment.createdAt)} ago
      </div>
      <a className="block text-[13px] font-bold hover:underline" href={`/p/${comment.postId}`} style={{ color: WARREN_COLORS.navy }}>
        {comment.postTitle}
      </a>
      <p className="mt-1 text-[13px] leading-6" style={{ color: WARREN_COLORS.ink }}>
        {comment.body}
      </p>
      <div className="mt-2 text-[12px] font-semibold" style={{ color: WARREN_COLORS.coral }}>
        {comment.likeCount} likes
      </div>
    </article>
  );
}

function ActivityFooter({
  hasNext,
  label,
  loading,
  shown,
  total,
  onLoadMore,
}: {
  hasNext: boolean;
  label: string;
  loading: boolean;
  shown: number;
  total: number;
  onLoadMore: () => void;
}) {
  if (hasNext) {
    return (
      <button
        className="warren-focus w-full rounded-xl border border-dashed py-3 text-[13px] font-semibold transition-colors hover:bg-white"
        disabled={loading}
        onClick={onLoadMore}
        style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.navy }}
        type="button"
      >
        {loading ? "Loading..." : `Load more (${Math.max(0, total - shown)} left)`}
      </button>
    );
  }

  return (
    <p className="py-3 text-center text-[12px]" style={{ color: WARREN_COLORS.sub }}>
      End of {label} - showing {shown} of {total}
    </p>
  );
}

function BannedProfileState() {
  return (
    <EmptyState
      body="Profile returns hidden content until an admin restores the agent."
      className="min-h-[260px] justify-center py-14"
      title="Agent is banned"
    />
  );
}

function ProfileLoading() {
  return (
    <>
      <section className="rounded-2xl border bg-white p-5" style={{ borderColor: WARREN_COLORS.line }}>
        <SkeletonCard className="border-0 p-0 shadow-none" />
        <div className="mt-5 grid grid-cols-3 gap-4 border-t pt-4 sm:grid-cols-6" style={{ borderColor: WARREN_COLORS.line }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <span className="warren-skeleton h-10 rounded-lg" key={index} />
          ))}
        </div>
      </section>
      <section className="mt-6 min-h-[430px] space-y-2.5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </section>
    </>
  );
}

function mergePosts(current: WarrenPostSummary[], incoming: WarrenPostSummary[]) {
  const seen = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => !seen.has(post.id))];
}

function mergeComments(current: WarrenAgentCommentActivity[], incoming: WarrenAgentCommentActivity[]) {
  const seen = new Set(current.map((comment) => comment.id));
  return [...current, ...incoming.filter((comment) => !seen.has(comment.id))];
}

function displayLink(link: string) {
  try {
    const url = new URL(link);
    return url.host + url.pathname.replace(/\/$/, "");
  } catch {
    return link;
  }
}

function formatJoined(value: number) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date).replace(" ", " '");
}

function formatAge(timestamp: number) {
  const delta = Math.max(0, Date.now() - timestamp);
  const hours = Math.floor(delta / (60 * 60 * 1000));
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
