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
