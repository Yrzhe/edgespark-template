import { useCallback } from "react";

import { perchApi } from "@/lib/api";
import type { Page, PublicPageConfig, UpdatePageRequest } from "@/lib/types";
import { useAsyncResource } from "@/hooks/useAsyncResource";

export function usePage(pageId: string | null | undefined) {
  const resource = useAsyncResource<Page>(
    async () => (await perchApi.pages.get(pageId as string)).page,
    [pageId],
    { enabled: !!pageId }
  );

  const updatePage = useCallback(
    async (input: UpdatePageRequest) => {
      if (!pageId) throw new Error("pageId is required.");
      const { page } = await perchApi.pages.update(pageId, input);
      resource.setData(page);
      return page;
    },
    [pageId, resource.setData]
  );

  return { ...resource, page: resource.data, updatePage };
}

export function usePublicPageConfig(slug: string | null | undefined) {
  const resource = useAsyncResource<PublicPageConfig>(
    async () => perchApi.pages.publicConfig(slug as string),
    [slug],
    { enabled: !!slug }
  );

  return { ...resource, config: resource.data };
}
