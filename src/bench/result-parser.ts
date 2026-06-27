import type { TokenUsage } from "./schema";

export type ParsedAgentOutput = {
  finalMessage: string;
  tokenUsage: TokenUsage;
  costUsd: number | null;
  events: unknown[];
};

export function parseAgentOutput(stdout: string): ParsedAgentOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { finalMessage: "", tokenUsage: null, costUsd: null, events: [] };
  }

  const events: unknown[] = [];
  const jsonValues = parseJsonValues(trimmed);
  events.push(...jsonValues);

  const lastObject = [...jsonValues].reverse().find(isRecord);
  const finalMessage = extractFinalMessage(lastObject) ?? fallbackFinalMessage(trimmed);
  const tokenUsage = extractTokenUsage(lastObject);
  const costUsd = typeof lastObject?.cost_usd === "number" ? lastObject.cost_usd : null;

  return { finalMessage, tokenUsage, costUsd, events };
}

function parseJsonValues(text: string): unknown[] {
  try {
    return [JSON.parse(text)];
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }
}

function extractFinalMessage(value: Record<string, unknown> | undefined): string | null {
  if (!value) return null;
  for (const key of ["final", "finalMessage", "message", "result", "text", "response"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  const nested = value.output;
  if (isRecord(nested)) return extractFinalMessage(nested);
  return null;
}

function extractTokenUsage(value: Record<string, unknown> | undefined): TokenUsage {
  if (!value) return null;
  const usage = isRecord(value.tokenUsage) ? value.tokenUsage : isRecord(value.usage) ? value.usage : null;
  if (!usage) return null;
  const inputTokens = numberFrom(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = numberFrom(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens);
  const reasoningTokens = numberFrom(usage.reasoningTokens ?? usage.reasoning_tokens);
  const totalTokens = numberFrom(usage.totalTokens ?? usage.total_tokens);
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

function fallbackFinalMessage(text: string): string {
  return text.split(/\r?\n/).slice(-20).join("\n").trim();
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

