/**
 * Storage Schema — Perch media bucket.
 *
 * Keys:
 * - owner/avatar/<asset_id>/<filename>
 * - pages/<page_id>/avatars/<asset_id>/<filename>
 * - pages/<page_id>/covers/<asset_id>/<filename>
 * - pages/<page_id>/links/<link_id>/<asset_id>/<filename>
 */

import type { BucketDef } from "@sdk/server-types";

export const perchMedia: BucketDef<"perch-media"> = {
  bucket_name: "perch-media",
  description: "Perch page avatars, covers, and link thumbnails (<page_id>/<asset_id>/<filename>)",
};
