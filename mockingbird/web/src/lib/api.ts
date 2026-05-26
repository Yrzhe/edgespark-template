import { client } from "@/lib/edgespark";
import type {
  AnalyticsResponse,
  ApiKeyRow,
  BioBlurb,
  ImageRow,
  MatchRule,
  PreviewResponse,
  PreviewShareResponse,
  ProjectRow,
  SocialRow,
  ThemeRow,
} from "@/lib/types";

let managementToken: string | null = null;

type JsonInit = RequestInit & { json?: unknown };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function clearManagementToken() {
  managementToken = null;
}

export async function mintToken() {
  const res = await client.api.fetch("/api/me/token");
  if (res.status === 401) await redirectToLogin();
  if (!res.ok) throw await toApiError(res, "Failed to mint management token.");
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Token response did not include token.");
  managementToken = data.token;
  return data.token;
}

export async function manage<T>(path: string, init: JsonInit = {}): Promise<T> {
  return manageWithRetry(path, init, true);
}

async function manageWithRetry<T>(path: string, init: JsonInit, retry: boolean): Promise<T> {
  const token = managementToken ?? (await mintToken());
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await client.api.fetch(`/api/public/manage${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (res.status === 401 && retry) {
    managementToken = null;
    return manageWithRetry(path, init, false);
  }
  if (res.status === 401) await redirectToLogin();
  if (!res.ok) throw await toApiError(res, "Management request failed.");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function redirectToLogin(): Promise<never> {
  managementToken = null;
  try {
    await client.auth.signOut();
  } catch {
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
    });
  } finally {
    if (window.location.pathname !== "/login") window.location.assign("/login");
  }
  throw new ApiError(401, "Login required.", "unauthorized");
}

async function toApiError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string }; message?: string };
    return new ApiError(res.status, data.error?.message ?? data.message ?? fallback, data.error?.code);
  } catch {
    return new ApiError(res.status, fallback);
  }
}

export const mockingbirdApi = {
  themes: {
    list: () => manage<{ themes: ThemeRow[] }>("/themes"),
    get: (id: string) => manage<{ theme: ThemeRow }>(`/themes/${encodeURIComponent(id)}`),
    update: (id: string, input: Partial<ThemeRow> & { lockVersion: number }) =>
      manage<{ theme: ThemeRow }>(`/themes/${encodeURIComponent(id)}`, { method: "PATCH", json: input }),
    rules: (id: string) => manage<{ rules: MatchRule[] }>(`/themes/${encodeURIComponent(id)}/rules`),
  },
  content: {
    bioBlurbs: () => manage<{ bioBlurbs: BioBlurb[] }>("/content/bio-blurbs"),
    projects: () => manage<{ projects: ProjectRow[] }>("/content/projects"),
    socials: () => manage<{ socials: SocialRow[] }>("/content/socials"),
    images: () => manage<{ images: ImageRow[] }>("/images"),
  },
  preview: (input: unknown) => manage<PreviewResponse>("/preview", { method: "POST", json: input }),
  previewShare: (input: unknown) => manage<PreviewShareResponse>("/preview/share", { method: "POST", json: input }),
  analytics: (range = "30d") => manage<AnalyticsResponse>(`/analytics?range=${encodeURIComponent(range)}`),
  keys: {
    list: () => manage<{ keys: ApiKeyRow[] }>("/keys"),
    create: (name: string) => manage<{ key: ApiKeyRow; plaintext: string }>("/keys", { method: "POST", json: { name } }),
    revoke: (id: string) => manage<{ revoked: true }>(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
};
