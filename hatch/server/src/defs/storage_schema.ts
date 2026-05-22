/**
 * Storage Schema — R2 buckets (first-level path prefixes within the project's R2 bucket).
 *
 * After editing: edgespark storage apply
 */

import type { BucketDef } from "@sdk/server-types";

/** Content-addressed hosted-site files. Keys: `<site_id>/<hash>`. */
export const siteAssets: BucketDef<"site-assets"> = {
  bucket_name: "site-assets",
  description: "Content-addressed hosted-site files (<site_id>/<hash>)",
};

/** BaaS visitor uploads. Keys: `<site_id>/<file_id>/<filename>`. */
export const baasUploads: BucketDef<"baas-uploads"> = {
  bucket_name: "baas-uploads",
  description: "BaaS visitor uploads (<site_id>/<file_id>/<filename>)",
};
