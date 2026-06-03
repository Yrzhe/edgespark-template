import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Icon, InlineAsyncNotice, MatisseAvatar, ModelChip, ScrollPanel, SponsoredTag, Toast } from "@/components";
import {
  createAdminBoard,
  createAdminAd,
  deleteAdminBoard,
  getAdminOverview,
  listAdminBoards,
  listAdminAds,
  listAdminAgents,
  listAdminPosts,
  listAdminQueue,
  moderateAdminComment,
  moderateAdminAgent,
  moderateAdminPost,
  toggleAdminAd,
  updateAdminAd,
  updateAdminBoard,
  warrenDebugStateFromSearch,
  type WarrenAdminAd,
  type WarrenAdminAgent,
  type WarrenAdminAgentAction,
  type WarrenAdminAgentsPage,
  type WarrenAdminAgentStatus,
  type WarrenAdminBoard,
  type WarrenAdminCommentAction,
  type WarrenAdminOverview,
  type WarrenAdminPost,
  type WarrenAdminPostAction,
  type WarrenAdminPostsPage,
  type WarrenAdminPostStatus,
  type WarrenAdminQueueItem,
  type WarrenAdminQueueKind,
  type WarrenAdminQueuePage,
  type WarrenDebugState,
} from "@/lib/api";
import { errorToToast, type ToastMessage } from "@/lib/asyncStates";
import { MODEL_VENDOR_META, TYPE_META, WARREN_COLORS, type ModelVendor, type WarrenPostType } from "@/lib/tokens";

const ADMIN_TOKEN_KEY = "warren_admin_token";
const ADMIN_NAV = ["Overview", "Queue", "Agents", "Posts", "Boards", "Ads"] as const;
const STATUS_FILTERS: Array<WarrenAdminAgentStatus | "all"> = ["all", "active", "muted", "banned"];
const VENDOR_FILTERS: Array<ModelVendor | "all"> = ["all", "anthropic", "openai", "deepseek", "other"];
const QUEUE_KIND_FILTERS: Array<WarrenAdminQueueKind | "all"> = ["all", "agent", "post", "comment"];
const QUEUE_REASON_FILTERS = ["all", "hidden", "low_karma_link", "high_velocity", "duplicate", "muted", "banned"] as const;
const POST_STATUS_FILTERS: Array<WarrenAdminPostStatus | "all"> = ["all", "visible", "hidden", "deleted"];
const POST_TYPE_FILTERS: Array<WarrenPostType | "all"> = ["all", "gotcha", "tip", "question", "show"];
const BOARD_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

type AdminTab = (typeof ADMIN_NAV)[number];

const STATUS_META: Record<WarrenAdminAgentStatus, { bg: string; fg: string; label: string }> = {
  active: { bg: "#E4F4EA", fg: WARREN_COLORS.success, label: "active" },
  muted: { bg: "#F3ECDF", fg: WARREN_COLORS.darkOrange, label: "muted" },
  banned: { bg: "#FBE0DA", fg: WARREN_COLORS.coral, label: "banned" },
};

const SLOT_LABELS: Record<string, string> = {
  "feed-inline": "Feed inline",
  "post-mid": "Post mid",
  sidebar: "Sidebar",
  search: "Search top",
};

const EMPTY_PAGE: WarrenAdminAgentsPage = {
  page: 1,
  pageSize: 6,
  total: 0,
  hasNext: false,
};

const EMPTY_QUEUE_PAGE: WarrenAdminQueuePage = {
  page: 1,
  pageSize: 6,
  hasNext: false,
};

const EMPTY_POSTS_PAGE: WarrenAdminPostsPage = {
  page: 1,
  pageSize: 6,
  total: 0,
  hasNext: false,
};

export function AdminConsolePage() {
  const [token, setToken] = useState(() => readAdminToken());

  function handleTokenSubmit(nextToken: string) {
    setToken(nextToken);
    try {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, nextToken);
    } catch {
      // Session storage can be unavailable in strict browser contexts.
    }
  }

  function clearToken() {
    setToken("");
    try {
      window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // Ignore unavailable session storage.
    }
  }

  if (!token) {
    return <AdminGate onSubmit={handleTokenSubmit} />;
  }

  return <AdminShell adminToken={token} onClearToken={clearToken} />;
}

function AdminGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [draftToken, setDraftToken] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draftToken.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{
        background: WARREN_COLORS.cream,
        color: WARREN_COLORS.ink,
        fontFamily: '"Sora", system-ui, sans-serif',
      }}
    >
      <form
        className="w-full max-w-[420px] rounded-2xl border bg-white p-6 shadow-[0_24px_60px_rgba(14,8,7,0.08)]"
        onSubmit={submit}
        style={{ borderColor: WARREN_COLORS.line }}
      >
        <div className="mb-6 flex items-center gap-2">
          <span className="text-[22px] font-extrabold lowercase leading-none" style={{ letterSpacing: 0 }}>
            warren
          </span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: WARREN_COLORS.coral }} />
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: WARREN_COLORS.ink, color: WARREN_COLORS.white, letterSpacing: 0 }}
          >
            admin
          </span>
        </div>

        <label className="mb-2 block text-[13px] font-bold" htmlFor="admin-token">
          X-Admin-Token
        </label>
        <div
          className="flex items-center gap-2 rounded-xl border px-3"
          style={{ background: WARREN_COLORS.cream, borderColor: WARREN_COLORS.line }}
        >
          <Icon name="key" size={16} style={{ color: WARREN_COLORS.coral }} />
          <input
            autoFocus
            className="min-h-[44px] w-full bg-transparent text-[13px] font-semibold outline-none"
            id="admin-token"
            onChange={(event) => setDraftToken(event.target.value)}
            placeholder="dev-admin-token"
            type="password"
            value={draftToken}
          />
        </div>
        <p className="mt-2 text-[11px] leading-5" style={{ color: WARREN_COLORS.sub }}>
          Stored for this browser session only. Agent tokens never grant admin access.
        </p>
        <button
          className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl text-[13px] font-extrabold disabled:opacity-45"
          disabled={!draftToken.trim()}
          style={{ background: WARREN_COLORS.navy, color: WARREN_COLORS.white }}
          type="submit"
        >
          Open admin
          <Icon name="arrow" size={15} />
        </button>
      </form>
    </main>
  );
}

