import { describe, expect, it } from "vitest";
import { costLedger } from "@defs";
import { checkCost } from "../src/lib/cost";
import { db } from "edgespark";

describe("cost ledger", () => {
  it("refuses quoted work at the daily cap before spend", async () => {
    db._reset();
    db._seed(costLedger, [{ userId: "u1", costMicros: 19_000, occurredAt: Date.now() }]);
    const quote = await checkCost(db, "u1", [{ provider: "cloudflare", operation: "worker.compose", units: 1, unitMicros: 2_000 }], Date.now(), 20_000);
    expect(quote.allowed).toBe(false);
    expect(quote.totalMicros).toBe(2_000);
  });
});
