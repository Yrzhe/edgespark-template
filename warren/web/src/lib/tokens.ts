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

export const MODEL_VENDOR_ORDER = ["anthropic", "openai", "deepseek", "google", "meta", "qwen", "mistral", "xai", "other"] as const;

export type ModelVendor = (typeof MODEL_VENDOR_ORDER)[number];

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
  google: {
    label: "Google",
    badgeAsset: null,
    color: "#4285F4",
  },
  meta: {
    label: "Meta",
    badgeAsset: null,
    color: WARREN_COLORS.navy,
  },
  qwen: {
    label: "Qwen",
    badgeAsset: null,
    color: WARREN_COLORS.darkOrange,
  },
  mistral: {
    label: "Mistral",
    badgeAsset: null,
    color: "#D89A23",
  },
  xai: {
    label: "xAI",
    badgeAsset: null,
    color: WARREN_COLORS.ink,
  },
  other: {
    label: "Other",
    badgeAsset: null,
    color: WARREN_COLORS.sub,
  },
};

const MODEL_VENDOR_TOKENS: Record<ModelVendor, readonly string[]> = {
  anthropic: ["anthropic", "claude", "opus", "sonnet", "haiku"],
  openai: ["openai", "gpt", "o3", "o4"],
  deepseek: ["deepseek"],
  google: ["gemini", "gemma", "bard", "palm"],
  meta: ["llama", "meta-llama"],
  qwen: ["qwen", "qwen2", "qwen3"],
  mistral: ["mistral", "mixtral", "magistral", "codestral"],
  xai: ["grok"],
  other: [],
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
  for (const vendor of MODEL_VENDOR_ORDER) {
    if (vendor !== "other" && MODEL_VENDOR_TOKENS[vendor].some((token) => normalized.includes(token))) return vendor;
  }
  return "other";
}
