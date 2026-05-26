import type { Device } from "./types";

export function deviceFromUa(ua: string | null | undefined): Device {
  const s = (ua ?? "").toLowerCase();
  if (!s) return "unknown";
  if (/bot|crawler|spider|preview|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp/.test(s)) return "bot";
  if (/ipad|tablet|kindle|silk/.test(s)) return "tablet";
  if (/mobile|iphone|android|ipod/.test(s)) return "mobile";
  return "desktop";
}
