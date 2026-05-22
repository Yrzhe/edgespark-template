import { describe, expect, it } from "vitest";
import { assertValidRules, canCreate, canModify, canRead, type ReadRule, type WriteRule } from "../src/lib/baas/rules";

describe("baas access rules", () => {
  it.each([
    ["public", true],
    ["private", false],
  ] satisfies Array<[ReadRule, boolean]>)("canRead(%s) -> %s", (rule, expected) => {
    expect(canRead(rule)).toBe(expected);
  });

  it.each([
    ["public-append", true, false],
    ["public", true, true],
    ["private", false, false],
  ] satisfies Array<[WriteRule, boolean, boolean]>)("write=%s create=%s modify=%s", (rule, canCreateExpected, canModifyExpected) => {
    expect(canCreate(rule)).toBe(canCreateExpected);
    expect(canModify(rule)).toBe(canModifyExpected);
  });

  it("accepts valid read/write pairs", () => {
    expect(assertValidRules({ read: "public", write: "public-append" })).toEqual({
      read: "public",
      write: "public-append",
    });
    expect(assertValidRules({ read: "private", write: "private" })).toEqual({
      read: "private",
      write: "private",
    });
  });

  it("rejects invalid rules", () => {
    expect(() => assertValidRules({ read: "friends", write: "public" })).toThrow("Invalid BaaS read rule");
    expect(() => assertValidRules({ read: "public", write: "owner" })).toThrow("Invalid BaaS write rule");
  });
});
