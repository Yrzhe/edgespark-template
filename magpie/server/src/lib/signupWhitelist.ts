import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { signupWhitelist } from "@defs";
import { newId } from "./ids";
import { getOwnerEmail } from "./ownerConfig";

export type SignupWhitelistKind = "domain" | "email";

const DEFAULT_DOMAIN = "@youware.com";
const SYSTEM_ACTOR = "system";

export function normalizeWhitelistValue(kind: SignupWhitelistKind, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (kind === "domain") return normalized.startsWith("@") ? normalized : `@${normalized}`;
  return normalized;
}

export function parseWhitelistKind(value: unknown): SignupWhitelistKind | null {
  return value === "domain" || value === "email" ? value : null;
}

export async function ensureSignupWhitelistSeed(now = Date.now()): Promise<void> {
  const existing = await db.select().from(signupWhitelist);
  if (existing.length > 0) return;
  await insertWhitelistRow("domain", DEFAULT_DOMAIN, SYSTEM_ACTOR, now);
  const ownerEmail = getOwnerEmail();
  if (ownerEmail) await insertWhitelistRow("email", ownerEmail, SYSTEM_ACTOR, now);
}

export async function listSignupWhitelist(): Promise<Array<typeof signupWhitelist.$inferSelect>> {
  await ensureSignupWhitelistSeed();
  return db.select().from(signupWhitelist);
}

export async function addSignupWhitelistEntry(kind: SignupWhitelistKind, rawValue: string, addedBy: string, now = Date.now()): Promise<{ id: string }> {
  await ensureSignupWhitelistSeed(now);
  const value = normalizeWhitelistValue(kind, rawValue);
  validateWhitelistValue(kind, value);
  const [existing] = await db
    .select()
    .from(signupWhitelist)
    .where(and(eq(signupWhitelist.kind, kind), eq(signupWhitelist.value, value)))
    .limit(1);
  if (existing) {
    if (!existing.active) await db.update(signupWhitelist).set({ active: 1, addedBy, addedAt: now }).where(eq(signupWhitelist.id, existing.id));
    return { id: existing.id };
  }
  return insertWhitelistRow(kind, value, addedBy, now);
}

export async function deactivateSignupWhitelistEntry(id: string): Promise<boolean> {
  const result = await db.update(signupWhitelist).set({ active: 0 }).where(eq(signupWhitelist.id, id));
  return affectedRows(result) !== 0;
}

export async function isSignupWhitelisted(email: string): Promise<boolean> {
  await ensureSignupWhitelistSeed();
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  const domain = `@${normalized.split("@").at(-1)}`;
  const rows = await db.select().from(signupWhitelist);
  return rows.some((row) => row.active === 1 && (
    (row.kind === "email" && row.value === normalized) ||
    (row.kind === "domain" && row.value === domain)
  ));
}

export async function assertSignupWhitelisted(email: string): Promise<void> {
  if (!(await isSignupWhitelisted(email))) throw new Error("signup_not_whitelisted");
}

async function insertWhitelistRow(kind: SignupWhitelistKind, rawValue: string, addedBy: string, addedAt: number): Promise<{ id: string }> {
  const id = newId("wl");
  await db.insert(signupWhitelist).values({
    id,
    kind,
    value: normalizeWhitelistValue(kind, rawValue),
    addedBy,
    addedAt,
    active: 1,
  });
  return { id };
}

function validateWhitelistValue(kind: SignupWhitelistKind, value: string): void {
  if (kind === "domain") {
    if (!/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) throw new Error("invalid_domain_whitelist_value");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("invalid_email_whitelist_value");
}

function affectedRows(result: unknown): number | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, any>;
  return Number.isInteger(r.rowsAffected) ? r.rowsAffected : Number.isInteger(r.changes) ? r.changes : Number.isInteger(r.meta?.changes) ? r.meta.changes : null;
}
