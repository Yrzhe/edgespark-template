import { Hono } from "hono";
import { AGENT_IDS, mockAgent, mockAgents, mockDecisions, mockSnapshots } from "../lib/mockData";
import { httpError } from "../lib/httpErrors";

export const mockUpstreamRoutes = new Hono()
  .get("/mock/agents", (c) => c.json(mockAgents()))
  .get("/mock/agents/:id", (c) => {
    const id = c.req.param("id");
    if (!AGENT_IDS.includes(id as never)) return httpError(c, 404, "agent_not_found", "Agent not found.");
    return c.json(mockAgent(id));
  })
  .get("/mock/snapshots", (c) => c.json(mockSnapshots()))
  .get("/mock/agent/decisions", (c) => c.json(mockDecisions()));

