import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

// Claude (Anthropic) is Güfi OS's AI provider (owner decision, docs/decisions.md).
// Server-only: the key never reaches the browser. Every call is logged in ai_runs.

export const CLAUDE_MODEL = "claude-opus-5-5";
// Opus 5.5 list price: $4 / $20 per million tokens → micro-dollars per token.
const PRICE_MICROUSD = { input: 4, output: 20 };

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Claude isn't configured (ANTHROPIC_API_KEY is missing).");
  client ??= new Anthropic({ timeout: 240_000, maxRetries: 2 });
  return client;
}

export function estimateCostMicroUsd(usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  return input * PRICE_MICROUSD.input + (usage.output_tokens ?? 0) * PRICE_MICROUSD.output;
}

export async function logAiRun(run: {
  organizationId: string;
  userId: string;
  feature: string;
  subjectType?: string;
  subjectId?: string;
  status: "succeeded" | "failed" | "refused";
  usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null;
  durationMs: number;
  error?: string;
  requestId?: string | null;
}) {
  try {
    const supabase = await createClient();
    await supabase.from("ai_runs").insert({
      organization_id: run.organizationId,
      user_id: run.userId,
      feature: run.feature,
      subject_type: run.subjectType ?? null,
      subject_id: run.subjectId ?? null,
      model: CLAUDE_MODEL,
      status: run.status,
      input_tokens: run.usage ? (run.usage.input_tokens ?? 0) + (run.usage.cache_creation_input_tokens ?? 0) + (run.usage.cache_read_input_tokens ?? 0) : null,
      output_tokens: run.usage?.output_tokens ?? null,
      cost_microusd: run.usage ? estimateCostMicroUsd(run.usage) : null,
      duration_ms: Math.round(run.durationMs),
      error: run.error?.slice(0, 500) ?? null,
      request_id: run.requestId ?? null,
    });
  } catch (e) {
    console.error("[ai] could not log run", e instanceof Error ? e.message : e);
  }
}
