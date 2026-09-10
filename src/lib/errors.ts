/** Error thrown for conditions that are worth retrying (timeouts, 429, 5xx, network blips). */
export class RetryableError extends Error {
  readonly cause_?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RetryableError";
    this.cause_ = cause;
  }
}

/** Error thrown for conditions that will never succeed on retry (4xx validation, auth, bad request). */
export class PermanentError extends Error {
  readonly cause_?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PermanentError";
    this.cause_ = cause;
  }
}

const SECRET_PATTERN =
  /(access_token|token|api[_-]?key|secret|authorization)\s*[=:]\s*[^&\s"']+/gi;

/** Strips credential-shaped substrings from a string before it is logged or stored. */
export function sanitizeErrorMessage(message: string): string {
  return message.replace(SECRET_PATTERN, (match) => {
    const sepIndex = match.search(/[=:]/);
    return sepIndex === -1 ? "[REDACTED]" : `${match.slice(0, sepIndex + 1)}[REDACTED]`;
  });
}

export function toSanitizedMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return sanitizeErrorMessage(raw);
}
