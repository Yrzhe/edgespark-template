import { getOpenAiApiKey, isDevEnv } from "../ownerConfig";
import { AGENT_TOOLS } from "./tools";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const AGENT_MODEL = "gpt-4.1-mini";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  rawArguments: string;
}

export interface ModelTurn {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string;
}

export type TurnFn = (messages: ChatMessage[], onTextDelta: (delta: string) => Promise<void>) => Promise<ModelTurn>;

// Real OpenAI turn: one streaming chat-completions call with the agent tool surface.
// Streams text deltas through onTextDelta and assembles any tool_call deltas (which arrive
// fragmented and keyed by index) into complete ToolCalls.
export const openAiTurn: TurnFn = async (messages, onTextDelta) => {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    if (!isDevEnv()) throw new Error("openai_api_key_missing");
    // Dev fallback: no key → emit a short text plan, never call tools.
    const userMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = `Drafted plan for: ${userMsg}`;
    for (const chunk of chunkText(text)) await onTextDelta(chunk);
    return { text, toolCalls: [], finishReason: "stop" };
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${apiKey}`, "User-Agent": "magpie-worker-agent/2.0" },
    body: JSON.stringify({
      model: AGENT_MODEL,
      stream: true,
      temperature: 0.4,
      max_tokens: 700,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
      messages,
    }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `openai_agent_failed_${response.status}`);
  }
  return parseStream(response.body, onTextDelta);
};

async function parseStream(body: ReadableStream<Uint8Array>, onTextDelta: (delta: string) => Promise<void>): Promise<ModelTurn> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason = "stop";
  const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = parsed?.choices?.[0];
      if (!choice) continue;
      if (typeof choice.finish_reason === "string" && choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) {
        text += delta.content;
        await onTextDelta(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const index = Number(tc.index ?? 0);
          const acc = toolAcc.get(index) ?? { id: "", name: "", arguments: "" };
          if (typeof tc.id === "string" && tc.id) acc.id = tc.id;
          if (typeof tc.function?.name === "string" && tc.function.name) acc.name = tc.function.name;
          if (typeof tc.function?.arguments === "string") acc.arguments += tc.function.arguments;
          toolAcc.set(index, acc);
        }
      }
    }
  }

  const toolCalls: ToolCall[] = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, acc]) => ({
      id: acc.id || `call_${index}`,
      name: acc.name,
      rawArguments: acc.arguments || "{}",
      args: safeParseArgs(acc.arguments),
    }))
    .filter((tc) => tc.name);

  if (toolCalls.length > 0 && finishReason === "stop") finishReason = "tool_calls";
  return { text, toolCalls, finishReason };
}

function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 18) chunks.push(text.slice(i, i + 18));
  return chunks.length ? chunks : [text];
}
