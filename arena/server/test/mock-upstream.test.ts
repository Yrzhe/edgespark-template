import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { mockUpstreamRoutes } from "../src/routes/mock-upstream";

const app = new Hono().route("/api/public", mockUpstreamRoutes);

describe("mock upstream", () => {
  it("serves agents in the frozen upstream shape", async () => {
    const res = await app.request("https://arena.test/api/public/mock/agents");
    const body = await res.json();
    expect(body.agents).toHaveLength(5);
    expect(body.agents[0]).toMatchObject({
      id: "claude",
      account: expect.objectContaining({ equity: expect.any(String), buying_power: expect.any(String) }),
      positions: expect.any(Array),
      metrics: expect.objectContaining({ returnPct: expect.any(Number) }),
    });
  });

  it("serves snapshots and decisions with chainOfThought", async () => {
    const snapshots = await (await app.request("https://arena.test/api/public/mock/snapshots")).json();
    const decisions = await (await app.request("https://arena.test/api/public/mock/agent/decisions")).json();
    expect(snapshots.snapshots.claude.length).toBeGreaterThan(200);
    expect(decisions.decisions).toHaveLength(40);
    expect(decisions.decisions[0].chainOfThought).toContain("Mock private deliberation");
  });
});

