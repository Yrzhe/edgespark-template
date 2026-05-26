import type { ReferrerRoot } from "./types";

export function referrerRoot(raw: string | null | undefined): ReferrerRoot {
  if (!raw) return "direct";
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "news.ycombinator.com") return "hn";
  if (["x.com", "twitter.com", "t.co"].includes(host) || host.endsWith(".twitter.com")) return "x";
  if (host.includes("xiaohongshu.com") || host === "xhslink.com") return "xiaohongshu";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("substack.com")) return "substack";
  if (host === "medium.com" || host.endsWith(".medium.com")) return "medium";
  if (/google\.|bing\.com|duckduckgo\.com|baidu\.com|yahoo\.com|yandex\./.test(host)) return "search";
  if (/mail\.google\.com|outlook\.live\.com|mail\.qq\.com|mail\.163\.com/.test(host)) return "email";
  return "other";
}
