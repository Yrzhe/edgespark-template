import { useCallback } from "react";

import { perchApi } from "@/lib/api";
import type { CreatePageRequest, Page, UpdatePageRequest } from "@/lib/types";
import { useAsyncResource } from "@/hooks/useAsyncResource";

export function usePages() {
  const resource = useAsyncResource<Page[]>(async () => (await perchApi.pages.list()).pages, []);

  const createPage = useCallback(
    async (input: CreatePageRequest) => {
      const { page } = await perchApi.pages.create(input);
      resource.setData((pages) => [page, ...(pages ?? [])]);
      return page;
    },
    [resource.setData]
  );

  const updatePage = useCallback(
    async (pageId: string, input: UpdatePageRequest) => {
      const { page } = await perchApi.pages.update(pageId, input);
      resource.setData((pages) => (pages ?? []).map((item) => (item.id === page.id ? page : item)));
      return page;
    },
    [resource.setData]
  );

  const deletePage = useCallback(
    async (pageId: string) => {
      await perchApi.pages.delete(pageId);
      resource.setData((pages) => (pages ?? []).filter((page) => page.id !== pageId));
    },
    [resource.setData]
  );

  return { ...resource, pages: resource.data ?? [], createPage, updatePage, deletePage };
}
