import { ctx, db, storage } from "edgespark";
import { eq } from "drizzle-orm";
import { assets } from "@defs";
import { checkCost, writeCost, type CostQuoteItem } from "../cost";
import { getOpenAiApiKey, isDevEnv } from "../ownerConfig";

const DESCRIPTION_QUOTE: CostQuoteItem = { provider: "openai", operation: "openai.vision.describe.gpt-4o-mini", units: 1, unitMicros: 2_000 };

export async function describeAssetFromUrl(input: { assetId: string; userId: string; imageUrl: string; agentRunId?: string | null }, database = db): Promise<string> {
  const quote = await checkCost(database, input.userId, [DESCRIPTION_QUOTE]);
  if (!quote.allowed) throw new Error("budget_exhausted");
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    if (!isDevEnv()) throw new Error("openai_api_key_missing");
    await writeCost(database, quote, input.agentRunId ?? null);
    return "Dev auto-description: uploaded brand asset ready for search metadata.";
  }
  const payload = {
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Write one short factual sentence describing this brand asset for hidden search metadata. No style advice." },
        { type: "image_url", image_url: { url: input.imageUrl } },
      ],
    }],
    max_tokens: 60,
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error?.message === "string" ? body.error.message : "description_failed");
  await writeCost(database, quote, input.agentRunId ?? null);
  const sentence = String(body?.choices?.[0]?.message?.content ?? "").trim();
  return sentence.slice(0, 240);
}

// Non-routable placeholder thumbnail (legacy agent-tools surface). Tolerant of both the legacy
// `r2://` and canonical `s3://` schemes so it never throws on a real asset URI. Prefer
// buildPresignedGetUrl for anything that must actually be fetched.
export function buildPresignedGetPlaceholder(s3Uri: string): string {
  if (!s3Uri.startsWith("r2://") && !s3Uri.startsWith("s3://")) throw new Error("invalid_asset_uri");
  return `https://assets.internal/presigned/${encodeURIComponent(s3Uri.slice(5))}`;
}

// Real, externally-fetchable presigned GET URL — required for OpenAI vision to read the asset.
// Works off the canonical `s3://magpie-media/<key>` URI produced by storage.createS3Uri.
export async function buildPresignedGetUrl(s3Uri: string, expiresInSecs = 600): Promise<string> {
  const parsed = storage.tryParseS3Uri(s3Uri);
  if (!parsed) throw new Error("invalid_asset_uri");
  const { downloadUrl } = await storage.from(parsed.bucket).createPresignedGetUrl(parsed.path, expiresInSecs);
  return downloadUrl;
}

// Best-effort presigned GET for public preview/thumbnail surfaces (M-212). Returns a real,
// fetchable signed URL for canonical `s3://magpie-media/<key>` assets, or null when the URI is
// not presignable (legacy `r2://` upload placeholders, malformed URIs, or a signer error) so
// callers can degrade gracefully instead of leaking a dead `assets.internal` placeholder.
export async function safePresignPreview(s3Uri: string, expiresInSecs = 600): Promise<string | null> {
  try {
    if (!storage.tryParseS3Uri(s3Uri)) return null;
    return await buildPresignedGetUrl(s3Uri, expiresInSecs);
  } catch {
    return null;
  }
}

// Background gpt-4o-mini vision auto-description, shared by the single and batch imagegen flows.
// Presigns the asset, asks the model for one factual sentence, and writes it back. Fire-and-forget:
// failures are swallowed and never affect the imagegen response. Runs via ctx.runInBackground
// (Worker waitUntil) so it survives past the HTTP response.
export function triggerAssetDescription(
  input: { assetId: string; s3Uri: string; userId: string; agentRunId?: string | null },
  database = db,
): void {
  const task = (async () => {
    try {
      const imageUrl = await buildPresignedGetUrl(input.s3Uri);
      const description = await describeAssetFromUrl(
        { assetId: input.assetId, userId: input.userId, imageUrl, agentRunId: input.agentRunId ?? null },
        database,
      );
      await database
        .update(assets)
        .set({ description, descriptionSource: "llm-auto", descriptionGeneratedAt: Date.now(), updatedAt: Date.now() })
        .where(eq(assets.id, input.assetId));
    } catch {
      // Auto-description must never affect the imagegen result.
    }
  })();
  ctx.runInBackground ? ctx.runInBackground(task) : void task;
}
