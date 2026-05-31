import { Hono } from "hono";
import { auth } from "edgespark/http";
import { db } from "edgespark";
import { and, eq, gte, sql } from "drizzle-orm";
import { costLedger, teamProfiles } from "@defs";
import { logEvent } from "../lib/events";
import { signMgmtToken } from "../lib/mgmtToken";
import { getDailyBudgetUsd, getMgmtSecret, isOwnerEmail } from "../lib/ownerConfig";
import { isSignupWhitelisted } from "../lib/signupWhitelist";
import { httpError } from "../lib/httpErrors";
import { requireApprovedUser, type AppEnv } from "../middleware/managementAuth";

export const meRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = auth.user;
    if (!user?.id || !user.email) return httpError(c, 401, "unauthorized", "Authentication required.");
    const profile = await ensureProfile({ id: user.id, email: user.email, name: user.name ?? null }, c.req.path);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [costRow] = await db
      .select({ totalMicros: sql<number>`coalesce(sum(${costLedger.costMicros}), 0)` })
      .from(costLedger)
      .where(and(eq(costLedger.userId, user.id), gte(costLedger.occurredAt, startOfDay.getTime())));
    const todayUsdSpent = (Number(costRow?.totalMicros ?? 0) / 1_000_000);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name ?? null },
      profile,
      gates: { ownerApproved: isOwnerEmail(user.email) || profile?.approvalStatus === "approved" },
      dailyBudgetUsd: getDailyBudgetUsd(),
      todayUsdSpent,
    });
  })
  .get("/token", requireApprovedUser, async (c) => {
    const user = auth.user;
    if (!user?.email || !isOwnerEmail(user.email)) return httpError(c, 403, "owner_required", "Only the owner can mint management tokens.");
    const secret = getMgmtSecret();
    if (!secret) return httpError(c, 500, "not_configured", "MGMT_TOKEN_SECRET is not set.");
    return c.json({ token: await signMgmtToken({ email: user.email }, secret, 3600), expiresIn: 3600 });
  });

async function ensureProfile(user: { id: string; email: string; name?: string | null }, route: string) {
  const [profile] = await db.select().from(teamProfiles).where(eq(teamProfiles.userId, user.id)).limit(1);
  if (profile) return profile;
  const now = Date.now();
  if (!isOwnerEmail(user.email)) {
    if (!(await isSignupWhitelisted(user.email))) return null;
    const pendingProfile = {
      userId: user.id,
      email: user.email,
      displayName: user.name ?? "",
      approvalStatus: "pending",
      role: "member",
      signupMetadataJson: "{}",
      createdAt: now,
      updatedAt: now,
      lockVersion: 0,
    };
    await db.insert(teamProfiles).values(pendingProfile);
    void logEvent("audit", "signup_pending_profile_created", user.email, { userId: user.id, route });
    return pendingProfile;
  }
  const ownerProfile = {
    userId: user.id,
    email: user.email,
    displayName: user.name ?? "Owner",
    approvalStatus: "approved",
    role: "owner",
    signupMetadataJson: "{}",
    approvedBy: user.email,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    lockVersion: 0,
  };
  await db.insert(teamProfiles).values(ownerProfile);
  return ownerProfile;
}
