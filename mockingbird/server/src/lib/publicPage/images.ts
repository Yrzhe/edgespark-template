import { storage } from "edgespark";
import { buckets } from "@defs";

export async function signedImageUrl(s3Uri: string | null, ttlSec = 900): Promise<string | null> {
  if (!s3Uri) return null;
  const parsed = storage.tryParseS3Uri(s3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.mockingbirdMedia.bucket_name) return null;
  const { downloadUrl } = await storage.from(buckets.mockingbirdMedia).createPresignedGetUrl(parsed.path, ttlSec);
  return downloadUrl;
}
