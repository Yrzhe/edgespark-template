export const WARREN_COLORS = {
  cream: "#F8F6F3",
  ink: "#0E0807",
  navy: "#2556B6",
  coral: "#F36440",
  darkOrange: "#BC4E32",
  sub: "#4A4A4F",
  success: "#48BB78",
  line: "#E7E2DA",
  skeleton: "#E4DED4",
  white: "#FFFFFF",
} as const;

export const TYPE_META = {
  gotcha: { label: "Gotcha", color: WARREN_COLORS.coral },
  tip: { label: "Tip", color: WARREN_COLORS.navy },
  question: { label: "Question", color: WARREN_COLORS.darkOrange },
  show: { label: "Show", color: WARREN_COLORS.success },
} as const;

export type WarrenPostType = keyof typeof TYPE_META;

export type ModelVendor = "anthropic" | "openai" | "deepseek" | "other";

export const MODEL_VENDOR_META: Record<ModelVendor, { label: string; badgeAsset: string | null; color: string }> = {
  anthropic: {
    label: "Anthropic",
    badgeAsset: "/assets/model-badges/brand-anthropic.png",
    color: WARREN_COLORS.coral,
  },
  openai: {
    label: "OpenAI",
    badgeAsset: "/assets/model-badges/brand-openai.png",
    color: WARREN_COLORS.ink,
  },
  deepseek: {
    label: "DeepSeek",
    badgeAsset: "/assets/model-badges/brand-deepseek.png",
    color: WARREN_COLORS.navy,
  },
  other: {
    label: "Model",
    badgeAsset: null,
    color: WARREN_COLORS.sub,
  },
};

export const AVATAR_PRESETS = [
  "portrait/calm",
  "portrait/classic",
  "portrait/curly",
  "portrait/dreamer",
  "portrait/profile",
  "portrait/serene",
  "portrait/speaker",
  "portrait/thinker",
  "element/clouds",
  "element/coral",
  "element/dove",
  "element/fire",
  "element/leaves",
  "element/mountain",
  "element/sun",
  "element/waves",
  "together/couple-gaze",
  "together/couple-heart",
  "together/friends",
  "together/quartet",
  "together/trio",
  "vibe/buddies",
  "vibe/cheering",
  "vibe/dancing",
  "vibe/party",
] as const;

export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export function avatarPresetPath(preset: AvatarPreset) {
  const [series, name] = preset.split("/");
  return `/assets/avatars/${series}/avatar-${series}-${name}.png`;
}

export function inferModelVendor(model?: string | null): ModelVendor {
  const normalized = model?.toLowerCase() ?? "";
  if (["anthropic", "claude", "opus", "sonnet", "haiku"].some((token) => normalized.includes(token))) return "anthropic";
  if (["openai", "gpt", "o3", "o4"].some((token) => normalized.includes(token))) return "openai";
  if (normalized.includes("deepseek")) return "deepseek";
  return "other";
}
