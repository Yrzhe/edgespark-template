import type { SimpleIcon } from "simple-icons";
import {
  siAlibabadotcom,
  siAnthropic,
  siDeepseek,
  siGoogle,
  siGooglegemini,
  siHuggingface,
  siMeta,
  siMistralai,
  siX,
} from "simple-icons";

import { INK, NAVY } from "@/lib/constants";

type AvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-20 w-20 text-2xl",
};

const ICON_SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-10 w-10",
};

const ICONS = {
  alibabadotcom: siAlibabadotcom,
  anthropic: siAnthropic,
  deepseek: siDeepseek,
  google: siGoogle,
  googlegemini: siGooglegemini,
  huggingface: siHuggingface,
  meta: siMeta,
  mistralai: siMistralai,
  x: siX,
} satisfies Record<string, SimpleIcon>;

const COMPANY_ALIASES: Array<[string, keyof typeof ICONS]> = [
  ["anthropic", "anthropic"],
  ["claude", "anthropic"],
  ["google gemini", "googlegemini"],
  ["gemini", "googlegemini"],
  ["google", "google"],
  ["deepseek", "deepseek"],
  ["xai", "x"],
  ["x.ai", "x"],
  ["grok", "x"],
  ["meta", "meta"],
  ["facebook", "meta"],
  ["mistral ai", "mistralai"],
  ["mistral", "mistralai"],
  ["alibaba", "alibabadotcom"],
  ["qwen", "alibabadotcom"],
  ["tongyi", "alibabadotcom"],
  ["hugging face", "huggingface"],
  ["huggingface", "huggingface"],
];

export function ContestantAvatar({
  name,
  company,
  avatarUrl,
  avatarS3Uri,
  color = NAVY,
  size = "md",
}: {
  name: string;
  company?: string | null;
  avatarUrl?: string | null;
  avatarS3Uri?: string | null;
  color?: string | null;
  size?: AvatarSize;
}) {
  const src = avatarUrl || (isRenderableUrl(avatarS3Uri) ? avatarS3Uri : null);
  const classes = `${SIZE_CLASS[size]} grid shrink-0 place-items-center rounded-full overflow-hidden font-black`;

  if (src) return <img src={src} alt={name} className={`${SIZE_CLASS[size]} shrink-0 rounded-full object-cover`} />;

  const icon = company ? iconForCompany(company) : null;
  if (icon) {
    const fill = color || INK;
    return (
      <span className={`${classes} bg-zinc-100 ring-1 ring-black/10`} title={icon.title}>
        <svg className={ICON_SIZE_CLASS[size]} viewBox="0 0 24 24" role="img" aria-label={icon.title} fill={fill}>
          <path d={icon.path} />
        </svg>
      </span>
    );
  }

  return (
    <span className={`${classes} text-white`} style={{ background: color || NAVY }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function iconForCompany(company: string): SimpleIcon | null {
  const normalized = normalize(company);
  const match = COMPANY_ALIASES.find(([alias]) => normalized.includes(alias));
  return match ? ICONS[match[1]] : null;
}

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/[\s_-]+/g, " ");
}

function isRenderableUrl(value?: string | null) {
  return !!value && (/^https?:\/\//i.test(value) || value.startsWith("/"));
}
