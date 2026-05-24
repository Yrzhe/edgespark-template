import { useCallback } from "react";

import { perchApi } from "@/lib/api";
import type {
  ConfirmAssetRequest,
  LinkAssetKind,
  PageAssetKind,
  PresignAssetRequest,
  PresignAssetResponse,
} from "@/lib/types";

export function useAssets(pageId: string | null | undefined, linkId?: string | null) {
  const presign = useCallback(
    async (
      input: PresignAssetRequest<PageAssetKind> | PresignAssetRequest<LinkAssetKind>
    ): Promise<PresignAssetResponse> => {
      if (!pageId) throw new Error("pageId is required.");
      if (linkId) return perchApi.assets.presignLink(pageId, linkId, input as PresignAssetRequest<LinkAssetKind>);
      return perchApi.assets.presignPage(pageId, input as PresignAssetRequest<PageAssetKind>);
    },
    [pageId, linkId]
  );

  const confirm = useCallback(
    async (input: ConfirmAssetRequest<PageAssetKind> | ConfirmAssetRequest<LinkAssetKind>) => {
      if (!pageId) throw new Error("pageId is required.");
      if (linkId) return perchApi.assets.confirmLink(pageId, linkId, input as ConfirmAssetRequest<LinkAssetKind>);
      return perchApi.assets.confirmPage(pageId, input as ConfirmAssetRequest<PageAssetKind>);
    },
    [pageId, linkId]
  );

  const upload = useCallback(
    async (file: File, kind: PageAssetKind | LinkAssetKind) => {
      const signed = await presign({ kind, filename: file.name, contentType: file.type as never });
      const res = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: signed.requiredHeaders,
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed with status ${res.status}.`);
      return confirm({ kind, assetId: signed.assetId } as never);
    },
    [presign, confirm]
  );

  return { presign, confirm, upload };
}
