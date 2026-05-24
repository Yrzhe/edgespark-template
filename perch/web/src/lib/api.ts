import { client } from "@/lib/edgespark";
import type {
  AnalyticsQuery,
  ApiErrorBody,
  ApiKeyListResponse,
  ConfirmAssetRequest,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CreateLinkRequest,
  CreatePageRequest,
  DeleteResponse,
  LinkAnalytics,
  LinkAssetKind,
  LinkListResponse,
  LinkResponse,
  MeResponse,
  OwnerAvatarPresignResponse,
  PageAnalytics,
  PageAssetKind,
  PageListResponse,
  PageResponse,
  PresignAssetRequest,
  PresignAssetResponse,
  PublicPageConfig,
  ReorderLinksRequest,
  ReorderLinksResponse,
  UpdateLinkRequest,
  UpdatePageRequest,
} from "@/lib/types";

let managementToken: string | null = null;

type JsonBody = unknown;

export class ApiError extends Error {
  readonly code?: string;
  readonly requestId?: string;
  readonly status: number;

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function mintToken(): Promise<string> {
  const res = await client.api.fetch("/api/me/token");
  if (!res.ok) throw await toApiError(res, "Failed to mint management token.");
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Token response did not include a token.");
  managementToken = data.token;
  return data.token;
}

export function clearManagementToken() {
  managementToken = null;
}

export async function manage<T>(path: string, init: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  return manageWithRetry<T>(path, init, true);
}

async function manageWithRetry<T>(
  path: string,
  init: RequestInit & { json?: JsonBody },
  retry: boolean
): Promise<T> {
  const token = managementToken ?? (await mintToken());
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await client.api.fetch(`/api/public/manage${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && retry) {
    managementToken = null;
    return manageWithRetry<T>(path, init, false);
  }
  if (!res.ok) throw await toApiError(res, "Management request failed.");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await client.api.fetch(`/api/public${path}`, init);
  if (!res.ok) throw await toApiError(res, "Public request failed.");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const perchApi = {
  me: {
    get: () => appApi<MeResponse>("/api/me"),
    presignAvatar: (contentType: string) =>
      appApi<OwnerAvatarPresignResponse>("/api/me/avatar/presign", {
        method: "POST",
        json: { contentType },
      }),
    confirmAvatar: (key: string) =>
      appApi<{ avatarS3Uri: string }>("/api/me/avatar/confirm", {
        method: "POST",
        json: { key },
      }),
  },
  pages: {
    list: () => manage<PageListResponse>("/pages"),
    get: (pageId: string) => manage<PageResponse>(`/pages/${encodeURIComponent(pageId)}`),
    create: (input: CreatePageRequest) => manage<PageResponse>("/pages", { method: "POST", json: input }),
    update: (pageId: string, input: UpdatePageRequest) =>
      manage<PageResponse>(`/pages/${encodeURIComponent(pageId)}`, { method: "PATCH", json: input }),
    delete: (pageId: string) =>
      manage<DeleteResponse>(`/pages/${encodeURIComponent(pageId)}`, { method: "DELETE" }),
    publicConfig: (slug: string) => publicApi<PublicPageConfig>(`/pages/${encodeURIComponent(slug)}/config`),
  },
  links: {
    list: (pageId: string) => manage<LinkListResponse>(`/pages/${encodeURIComponent(pageId)}/links`),
    create: (pageId: string, input: CreateLinkRequest) =>
      manage<LinkResponse>(`/pages/${encodeURIComponent(pageId)}/links`, { method: "POST", json: input }),
    update: (pageId: string, linkId: string, input: UpdateLinkRequest) =>
      manage<LinkResponse>(`/pages/${encodeURIComponent(pageId)}/links/${encodeURIComponent(linkId)}`, {
        method: "PATCH",
        json: input,
      }),
    delete: (pageId: string, linkId: string) =>
      manage<DeleteResponse>(`/pages/${encodeURIComponent(pageId)}/links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
      }),
    reorder: (pageId: string, input: ReorderLinksRequest) =>
      manage<ReorderLinksResponse>(`/pages/${encodeURIComponent(pageId)}/links/reorder`, {
        method: "POST",
        json: input,
      }),
  },
  assets: {
    presignPage: (pageId: string, input: PresignAssetRequest<PageAssetKind>) =>
      manage<PresignAssetResponse>(`/pages/${encodeURIComponent(pageId)}/assets/presign`, {
        method: "POST",
        json: input,
      }),
    confirmPage: (pageId: string, input: ConfirmAssetRequest<PageAssetKind>) =>
      manage<PageResponse>(`/pages/${encodeURIComponent(pageId)}/assets/confirm`, {
        method: "POST",
        json: input,
      }),
    presignLink: (pageId: string, linkId: string, input: PresignAssetRequest<LinkAssetKind>) =>
      manage<PresignAssetResponse>(
        `/pages/${encodeURIComponent(pageId)}/links/${encodeURIComponent(linkId)}/assets/presign`,
        { method: "POST", json: input }
      ),
    confirmLink: (pageId: string, linkId: string, input: ConfirmAssetRequest<LinkAssetKind>) =>
      manage<LinkResponse>(`/pages/${encodeURIComponent(pageId)}/links/${encodeURIComponent(linkId)}/assets/confirm`, {
        method: "POST",
        json: input,
      }),
  },
  analytics: {
    page: (pageId: string, query: AnalyticsQuery = {}) =>
      manage<PageAnalytics>(`/pages/${encodeURIComponent(pageId)}/analytics${queryString(query)}`),
    link: (pageId: string, linkId: string, query: AnalyticsQuery = {}) =>
      manage<LinkAnalytics>(
        `/pages/${encodeURIComponent(pageId)}/links/${encodeURIComponent(linkId)}/analytics${queryString(query)}`
      ),
  },
  keys: {
    list: () => manage<ApiKeyListResponse>("/keys"),
    create: (input: CreateApiKeyRequest) => manage<CreateApiKeyResponse>("/keys", { method: "POST", json: input }),
    delete: (id: string) => manage<{ revoked: true }>(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
};

async function appApi<T>(path: string, init: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await client.api.fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok) throw await toApiError(res, "Request failed.");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function queryString(query: AnalyticsQuery): string {
  const params = new URLSearchParams();
  if (query.from !== undefined) params.set("from", String(query.from));
  if (query.to !== undefined) params.set("to", String(query.to));
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    return new ApiError(
      res.status,
      data.error?.message ?? data.message ?? fallback,
      data.error?.code,
      data.error?.requestId
    );
  } catch {
    return new ApiError(res.status, fallback);
  }
}
