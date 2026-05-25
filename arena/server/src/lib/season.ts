import { eq } from "drizzle-orm";
import { competition } from "@defs";
import { validateUpstreamBaseUrl } from "./upstream";

export function bucketStart(ts: number): number {
  return Math.floor(ts / 60000) * 60000;
}

export function publicOriginFromHeaders(headers: Headers, requestUrl: string): string {
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  return host ? `${proto}://${host}` : new URL(requestUrl).origin;
}

export async function ensureCompetition(origin: string) {
  const { db, vars } = await import("edgespark");
  const [row] = await db.select().from(competition).where(eq(competition.id, "current")).limit(1);
  if (row) return row;
  const now = Date.now();
  const configuredUpstream = vars.get("UPSTREAM_BASE_URL")?.trim();
  const validatedUpstream = configuredUpstream ? validateUpstreamBaseUrl(configuredUpstream) : null;
  const defaultUpstreamBaseUrl = validatedUpstream?.ok
    ? validatedUpstream.url
    : `${origin.replace(/\/+$/, "")}/api/public/mock`;
  const value: typeof competition.$inferInsert = {
    id: "current",
    title: "Live Trading Arena",
    status: "draft",
    startsAt: null,
    endsAt: null,
    upstreamBaseUrl: defaultUpstreamBaseUrl,
    votingEnabled: 1,
    commentsEnabled: 1,
    activeSeasonId: crypto.randomUUID(),
    updatedAt: now,
  };
  await db.insert(competition).values(value);
  return value as typeof competition.$inferSelect;
}
