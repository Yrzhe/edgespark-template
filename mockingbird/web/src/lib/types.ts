export type LayoutKey = "terminal" | "magazine" | "gallery" | "letter";
export type ThemeStatus = "draft" | "active" | "paused" | "archived";
export type BlockKey =
  | "hero-headline"
  | "hero-intro"
  | "about-body"
  | "note-<i>"
  | "hero-greeting"
  | "returning-note"
  | "sign-off-line"
  | "sign-off-name"
  | "hero-name"
  | "about-short"
  | "now-short"
  | "featured-title"
  | "featured-blurb"
  | "project-<id>"
  | "project-<id>-title"
  | "project-<id>-blurb"
  | "hero-deck"
  | "body-p1"
  | "body-p2"
  | "body-p3"
  | "pull-quote"
  | "contact-note";

export type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  layoutKey: LayoutKey;
  status: ThemeStatus;
  priority: number;
  abWeight: number;
  palette?: Record<string, string>;
  font?: Record<string, string>;
  copyPrompt: string;
  defaultTone: string;
  fallbackCopy?: Record<string, unknown>;
  isDefault: boolean;
  lockVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type MatchRule = {
  id: string;
  themeId: string;
  expression: string;
  score: number;
  enabled: boolean;
  explanation?: string | null;
  lockVersion: number;
};

export type BioBlurb = {
  id: string;
  title: string;
  body: string;
  tagsJson?: string;
  source: string;
  isActive: number | boolean;
  position: number;
  lockVersion: number;
  updatedAt: number;
};

export type ProjectRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  description: string;
  url?: string | null;
  imageId?: string | null;
  tagsJson?: string;
  status: "active" | "draft" | "paused" | "archived";
  position: number;
  lockVersion: number;
  updatedAt: number;
};

export type SocialRow = {
  id: string;
  platform: string;
  label: string;
  url: string;
  handle?: string | null;
  iconKey?: string | null;
  isActive: number | boolean;
  position: number;
  lockVersion: number;
  updatedAt: number;
};

export type ImageRow = {
  id: string;
  kind: "avatar" | "cover" | "project" | "inline" | string;
  alt: string;
  contentType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  isActive: number | boolean;
  lockVersion: number;
  updatedAt: number;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt?: number | null;
  revokedAt?: number | null;
};

export type AnalyticsResponse = {
  range?: { from: number; to: number };
  kpis?: {
    views: number;
    llmRequests: number;
    cacheHits: number;
    cacheHitRate: number;
    costMicros: number;
    tokenIn: number;
    tokenOut: number;
  };
  themeDistribution?: Record<string, number | { name?: string; share?: number; hits?: number; color?: string }>;
  signals?: {
    country?: Record<string, number>;
    device?: Record<string, number>;
    referrer?: Record<string, number>;
    language?: Record<string, number>;
    lang?: Record<string, number>;
    hourBand?: Record<string, number>;
  };
  signalDistribution?: {
    country?: Record<string, number>;
    device?: Record<string, number>;
    referrer?: Record<string, number>;
    lang?: Record<string, number>;
  };
  failCounts?: Record<string, number>;
  filters?: { includeBots?: boolean; ownerTrafficExcluded?: boolean; themeId?: string | null };
  costTrend?: number[];
};

export type PreviewResponse = {
  theme?: ThemeRow;
  winnerTheme?: ThemeRow;
  winner?: ThemeRow;
  selectedThemeId?: string;
  candidates?: Array<{ id: string; score: number; name?: string; layoutKey?: LayoutKey; ruleMatched?: boolean }>;
  reason?: string;
  visitor?: Record<string, unknown>;
  blocks?: Record<string, string>;
  rewrite?: Record<string, unknown>;
  cacheBucketLabel?: string;
  cacheKey?: string;
  shareUrl?: string;
};

export type PreviewShareResponse = {
  shareUrl?: string;
  url?: string;
  expiresAt?: number;
  ttlSec?: number;
  watermark?: "preview";
  token?: string;
};
