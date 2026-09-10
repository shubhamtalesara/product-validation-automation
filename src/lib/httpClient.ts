import { PermanentError, RetryableError, toSanitizedMessage } from "./errors.js";
import type { Logger } from "./logger.js";

export interface HttpClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  logger?: Logger;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

// TrendTrack's /v1/lookup?type=auto searches brandtrackers, advertisers,
// and shops in one call, and can genuinely take longer than 15s under load -
// observed timing out repeatedly against the 15s default in production.
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WithRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  logger?: Logger;
  label?: string;
}

/**
 * Generic retry/backoff wrapper for API calls that can't go through
 * HttpClient.request directly (multipart uploads, SDK calls, etc). Retries
 * RetryableError, rethrows PermanentError immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PermanentError) throw err;
      attempt += 1;
      if (attempt > maxRetries) {
        options.logger?.error("Exhausted retries", {
          label: options.label,
          attempts: attempt,
          error: toSanitizedMessage(err),
        });
        throw err instanceof RetryableError
          ? err
          : new RetryableError(`${options.label ?? "request"} failed: ${toSanitizedMessage(err)}`);
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      options.logger?.warn("Retrying after transient error", {
        label: options.label,
        attempt,
        delayMs: delay,
        error: toSanitizedMessage(err),
      });
      await sleep(delay);
    }
  }
}

/**
 * Fetch wrapper with timeout, exponential backoff, and retry/permanent error
 * classification for external API calls (TrendTrack, Meta, Google).
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly logger?: Logger;

  constructor(baseUrl: string, options: HttpClientOptions = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.logger = options.logger;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = buildUrl(this.baseUrl, path, options.query);
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          const sanitized = toSanitizedMessage(bodyText || response.statusText);
          const message = `HTTP ${response.status} for ${options.method ?? "GET"} ${path}: ${sanitized}`;
          if (isRetryableStatus(response.status)) {
            throw new RetryableError(message);
          }
          throw new PermanentError(message);
        }

        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        const isAbort = err instanceof Error && err.name === "AbortError";
        const isPermanent = err instanceof PermanentError;

        if (isPermanent) {
          this.logger?.error("Permanent error, not retrying", {
            path,
            error: toSanitizedMessage(err),
          });
          throw err;
        }

        const wrapped = isAbort
          ? new RetryableError(`Request timed out after ${this.timeoutMs}ms: ${path}`)
          : err instanceof RetryableError
            ? err
            : new RetryableError(`Network error for ${path}: ${toSanitizedMessage(err)}`);

        attempt += 1;
        if (attempt > this.maxRetries) {
          this.logger?.error("Exhausted retries", {
            path,
            attempts: attempt,
            error: toSanitizedMessage(wrapped),
          });
          throw wrapped;
        }

        const delay = this.baseDelayMs * 2 ** (attempt - 1);
        this.logger?.warn("Retrying after transient error", {
          path,
          attempt,
          delayMs: delay,
          error: toSanitizedMessage(wrapped),
        });
        await sleep(delay);
      }
    }

    throw lastError instanceof Error ? lastError : new RetryableError("Unknown request failure");
  }
}
