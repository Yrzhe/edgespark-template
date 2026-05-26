import { secret } from "edgespark";
import type { LlmPromptInput } from "./prompt";

export type LlmUsage = { tokenIn: number; tokenOut: number; costMicros: number };
export type LlmProviderResult = { json: unknown; model: string; usage: LlmUsage };
export interface LlmProvider {
  readonly model: string;
  chatJson(prompt: LlmPromptInput, timeoutMs?: number): Promise<LlmProviderResult>;
}

const MODEL = "gpt-4o-mini";

export function getDefaultProvider(): LlmProvider {
  return new OpenAiProvider(secret.get("OPENAI_API_KEY"));
}

export class OpenAiProvider implements LlmProvider {
  readonly model = MODEL;
  constructor(private readonly apiKey: string | null) {}

  async chatJson(prompt: LlmPromptInput, timeoutMs = 8000): Promise<LlmProviderResult> {
    if (!this.apiKey) throw new Error("openai_api_key_missing");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You rewrite personal-site text as strict JSON. Obey the contract and never invent facts." },
            { role: "user", content: JSON.stringify(prompt) },
          ],
          temperature: 0.5,
        }),
      });
      if (!res.ok) throw new Error(`openai_http_${res.status}`);
      const body = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("openai_empty_content");
      const tokenIn = body.usage?.prompt_tokens ?? 0;
      const tokenOut = body.usage?.completion_tokens ?? 0;
      return { json: JSON.parse(content), model: MODEL, usage: { tokenIn, tokenOut, costMicros: estimateCostMicros(tokenIn, tokenOut) } };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function estimateCostMicros(tokenIn: number, tokenOut: number): number {
  return Math.ceil(tokenIn * 0.00000015 * 1_000_000 + tokenOut * 0.0000006 * 1_000_000);
}
