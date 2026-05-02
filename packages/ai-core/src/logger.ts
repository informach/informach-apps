import { PinoLogger } from "@mastra/loggers";

export type MastraLogLevel = "debug" | "info" | "warn" | "error";

export type CreateDefaultLoggerConfig = {
  /** Tag para o logger (aparece no campo `name` dos logs JSON). Use o nome do app. */
  name: string;
  /** Nível mínimo. Default "info". */
  level?: MastraLogLevel;
  /** Em dev costuma ser `true`, em prod `false`. Default segue NODE_ENV: pretty em desenvolvimento. */
  prettyPrint?: boolean;
};

/**
 * Cria um `PinoLogger` (compatível com `IMastraLogger`) já configurado para
 * o app. Apps podem passar isso direto para `createMastra({ logger })`.
 *
 * O package nunca lê `process.env`; quem decide o `name`/`level`/`prettyPrint`
 * é o app, normalmente via `lib/env.ts` (`MASTRA_LOG_LEVEL`).
 */
export function createDefaultLogger(config: CreateDefaultLoggerConfig): PinoLogger {
  return new PinoLogger({
    name: config.name,
    level: config.level ?? "info",
    ...(config.prettyPrint !== undefined ? { prettyPrint: config.prettyPrint } : {}),
  });
}

export type { PinoLogger };
