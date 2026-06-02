import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db, storage } from "edgespark";
import { adBeacons, ads, buckets } from "@defs";
import { forumConfig, type WarrenAdSlot } from "../config/forum";

export type PublicAd = {
  id: string;
  slot: string;
  title: string;
  body: string;
  image_url: string | null;
  cta_label: string;
  cta_url: string;
  sponsored: true;
};

export type AdsSelectionContext = {
  now?: number;
  limit?: number;
  random?: () => number;
};

export type AdBeaconEventType = "impression" | "click";

type AdRow = typeof ads.$inferSelect;
type PresignedGetBucket = {
  createPresignedGetUrl(path: string, expiresInSecs?: number): Promise<{ downloadUrl: string }>;
};

const BEACON_WINDOW_MS = 60 * 60 * 1000;

export async function selectWeightedAd(
  slot: WarrenAdSlot,
  now = Date.now(),
  random: () => number = Math.random
): Promise<AdRow | null> {
  if (!forumConfig.ads.enabled) return null;

  const candidates = await db.select().from(ads)
    .where(and(
      eq(ads.slot, slot),
      eq(ads.active, 1),
      or(isNull(ads.startsAt), lte(ads.startsAt, now)),
      or(isNull(ads.endsAt), gt(ads.endsAt, now))
    ));

  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, ad) => sum + Math.max(0, ad.weight), 0);
  if (totalWeight <= 0) {
    return candidates[Math.floor(random() * candidates.length)] ?? candidates[0] ?? null;
  }

  let cursor = random() * totalWeight;
  for (const ad of candidates) {
    cursor -= Math.max(0, ad.weight);
    if (cursor <= 0) return ad;
  }
  return candidates[candidates.length - 1] ?? null;
}

export async function selectAdsForSlot(slot: WarrenAdSlot, ctx: AdsSelectionContext = {}): Promise<PublicAd[]> {
  const limit = Math.max(1, ctx.limit ?? forumConfig.ads.defaultPerSlot);
  const selected: PublicAd[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < limit; i++) {
    const ad = await selectWeightedAd(slot, ctx.now, ctx.random);
    if (!ad || seen.has(ad.id)) break;
    seen.add(ad.id);
    selected.push(await toPublicAd(ad));
  }

  return selected;
}

export async function loadAdById(id: string): Promise<AdRow | null> {
  const [ad] = await db.select().from(ads).where(eq(ads.id, id)).limit(1);
  return ad ?? null;
}

export async function recordAdBeacon(input: {
  adId: string;
  eventType: AdBeaconEventType;
  ipHash: string;
  now?: number;
}): Promise<{ ad: AdRow | null; counted: boolean }> {
  const now = input.now ?? Date.now();
  const ad = await loadAdById(input.adId);
  if (!ad) return { ad: null, counted: false };

  const inserted = await db.insert(adBeacons)
    .values({
      id: crypto.randomUUID(),
      adId: input.adId,
      eventType: input.eventType,
      ipHash: input.ipHash,
      windowBucket: beaconWindowBucket(now),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: adBeacons.id });

  if (inserted.length === 0) return { ad, counted: false };

  if (input.eventType === "impression") {
    await db.update(ads)
      .set({ impressionCount: sql`${ads.impressionCount} + 1` })
      .where(eq(ads.id, input.adId));
  } else {
    await db.update(ads)
      .set({ clickCount: sql`${ads.clickCount} + 1` })
      .where(eq(ads.id, input.adId));
  }

  return { ad, counted: true };
}

export function isAdSlot(value: string): value is WarrenAdSlot {
  return adSlotSet.has(value as WarrenAdSlot);
}

export async function toPublicAd(ad: AdRow): Promise<PublicAd> {
  return {
    id: ad.id,
    slot: ad.slot,
    title: ad.title,
    body: ad.body,
    image_url: await signedImageUrl(ad.imageS3Uri),
    cta_label: ad.ctaLabel,
    cta_url: ad.ctaUrl,
    sponsored: true,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function beaconWindowBucket(now: number): number {
  return Math.floor(now / BEACON_WINDOW_MS);
}

async function signedImageUrl(s3Uri: string | null): Promise<string | null> {
  if (!s3Uri) return null;
  const parsed = storage.tryParseS3Uri(s3Uri);
  if (!parsed || parsed.bucket.bucket_name !== buckets.warrenMedia.bucket_name) return null;
  const bucket = storage.from(buckets.warrenMedia) as PresignedGetBucket;
  const { downloadUrl } = await bucket.createPresignedGetUrl(parsed.path, 900);
  return downloadUrl;
}

const adSlotSet = new Set<WarrenAdSlot>(Object.keys(forumConfig.ads.slots) as WarrenAdSlot[]);
