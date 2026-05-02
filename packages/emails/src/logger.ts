export type LogFn = (msg: string, ctx?: object) => void;

export type Logger = {
  debug?: LogFn;
  info?: LogFn;
  warn?: LogFn;
  error?: LogFn;
};

export function safeLog(
  logger: Logger | undefined,
  level: keyof Logger,
  msg: string,
  ctx?: object,
): void {
  try {
    logger?.[level]?.(msg, ctx);
  } catch {
    // Observability must never change email delivery behavior.
  }
}
