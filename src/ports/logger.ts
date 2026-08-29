export type LogFields = Record<string, string | number | boolean | undefined>;
export interface Logger {
  debug(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
}
export const noopLogger: Logger = { debug() {}, warn() {} };

export function createRedactedLogger(write: (level: 'debug' | 'warn', event: string, fields: LogFields) => void): Logger {
  return {
    debug: (event, fields = {}) => write('debug', event, redact(fields)),
    warn: (event, fields = {}) => write('warn', event, redact(fields)),
  };
}
function redact(fields: LogFields): LogFields {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) =>
    /url|href|filename|query|text|user|account|cookie|token|signature/i.test(key)
      ? [key, '[redacted]'] : [key, value]));
}
