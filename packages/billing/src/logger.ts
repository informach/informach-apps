export type Logger = {
  debug?: (msg: string, ctx?: Record<string, unknown>) => void;
  info?: (msg: string, ctx?: Record<string, unknown>) => void;
  warn?: (msg: string, ctx?: Record<string, unknown>) => void;
  error?: (msg: string, ctx?: Record<string, unknown>) => void;
};

export function safeLog(
  logger: Logger | undefined,
  level: "debug" | "info" | "warn" | "error",
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  if (!logger) return;
  const fn = logger[level];
  if (!fn) return;
  try {
    fn(msg, ctx);
  } catch {
    // Logger failures must never break the billing flow.
  }
}
