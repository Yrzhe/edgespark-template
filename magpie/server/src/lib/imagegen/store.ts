import { storage } from "edgespark";
import { buckets } from "@defs";

export const MEDIA_PREFIX = "assets/agent-gen";

// Deterministic R2 key / canonical s3 URI for a generated asset. Pre-computed when an async
// agent generation inserts its pending row so the row's s3_uri already points at where the
// bytes will land — storeGeneratedPng writes to exactly this key.
export function mediaKeyForAsset(assetId: string): string {
  return `${MEDIA_PREFIX}/${assetId}.png`;
}

export function plannedMediaS3Uri(assetId: string): string {
  return storage.createS3Uri(buckets.magpieMedia, mediaKeyForAsset(assetId));
}

// Persist a generated PNG to the magpie-media R2 bucket and return its canonical
// `s3://magpie-media/<key>` URI. This is the single place bytes actually land in storage —
// both the single and batch imagegen flows go through it so no generated image is discarded.
export async function storeGeneratedPng(assetId: string, png: Uint8Array): Promise<string> {
  const key = mediaKeyForAsset(assetId);
  await storage.from(buckets.magpieMedia).put(key, png, { contentType: "image/png" });
  return storage.createS3Uri(buckets.magpieMedia, key);
}
