import { useCallback } from "react";

import { perchApi } from "@/lib/api";
import type { CreateLinkRequest, Link, ReorderLinksRequest, UpdateLinkRequest } from "@/lib/types";
import { useAsyncResource } from "@/hooks/useAsyncResource";

export function useLinks(pageId: string | null | undefined) {
  const resource = useAsyncResource<Link[]>(
    async () => (await perchApi.links.list(pageId as string)).links,
    [pageId],
    { enabled: !!pageId }
  );

  const createLink = useCallback(
    async (input: CreateLinkRequest) => {
      if (!pageId) throw new Error("pageId is required.");
      const { link } = await perchApi.links.create(pageId, input);
      resource.setData((links) => [...(links ?? []), link].sort((a, b) => a.position - b.position));
      return link;
    },
    [pageId, resource.setData]
  );

  const updateLink = useCallback(
    async (linkId: string, input: UpdateLinkRequest) => {
      if (!pageId) throw new Error("pageId is required.");
      const { link } = await perchApi.links.update(pageId, linkId, input);
      resource.setData((links) =>
        (links ?? []).map((item) => (item.id === link.id ? link : item)).sort((a, b) => a.position - b.position)
      );
      return link;
    },
    [pageId, resource.setData]
  );

  const deleteLink = useCallback(
    async (linkId: string) => {
      if (!pageId) throw new Error("pageId is required.");
      await perchApi.links.delete(pageId, linkId);
      resource.setData((links) => (links ?? []).filter((link) => link.id !== linkId));
    },
    [pageId, resource.setData]
  );

  const reorderLinks = useCallback(
    async (input: ReorderLinksRequest) => {
      if (!pageId) throw new Error("pageId is required.");
      const { links } = await perchApi.links.reorder(pageId, input);
      resource.setData(links);
      return links;
    },
    [pageId, resource.setData]
  );

  return { ...resource, links: resource.data ?? [], createLink, updateLink, deleteLink, reorderLinks };
}
