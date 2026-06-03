import { client } from "@/lib/edgespark";

type JsonBody = unknown;
type ApiInit = RequestInit & { json?: JsonBody; redirectOn401?: boolean };

export type ApprovalStatus = "pending" | "approved" | "rejected" | "hold" | "suspended";

export type MeResponse = {
  user: { id: string; email: string; name: string | null };
  profile: {
    userId: string;
    email: string;
    displayName: string | null;
    approvalStatus: ApprovalStatus;
    role: string;
  } | null;
  gates: { ownerApproved: boolean };
  dailyBudgetUsd: number;
  todayUsdSpent: number;
};
export type SignupWhitelistRow = {
  id: string;
  kind: "domain" | "email" | string;
  value: string;
  addedBy: string;
  addedAt: number;
  active: number;
};

export type AdminEventLevel = "error" | "warn" | "info" | "audit" | string;

export type AdminEventRow = {
  id: string;
  level: AdminEventLevel;
  code: string;
  message?: string | null;
  route?: string | null;
  userId?: string | null;
  user_id?: string | null;
  metaJson?: string | null;
  meta_json?: string | null;
  createdAt?: number | string | null;
  created_at?: number | string | null;
};

export type CardRow = {
  id: string;
  cardRootId?: string | null;
  card_root_id?: string | null;
  parentCardId?: string | null;
  parent_card_id?: string | null;
  title?: string | null;
  status?: "draft" | "ready" | string | null;
  creatorUserId?: string | null;
  creator_user_id?: string | null;
  ratioPreset?: string | null;
  ratio_preset?: string | null;
  aspectRatio?: string | null;
  aspect_ratio?: string | null;
  width?: number | null;
  height?: number | null;
  paletteId?: string | null;
  primaryAssetId?: string | null;
  cardSpecJson?: string | null;
  card_spec_json?: string | null;
  slotAssignmentsJson?: string | null;
  copyBlockJson?: string | null;
  renderManifestJson?: string | null;
  agentRunId?: string | null;
  agent_run_id?: string | null;
  ruleVersionAtSave?: string | null;
  rule_version_at_save?: string | null;
  createdAt?: number | null;
  created_at?: number | null;
  updatedAt?: number | null;
  lockVersion?: number | null;
};

export type CardDetailResponse = {
  card: CardRow & {
    name?: string | null;
    cardSpec?: Record<string, unknown>;
    slotAssignments?: Record<string, unknown>;
    copyBlock?: Record<string, unknown>;
  };
  ruleReport: RuleReport | null;
  parent: { id: string; name: string; thumbnailUrl?: string | null } | null;
  root: { id: string; name: string; thumbnailUrl?: string | null } | null;
  palette: { id: string; name: string; colors: Record<string, string> } | null;
  agentRun: AgentRunRow | null;
};

export type CardShareResponse = {
  publicAccess: boolean;
  shareId: string | null;
  token?: string;
  url: string | null;
};

export type SuggestLayoutLayer = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number | null;
};

export type SuggestLayoutResponse = {
  layers: SuggestLayoutLayer[];
  rationale?: string | null;
};

export type MarketplaceTemplateRow = {
  id: string;
  title?: string | null;
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  author?: { handle?: string | null; displayName?: string | null } | null;
  publishedAt?: number | string | null;
  useCount?: number | string | null;
};

export type MarketplaceTemplatesResponse = {
  templates?: MarketplaceTemplateRow[];
  items?: MarketplaceTemplateRow[];
  pagination?: {
    limit?: number;
    offset?: number;
    hasMore?: boolean;
    nextOffset?: number | null;
  };
  hasMore?: boolean;
  nextOffset?: number | null;
};

export type UseMarketplaceTemplateResponse = {
  cardId?: string;
  newCardId?: string;
  id?: string;
};

