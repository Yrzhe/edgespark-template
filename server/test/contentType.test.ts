import { describe, it, expect } from "vitest";
import { contentTypeFor, isInlineSafe } from "../src/lib/contentType";

describe("contentType", () => {
  it("maps known extensions", () => {
    expect(contentTypeFor("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("style.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("logo.png")).toBe("image/png");
    expect(contentTypeFor("data.json")).toBe("application/json; charset=utf-8");
  });

  it("falls back to octet-stream", () => {
    expect(contentTypeFor("weird.xyz")).toBe("application/octet-stream");
    expect(contentTypeFor("noext")).toBe("application/octet-stream");
  });

  it("flags svg as not inline-safe", () => {
    expect(isInlineSafe("image/svg+xml")).toBe(false);
    expect(isInlineSafe("image/png")).toBe(true);
    expect(isInlineSafe("text/html; charset=utf-8")).toBe(true);
  });
});
