import { client } from "@/lib/edgespark";

let managementToken: string | null = null;

type JsonBody = Record<string, unknown> | unknown[];

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export async function mintToken(): Promise<string> {
  const res = await client.api.fetch("/api/me/token");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to mint management token."));
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Token response did not include a token.");
  managementToken = data.token;
  return data.token;
}

export async function manage<T>(path: string, init: RequestInit & { json?: JsonBody } = {}): Promise<T> {
  return manageWithRetry<T>(path, init, true);
}

export function clearManagementToken() {
  managementToken = null;
}

async function manageWithRetry<T>(path: string, init: RequestInit & { json?: JsonBody }, retry: boolean): Promise<T> {
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
  if (!res.ok) throw new Error(await errorMessage(res, "Management request failed."));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string }; message?: string };
    return data.error?.message ?? data.message ?? fallback;
  } catch {
    return fallback;
  }
}
