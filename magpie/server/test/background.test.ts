import { describe, expect, it } from "vitest";
import { withTimeout } from "../src/lib/background";

describe("withTimeout (M-102 watchdog primitive)", () => {
  it("resolves with the value when the promise settles before the deadline", async () => {
    const value = await withTimeout(Promise.resolve("ok"), 1000, "fast");
    expect(value).toBe("ok");
  });

  it("rejects with a timeout:<label> error when the promise outlives the deadline", async () => {
    const hang = new Promise<string>(() => {}); // never resolves
    await expect(withTimeout(hang, 10, "tool:generate_asset")).rejects.toThrow("timeout:tool:generate_asset");
  });

  it("propagates the original rejection (not a timeout) when the promise fails fast", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "x")).rejects.toThrow("boom");
  });
});
