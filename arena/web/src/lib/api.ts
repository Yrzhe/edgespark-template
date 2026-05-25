import { client } from "@/lib/edgespark";
import type {
  ApiKeysResponse,
  CommentCreateResponse,
  CommentsResponse,
  CompetitionResponse,
  ContestantDetail,
  ContestantsResponse,
  CreateApiKeyResponse,
  DecisionsByMinuteResponse,
  DecisionsResponse,
  DailyResponse,
  EquitySeriesResponse,
  IngestResponse,
  ManagedCommentsResponse,
  ManagedCompetitionResponse,
  ManagedContestantsResponse,
  MeResponse,
  PresignAvatarResponse,
  SeriesRange,
  SummaryEquityResponse,
  SummaryVotesResponse,
  VoteResponse,
  VoteSeriesResponse,
  VotesResponse,
} from "@/lib/types";

type JsonBody = unknown;

let managementToken: string | null = null;
const API_KEY_STORAGE = "arena.managementBearer";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function setManagementBearer(token: string | null) {
  managementToken = token;
  if (token) localStorage.setItem(API_KEY_STORAGE, token);
  else localStorage.removeItem(API_KEY_STORAGE);
}

export function clearManagementToken() {
  managementToken = null;
}

export async function publicApi<T>(path: string, init: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  const res = await client.api.fetch(`/api/public${path}`, withJson(init));
  return readResponse<T>(res, "Public API request failed.");
}

export async function appApi<T>(path: string, init: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  const res = await client.api.fetch(path, withJson(init));
  return readResponse<T>(res, "API request failed.");
}

export async function mintToken(): Promise<string> {
  const res = await client.api.fetch("/api/me/token");
  const data = await readResponse<{ token?: string }>(res, "Failed to mint management token.");
  if (!data.token) throw new Error("Management token missing.");
  managementToken = data.token;
  return data.token;
}

export async function manage<T>(path: string, init: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  return manageWithRetry<T>(path, init, true);
}

async function manageWithRetry<T>(path: string, init: RequestInit & { json?: JsonBody }, retry: boolean): Promise<T> {
  const token = managementToken ?? localStorage.getItem(API_KEY_STORAGE) ?? (await mintToken());
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await client.api.fetch(`/api/public/manage${path}`, { ...withJson(init), headers });
  if (res.status === 401 && retry) {
    managementToken = null;
    localStorage.removeItem(API_KEY_STORAGE);
    return manageWithRetry<T>(path, init, false);
  }
  return readResponse<T>(res, "Management request failed.");
}

function withJson(init: RequestInit & { json?: JsonBody }): RequestInit {
  const headers = new Headers(init.headers);
  if (init.json !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  };
}

async function readResponse<T>(res: Response, fallback: string): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/plain")) return (await res.text()) as T;
    return (await res.json()) as T;
  }
  throw await toApiError(res, fallback);
}

async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: string | { code?: string; message?: string }; message?: string };
    if (typeof data.error === "string") return new ApiError(res.status, data.error);
    return new ApiError(res.status, data.error?.message ?? data.message ?? fallback, data.error?.code);
  } catch {
    return new ApiError(res.status, fallback);
  }
}

function qs(params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

function idsParam(ids: string[]) {
  return ids.length ? ids.join(",") : undefined;
}

export const arenaApi = {
  me: () => appApi<MeResponse>("/api/me"),
  competition: () => publicApi<CompetitionResponse>("/competition"),
  contestants: () => publicApi<ContestantsResponse>("/contestants"),
  contestant: (id: string) => publicApi<ContestantDetail>(`/contestants/${encodeURIComponent(id)}`),
  equitySeries: (range: SeriesRange, ids: string[]) =>
    publicApi<EquitySeriesResponse>(`/equity-series${qs({ range, ids: idsParam(ids) })}`),
  votes: () => publicApi<VotesResponse>("/votes"),
  voteSeries: (range: SeriesRange, ids: string[]) =>
    publicApi<VoteSeriesResponse>(`/votes/series${qs({ range, ids: idsParam(ids) })}`),
  decisions: (input: { contestantId?: string; cursor?: string | null; limit?: number } = {}) =>
    publicApi<DecisionsResponse>(`/decisions${qs(input)}`),
  decisionsByMinute: (input: { cursor?: string | null; limit?: number } = {}) =>
    publicApi<DecisionsByMinuteResponse>(`/decisions/by-minute${qs(input)}`),
  daily: (contestantId: string) => publicApi<DailyResponse>(`/daily${qs({ contestantId })}`),
  comments: (input: { since?: number; cursor?: string | null; limit?: number } = {}) =>
    publicApi<CommentsResponse>(`/comments${qs(input)}`),
  llms: () => publicApi<string>("/llms.txt"),
  ingest: (json: { agents?: unknown; snapshots?: unknown; decisions?: unknown }) =>
    publicApi<IngestResponse>("/ingest", { method: "POST", json }),
  vote: (contestantId: string, count: number) =>
    appApi<VoteResponse>("/api/vote", { method: "POST", json: { contestantId, count } }),
  comment: (text: string) => appApi<CommentCreateResponse>("/api/comments", { method: "POST", json: { text } }),
  manage: {
    competition: () => manage<ManagedCompetitionResponse>("/competition"),
    patchCompetition: (json: Partial<ManagedCompetitionResponse["competition"]>) =>
      manage<ManagedCompetitionResponse>("/competition", { method: "PATCH", json }),
    start: () => manage<ManagedCompetitionResponse>("/competition/start", { method: "POST" }),
    end: () => manage<ManagedCompetitionResponse>("/competition/end", { method: "POST" }),
    contestants: () => manage<ManagedContestantsResponse>("/contestants"),
    syncContestants: () => manage<ManagedContestantsResponse & { ok: true; inserted: number }>("/contestants/sync", { method: "POST" }),
    patchContestant: (id: string, json: Partial<{ displayName: string; tagline: string; accentColor: string; sortOrder: number; hidden: boolean }>) =>
      manage<{ contestant: ManagedContestantsResponse["contestants"][number] }>(`/contestants/${encodeURIComponent(id)}`, { method: "PATCH", json }),
    reorderContestants: (items: Array<{ id: string; sortOrder: number }>) =>
      manage<{ ok: true }>("/contestants/reorder", { method: "POST", json: { items } }),
    presignAvatar: (id: string, contentType: string) =>
      manage<PresignAvatarResponse>(`/contestants/${encodeURIComponent(id)}/avatar/presign`, { method: "POST", json: { contentType } }),
    confirmAvatar: (id: string, key: string) =>
      manage<{ avatarS3Uri: string }>(`/contestants/${encodeURIComponent(id)}/avatar/confirm`, { method: "POST", json: { key } }),
    resetVotes: () => manage<{ ok: true; seasonId: string }>("/votes/reset", { method: "POST" }),
    comments: () => manage<ManagedCommentsResponse>("/comments"),
    hideComment: (id: number) => manage<{ ok: true }>(`/comments/${id}/hide`, { method: "PATCH" }),
    keys: () => manage<ApiKeysResponse>("/keys"),
    createKey: (name: string) => manage<CreateApiKeyResponse>("/keys", { method: "POST", json: { name } }),
    revokeKey: (id: string) => manage<{ revoked: true }>(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
    summaryVotes: () => manage<SummaryVotesResponse>("/summary/votes"),
    summaryEquity: () => manage<SummaryEquityResponse>("/summary/equity"),
    clear: () => manage<{ ok: true }>("/clear", { method: "POST", json: { confirm: "CLEAR" } }),
  },
};
