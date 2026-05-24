export type TimestampMs = number;

export type SocialLink = {
  platform?: string;
  label?: string;
  url: string;
};

export type Theme = {
  background?: string;
  foreground?: string;
  muted?: string;
  card?: string;
  accent?: string;
  radius?: string;
  fontFamily?: string;
  footerText?: string;
};

export type Page = {
  id: string;
  slug: string;
  title: string;
  displayName: string;
  bio: string | null;
  avatarS3Uri: string | null;
  coverS3Uri: string | null;
  socialLinksJson: string;
  themeJson: string;
  isDefault: boolean;
  publishedAt: TimestampMs | null;
  lockVersion: number;
  deletedAt: TimestampMs | null;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
  theme: Theme;
  socialLinks: SocialLink[];
};

export type LinkKind = "link" | "section";

export type Link = {
  id: string;
  pageId: string;
  title: string;
  url: string;
  description: string | null;
  thumbnailS3Uri: string | null;
  position: number;
  isActive: boolean;
  isFeatured: boolean;
  linkKind: LinkKind;
  deletedAt: TimestampMs | null;
  lockVersion: number;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
};

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: TimestampMs;
  lastUsedAt: TimestampMs | null;
  revokedAt: TimestampMs | null;
};

export type MeResponse = {
  email: string;
  avatarUrl: string | null;
};

export type OwnerAvatarPresignResponse = {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  key: string;
};

export type AnalyticsRange = {
  from: TimestampMs;
  to: TimestampMs;
};

export type AnalyticsSummary = {
  views: number;
  clicks: number;
  ctr: number;
};

export type TimeSeriesPoint = {
  timestamp: TimestampMs;
  views: number;
  clicks: number;
};

export type DailyAnalyticsPoint = {
  day: string;
  views: number;
  clicks: number;
};

export type TopLink = {
  linkId: string | null;
  title: string | null;
  value: number;
};

export type DimensionCount = {
  value: string;
  count: number;
};

export type PageAnalytics = {
  pageId: string;
  range: AnalyticsRange;
  totals: AnalyticsSummary;
  dailySeries: DailyAnalyticsPoint[];
  topLinks: TopLink[];
  referrers: DimensionCount[];
  devices: DimensionCount[];
  countries: DimensionCount[];
};

export type LinkAnalytics = {
  pageId: string;
  linkId: string;
  range: AnalyticsRange;
  totals: {
    clicks: number;
  };
};

export type PublicPageConfig = {
  page: {
    id: string;
    slug: string;
    title: string;
    displayName: string;
    bio: string | null;
    theme: Theme;
    socialLinks: SocialLink[];
    avatarUrl: string | null;
    coverUrl: string | null;
  };
  links: Array<{
    id: string;
    title: string;
    description: string | null;
    position: number;
    isFeatured: boolean;
    linkKind: LinkKind;
    thumbnailUrl: string | null;
    href: string;
  }>;
};

export type PageListResponse = { pages: Page[]; total: number; limit: number; offset: number };
export type PageResponse = { page: Page };
export type LinkListResponse = { links: Link[] };
export type LinkResponse = { link: Link };
export type ApiKeyListResponse = { keys: ApiKey[] };
export type CreateApiKeyResponse = { key: ApiKey; plaintext: string };
export type DeleteResponse = { deleted: true };
export type ReorderLinksResponse = { links: Link[] };

export type CreatePageRequest = {
  slug: string;
  title: string;
  displayName: string;
  bio?: string;
  theme?: Theme;
  socialLinks?: SocialLink[];
  isDefault?: boolean;
  published?: boolean;
};

export type UpdatePageRequest = Partial<CreatePageRequest> & {
  lockVersion?: number;
};

export type CreateLinkRequest = {
  title: string;
  url?: string;
  description?: string;
  position?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  linkKind?: LinkKind;
};

export type UpdateLinkRequest = Partial<CreateLinkRequest> & {
  lockVersion?: number;
};

export type ReorderLinksRequest = {
  items: Array<{ id: string; position: number }>;
};

export type PageAssetKind = "avatar" | "cover";
export type LinkAssetKind = "thumbnail";
export type AssetKind = PageAssetKind | LinkAssetKind;

export type PresignAssetRequest<TKind extends AssetKind = AssetKind> = {
  kind: TKind;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

export type PresignAssetResponse = {
  assetId: string;
  key: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
};

export type ConfirmAssetRequest<TKind extends AssetKind = AssetKind> = {
  kind: TKind;
  assetId: string;
};

export type CreateApiKeyRequest = {
  name: string;
};

export type AnalyticsQuery = {
  from?: TimestampMs;
  to?: TimestampMs;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
  message?: string;
};
