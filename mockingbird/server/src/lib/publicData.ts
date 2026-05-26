import { and, asc, eq, isNull } from "drizzle-orm";
import { bioBlurbs, images, matchRules, projects, socials, themes } from "@defs";
import { db } from "edgespark";
import { selectTheme } from "./matcher/selectTheme";
import { signedImageUrl } from "./publicPage/images";
import type { PublicContent } from "./publicPage/layouts";
import type { VisitorPromptSafe } from "./signals/types";
import { hashObject, llmCacheKey, type CacheHashes } from "./llm/cache";

export type PublicContext = {
  themes: Array<typeof themes.$inferSelect>;
  rules: Array<typeof matchRules.$inferSelect>;
  content: PublicContent;
  selection: ReturnType<typeof selectTheme>;
  theme: typeof themes.$inferSelect;
  hashes: CacheHashes;
  cacheKey: string;
};

export async function loadPublicContext(visitor: VisitorPromptSafe, bucketSeed: string): Promise<PublicContext> {
  const [themeRows, ruleRows, content] = await Promise.all([
    db.select().from(themes).where(and(eq(themes.status, "active"), isNull(themes.deletedAt))).orderBy(asc(themes.priority)),
    db.select().from(matchRules).where(and(eq(matchRules.enabled, 1), isNull(matchRules.deletedAt))),
    loadContent(),
  ]);
  const selection = selectTheme({ themes: themeRows, rules: ruleRows, visitor, bucketSeed });
  const theme = themeRows.find((row) => row.id === selection.theme.id) ?? seedTheme();
  const candidates = selection.candidates.map((row) => row.theme.id);
  const hashes = await computeHashes({ themes: themeRows, rules: ruleRows, content, candidates });
  const cacheKey = llmCacheKey({
    themeOrTie: candidates.join("_") || theme.id,
    visitor,
    ...hashes,
  });
  return { themes: themeRows, rules: ruleRows, content, selection, theme, hashes, cacheKey };
}

export async function loadContent(): Promise<PublicContent> {
  const [bios, projectRows, socialRows, imageRows] = await Promise.all([
    db.select().from(bioBlurbs).where(and(eq(bioBlurbs.isActive, 1), isNull(bioBlurbs.deletedAt))).orderBy(asc(bioBlurbs.position), asc(bioBlurbs.createdAt)),
    db.select().from(projects).where(and(eq(projects.status, "active"), isNull(projects.deletedAt))).orderBy(asc(projects.position), asc(projects.createdAt)),
    db.select().from(socials).where(and(eq(socials.isActive, 1), isNull(socials.deletedAt))).orderBy(asc(socials.position), asc(socials.createdAt)),
    db.select().from(images).where(and(eq(images.isActive, 1), isNull(images.deletedAt))),
  ]);
  const imageUrlById = new Map<string, string | null>();
  await Promise.all(imageRows.map(async (image) => imageUrlById.set(image.id, await signedImageUrl(image.s3Uri))));
  return { bioBlurbs: bios, projects: projectRows.map((p) => ({ ...p, imageUrl: p.imageId ? imageUrlById.get(p.imageId) ?? null : null })), socials: socialRows };
}

export async function computeHashes(input: { themes: Array<typeof themes.$inferSelect>; rules: Array<typeof matchRules.$inferSelect>; content: PublicContent; candidates: string[] }): Promise<CacheHashes> {
  const selectedThemes = input.themes.filter((theme) => input.candidates.includes(theme.id));
  return {
    contentHash: await hashObject({
      bio: input.content.bioBlurbs.map((row) => [row.id, row.title, row.body, row.updatedAt]),
      projects: input.content.projects.map((row) => [row.id, row.title, row.description, row.updatedAt]),
      socials: input.content.socials.map((row) => [row.id, row.label, row.updatedAt]),
    }),
    ruleHash: await hashObject(input.rules.map((row) => [row.id, row.themeId, row.compiledJson, row.score, row.updatedAt])),
    promptHash: await hashObject(selectedThemes.map((row) => [row.id, row.copyPrompt, row.defaultTone, row.updatedAt])),
    modelKey: "gpt-4o-mini",
  };
}

export function seedTheme(): typeof themes.$inferSelect {
  const now = Date.now();
  return { id: "seed_letter", slug: "letter", name: "Letter", layoutKey: "letter", status: "active", priority: 0, abWeight: 100, paletteJson: JSON.stringify({ bg: "#FBFAF6", fg: "#1A1715", accent: "#2556B6" }), fontJson: "{}", layoutConfigJson: "{}", copyPrompt: "", defaultTone: "clear, warm, concise", fallbackCopyJson: JSON.stringify({ headline: "Personal site", intro: "A small adaptive home for current work." }), isDefault: 1, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now };
}