export type PublicShareCard = {
  title?: string | null;
  name?: string | null;
  ratioPreset?: string | null;
  width?: number | null;
  height?: number | null;
  background?: string | null;
  cardSpec?: {
    layers?: Array<Record<string, unknown>>;
    background?: string | null;
  };
};

export type PublicShareResponse = {
  share: { publicAccess: boolean };
  card: PublicShareCard;
};

export type AssetRow = {
  id: string;
  kind?: string | null;
  source?: string | null;
  folderId?: string | null;
  folder_id?: string | null;
  ownerUserId?: string | null;
  name?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  transparent?: number | boolean | null;
  tagsJson?: string | null;
  tags_json?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  lockVersion?: number | null;
  deletedAt?: number | null;
  description?: string | null;
  descriptionStatus?: "pending" | "ready" | string | null;
  previewUrl?: string | null;
  // Generation status from the server (assets.ts publicAsset). previewUrl is non-null ONLY
  // when status === "ready"; "generating" = bytes not yet in R2 (agent-gen async / M-102).
  status?: "generating" | "ready" | "failed" | string | null;
  tags?: string[] | null;
};

export type AssetFolderRow = {
  id: string;
  name: string;
  parentFolderId?: string | null;
  parent_folder_id?: string | null;
  depth?: number | null;
};

export type PaletteRow = {
  id: string;
  name: string;
  kind: "canonical" | "team" | "derived" | string;
  locked?: number | boolean | null;
  colorsJson?: string | null;
  colors_json?: string | null;
  lockVersion?: number | null;
};

export type RuleReport = {
  id?: string;
  ruleVersionId?: string;
  passed?: boolean;
  pass?: boolean;
  findings?: unknown[];
  rules?: unknown[];
  score?: number;
};

export type ActiveRuleResponse = {
  rule: {
    id: string;
    family: string;
    version: number;
    status: string;
    active: boolean;
    rules: unknown[];
    canonicalPalette: unknown[];
    lockVersion: number;
  };
};

export type AgentSessionRow = {
  id: string;
  title: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  lockVersion?: number | null;
};

// An asset the agent produced/selected during a run (from tool_call_result.resultPreview).
// Resolved to a thumbnail via GET /assets. previewUrl non-null = ready to render (M-225).
export type ProducedAsset = {
  id: string;
  name?: string | null;
  previewUrl?: string | null;
  pending?: boolean; // status==="generating": bytes not in R2 yet, show loading
  width?: number | null;
  height?: number | null;
  tool?: string; // which tool produced it (generate_asset | search_asset)
};

export type AgentRunRow = {
  id: string;
  sessionId?: string | null;
  state?: string;
  status?: string;
  prompt?: string;
  plan?: Record<string, unknown>;
  tools?: string[];
  steps?: Array<{ name: string; status: "running" | "done" | "error"; output?: string }>;
  outputRefs?: unknown[];
  outputText?: string | null;
  costMicros?: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  createdAt?: number | null;
  // assetIds surfaced via tool_call_result during the run (dedup, order-preserved).
  producedAssetIds?: string[];
  // resolved thumbnails for producedAssetIds (filled by the editor after fetching /assets).
  producedAssets?: ProducedAsset[];
};

export type AgentRunEvent = {
  id?: string;
  runId?: string;
  type?: string;
  event?: string;
  step?: string;
  name?: string;
  tool?: string;
  // Magpie server SSE schema (see server cards.ts AgentRunStreamEvent):
  // event names step_start | step_end | output | done | error, each data payload
  // carries { id, runId, type, stepId?, label?, delta?, output?, createdAt }.
  stepId?: string;
  label?: string;
  delta?: string;
  status?: string;
  outputText?: string;
  output?: unknown;
  createdAt?: number;
  data?: unknown;
  run?: AgentRunRow;
  // R6 tool-use events (server loop.ts): tool_call_start carries { tool, args };
  // tool_call_result carries { tool, resultPreview, success }. resultPreview is the tool's
  // meta: generate_asset -> { assetId }, search_asset -> { assetIds }.
  args?: Record<string, unknown>;
  resultPreview?: Record<string, unknown>;
  success?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, requestId?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

async function request<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await client.api.fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok) throw await toApiError(res, "Request failed.");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; requestId?: string }; message?: string; [key: string]: unknown }
    | null;
  return new ApiError(
    res.status,
    body?.error?.message ?? body?.message ?? fallback,
    body?.error?.code,
    body?.error?.requestId,
    body
  );
}