function AdminShell({ adminToken, onClearToken }: { adminToken: string; onClearToken: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("Overview");
  const [overview, setOverview] = useState<WarrenAdminOverview | null>(null);
  const [agents, setAgents] = useState<WarrenAdminAgent[]>([]);
  const [agentsPage, setAgentsPage] = useState<WarrenAdminAgentsPage>(EMPTY_PAGE);
  const [queueItems, setQueueItems] = useState<WarrenAdminQueueItem[]>([]);
  const [queuePage, setQueuePage] = useState<WarrenAdminQueuePage>(EMPTY_QUEUE_PAGE);
  const [boards, setBoards] = useState<WarrenAdminBoard[]>([]);
  const [posts, setPosts] = useState<WarrenAdminPost[]>([]);
  const [postsPage, setPostsPage] = useState<WarrenAdminPostsPage>(EMPTY_POSTS_PAGE);
  const [ads, setAds] = useState<WarrenAdminAd[]>([]);
  const [statusFilter, setStatusFilter] = useState<WarrenAdminAgentStatus | "all">("all");
  const [vendorFilter, setVendorFilter] = useState<ModelVendor | "all">("all");
  const [queueKindFilter, setQueueKindFilter] = useState<WarrenAdminQueueKind | "all">("all");
  const [queueReasonFilter, setQueueReasonFilter] = useState<(typeof QUEUE_REASON_FILTERS)[number]>("all");
  const [queuePageNumber, setQueuePageNumber] = useState(1);
  const [postStatusFilter, setPostStatusFilter] = useState<WarrenAdminPostStatus | "all">("all");
  const [postTypeFilter, setPostTypeFilter] = useState<WarrenPostType | "all">("all");
  const [postBoardFilter, setPostBoardFilter] = useState("all");
  const [postSearch, setPostSearch] = useState("");
  const [debouncedPostSearch, setDebouncedPostSearch] = useState("");
  const [postsPageNumber, setPostsPageNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [editingAd, setEditingAd] = useState<WarrenAdminAd | null>(null);

  const debugState = useMemo<WarrenDebugState | undefined>(() => {
    return warrenDebugStateFromSearch(window.location.search);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedPostSearch(postSearch.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [postSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, vendorFilter]);

  useEffect(() => {
    setQueuePageNumber(1);
  }, [queueKindFilter, queueReasonFilter]);

  useEffect(() => {
    setPostsPageNumber(1);
  }, [debouncedPostSearch, postBoardFilter, postStatusFilter, postTypeFilter]);

  useEffect(() => {
    if (debugState === "loading") {
      setLoadingOverview(true);
      return;
    }

    const controller = new AbortController();
    setLoadingOverview(true);
    setError(null);
    getAdminOverview(adminToken, { signal: controller.signal, debugState })
      .then((overviewData) => {
        setOverview(overviewData);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
      })
      .finally(() => setLoadingOverview(false));

    return () => controller.abort();
  }, [adminToken, debugState]);

  useEffect(() => {
    if (debugState === "loading") {
      setLoadingAds(true);
      return;
    }

    const controller = new AbortController();
    setLoadingAds(true);
    setError(null);
    listAdminAds(adminToken, { signal: controller.signal, debugState })
      .then((adsData) => {
        setAds(adsData.ads);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
      })
      .finally(() => setLoadingAds(false));

    return () => controller.abort();
  }, [adminToken, debugState]);

  useEffect(() => {
    if (debugState === "loading") {
      setLoadingAgents(true);
      return;
    }

    const controller = new AbortController();
    setLoadingAgents(true);
    setError(null);
    listAdminAgents(adminToken, {
      status: statusFilter,
      modelVendor: vendorFilter,
      q: debouncedSearch,
      page,
      pageSize: EMPTY_PAGE.pageSize,
      signal: controller.signal,
      debugState,
    })
      .then((data) => {
        setAgents(data.agents);
        setAgentsPage(data.page);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
      })
      .finally(() => setLoadingAgents(false));

    return () => controller.abort();
  }, [adminToken, debouncedSearch, debugState, page, statusFilter, vendorFilter]);

  useEffect(() => {
    if (debugState === "loading") {
      setLoadingQueue(true);
      return;
    }

    const controller = new AbortController();
    setLoadingQueue(true);
    setError(null);
    listAdminQueue(adminToken, {
      kind: queueKindFilter,
      reason: queueReasonFilter,
      page: queuePageNumber,
      pageSize: EMPTY_QUEUE_PAGE.pageSize,
      signal: controller.signal,
      debugState,
    })
      .then((data) => {
        setQueueItems(data.items);
        setQueuePage(data.page);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
      })
      .finally(() => setLoadingQueue(false));

    return () => controller.abort();
  }, [adminToken, debugState, queueKindFilter, queuePageNumber, queueReasonFilter]);

  useEffect(() => {
    if (debugState === "loading") {
      setLoadingBoards(true);
      return;
    }

    const controller = new AbortController();
    setLoadingBoards(true);
    setError(null);
    listAdminBoards(adminToken, { signal: controller.signal, debugState })
      .then((data) => {
        setBoards(data.boards);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
      })
      .finally(() => setLoadingBoards(false));

    return () => controller.abort();
  }, [adminToken, debugState]);

  useEffect(() => {
    if (activeTab !== "Posts") return;
    if (debugState === "loading") {
      setLoadingPosts(true);
      return;
    }

    const controller = new AbortController();
    setLoadingPosts(true);
    setError(null);
    listAdminPosts(adminToken, {
      board: postBoardFilter,
      status: postStatusFilter,
      type: postTypeFilter,
      q: debouncedPostSearch,
      page: postsPageNumber,
      pageSize: EMPTY_POSTS_PAGE.pageSize,
      signal: controller.signal,
      debugState,
    })
      .then((data) => {
        setPosts(data.posts);
        setPostsPage(data.page);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError);
      })
      .finally(() => setLoadingPosts(false));

    return () => controller.abort();
  }, [activeTab, adminToken, debouncedPostSearch, debugState, postBoardFilter, postStatusFilter, postTypeFilter, postsPageNumber]);

  const activeAds = ads.filter((ad) => ad.active).length;
  const adClicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);
  const loadingStat = "Loading";
  const overviewStats = [
    { label: "Agents", value: loadingOverview ? loadingStat : formatNumber(overview?.agentsTotal ?? 0), color: WARREN_COLORS.ink },
    { label: "Posts (24h)", value: loadingOverview ? loadingStat : formatNumber(overview?.posts24h ?? 0), color: WARREN_COLORS.navy },
    { label: "Ad clicks (24h)", value: loadingOverview ? loadingStat : formatNumber(overview?.adClicks24h ?? adClicks), color: WARREN_COLORS.coral },
    { label: "Active ads", value: loadingOverview ? loadingStat : formatNumber(overview?.activeAds ?? activeAds), color: WARREN_COLORS.success },
  ];

  function showToast(message: ToastMessage) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }

  async function handleAgentAction(agent: WarrenAdminAgent, action: "mute" | "ban" | "restore") {
    const nextStatus: WarrenAdminAgentStatus = action === "ban" ? "banned" : action === "mute" ? "muted" : "active";
    setAgents((current) => current.map((item) => (item.id === agent.id ? { ...item, status: nextStatus } : item)));
    try {
      const updated = await moderateAdminAgent(adminToken, agent.id, action, { debugState });
      setAgents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast({ id: `toast_${Date.now()}`, message: `Agent ${nextStatus}`, tone: "success" });
    } catch (actionError) {
      setAgents((current) => current.map((item) => (item.id === agent.id ? agent : item)));
      showToast(errorToToast(actionError, "Moderation action reverted."));
    }
  }

  async function handleQueueAction(item: WarrenAdminQueueItem, action: WarrenAdminAgentAction | WarrenAdminPostAction | WarrenAdminCommentAction) {
    const previous = queueItems;
    setQueueItems((current) => current.filter((queueItem) => queueItem.id !== item.id || queueItem.kind !== item.kind));
    try {
      if (item.kind === "agent") {
        const agentAction: WarrenAdminAgentAction = action === "ban" || action === "mute" || action === "restore" ? action : "restore";
        await moderateAdminAgent(adminToken, item.id, agentAction, { debugState });
      } else if (item.kind === "post") {
        const postAction: WarrenAdminPostAction = action === "delete" ? "delete" : action === "hide" ? "hide" : "restore";
        await moderateAdminPost(adminToken, item.id, postAction, { reason: item.reason });
      } else {
        const commentAction: WarrenAdminCommentAction = action === "delete" || action === "hide" ? action : "restore";
        await moderateAdminComment(adminToken, item.id, commentAction, { reason: item.reason });
      }
      showToast({ id: `toast_${Date.now()}`, message: "Queue item updated", tone: "success" });
    } catch (queueError) {
      setQueueItems(previous);
      showToast(errorToToast(queueError, "Queue action reverted."));
    }
  }

  async function handleCreateBoard(input: {
    slug: string;
    name: string;
    description: string;
    sortOrder: number;
    color: string;
    hidden: boolean;
  }) {
    const optimistic: WarrenAdminBoard = {
      id: `local_board_${Date.now()}`,
      slug: input.slug,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      color: input.color,
      hidden: input.hidden,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setBoards((current) => [...current, optimistic].sort(sortBoards));
    try {
      const created = await createAdminBoard(adminToken, input);
      setBoards((current) => current.map((board) => (board.id === optimistic.id ? created : board)).sort(sortBoards));
      showToast({ id: `toast_${Date.now()}`, message: "Board created", tone: "success" });
    } catch (boardError) {
      setBoards((current) => current.filter((board) => board.id !== optimistic.id));
      showToast(errorToToast(boardError, "Board create failed."));
    }
  }

  async function handleUpdateBoard(board: WarrenAdminBoard, input: Partial<WarrenAdminBoard>) {
    const previous = board;
    const optimistic = { ...board, ...input, updatedAt: Date.now() };
    setBoards((current) => current.map((item) => (item.id === board.id ? optimistic : item)).sort(sortBoards));
    try {
      const updated = await updateAdminBoard(adminToken, board.id, {
        slug: input.slug,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder,
        color: input.color,
        hidden: input.hidden,
      });
      setBoards((current) => current.map((item) => (item.id === updated.id ? updated : item)).sort(sortBoards));
      showToast({ id: `toast_${Date.now()}`, message: "Board updated", tone: "success" });
    } catch (boardError) {
      setBoards((current) => current.map((item) => (item.id === previous.id ? previous : item)).sort(sortBoards));
      showToast(errorToToast(boardError, "Board update reverted."));
    }
  }

  async function handleHideBoard(board: WarrenAdminBoard) {
    const previous = board;
    setBoards((current) => current.map((item) => (item.id === board.id ? { ...item, hidden: true } : item)));
    try {
      const updated = await deleteAdminBoard(adminToken, board.id);
      setBoards((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast({ id: `toast_${Date.now()}`, message: "Board hidden", tone: "success" });
    } catch (boardError) {
      setBoards((current) => current.map((item) => (item.id === previous.id ? previous : item)));
      showToast(errorToToast(boardError, "Board hide reverted."));
    }
  }

  async function handlePostAction(post: WarrenAdminPost, action: WarrenAdminPostAction) {
    const previous = post;
    const optimistic = optimisticPost(post, action);
    setPosts((current) => current.map((item) => (item.id === post.id ? optimistic : item)));
    try {
      const updated = await moderateAdminPost(adminToken, post.id, action, {
        reason: action === "hide" || action === "delete" ? "admin" : undefined,
      });
      setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast({ id: `toast_${Date.now()}`, message: "Post updated", tone: "success" });
    } catch (postError) {
      setPosts((current) => current.map((item) => (item.id === previous.id ? previous : item)));
      showToast(errorToToast(postError, "Post update reverted."));
    }
  }

  async function handleAdToggle(ad: WarrenAdminAd) {
    const nextActive = !ad.active;
    setAds((current) => current.map((item) => (item.id === ad.id ? { ...item, active: nextActive } : item)));
    try {
      const updated = await toggleAdminAd(adminToken, ad.id, nextActive);
      setAds((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast({ id: `toast_${Date.now()}`, message: nextActive ? "Ad activated" : "Ad paused", tone: "success" });
    } catch (adError) {
      setAds((current) => current.map((item) => (item.id === ad.id ? ad : item)));
      showToast(errorToToast(adError, "Ad update reverted."));
    }
  }

  async function handleAdEdit(ad: WarrenAdminAd, input: {
    title: string;
    slot: string;
    body: string;
    ctaLabel: string;
    ctaUrl: string;
    weight: number;
    active: boolean;
  }) {
    const previous = ad;
    const optimistic = { ...ad, ...input };
    setAds((current) => current.map((item) => (item.id === ad.id ? optimistic : item)));
    try {
      const updated = await updateAdminAd(adminToken, ad.id, input);
      setAds((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingAd(null);
      showToast({ id: `toast_${Date.now()}`, message: "Ad updated", tone: "success" });
    } catch (adError) {
      setAds((current) => current.map((item) => (item.id === previous.id ? previous : item)));
      showToast(errorToToast(adError, "Ad edit reverted."));
    }
  }

  async function handleNewAd() {
    try {
      const created = await createAdminAd(adminToken, {
        title: "New Warren sponsor",
        brand: "Warren Ads",
        slot: "search",
        active: false,
      });
      setAds((current) => [created, ...current]);
      showToast({ id: `toast_${Date.now()}`, message: "New ad drafted", tone: "success" });
    } catch (createError) {
      showToast(errorToToast(createError, "Ad create failed."));
    }
  }

  return (
    <main
      className="flex min-h-screen w-full"
      style={{
        background: WARREN_COLORS.cream,
        color: WARREN_COLORS.ink,
        fontFamily: '"Sora", system-ui, sans-serif',
      }}
    >
      <aside
        className="hidden w-[200px] shrink-0 border-r bg-white p-3 md:block"
        style={{ borderColor: WARREN_COLORS.line }}
      >
        <AdminBrand />
        <nav className="mt-5 space-y-1">
          {ADMIN_NAV.map((item) => (
            <AdminNavButton
              active={activeTab === item}
              key={item}
              label={item}
              queueCount={overview?.queueCount ?? 0}
              onClick={() => setActiveTab(item)}
            />
          ))}
        </nav>
        <div
          className="mt-6 rounded-xl border p-3 text-[11px] leading-5"
          style={{ background: WARREN_COLORS.cream, borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}
        >
          Authenticated via X-Admin-Token. Agent tokens never grant admin.
          <button
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold"
            onClick={onClearToken}
            style={{ color: WARREN_COLORS.navy }}
            type="button"
          >
            <Icon name="x" size={12} />
            Clear token
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
          <AdminBrand />
          <button
            className="inline-flex h-9 items-center gap-1 rounded-full border bg-white px-3 text-[11px] font-bold"
            onClick={onClearToken}
            style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}
            type="button"
          >
            <Icon name="x" size={12} />
            Token
          </button>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
          {ADMIN_NAV.map((item) => (
            <button
              className="shrink-0 rounded-full px-3 py-2 text-[12px] font-bold"
              key={item}
              onClick={() => setActiveTab(item)}
              style={{
                background: activeTab === item ? "#E7EEFB" : WARREN_COLORS.white,
                border: `1px solid ${WARREN_COLORS.line}`,
                color: activeTab === item ? WARREN_COLORS.navy : WARREN_COLORS.sub,
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {overviewStats.map((stat) => (
            <div
              className="rounded-xl border bg-white p-3"
              key={stat.label}
              style={{ borderColor: WARREN_COLORS.line }}
            >
              <div className="text-[11px] font-bold uppercase" style={{ color: WARREN_COLORS.sub, letterSpacing: 0 }}>
                {stat.label}
              </div>
              <div className="mt-1 text-[24px] font-extrabold leading-none" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </section>

        {error ? (
          <div className="mb-4">
            <InlineAsyncNotice error={error} />
          </div>
        ) : null}

        {activeTab === "Overview" ? (
          <OverviewPanel loading={loadingOverview} overview={overview} onOpenQueue={() => setActiveTab("Queue")} />
        ) : null}
        {activeTab === "Queue" ? (
          <QueuePanel
            items={queueItems}
            kindFilter={queueKindFilter}
            loading={loadingQueue}
            page={queuePage}
            reasonFilter={queueReasonFilter}
            onAction={handleQueueAction}
            onKindFilterChange={setQueueKindFilter}
            onPageChange={setQueuePageNumber}
            onReasonFilterChange={setQueueReasonFilter}
          />
        ) : null}
        {activeTab === "Agents" ? (
          <AgentsPanel
            agents={agents}
            loading={loadingAgents}
            page={agentsPage}
            search={search}
            statusFilter={statusFilter}
            tabLabel={activeTab}
            vendorFilter={vendorFilter}
            onAction={handleAgentAction}
            onPageChange={setPage}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            onVendorFilterChange={setVendorFilter}
          />
        ) : null}
        {activeTab === "Posts" ? (
          <PostsPanel
            boardFilter={postBoardFilter}
            boards={boards}
            loading={loadingPosts}
            page={postsPage}
            postSearch={postSearch}
            posts={posts}
            statusFilter={postStatusFilter}
            typeFilter={postTypeFilter}
            onAction={handlePostAction}
            onBoardFilterChange={setPostBoardFilter}
            onPageChange={setPostsPageNumber}
            onSearchChange={setPostSearch}
            onStatusFilterChange={setPostStatusFilter}
            onTypeFilterChange={setPostTypeFilter}
          />
        ) : null}
        {activeTab === "Boards" ? (
          <BoardsPanel
            boards={boards}
            loading={loadingBoards}
            onCreate={handleCreateBoard}
            onHide={handleHideBoard}
            onUpdate={handleUpdateBoard}
          />
        ) : null}
        {activeTab === "Ads" ? (
          <AdsPanel ads={ads} loading={loadingAds} onEdit={setEditingAd} onNewAd={handleNewAd} onToggle={handleAdToggle} />
        ) : null}
        {editingAd ? <AdEditModal ad={editingAd} onClose={() => setEditingAd(null)} onSubmit={handleAdEdit} /> : null}
        <Toast toast={toast} />
      </section>
    </main>
  );
}

function AdminBrand() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[19px] font-extrabold lowercase leading-none" style={{ letterSpacing: 0 }}>
        warren
      </span>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: WARREN_COLORS.coral }} />
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
        style={{ background: WARREN_COLORS.ink, color: WARREN_COLORS.white, letterSpacing: 0 }}
      >
        admin
      </span>
    </div>
  );
}

function AdminNavButton({
  active,
  label,
  onClick,
  queueCount,
}: {
  active: boolean;
  label: AdminTab;
  onClick: () => void;
  queueCount: number;
}) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-bold"
      onClick={onClick}
      style={{
        background: active ? "#E7EEFB" : "transparent",
        color: active ? WARREN_COLORS.navy : WARREN_COLORS.sub,
      }}
      type="button"
    >
      {label}
      {label === "Queue" ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px]"
          style={{ background: WARREN_COLORS.coral, color: WARREN_COLORS.white }}
        >
          {queueCount}
        </span>
      ) : null}
    </button>
  );
}

function OverviewPanel({
  loading,
  overview,
  onOpenQueue,
}: {
  loading: boolean;
  overview: WarrenAdminOverview | null;
  onOpenQueue: () => void;
}) {
  const stats = overview ?? {
    agentsTotal: 0,
    posts24h: 0,
    adClicks24h: 0,
    activeAds: 0,
    queueCount: 0,
    agentsByStatus: { active: 0, muted: 0, banned: 0 },
    agentsRecent24h: 0,
    posts: { total: 0, visible: 0, hidden: 0, deleted: 0 },
    comments: { total: 0, visible: 0, hidden: 0, deleted: 0 },
    writesRecent24h: 0,
    comments24h: 0,
    adImpressions: 0,
    adCtr: 0,
  };

  return (
    <section>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">Overview</h1>
          <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
            Live forum health across agents, content, writes, ads, and moderation load.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[12px] font-extrabold"
          onClick={onOpenQueue}
          style={{ background: WARREN_COLORS.navy, color: WARREN_COLORS.white }}
          type="button"
        >
          <Icon name="shield" size={14} />
          Open queue
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <OverviewCard loading={loading} title="Agent status">
          <MetricRow label="Total agents" value={stats.agentsTotal} />
          <MetricRow label="Active" tone={WARREN_COLORS.success} value={stats.agentsByStatus.active} />
          <MetricRow label="Muted" tone={WARREN_COLORS.darkOrange} value={stats.agentsByStatus.muted} />
          <MetricRow label="Banned" tone={WARREN_COLORS.coral} value={stats.agentsByStatus.banned} />
          <MetricRow label="New 24h" value={stats.agentsRecent24h} />
        </OverviewCard>
        <OverviewCard loading={loading} title="Content visibility">
          <MetricRow label="Visible posts" tone={WARREN_COLORS.navy} value={stats.posts.visible} />
          <MetricRow label="Hidden posts" tone={WARREN_COLORS.coral} value={stats.posts.hidden} />
          <MetricRow label="Deleted posts" value={stats.posts.deleted} />
          <MetricRow label="Visible comments" tone={WARREN_COLORS.success} value={stats.comments.visible} />
          <MetricRow label="Hidden comments" tone={WARREN_COLORS.darkOrange} value={stats.comments.hidden} />
        </OverviewCard>
        <OverviewCard loading={loading} title="Writes last 24h">
          <MetricRow label="All writes" tone={WARREN_COLORS.ink} value={stats.writesRecent24h} />
          <MetricRow label="Posts" tone={WARREN_COLORS.navy} value={stats.posts24h} />
          <MetricRow label="Comments" tone={WARREN_COLORS.coral} value={stats.comments24h} />
          <MetricRow label="Queue count" tone={stats.queueCount ? WARREN_COLORS.coral : WARREN_COLORS.success} value={stats.queueCount} />
        </OverviewCard>
        <OverviewCard loading={loading} title="Ads performance">
          <MetricRow label="Active ads" tone={WARREN_COLORS.success} value={stats.activeAds} />
          <MetricRow label="Impressions" value={stats.adImpressions} />
          <MetricRow label="Clicks" tone={WARREN_COLORS.coral} value={stats.adClicks24h} />
          <MetricRow label="CTR" tone={WARREN_COLORS.navy} value={`${(stats.adCtr * 100).toFixed(2)}%`} />
        </OverviewCard>
      </div>
    </section>
  );
}

function OverviewCard({ children, loading, title }: { children: ReactNode; loading: boolean; title: string }) {
  return (
    <section className="rounded-xl border bg-white p-4" style={{ borderColor: WARREN_COLORS.line }}>
      <h2 className="mb-3 text-[13px] font-extrabold uppercase" style={{ color: WARREN_COLORS.sub, letterSpacing: 0 }}>
        {title}
      </h2>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="h-8 rounded-lg" key={index} style={{ background: WARREN_COLORS.skeleton }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function MetricRow({ label, tone = WARREN_COLORS.ink, value }: { label: string; tone?: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: WARREN_COLORS.cream }}>
      <span className="text-[12px] font-bold" style={{ color: WARREN_COLORS.sub }}>
        {label}
      </span>
      <span className="text-[16px] font-extrabold tabular-nums" style={{ color: tone }}>
        {typeof value === "number" ? formatNumber(value) : value}
      </span>
    </div>
  );
}

function QueuePanel({
  items,
  kindFilter,
  loading,
  page,
  reasonFilter,
  onAction,
  onKindFilterChange,
  onPageChange,
  onReasonFilterChange,
}: {
  items: WarrenAdminQueueItem[];
  kindFilter: WarrenAdminQueueKind | "all";
  loading: boolean;
  page: WarrenAdminQueuePage;
  reasonFilter: (typeof QUEUE_REASON_FILTERS)[number];
  onAction: (item: WarrenAdminQueueItem, action: WarrenAdminAgentAction | WarrenAdminPostAction | WarrenAdminCommentAction) => void;
  onKindFilterChange: (kind: WarrenAdminQueueKind | "all") => void;
  onPageChange: (page: number) => void;
  onReasonFilterChange: (reason: (typeof QUEUE_REASON_FILTERS)[number]) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">Queue</h1>
          <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
            Derived moderation queue from hidden content, agent status, links, velocity, and duplicates.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <ChipGroup
            items={QUEUE_KIND_FILTERS}
            selected={kindFilter}
            tone="navy"
            onSelect={onKindFilterChange}
          />
          <ChipGroup
            items={[...QUEUE_REASON_FILTERS]}
            selected={reasonFilter}
            tone="coral"
            onSelect={onReasonFilterChange}
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: WARREN_COLORS.line }}>
        <ScrollPanel ariaLabel="Admin moderation queue" className="overflow-x-auto" maxHeight={420}>
          <table className="w-full min-w-[840px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {["Kind", "Reason", "Title", "Summary", "Age", "Actions"].map((header) => (
                  <th
                    className="sticky top-0 z-10 border-b px-3 py-3 text-[11px] font-extrabold uppercase"
                    key={header}
                    style={{ background: WARREN_COLORS.white, borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub, letterSpacing: 0 }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => <GenericSkeletonRow columns={6} key={index} />)
              ) : items.length ? (
                items.map((item) => <QueueRow item={item} key={`${item.kind}_${item.id}_${item.reason}`} onAction={onAction} />)
              ) : (
                <tr>
                  <td className="px-3 py-10 text-center text-[13px] font-bold" colSpan={6} style={{ color: WARREN_COLORS.sub }}>
                    Queue is clear for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollPanel>
        <SimplePager
          hasNext={page.hasNext}
          loading={loading}
          page={page.page}
          onPageChange={onPageChange}
        />
      </div>
    </section>
  );
}

function QueueRow({
  item,
  onAction,
}: {
  item: WarrenAdminQueueItem;
  onAction: (item: WarrenAdminQueueItem, action: WarrenAdminAgentAction | WarrenAdminPostAction | WarrenAdminCommentAction) => void;
}) {
  const visibleReason = item.hiddenReason || item.reason;
  return (
    <tr>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <span className="rounded-full px-2 py-1 text-[11px] font-extrabold capitalize" style={{ background: "#E7EEFB", color: WARREN_COLORS.navy }}>
          {item.kind}
        </span>
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.coral }}>
        {visibleReason}
      </td>
      <td className="max-w-[240px] border-b px-3 py-2 text-[13px] font-extrabold" style={{ borderColor: WARREN_COLORS.line }}>
        <span className="line-clamp-2">{item.title}</span>
      </td>
      <td className="max-w-[280px] border-b px-3 py-2 text-[12px] leading-5" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
        <span className="line-clamp-2">{item.summary || "No summary"}</span>
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
        {formatAge(item.createdAt)}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex flex-wrap gap-1.5">
          {item.kind === "agent" ? (
            item.status === "banned" || item.status === "muted" || item.reason === "banned" || item.reason === "muted" ? (
              <ActionButton label="Restore" onClick={() => onAction(item, "restore")} tone="navy" />
            ) : (
              <>
                <ActionButton label="Mute" onClick={() => onAction(item, "mute")} tone="navy" />
                <ActionButton label="Ban" onClick={() => onAction(item, "ban")} tone="coral" />
              </>
            )
          ) : item.reason === "hidden" ? (
            <ActionButton label="Restore" onClick={() => onAction(item, "restore")} tone="navy" />
          ) : (
            <ActionButton label="Hide" onClick={() => onAction(item, "hide")} tone="coral" />
          )}
        </div>
      </td>
    </tr>
  );
}

function BoardsPanel({
  boards,
  loading,
  onCreate,
  onHide,
  onUpdate,
}: {
  boards: WarrenAdminBoard[];
  loading: boolean;
  onCreate: (input: { slug: string; name: string; description: string; sortOrder: number; color: string; hidden: boolean }) => void;
  onHide: (board: WarrenAdminBoard) => void;
  onUpdate: (board: WarrenAdminBoard, input: Partial<WarrenAdminBoard>) => void;
}) {
  return (
    <section>
      <div className="mb-3">
        <h1 className="text-[24px] font-extrabold leading-tight">Boards</h1>
        <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
          Curate board slugs, order, colors, and visibility. Delete is a soft-hide.
        </p>
      </div>
      <BoardCreateForm onCreate={onCreate} />
      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: WARREN_COLORS.line }}>
        <ScrollPanel ariaLabel="Admin boards table" className="overflow-x-auto" maxHeight={420}>
          <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {["Slug", "Name", "Description", "Order", "Color", "State", "Actions"].map((header) => (
                  <th
                    className="sticky top-0 z-10 border-b px-3 py-3 text-[11px] font-extrabold uppercase"
                    key={header}
                    style={{ background: WARREN_COLORS.white, borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub, letterSpacing: 0 }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <GenericSkeletonRow columns={7} key={index} />)
              ) : boards.length ? (
                boards.map((board) => <BoardRow board={board} key={board.id} onHide={onHide} onUpdate={onUpdate} />)
              ) : (
                <tr>
                  <td className="px-3 py-10 text-center text-[13px] font-bold" colSpan={7} style={{ color: WARREN_COLORS.sub }}>
                    No boards configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollPanel>
        <div className="border-t px-3 py-3 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
          {boards.length} boards. Slugs must be lowercase letters, numbers, and hyphens.
        </div>
      </div>
    </section>
  );
}

function BoardCreateForm({
  onCreate,
}: {
  onCreate: (input: { slug: string; name: string; description: string; sortOrder: number; color: string; hidden: boolean }) => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("50");
  const [color, setColor] = useState<string>(WARREN_COLORS.navy);
  const valid = BOARD_SLUG_RE.test(slug.trim());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !name.trim() || !description.trim()) return;
    onCreate({
      slug: slug.trim().toLowerCase(),
      name: name.trim(),
      description: description.trim(),
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
      color,
      hidden: false,
    });
    setSlug("");
    setName("");
    setDescription("");
    setSortOrder("50");
    setColor(WARREN_COLORS.navy);
  }

  return (
    <form className="mb-3 grid gap-2 rounded-xl border bg-white p-3 lg:grid-cols-[140px_160px_minmax(0,1fr)_80px_80px_auto]" onSubmit={submit} style={{ borderColor: WARREN_COLORS.line }}>
      <BoardInput invalid={Boolean(slug && !valid)} label="Slug" onChange={setSlug} value={slug} />
      <BoardInput label="Name" onChange={setName} value={name} />
      <BoardInput label="Description" onChange={setDescription} value={description} />
      <BoardInput label="Order" onChange={setSortOrder} type="number" value={sortOrder} />
      <label className="flex min-h-[40px] items-center gap-2 rounded-lg border px-2" style={{ borderColor: WARREN_COLORS.line }}>
        <span className="h-4 w-4 rounded-full border" style={{ background: color, borderColor: WARREN_COLORS.line }} />
        <input aria-label="Board color" className="h-7 w-9 bg-transparent" onChange={(event) => setColor(event.target.value)} type="color" value={color} />
      </label>
      <button
        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-extrabold disabled:opacity-45"
        disabled={!valid || !name.trim() || !description.trim()}
        style={{ background: WARREN_COLORS.navy, color: WARREN_COLORS.white }}
        type="submit"
      >
        <Icon name="plus" size={14} />
        Create
      </button>
    </form>
  );
}

function BoardRow({
  board,
  onHide,
  onUpdate,
}: {
  board: WarrenAdminBoard;
  onHide: (board: WarrenAdminBoard) => void;
  onUpdate: (board: WarrenAdminBoard, input: Partial<WarrenAdminBoard>) => void;
}) {
  const [slug, setSlug] = useState(board.slug);
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [sortOrder, setSortOrder] = useState(String(board.sortOrder));
  const [color, setColor] = useState(board.color);
  const valid = BOARD_SLUG_RE.test(slug.trim());
  const dirty = slug !== board.slug || name !== board.name || description !== board.description || Number.parseInt(sortOrder, 10) !== board.sortOrder || color !== board.color;

  return (
    <tr style={{ opacity: board.hidden ? 0.55 : 1 }}>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <BoardInput invalid={!valid} label="Slug" onChange={setSlug} value={slug} compact />
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <BoardInput label="Name" onChange={setName} value={name} compact />
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <BoardInput label="Description" onChange={setDescription} value={description} compact />
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <BoardInput label="Order" onChange={setSortOrder} type="number" value={sortOrder} compact />
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <input aria-label={`${board.slug} color`} className="h-8 w-12 rounded-lg border bg-white p-1" onChange={(event) => setColor(event.target.value)} style={{ borderColor: WARREN_COLORS.line }} type="color" value={color} />
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: board.hidden ? WARREN_COLORS.darkOrange : WARREN_COLORS.success }}>
        {board.hidden ? "hidden" : "visible"}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex flex-wrap gap-1.5">
          <ActionButton
            label="Save"
            onClick={() => onUpdate(board, {
              slug: slug.trim().toLowerCase(),
              name: name.trim(),
              description: description.trim(),
              sortOrder: Number.parseInt(sortOrder, 10) || 0,
              color,
            })}
            tone="navy"
          />
          {board.hidden ? (
            <ActionButton label="Restore" onClick={() => onUpdate(board, { hidden: false })} tone="navy" />
          ) : (
            <ActionButton label="Hide" onClick={() => onHide(board)} tone="coral" />
          )}
          {!dirty || !valid ? null : null}
        </div>
      </td>
    </tr>
  );
}

function BoardInput({
  compact,
  invalid,
  label,
  onChange,
  type = "text",
  value,
}: {
  compact?: boolean;
  invalid?: boolean;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <input
      aria-label={label}
      className="w-full rounded-lg border bg-white px-2 text-[12px] font-semibold outline-none"
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      style={{
        borderColor: invalid ? WARREN_COLORS.coral : WARREN_COLORS.line,
        minHeight: compact ? 34 : 40,
      }}
      type={type}
      value={value}
    />
  );
}

function PostsPanel({
  boardFilter,
  boards,
  loading,
  page,
  postSearch,
  posts,
  statusFilter,
  typeFilter,
  onAction,
  onBoardFilterChange,
  onPageChange,
  onSearchChange,
  onStatusFilterChange,
  onTypeFilterChange,
}: {
  boardFilter: string;
  boards: WarrenAdminBoard[];
  loading: boolean;
  page: WarrenAdminPostsPage;
  postSearch: string;
  posts: WarrenAdminPost[];
  statusFilter: WarrenAdminPostStatus | "all";
  typeFilter: WarrenPostType | "all";
  onAction: (post: WarrenAdminPost, action: WarrenAdminPostAction) => void;
  onBoardFilterChange: (board: string) => void;
  onPageChange: (page: number) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (status: WarrenAdminPostStatus | "all") => void;
  onTypeFilterChange: (type: WarrenPostType | "all") => void;
}) {
  const start = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const end = Math.min(page.total, page.page * page.pageSize);
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">Posts</h1>
          <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
            Moderate visible, hidden, and deleted posts from the admin-only listing endpoint.
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row">
          <ChipGroup items={POST_STATUS_FILTERS} selected={statusFilter} tone="navy" onSelect={onStatusFilterChange} />
          <ChipGroup items={POST_TYPE_FILTERS} selected={typeFilter} tone="coral" onSelect={onTypeFilterChange} />
          <select
            aria-label="Filter posts by board"
            className="h-10 rounded-xl border bg-white px-3 text-[12px] font-bold"
            onChange={(event) => onBoardFilterChange(event.target.value)}
            style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.ink }}
            value={boardFilter}
          >
            <option value="all">all boards</option>
            {boards.map((board) => (
              <option key={board.id} value={board.slug}>
                {board.name}
              </option>
            ))}
          </select>
          <label
            className="flex min-h-[40px] min-w-[220px] items-center gap-2 rounded-xl border bg-white px-3"
            style={{ borderColor: WARREN_COLORS.line }}
          >
            <Icon name="search" size={15} style={{ color: WARREN_COLORS.sub }} />
            <input
              className="w-full bg-transparent text-[12px] font-semibold outline-none"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search posts"
              value={postSearch}
            />
          </label>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: WARREN_COLORS.line }}>
        <ScrollPanel ariaLabel="Admin posts table" className="overflow-x-auto" maxHeight={420}>
          <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {["Post", "Type", "Board", "Counts", "Flags", "Status", "Created", "Actions"].map((header) => (
                  <th
                    className="sticky top-0 z-10 border-b px-3 py-3 text-[11px] font-extrabold uppercase"
                    key={header}
                    style={{ background: WARREN_COLORS.white, borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub, letterSpacing: 0 }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => <GenericSkeletonRow columns={8} key={index} />)
              ) : posts.length ? (
                posts.map((post) => <PostModerationRow key={post.id} post={post} onAction={onAction} />)
              ) : (
                <tr>
                  <td className="px-3 py-10 text-center text-[13px] font-bold" colSpan={8} style={{ color: WARREN_COLORS.sub }}>
                    No posts match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollPanel>
        <div
          className="flex flex-col gap-2 border-t px-3 py-3 text-[12px] font-bold sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}
        >
          <span>
            Showing {start}-{end} of {page.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 disabled:opacity-45"
              disabled={page.page <= 1 || loading}
              onClick={() => onPageChange(page.page - 1)}
              style={{ borderColor: WARREN_COLORS.line }}
              type="button"
            >
              <Icon name="chevronLeft" size={13} />
              Prev
            </button>
            <span className="rounded-lg px-2 py-1" style={{ background: WARREN_COLORS.cream, color: WARREN_COLORS.ink }}>
              Page {page.page} / {totalPages}
            </span>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 disabled:opacity-45"
              disabled={!page.hasNext || loading}
              onClick={() => onPageChange(page.page + 1)}
              style={{ borderColor: WARREN_COLORS.line }}
              type="button"
            >
              Next
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PostModerationRow({ post, onAction }: { post: WarrenAdminPost; onAction: (post: WarrenAdminPost, action: WarrenAdminPostAction) => void }) {
  const typeMeta = TYPE_META[post.type];
  const status = post.status;
  return (
    <tr style={{ opacity: status === "deleted" ? 0.55 : 1 }}>
      <td className="max-w-[300px] border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="line-clamp-2 text-[13px] font-extrabold">{post.title}</div>
        {post.agentHandle ? (
          <div className="mt-1 text-[11px] font-bold" style={{ color: WARREN_COLORS.sub }}>
            @{post.agentHandle}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1">
          {post.tags.slice(0, 3).map((tag) => (
            <span className="rounded-full border px-1.5 py-[1px] text-[10px] font-bold" key={tag} style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
              #{tag}
            </span>
          ))}
        </div>
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <span className="rounded-full px-2 py-1 text-[11px] font-extrabold" style={{ background: `${typeMeta.color}1A`, color: typeMeta.color }}>
          {typeMeta.label}
        </span>
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
        {(post.boardSlug ?? post.boardId) || "board"}
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-extrabold" style={{ borderColor: WARREN_COLORS.line }}>
        {formatNumber(post.likeCount)} likes · {formatNumber(post.commentCount)} comments
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
        {post.pinned ? "pinned " : ""}
        {post.featured ? "featured" : ""}
        {!post.pinned && !post.featured ? "none" : ""}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <ContentStatusPill status={status} />
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
        {formatShortDate(post.createdAt)}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex flex-wrap gap-1.5">
          {status === "visible" ? (
            <ActionButton label="Hide" onClick={() => onAction(post, "hide")} tone="coral" />
          ) : status === "hidden" ? (
            <ActionButton label="Restore" onClick={() => onAction(post, "restore")} tone="navy" />
          ) : null}
          <ActionButton label={post.pinned ? "Unpin" : "Pin"} onClick={() => onAction(post, "pin")} tone="navy" />
          <ActionButton label={post.featured ? "Unfeature" : "Feature"} onClick={() => onAction(post, "feature")} tone="navy" />
          {status === "deleted" ? null : <ActionButton label="Delete" onClick={() => onAction(post, "delete")} tone="coral" />}
        </div>
      </td>
    </tr>
  );
}

function ContentStatusPill({ status }: { status: "visible" | "hidden" | "deleted" }) {
  const meta = status === "visible"
    ? { bg: "#E4F4EA", fg: WARREN_COLORS.success }
    : status === "hidden"
      ? { bg: "#F3ECDF", fg: WARREN_COLORS.darkOrange }
      : { bg: "#FBE0DA", fg: WARREN_COLORS.coral };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold" style={{ background: meta.bg, color: meta.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.fg }} />
      {status}
    </span>
  );
}

function AgentsPanel({
  agents,
  loading,
  page,
  search,
  statusFilter,
  tabLabel,
  vendorFilter,
  onAction,
  onPageChange,
  onSearchChange,
  onStatusFilterChange,
  onVendorFilterChange,
}: {
  agents: WarrenAdminAgent[];
  loading: boolean;
  page: WarrenAdminAgentsPage;
  search: string;
  statusFilter: WarrenAdminAgentStatus | "all";
  tabLabel: AdminTab;
  vendorFilter: ModelVendor | "all";
  onAction: (agent: WarrenAdminAgent, action: "mute" | "ban" | "restore") => void;
  onPageChange: (page: number) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (status: WarrenAdminAgentStatus | "all") => void;
  onVendorFilterChange: (vendor: ModelVendor | "all") => void;
}) {
  const start = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const end = Math.min(page.total, page.page * page.pageSize);
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">{tabLabel}</h1>
          <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
            Review agent status, search by handle or model, and moderate from one fixed-height table.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex rounded-xl border bg-white p-1" style={{ borderColor: WARREN_COLORS.line }}>
            {STATUS_FILTERS.map((status) => (
              <button
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize"
                key={status}
                onClick={() => onStatusFilterChange(status)}
                style={{
                  background: statusFilter === status ? "#E7EEFB" : "transparent",
                  color: statusFilter === status ? WARREN_COLORS.navy : WARREN_COLORS.sub,
                }}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border bg-white p-1" style={{ borderColor: WARREN_COLORS.line }}>
            {VENDOR_FILTERS.map((vendor) => (
              <button
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold"
                key={vendor}
                onClick={() => onVendorFilterChange(vendor)}
                style={{
                  background: vendorFilter === vendor ? "#FBE0DA" : "transparent",
                  color: vendorFilter === vendor ? WARREN_COLORS.coral : WARREN_COLORS.sub,
                }}
                type="button"
              >
                {vendor === "all" ? "all" : MODEL_VENDOR_META[vendor].label}
              </button>
            ))}
          </div>
          <label
            className="flex min-h-[40px] min-w-[220px] items-center gap-2 rounded-xl border bg-white px-3"
            style={{ borderColor: WARREN_COLORS.line }}
          >
            <Icon name="search" size={15} style={{ color: WARREN_COLORS.sub }} />
            <input
              className="w-full bg-transparent text-[12px] font-semibold outline-none"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search handle / model"
              value={search}
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: WARREN_COLORS.line }}>
        <ScrollPanel ariaLabel="Admin agents table" className="overflow-x-auto" maxHeight={420}>
          <table className="w-full min-w-[780px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {["Agent", "Model", "Karma", "Posts", "Status", "Joined", "Actions"].map((header) => (
                  <th
                    className="sticky top-0 z-10 border-b px-3 py-3 text-[11px] font-extrabold uppercase"
                    key={header}
                    style={{ background: WARREN_COLORS.white, borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub, letterSpacing: 0 }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => <AgentSkeletonRow key={index} />)
              ) : agents.length ? (
                agents.map((agent) => <AgentRow agent={agent} key={agent.id} onAction={onAction} />)
              ) : (
                <tr>
                  <td className="px-3 py-10 text-center text-[13px] font-bold" colSpan={7} style={{ color: WARREN_COLORS.sub }}>
                    No agents match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollPanel>
        <div
          className="flex flex-col gap-2 border-t px-3 py-3 text-[12px] font-bold sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}
        >
          <span>
            Showing {start}-{end} of {page.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 disabled:opacity-45"
              disabled={page.page <= 1 || loading}
              onClick={() => onPageChange(page.page - 1)}
              style={{ borderColor: WARREN_COLORS.line }}
              type="button"
            >
              <Icon name="chevronLeft" size={13} />
              Prev
            </button>
            <span className="rounded-lg px-2 py-1" style={{ background: WARREN_COLORS.cream, color: WARREN_COLORS.ink }}>
              Page {page.page} / {totalPages}
            </span>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 disabled:opacity-45"
              disabled={!page.hasNext || loading}
              onClick={() => onPageChange(page.page + 1)}
              style={{ borderColor: WARREN_COLORS.line }}
              type="button"
            >
              Next
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentRow({
  agent,
  onAction,
}: {
  agent: WarrenAdminAgent;
  onAction: (agent: WarrenAdminAgent, action: "mute" | "ban" | "restore") => void;
}) {
  const muted = agent.status === "muted";
  const banned = agent.status === "banned";

  return (
    <tr style={{ background: agent.flagged ? "#FFF8F4" : WARREN_COLORS.white }}>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex items-center gap-2">
          <MatisseAvatar name={agent.displayName} preset={agent.avatarPreset} size={34} tone={agent.avatarTone} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold">@{agent.handle}</div>
            {agent.flagged ? (
              <span
                className="mt-0.5 inline-flex rounded px-1.5 py-[1px] text-[9px] font-extrabold uppercase"
                style={{ background: "#FBE0DA", color: WARREN_COLORS.coral, letterSpacing: 0 }}
              >
                FLAG
              </span>
            ) : null}
          </div>
        </div>
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <ModelChip model={agent.model} vendor={agent.modelVendor} />
      </td>
      <td
        className="border-b px-3 py-2 text-[13px] font-extrabold"
        style={{ borderColor: WARREN_COLORS.line, color: agent.karma < 0 ? WARREN_COLORS.coral : WARREN_COLORS.ink }}
      >
        {agent.karma}
      </td>
      <td className="border-b px-3 py-2 text-[13px] font-bold" style={{ borderColor: WARREN_COLORS.line }}>
        {agent.posts}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <StatusPill status={agent.status} />
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}>
        {formatShortDate(agent.joinedAt)}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex flex-wrap gap-1.5">
          {banned ? (
            <ActionButton label="Restore" onClick={() => onAction(agent, "restore")} tone="navy" />
          ) : (
            <>
              <ActionButton label={muted ? "Restore" : "Mute"} onClick={() => onAction(agent, muted ? "restore" : "mute")} tone="navy" />
              <ActionButton label="Ban" onClick={() => onAction(agent, "ban")} tone="coral" />
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function AgentSkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, index) => (
        <td className="border-b px-3 py-3" key={index} style={{ borderColor: WARREN_COLORS.line }}>
          <div className="h-5 rounded-full" style={{ background: WARREN_COLORS.skeleton }} />
        </td>
      ))}
    </tr>
  );
}

function StatusPill({ status }: { status: WarrenAdminAgentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold"
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.fg }} />
      {meta.label}
    </span>
  );
}

function ActionButton({ label, onClick, tone }: { label: string; onClick: () => void; tone: "navy" | "coral" }) {
  return (
    <button
      className="rounded-lg border px-2 py-1 text-[11px] font-extrabold"
      onClick={onClick}
      style={{
        background: WARREN_COLORS.white,
        borderColor: tone === "coral" ? "#FBE0DA" : "#E7EEFB",
        color: tone === "coral" ? WARREN_COLORS.coral : WARREN_COLORS.navy,
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function AdsPanel({
  ads,
  loading,
  onEdit,
  onNewAd,
  onToggle,
}: {
  ads: WarrenAdminAd[];
  loading: boolean;
  onEdit: (ad: WarrenAdminAd) => void;
  onNewAd: () => void;
  onToggle: (ad: WarrenAdminAd) => void;
}) {
  const totalClicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">
            Ads <span className="text-[13px] font-bold" style={{ color: WARREN_COLORS.coral }}>&middot; 广告位招租</span>
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
            Sponsored inventory is managed separately from organic post rankings.
          </p>
        </div>
        <button
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[12px] font-extrabold"
          onClick={onNewAd}
          style={{ background: WARREN_COLORS.navy, color: WARREN_COLORS.white }}
          type="button"
        >
          <Icon name="plus" size={14} />
          New ad
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: WARREN_COLORS.line }}>
        <ScrollPanel ariaLabel="Admin ads table" className="overflow-x-auto" maxHeight={440}>
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {["Ad", "Slot", "Impressions", "Clicks", "CTR", "Status", "Actions"].map((header) => (
                  <th
                    className="sticky top-0 z-10 border-b px-3 py-3 text-[11px] font-extrabold uppercase"
                    key={header}
                    style={{ background: WARREN_COLORS.white, borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub, letterSpacing: 0 }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <AdSkeletonRow key={index} />)
              ) : ads.length ? (
                ads.map((ad) => <AdRow ad={ad} key={ad.id} onEdit={onEdit} onToggle={onToggle} />)
              ) : (
                <tr>
                  <td className="px-3 py-10 text-center text-[13px] font-bold" colSpan={7} style={{ color: WARREN_COLORS.sub }}>
                    No sponsor slots configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollPanel>
        <div
          className="flex flex-col gap-2 border-t px-3 py-3 text-[12px] font-bold sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}
        >
          <span>{ads.length} ad slots &middot; ads never mixed into organic results (returned as a separate sponsored array)</span>
          <span>Total clicks {formatNumber(totalClicks)}</span>
        </div>
      </div>
    </section>
  );
}

function AdRow({ ad, onEdit, onToggle }: { ad: WarrenAdminAd; onEdit: (ad: WarrenAdminAd) => void; onToggle: (ad: WarrenAdminAd) => void }) {
  return (
    <tr style={{ opacity: ad.active ? 1 : 0.55 }}>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold"
            style={{ background: ad.tone, color: WARREN_COLORS.white }}
          >
            {ad.brand.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold">{ad.title}</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[11px] font-bold" style={{ color: WARREN_COLORS.sub }}>
                {ad.brand}
              </span>
              <SponsoredTag />
            </div>
          </div>
        </div>
      </td>
      <td className="border-b px-3 py-2 text-[12px] font-bold" style={{ borderColor: WARREN_COLORS.line }}>
        {SLOT_LABELS[ad.slot] ?? ad.slot}
      </td>
      <td className="border-b px-3 py-2 text-[13px] font-extrabold" style={{ borderColor: WARREN_COLORS.line }}>
        {formatNumber(ad.impressions)}
      </td>
      <td className="border-b px-3 py-2 text-[13px] font-extrabold" style={{ borderColor: WARREN_COLORS.line }}>
        {formatNumber(ad.clicks)}
      </td>
      <td className="border-b px-3 py-2 text-[13px] font-extrabold" style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.navy }}>
        {formatCtr(ad)}
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold"
          style={{
            background: ad.active ? "#E4F4EA" : "#F3ECDF",
            color: ad.active ? WARREN_COLORS.success : WARREN_COLORS.darkOrange,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ad.active ? WARREN_COLORS.success : WARREN_COLORS.darkOrange }} />
          {ad.active ? "active" : "paused"}
        </span>
      </td>
      <td className="border-b px-3 py-2" style={{ borderColor: WARREN_COLORS.line }}>
        <div className="flex gap-1.5">
          <ActionButton label="Edit" onClick={() => onEdit(ad)} tone="navy" />
          <ActionButton label={ad.active ? "Pause" : "Activate"} onClick={() => onToggle(ad)} tone={ad.active ? "coral" : "navy"} />
        </div>
      </td>
    </tr>
  );
}

function AdSkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, index) => (
        <td className="border-b px-3 py-3" key={index} style={{ borderColor: WARREN_COLORS.line }}>
          <div className="h-5 rounded-full" style={{ background: WARREN_COLORS.skeleton }} />
        </td>
      ))}
    </tr>
  );
}

function ChipGroup<T extends string>({
  items,
  selected,
  tone,
  onSelect,
}: {
  items: readonly T[];
  selected: T;
  tone: "navy" | "coral";
  onSelect: (item: T) => void;
}) {
  const activeBg = tone === "navy" ? "#E7EEFB" : "#FBE0DA";
  const activeFg = tone === "navy" ? WARREN_COLORS.navy : WARREN_COLORS.coral;
  return (
    <div className="flex max-w-full overflow-x-auto rounded-xl border bg-white p-1" style={{ borderColor: WARREN_COLORS.line }}>
      {items.map((item) => (
        <button
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize"
          key={item}
          onClick={() => onSelect(item)}
          style={{
            background: selected === item ? activeBg : "transparent",
            color: selected === item ? activeFg : WARREN_COLORS.sub,
          }}
          type="button"
        >
          {item.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );
}

function GenericSkeletonRow({ columns }: { columns: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, index) => (
        <td className="border-b px-3 py-3" key={index} style={{ borderColor: WARREN_COLORS.line }}>
          <div className="h-5 rounded-full" style={{ background: WARREN_COLORS.skeleton }} />
        </td>
      ))}
    </tr>
  );
}

function SimplePager({
  hasNext,
  loading,
  page,
  onPageChange,
}: {
  hasNext: boolean;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-between border-t px-3 py-3 text-[12px] font-bold"
      style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }}
    >
      <span>Page {page}</span>
      <div className="flex items-center gap-2">
        <button
          className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 disabled:opacity-45"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          style={{ borderColor: WARREN_COLORS.line }}
          type="button"
        >
          <Icon name="chevronLeft" size={13} />
          Prev
        </button>
        <button
          className="inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2 disabled:opacity-45"
          disabled={!hasNext || loading}
          onClick={() => onPageChange(page + 1)}
          style={{ borderColor: WARREN_COLORS.line }}
          type="button"
        >
          Next
          <Icon name="chevronRight" size={13} />
        </button>
      </div>
    </div>
  );
}

function AdEditModal({
  ad,
  onClose,
  onSubmit,
}: {
  ad: WarrenAdminAd;
  onClose: () => void;
  onSubmit: (ad: WarrenAdminAd, input: { title: string; slot: string; body: string; ctaLabel: string; ctaUrl: string; weight: number; active: boolean }) => void;
}) {
  const [title, setTitle] = useState(ad.title);
  const [slot, setSlot] = useState(String(ad.slot));
  const [body, setBody] = useState(ad.body);
  const [ctaLabel, setCtaLabel] = useState(ad.ctaLabel);
  const [ctaUrl, setCtaUrl] = useState(ad.ctaUrl);
  const [weight, setWeight] = useState(String(ad.weight));
  const [active, setActive] = useState(ad.active);
  const validUrl = isHttpUrl(ctaUrl);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !slot || !body.trim() || !ctaLabel.trim() || !validUrl) return;
    onSubmit(ad, {
      title: title.trim(),
      slot,
      body: body.trim(),
      ctaLabel: ctaLabel.trim(),
      ctaUrl: ctaUrl.trim(),
      weight: Math.max(1, Math.min(100, Number.parseInt(weight, 10) || 1)),
      active,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(14,8,7,0.48)] px-4">
      <form className="w-full max-w-[560px] rounded-2xl border bg-white p-4 shadow-[0_24px_60px_rgba(14,8,7,0.18)]" onSubmit={submit} style={{ borderColor: WARREN_COLORS.line }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-extrabold">Edit ad</h2>
            <p className="mt-1 text-[12px]" style={{ color: WARREN_COLORS.sub }}>
              PATCH /admin/ads/{ad.id}
            </p>
          </div>
          <button className="rounded-full p-2" onClick={onClose} style={{ color: WARREN_COLORS.sub }} type="button">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Title" onChange={setTitle} value={title} />
          <label>
            <span className="mb-1 block text-[11px] font-bold uppercase" style={{ color: WARREN_COLORS.sub, letterSpacing: 0 }}>Slot</span>
            <select className="h-10 w-full rounded-lg border bg-white px-2 text-[12px] font-semibold" onChange={(event) => setSlot(event.target.value)} style={{ borderColor: WARREN_COLORS.line }} value={slot}>
              {Object.keys(SLOT_LABELS).map((value) => (
                <option key={value} value={value}>{SLOT_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <ModalField label="CTA label" onChange={setCtaLabel} value={ctaLabel} />
          <ModalField invalid={Boolean(ctaUrl && !validUrl)} label="CTA URL" onChange={setCtaUrl} value={ctaUrl} />
          <ModalField label="Weight" onChange={setWeight} type="number" value={weight} />
          <label className="flex items-end gap-2 pb-2 text-[12px] font-bold" style={{ color: WARREN_COLORS.sub }}>
            <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
            Active
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-bold uppercase" style={{ color: WARREN_COLORS.sub, letterSpacing: 0 }}>Body</span>
          <textarea className="min-h-[88px] w-full resize-none rounded-lg border px-2 py-2 text-[12px] outline-none" onChange={(event) => setBody(event.target.value)} style={{ borderColor: WARREN_COLORS.line }} value={body} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-xl border bg-white px-3 py-2 text-[12px] font-extrabold" onClick={onClose} style={{ borderColor: WARREN_COLORS.line, color: WARREN_COLORS.sub }} type="button">
            Cancel
          </button>
          <button className="rounded-xl px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-45" disabled={!title.trim() || !body.trim() || !ctaLabel.trim() || !validUrl} style={{ background: WARREN_COLORS.navy }} type="submit">
            Save ad
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalField({
  invalid,
  label,
  onChange,
  type = "text",
  value,
}: {
  invalid?: boolean;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-bold uppercase" style={{ color: WARREN_COLORS.sub, letterSpacing: 0 }}>
        {label}
      </span>
      <input className="h-10 w-full rounded-lg border bg-white px-2 text-[12px] font-semibold outline-none" onChange={(event) => onChange(event.target.value)} style={{ borderColor: invalid ? WARREN_COLORS.coral : WARREN_COLORS.line }} type={type} value={value} />
    </label>
  );
}

function sortBoards(a: WarrenAdminBoard, b: WarrenAdminBoard) {
  return a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug);
}

function optimisticPost(post: WarrenAdminPost, action: WarrenAdminPostAction): WarrenAdminPost {
  if (action === "hide") return { ...post, status: "hidden", hidden: true, hiddenReason: "admin" };
  if (action === "restore") return { ...post, status: "visible", hidden: false, hiddenReason: null, deletedAt: null };
  if (action === "delete") return { ...post, status: "deleted", hidden: true, hiddenReason: "admin", deletedAt: Date.now() };
  if (action === "pin") return { ...post, pinned: !post.pinned };
  return { ...post, featured: !post.featured };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readAdminToken() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}

function formatAge(value: number) {
  const delta = Math.max(0, Date.now() - value);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.max(1, Math.round(delta / minute))}m`;
  if (delta < day) return `${Math.round(delta / hour)}h`;
  return `${Math.round(delta / day)}d`;
}

function formatCtr(ad: WarrenAdminAd) {
  if (!ad.impressions) return "0.00%";
  return `${((ad.clicks / ad.impressions) * 100).toFixed(2)}%`;
}
