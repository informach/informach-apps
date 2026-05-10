import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    app: "agenda-da-turma",
    env: env.NODE_ENV,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});
