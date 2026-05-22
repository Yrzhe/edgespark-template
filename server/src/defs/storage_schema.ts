/**
 * Storage Schema
 *
 * Define your storage buckets here for compile-time type safety.
 * This file is the source of truth for bucket metadata.
 * Bucket names are first-level path prefixes in the environment's R2 bucket.
 *
 * After editing this file, run:
 *   edgespark storage apply
 *
 * Usage in code:
 *   import { buckets } from "@defs";
 *   await edgespark.storage.from(buckets.uploads).put("file.jpg", buffer);
 */

import type { BucketDef } from "@sdk/server-types";

// Example bucket — uncomment and modify:
//
// export const uploads: BucketDef<"uploads"> = {
//   bucket_name: "uploads",
//   description: "User uploaded files",
// };
