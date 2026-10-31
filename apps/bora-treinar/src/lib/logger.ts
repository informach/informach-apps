import pino from "pino";

export const logger = pino({
  base: { app: "bora-treinar" },
  redact: ["email", "password", "token", "cookie", "answer", "text"],
});
