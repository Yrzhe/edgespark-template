import type { Context } from "hono";
import { deviceFromUa } from "./device";
import { referrerRoot } from "./referrer";
import type { HourBand, VisitorPrivate, VisitorPromptSafe } from "./types";

type CfRequest = Request & {
  cf?: {
    country?: string | null;
    city?: string | null;
    region?: string | null;
    timezone?: string | null;
    asn?: number | null;
    asOrganization?: string | null;
    colo?: string | null;
  };
};

export async function extractVisitor(c: Context): Promise<VisitorPrivate> {
  const req = c.req.raw as CfRequest;
  const url = new URL(c.req.url);
  const ua = c.req.header("User-Agent") ?? null;
  const ref = c.req.header("Referer") ?? null;
  const country = normalizeCountry(req.cf?.country ?? c.req.header("CF-IPCountry"));
  const langRoot = parseLangRoot(c.req.header("Accept-Language"));
  const timezoneRaw = req.cf?.timezone ?? null;
  const coarse: VisitorPromptSafe = {
    country,
    langRoot,
    device: deviceFromUa(ua),
    referrerRoot: referrerRoot(ref),
    hourBand: hourBand(timezoneRaw),
    isReturning: /(?:^|;\s*)mb_seen=1(?:;|$)/.test(c.req.header("Cookie") ?? ""),
    isWeekend: isWeekend(timezoneRaw),
    urlSource: allowlistedSource(url.searchParams.get("from") ?? url.searchParams.get("utm_source")),
  };
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgentHash = ua ? await sha256Hex(ua) : null;
  const ipHash = ip ? await sha256Hex(ip) : null;
  return {
    coarse,
    precise: {
      ip,
      city: req.cf?.city ?? null,
      region: req.cf?.region ?? null,
      asn: typeof req.cf?.asn === "number" ? req.cf.asn : null,
      asOrganization: req.cf?.asOrganization ?? null,
      colo: req.cf?.colo ?? null,
      timezoneRaw,
      userAgentRaw: ua,
      referrerUrlRaw: ref,
    },
    hashes: {
      ipHash,
      userAgentHash,
      visitorBucketHash: await sha256Hex(JSON.stringify(coarse)),
    },
  };
}

function parseLangRoot(raw: string | null | undefined): string | null {
  const first = raw?.split(",")[0]?.trim().toLowerCase();
  const root = first?.split("-")[0];
  return root && /^[a-z]{2,3}$/.test(root) ? root : null;
}

function normalizeCountry(raw: string | null | undefined): string | null {
  const s = raw?.trim().toUpperCase();
  return s && /^[A-Z]{2}$/.test(s) ? s : null;
}

function allowlistedSource(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().slice(0, 32);
  return /^[a-z0-9_-]{1,32}$/.test(s) ? s : null;
}

function hourBand(timezone: string | null): HourBand {
  if (!timezone) return "unknown";
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: timezone }).format(new Date()));
    if (!Number.isFinite(hour)) return "unknown";
    if (hour >= 5 && hour <= 10) return "morning";
    if (hour >= 11 && hour <= 16) return "day";
    if (hour >= 17 && hour <= 22) return "evening";
    return "late_night";
  } catch {
    return "unknown";
  }
}

function isWeekend(timezone: string | null): boolean {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone ?? "UTC" }).format(new Date());
    return weekday === "Sat" || weekday === "Sun";
  } catch {
    return false;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
