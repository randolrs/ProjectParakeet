// Shared HTTP client for external API calls. CLAUDE.md mandate:
// every external call gets retry + timeout + structured logging.

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  // Free-form context for structured logs (e.g. { source: 'sam-direct' }).
  context?: Record<string, unknown>;
}

interface LogFields {
  event: string;
  url: string;
  attempt: number;
  status?: number;
  durationMs?: number;
  error?: string;
  context?: Record<string, unknown>;
}

function log(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// Strip query strings before logging so api_key query params never leak.
function safeUrl(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchJson(
  url: string,
  init: RequestInit = {},
  opts: FetchJsonOptions = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 3;
  const logged = safeUrl(url);

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const durationMs = Date.now() - start;

      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          log('warn', {
            event: 'external_call_retryable',
            url: logged,
            attempt,
            status: res.status,
            durationMs,
            context: opts.context,
          });
          await backoff(attempt);
          continue;
        }
        log('error', {
          event: 'external_call_failed',
          url: logged,
          attempt,
          status: res.status,
          durationMs,
          context: opts.context,
        });
        throw new Error(`Request to ${logged} failed: ${res.status} ${res.statusText}`);
      }

      log('info', {
        event: 'external_call_ok',
        url: logged,
        attempt,
        status: res.status,
        durationMs,
        context: opts.context,
      });
      return await res.json();
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - start;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      log('warn', {
        event: isAbort ? 'external_call_timeout' : 'external_call_error',
        url: logged,
        attempt,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
        context: opts.context,
      });
      // Re-throw immediately for thrown non-ok responses already logged above.
      if (err instanceof Error && err.message.startsWith(`Request to ${logged} failed:`)) {
        throw err;
      }
      if (attempt < retries) {
        await backoff(attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Request to ${logged} failed after ${retries} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function backoff(attempt: number): Promise<void> {
  // 1st retry waits ~500ms, then 1s, 2s ... with light jitter.
  const base = 500 * 2 ** (attempt - 1);
  const jitter = Math.random() * 250;
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
}
