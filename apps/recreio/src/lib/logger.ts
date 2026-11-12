import pino from "pino";

export const logger = pino({
  base: { app: "recreio" },
  redact: ["email", "password", "token", "cookie", "answer", "text"],
});
