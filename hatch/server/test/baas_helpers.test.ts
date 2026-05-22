import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "../src/lib/baas/files";
import { decodeRecordCursor, encodeRecordCursor, parseLimit, stringifyRecordData } from "../src/lib/baas/records";
import { getClientIp, hashIp } from "../src/lib/baas/rateLimit";

describe("baas record helpers", () => {
  it("round-trips keyset cursors", () => {
    const cursor = { createdAt: 1710000000000, id: "rec_123" };
    expect(decodeRecordCursor(encodeRecordCursor(cursor))).toEqual(cursor);
    expect(decodeRecordCursor("not-json")).toBeNull();
  });

  it("clamps invalid or excessive limits", () => {
    expect(parseLimit(null)).toBe(50);
    expect(parseLimit("0")).toBe(50);
    expect(parseLimit("500")).toBe(100);
    expect(parseLimit("12")).toBe(12);
  });

  it("accepts only JSON objects within the configured byte cap", () => {
    expect(stringifyRecordData({ ok: true }, 20)).toEqual({ ok: true, json: "{\"ok\":true}" });
    expect(stringifyRecordData(["no"], 100)).toEqual({ ok: false });
    expect(stringifyRecordData({ value: "abcdef" }, 10)).toEqual({ ok: false });
    expect(stringifyRecordData({ value: "你好" }, "{\"value\":\"你好\"}".length)).toEqual({ ok: false });
  });
});

describe("baas rate limit helpers", () => {
  it("extracts client IP from Cloudflare headers only", () => {
    expect(getClientIp(new Headers({ "CF-Connecting-IP": "203.0.113.1" }))).toBe("203.0.113.1");
    expect(getClientIp(new Headers({ "X-Forwarded-For": "198.51.100.1, 198.51.100.2" }))).toBe("unknown");
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("hashes IPs deterministically without storing raw addresses", async () => {
    const first = await hashIp("203.0.113.1");
    expect(first).toHaveLength(64);
    expect(await hashIp("203.0.113.1")).toBe(first);
    expect(first).not.toContain("203.0.113.1");
  });
});

describe("baas file helpers", () => {
  it("strips path separators and caps filenames", () => {
    expect(sanitizeFilename("../avatar.png")).toBe("..-avatar.png");
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("a".repeat(300))).toHaveLength(255);
  });
});
