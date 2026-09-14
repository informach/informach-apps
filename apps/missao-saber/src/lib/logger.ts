import pino from "pino";

export const logger = pino({
  base: { app: "missao-saber" },
  redact: ["email", "password", "token", "cookie", "answer", "text"],
});
