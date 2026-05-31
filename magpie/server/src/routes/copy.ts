import { Hono } from "hono";
import { db } from "edgespark";
import { checkCost, writeCost, type CostQuoteItem } from "../lib/cost";
import { getOpenAiApiKey } from "../lib/ownerConfig";
import { httpError } from "../lib/httpErrors";
import { isRecord } from "../lib/json";
import { approvedUserOrAgentKey, type AppEnv } from "../middleware/managementAuth";

const COPY_QUOTE: CostQuoteItem = { provider: "openai", operation: "openai.copy.gpt-4o-mini", units: 1, unitMicros: 3_000 };

export const copyRoutes = new Hono<AppEnv>()
  .post("/copy/draft", approvedUserOrAgentKey, async (c) => {
    const principal = c.get("principal");
    const userId = principal.kind === "user" || principal.kind === "agent" ? principal.userId : null;
    if (!userId) return httpError(c, 401, "user_required", "User principal required.");
    const body = await c.req.json().catch(() => null);
    if (!isRecord(body)) return httpError(c, 400, "invalid_request", "JSON object body required.");
    const quote = await checkCost(db, userId, [COPY_QUOTE]);
    if (!quote.allowed) return httpError(c, 429, "budget_exhausted", "Daily copy budget would be exceeded.", { quote });
    const fallback = localCopyDraft(body);
    const apiKey = getOpenAiApiKey();
    if (!apiKey) return c.json(fallback);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: `Draft concise Bloome card copy as JSON with headline, sub, cta. Intent: ${String(body.intent ?? "")}. Tone: ${String(body.tone ?? "restrained")}. Locale: ${String(body.locale ?? "en")}.` }],
      }),
    });
    const json = await response.json().catch(() => null);
    await writeCost(db, quote, null);
    const parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
    return c.json({ headline: String(parsed.headline ?? fallback.headline), sub: String(parsed.sub ?? fallback.sub), cta: String(parsed.cta ?? fallback.cta) });
  });

function localCopyDraft(body: Record<string, unknown>) {
  const locale = String(body.locale ?? "en");
  if (locale.toLowerCase().startsWith("zh")) return { headline: "六个大脑，一个聊天", sub: "把调好的提示词、代理和流程沉淀成可复用的 AI 同事。", cta: "开始创作" };
  return { headline: "Six minds. One chat.", sub: "Turn tuned prompts, agents, and workflows into reusable AI coworkers.", cta: "Start creating" };
}
