import type { ChatMessage, ModelTurn, TurnFn } from "./openai";
import { openAiTurn } from "./openai";
import { executeTool, type ToolContext, type ToolResult } from "./tools";
import { withTimeout } from "../background";

export const MAX_ITERATIONS = 5;
// Per-tool-call watchdog (M-102). generate_asset now renders INLINE (5-40s for a 1024² image),
// so this budget must comfortably exceed a real render while still bounding a genuine hang. If a
// render does blow past it, the tool result becomes a failure and the stuck "generating" asset
// row is converted to "failed" by the read-time reconcile — never an infinite spinner. The 90s
// global run watchdog (cards.ts) still bounds the whole run.
export const TOOL_CALL_TIMEOUT_MS = 60_000;

// Emitted to the SSE stream + persisted on the run. tool_call_start / tool_call_result are
// the R6 additions so the client can render the agent actually using tools.
export interface AgentLoopEvent {
  type: "output" | "tool_call_start" | "tool_call_result";
  delta?: string;
  tool?: string;
  args?: Record<string, unknown>;
  resultPreview?: Record<string, unknown>;
  success?: boolean;
}

export interface AgentLoopResult {
  text: string;
  iterations: number;
  toolCallsMade: number;
  hitMaxIterations: boolean;
}

// A settled tool call (cumulative across iterations). Fed to onToolPhaseSettled so the caller
// can mark the run completed as soon as real output exists — BEFORE the trailing summary turn,
// which (after a 20s inline render) can run past the Worker waitUntil window (M-102 R11).
export interface SettledToolCall {
  tool: string;
  success: boolean;
  resultPreview: Record<string, unknown>;
}

// Multi-turn tool-use loop. Each turn: ask the model (streaming text via `emit`), and if it
// requests tools, emit tool_call_start → execute → emit tool_call_result → feed the result
// back as a tool message, then loop. Capped at MAX_ITERATIONS to prevent runaway loops.
// `turn` is injectable so tests can script model behaviour without hitting OpenAI.
export async function runToolLoop(input: {
  prompt: string;
  cardId?: string | null;
  ctx: ToolContext;
  emit: (event: AgentLoopEvent) => Promise<void> | void;
  turn?: TurnFn;
  // Called after each iteration's tool batch settles, with the cumulative results so far. Lets
  // the run be persisted completed before the trailing summary turn (M-102 R11).
  onToolPhaseSettled?: (settled: SettledToolCall[]) => Promise<void> | void;
}): Promise<AgentLoopResult> {
  const turn = input.turn ?? openAiTurn;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(input.cardId ?? null) },
    { role: "user", content: input.prompt },
  ];

  let finalText = "";
  let toolCallsMade = 0;
  const settled: SettledToolCall[] = [];
  const onTextDelta = async (delta: string) => {
    finalText += delta;
    await input.emit({ type: "output", delta });
  };

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const result: ModelTurn = await turn(messages, onTextDelta);
    if (result.toolCalls.length === 0) {
      return { text: result.text || finalText, iterations: iteration, toolCallsMade, hitMaxIterations: false };
    }

    // Record the assistant's tool-call request so the follow-up tool messages have a parent.
    messages.push({
      role: "assistant",
      content: result.text || null,
      tool_calls: result.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.rawArguments } })),
    });

    for (const call of result.toolCalls) {
      toolCallsMade += 1;
      await input.emit({ type: "tool_call_start", tool: call.name, args: call.args });
      const execution = await runToolWithWatchdog(call.name, call.args, input.ctx);
      await input.emit({ type: "tool_call_result", tool: call.name, resultPreview: execution.resultPreview, success: execution.success });
      settled.push({ tool: call.name, success: execution.success, resultPreview: execution.resultPreview });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(execution.result) });
    }
    // Checkpoint: tools for this iteration are done. The caller can now mark the run completed
    // so the slow trailing summary turn never gates completion.
    if (input.onToolPhaseSettled) await input.onToolPhaseSettled([...settled]);
  }

  // Exhausted the iteration budget — make one final non-tool turn so the user gets a summary.
  const closing: ModelTurn = await turn(
    [...messages, { role: "user", content: "Stop calling tools and summarise what you did in one or two sentences." }],
    onTextDelta,
  );
  return { text: closing.text || finalText, iterations: MAX_ITERATIONS, toolCallsMade, hitMaxIterations: true };
}

// Execute a tool under the per-call watchdog. On timeout, returns a failed ToolResult (rather
// than throwing) so the loop keeps going and still reaches a terminal state.
async function runToolWithWatchdog(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  try {
    return await withTimeout(executeTool(name, args, ctx), TOOL_CALL_TIMEOUT_MS, `tool:${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.startsWith("timeout:");
    const code = timedOut ? "tool_timeout" : message;
    return { success: false, result: { error: code }, resultPreview: { error: code, success: false }, error: code };
  }
}

function systemPrompt(cardId: string | null): string {
  const cardLine = cardId
    ? `The user is working on card "${cardId}". When a tool needs a cardId, use exactly this one unless the user names another.`
    : `No card is open. If the user asks to modify a card, ask them to open one first.`;
  return [
    "You are Magpie's server-side design agent. You can really call tools to search and generate brand assets and edit the open card — do not just describe what you would do, actually call the tools.",
    cardLine,
    "Tools: search_asset (find existing images first), describe_asset, generate_asset (only when nothing suitable exists), get_brand_rules, get_card_layers, add_layer_to_card.",
    "Prefer reusing an existing asset over generating a new one. After acting, reply with a short confirmation of what you changed. Never claim a tool result you did not get.",
  ].join("\n");
}
