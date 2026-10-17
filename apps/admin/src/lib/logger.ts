import "server-only";
import pino from "pino";

export const logger = pino({
  name: "admin",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["authorization", "cookie", "token", "secret", "body", "email", "reason", "apiKey"],
    censor: "[redacted]",
  },
});
