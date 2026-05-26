import type { bioBlurbs, projects, socials, themes } from "@defs";
import type { VisitorPrivate, VisitorPromptSafe } from "../signals/types";
import { PRECISE_FIELD_NAMES } from "../signals/types";
import { promptSafeVisitor, assertNoPreciseFieldsSerialized } from "../signals/privacy";
import { blockKeysFor } from "./blockSchema";

export type PromptTheme = Pick<typeof themes.$inferSelect, "id" | "layoutKey" | "name" | "defaultTone" | "copyPrompt">;
export type PromptContent = {
  bioBlurbs: Array<Pick<typeof bioBlurbs.$inferSelect, "id" | "title" | "body" | "tagsJson">>;
  projects: Array<Pick<typeof projects.$inferSelect, "id" | "title" | "description" | "tagsJson">>;
  socials: Array<Pick<typeof socials.$inferSelect, "id" | "platform" | "label">>;
};

export type LlmPromptInput = {
  visitor: VisitorPromptSafe;
  candidateThemes: Array<{ id: string; layoutKey: string; name: string; tone: string; copyPrompt: string; blockKeys: string[] }>;
  content: {
    bioBlurbs: Array<{ id: string; title: string; body: string; tags: unknown[] }>;
    projects: Array<{ id: string; title: string; description: string; tags: unknown[] }>;
    socials: Array<{ id: string; platform: string; label: string }>;
  };
  outputSchema: {
    selectedThemeId: "string";
    blocks: Record<string, "string">;
    projectSummaries: Array<{ projectId: "string"; title: "string"; description: "string" }>;
  };
  contract: string[];
};

export function buildPrompt(input: { visitor: VisitorPromptSafe | VisitorPrivate; candidateThemes: PromptTheme[]; content: PromptContent }): LlmPromptInput {
  const visitor = "precise" in input.visitor ? promptSafeVisitor(input.visitor) : input.visitor;
  const projectIds = input.content.projects.map((project) => project.id);
  const blockKeySet = new Set<string>();
  const candidateThemes = input.candidateThemes.map((theme) => {
    const blockKeys = blockKeysFor(theme.layoutKey, projectIds);
    for (const key of blockKeys) blockKeySet.add(key);
    return {
      id: theme.id,
      layoutKey: theme.layoutKey,
      name: theme.name,
      tone: theme.defaultTone,
      copyPrompt: theme.copyPrompt.slice(0, 2048),
      blockKeys,
    };
  });
  const prompt: LlmPromptInput = {
    visitor,
    candidateThemes,
    content: {
      bioBlurbs: input.content.bioBlurbs.map((row) => ({ id: row.id, title: row.title, body: row.body, tags: safeJsonArray(row.tagsJson) })),
      projects: input.content.projects.map((row) => ({ id: row.id, title: row.title, description: row.description, tags: safeJsonArray(row.tagsJson) })),
      socials: input.content.socials.map((row) => ({ id: row.id, platform: row.platform, label: row.label })),
    },
    outputSchema: {
      selectedThemeId: "string",
      blocks: Object.fromEntries([...blockKeySet].map((key) => [key, "string"])),
      projectSummaries: [{ projectId: "string", title: "string", description: "string" }],
    },
    contract: [
      "Use only supplied content facts.",
      "Do not mention visitor signals.",
      "Return JSON only.",
      "No HTML, CSS, JavaScript, markdown tables, or invented biography.",
    ],
  };
  assertNoPreciseFieldsSerialized(JSON.stringify(prompt), PRECISE_FIELD_NAMES);
  return prompt;
}

function safeJsonArray(raw: string): unknown[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
