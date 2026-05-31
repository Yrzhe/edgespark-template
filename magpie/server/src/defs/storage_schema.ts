import type { BucketDef } from "../__generated__/server-types";

// R2 bucket holding every Magpie image asset — agent-generated and (future) user uploads.
// Provisioned from this schema on `edgespark deploy`. Persist the canonical `s3://magpie-media/<key>`
// URI (via storage.createS3Uri) on the assets row; never hand-build the URI string.
export const magpieMedia: BucketDef<"magpie-media"> = {
  bucket_name: "magpie-media",
  description: "Magpie generated and uploaded image assets",
};
