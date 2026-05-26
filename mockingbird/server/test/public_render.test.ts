import { describe, expect, it } from "vitest";
import { renderPublicPage, emergencyFallbackPage } from "../src/lib/publicPage/html";

describe("public render", () => {
  it("escapes owner content and does not render precise visitor labels", () => {
    const now = Date.now();
    const theme = { id: "t1", slug: "terminal", name: "Terminal <x>", layoutKey: "terminal", status: "active", priority: 0, abWeight: 100, paletteJson: "{}", fontJson: "{}", layoutConfigJson: "{}", copyPrompt: "", defaultTone: "", fallbackCopyJson: JSON.stringify({ headline: "<script>alert(1)</script>", intro: "Hello" }), isDefault: 0, lockVersion: 0, deletedAt: null, createdAt: now, updatedAt: now };
    const html = renderPublicPage(theme, { bioBlurbs: [], projects: [], socials: [] }, "cache");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("timezoneRaw");
    expect(emergencyFallbackPage()).toContain("static fallback");
  });
});
