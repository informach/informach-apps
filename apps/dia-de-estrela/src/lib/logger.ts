import pino from "pino";

export const logger = pino({
  base: { app: "dia-de-estrela" },
  redact: ["email", "password", "token", "cookie", "answer", "text"],
});
