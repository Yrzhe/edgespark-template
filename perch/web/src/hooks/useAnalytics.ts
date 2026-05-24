import { perchApi } from "@/lib/api";
import type { AnalyticsQuery, LinkAnalytics, PageAnalytics } from "@/lib/types";
import { useAsyncResource } from "@/hooks/useAsyncResource";

export function useAnalytics(pageId: string | null | undefined, range: AnalyticsQuery = {}) {
  const from = range.from;
  const to = range.to;
  const resource = useAsyncResource<PageAnalytics>(
    async () => perchApi.analytics.page(pageId as string, { from, to }),
    [pageId, from, to],
    { enabled: !!pageId }
  );

  return { ...resource, analytics: resource.data, dailySeries: resource.data?.dailySeries ?? [] };
}

export function useLinkAnalytics(
  pageId: string | null | undefined,
  linkId: string | null | undefined,
  range: AnalyticsQuery = {}
) {
  const from = range.from;
  const to = range.to;
  const resource = useAsyncResource<LinkAnalytics>(
    async () => perchApi.analytics.link(pageId as string, linkId as string, { from, to }),
    [pageId, linkId, from, to],
    { enabled: !!pageId && !!linkId }
  );

  return { ...resource, analytics: resource.data };
}
