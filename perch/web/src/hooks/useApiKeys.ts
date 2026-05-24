import { useCallback } from "react";

import { perchApi } from "@/lib/api";
import type { ApiKey, CreateApiKeyRequest, CreateApiKeyResponse } from "@/lib/types";
import { useAsyncResource } from "@/hooks/useAsyncResource";

export function useApiKeys() {
  const resource = useAsyncResource<ApiKey[]>(async () => (await perchApi.keys.list()).keys, []);

  const createKey = useCallback(
    async (input: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
      const response = await perchApi.keys.create(input);
      resource.setData((keys) => [response.key, ...(keys ?? [])]);
      return response;
    },
    [resource.setData]
  );

  const revokeKey = useCallback(
    async (id: string) => {
      await perchApi.keys.delete(id);
      const revokedAt = Date.now();
      resource.setData((keys) => (keys ?? []).map((key) => (key.id === id ? { ...key, revokedAt } : key)));
    },
    [resource.setData]
  );

  return { ...resource, keys: resource.data ?? [], createKey, revokeKey };
}
