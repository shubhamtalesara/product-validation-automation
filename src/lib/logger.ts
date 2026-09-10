type LogFields = Record<string, unknown>;

const SECRET_KEY_PATTERN = /token|secret|password|authorization|access_token|refresh_token/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: LogFields = {};
    for (const [k, v] of Object.entries(value as LogFields)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

function format(scope: string, message: string, fields?: LogFields): string {
  const base = `[${scope}] ${message}`;
  if (!fields || Object.keys(fields).length === 0) return base;
  const safeFields = redact(fields);
  return `${base} ${JSON.stringify(safeFields)}`;
}

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    info(message, fields) {
      // eslint-disable-next-line no-console
      console.log(format(scope, message, fields));
    },
    warn(message, fields) {
      // eslint-disable-next-line no-console
      console.warn(format(scope, message, fields));
    },
    error(message, fields) {
      // eslint-disable-next-line no-console
      console.error(format(scope, message, fields));
    },
    debug(message, fields) {
      if (process.env.LOG_LEVEL === "debug") {
        // eslint-disable-next-line no-console
        console.debug(format(scope, message, fields));
      }
    },
    child(childScope: string) {
      return createLogger(`${scope}:${childScope}`);
    },
  };
}
