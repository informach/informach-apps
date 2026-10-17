import "server-only";
import pino from "pino";
export const logger = pino({
  name: "edi",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["authorization", "cookie", "token", "secret", "body", "privateKey", "apiKey"],
    censor: "[redacted]",
  },
});
export const packageLogger = {
  debug: (message: string, context?: object) => logger.debug(context ?? {}, message),
  info: (message: string, context?: object) => logger.info(context ?? {}, message),
  warn: (message: string, context?: object) => logger.warn(context ?? {}, message),
  error: (message: string, context?: object) => logger.error(context ?? {}, message),
};
