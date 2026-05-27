import Anthropic from '@anthropic-ai/sdk';

// Model selection per SPEC/CLAUDE.md: Sonnet 4.6 for conversational onboarding
// and digest reasoning; Haiku 4.5 for routine per-opportunity scoring (M4).
export const MODELS = {
  onboarding: 'claude-sonnet-4-6',
  scoring: 'claude-haiku-4-5',
} as const;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
    // The SDK retries 429/5xx with backoff; we add a request timeout.
    client = new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 });
  }
  return client;
}

type WithUsage = {
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
};

// Wraps a Claude call with structured logging (model, latency, token usage;
// request_id on failure). Retry/timeout are handled by the SDK client above.
export async function withClaudeLogging<T extends WithUsage>(
  context: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const res = await fn();
    console.log(
      JSON.stringify({
        level: 'info',
        ts: new Date().toISOString(),
        event: 'llm_call_ok',
        durationMs: Date.now() - start,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
        ...context,
      }),
    );
    return res;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        ts: new Date().toISOString(),
        event: 'llm_call_failed',
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        requestId: err instanceof Anthropic.APIError ? err.requestID : undefined,
        ...context,
      }),
    );
    throw err;
  }
}