export const magpieApi = {
  me: () => request<MeResponse>("/api/me", { redirectOn401: false }),
  cards: {
    list: () => request<{ cards: CardRow[] }>("/api/public/cards"),
    get: (id: string) => request<CardDetailResponse>(`/api/public/cards/${encodeURIComponent(id)}`),
    create: (body: Record<string, unknown>) =>
      request<{ id: string; status: string; report: RuleReport }>("/api/public/cards", { method: "POST", json: body }),
    patch: (id: string, body: Record<string, unknown>) =>
      request<{ id: string; status: string; report: RuleReport }>(`/api/public/cards/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
    ruleReport: (id: string) =>
      request<{ cardId: string; reports: RuleReport[] }>(`/api/public/cards/${encodeURIComponent(id)}/rule-report`),
    suggestLayout: (id: string) =>
      request<SuggestLayoutResponse>(`/api/public/cards/${encodeURIComponent(id)}/suggest-layout`, { method: "POST" }),
    publishTemplate: (id: string) =>
      request<{ template: MarketplaceTemplateRow }>(`/api/public/cards/${encodeURIComponent(id)}/publish-template`, { method: "POST" }),
    unpublishTemplate: (id: string) =>
      request<{ unpublished: boolean; templateId: string | null }>(`/api/public/cards/${encodeURIComponent(id)}/publish-template`, { method: "DELETE" }),
  },
  templates: {
    marketplace: (params: { q?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.q?.trim()) query.set("q", params.q.trim());
      if (params.limit) query.set("limit", String(params.limit));
      if (params.offset) query.set("offset", String(params.offset));
      const qs = query.toString();
      return request<MarketplaceTemplatesResponse>(`/api/public/templates/marketplace${qs ? `?${qs}` : ""}`);
    },
    use: (id: string) =>
      request<UseMarketplaceTemplateResponse>(`/api/public/templates/${encodeURIComponent(id)}/use`, { method: "POST" }),
  },
  shares: {
    get: (cardId: string) =>
      request<CardShareResponse>(`/api/public/cards/${encodeURIComponent(cardId)}/share`),
    setPublicAccess: (cardId: string, publicAccess: boolean) =>
      request<CardShareResponse>(`/api/public/cards/${encodeURIComponent(cardId)}/share`, { method: "POST", json: { publicAccess } }),
    publicGet: (token: string) =>
      request<PublicShareResponse>(`/api/public/shares/${encodeURIComponent(token)}`, { redirectOn401: false }),
  },
  assets: {
    fileUrl: (id: string) => `/api/public/assets/${encodeURIComponent(id)}/file`,
    list: (folderId?: string | null) =>
      request<{ assets: AssetRow[] }>(
        `/api/public/assets${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`
      ),
    folders: () => request<{ folders: AssetFolderRow[] }>("/api/public/asset-folders"),
    get: (id: string) => request<{ asset: AssetRow }>(`/api/public/assets/${encodeURIComponent(id)}`),
    upload: (file: File, folderId?: string | null) => {
      const form = new FormData();
      form.set("file", file);
      form.set("name", file.name);
      if (folderId) form.set("folderId", folderId);
      return request<{ id: string; asset: AssetRow }>("/api/public/assets", { method: "POST", body: form });
    },
    patch: (id: string, body: Record<string, unknown>) =>
      request<{ ok: true }>(`/api/public/assets/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
    delete: (id: string, lockVersion: number, confirmUsed = false) =>
      request<{ ok: true; purgeAfterDays: number }>(
        `/api/public/assets/${encodeURIComponent(id)}?lockVersion=${lockVersion}${confirmUsed ? "&confirm_used=true&confirm_retention=true" : ""}`,
        { method: "DELETE" }
      ),
    createFolder: (name: string, parentFolderId?: string | null) =>
      request<{ id: string }>("/api/public/asset-folders", { method: "POST", json: { name, parentFolderId } }),
  },
  palettes: {
    list: () => request<{ palettes: PaletteRow[] }>("/api/public/palettes"),
  },
  rules: {
    active: () => request<ActiveRuleResponse>("/api/public/rules/active"),
  },
  sessions: {
    list: () => request<{ sessions: AgentSessionRow[] }>("/api/public/agent/sessions"),
    create: (title: string) =>
      request<{ id: string }>("/api/public/agent/sessions", { method: "POST", json: { title } }),
    runs: (sessionId: string) =>
      request<{ runs: AgentRunRow[] }>(`/api/public/agent/sessions/${encodeURIComponent(sessionId)}/runs`),
  },
  runs: {
    create: (body: Record<string, unknown>) =>
      request<{ id: string; quote?: unknown; allowedTools: string[] }>("/api/public/agent/runs", { method: "POST", json: body }),
    get: (id: string) => request<{ run: AgentRunRow }>(`/api/public/agent/runs/${encodeURIComponent(id)}`),
    eventsUrl: (id: string) => `/api/public/agent/runs/${encodeURIComponent(id)}/events`,
  },
  manage: {
    profiles: () => request<{ profiles: Array<Record<string, unknown>> }>("/api/public/manage/profiles"),
    updateProfile: (userId: string, body: Record<string, unknown>) =>
      request<{ profile: Record<string, unknown> }>(`/api/public/manage/profiles/${encodeURIComponent(userId)}`, { method: "PATCH", json: body }),
    whitelist: () => request<{ whitelist: SignupWhitelistRow[] }>("/api/public/manage/whitelist"),
    addWhitelist: (body: { kind: "domain" | "email"; value: string }) =>
      request<{ id: string }>("/api/public/manage/whitelist", { method: "POST", json: body }),
    deleteWhitelist: (id: string) =>
      request<{ ok: true }>(`/api/public/manage/whitelist/${encodeURIComponent(id)}`, { method: "DELETE" }),
    events: (filters: { level?: string; code?: string; since?: string; until?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (filters.level && filters.level !== "all") params.set("level", filters.level);
      if (filters.code?.trim()) params.set("code", filters.code.trim());
      if (filters.since) params.set("since", String(new Date(filters.since).getTime()));
      if (filters.until) params.set("until", String(new Date(filters.until).getTime()));
      if (filters.limit) params.set("limit", String(filters.limit));
      const query = params.toString();
      return request<{ events: AdminEventRow[] }>(`/api/public/manage/events${query ? `?${query}` : ""}`);
    },
    event: (id: string) => request<{ event: AdminEventRow }>(`/api/public/manage/events/${encodeURIComponent(id)}`),
    rules: () => request<{ rules: Array<Record<string, unknown>> }>("/api/public/manage/rules"),
    createRule: (body: Record<string, unknown>) =>
      request<{ id: string }>("/api/public/manage/rules", { method: "POST", json: body }),
    patchRule: (id: string, body: Record<string, unknown>) =>
      request<{ ok: true }>(`/api/public/manage/rules/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
    palettes: {
      create: (body: Record<string, unknown>) => request<{ id: string }>("/api/public/manage/palettes", { method: "POST", json: body }),
      patch: (id: string, body: Record<string, unknown>) =>
        request<{ ok: true }>(`/api/public/manage/palettes/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
    },
  },
};
