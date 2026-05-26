export type Device = "desktop" | "mobile" | "tablet" | "bot" | "unknown";
export type HourBand = "morning" | "day" | "evening" | "late_night" | "unknown";
export type ReferrerRoot = "direct" | "github" | "hn" | "x" | "xiaohongshu" | "instagram" | "substack" | "medium" | "search" | "email" | "other";

export type VisitorPromptSafe = {
  country: string | null;
  langRoot: string | null;
  device: Device;
  referrerRoot: ReferrerRoot;
  hourBand: HourBand;
  isReturning: boolean;
  isWeekend: boolean;
  urlSource: string | null;
};

export type VisitorPrivate = {
  coarse: VisitorPromptSafe;
  precise: {
    ip: string | null;
    city: string | null;
    region: string | null;
    asn: number | null;
    asOrganization: string | null;
    colo: string | null;
    timezoneRaw: string | null;
    userAgentRaw: string | null;
    referrerUrlRaw: string | null;
  };
  hashes: {
    ipHash: string | null;
    userAgentHash: string | null;
    visitorBucketHash: string;
  };
};

export const PRECISE_FIELD_NAMES = ["ip", "city", "region", "asn", "asOrganization", "colo", "timezoneRaw", "userAgentRaw", "referrerUrlRaw"] as const;
