import "server-only";
import { createReadOnlyDatabase, type ReadOnlyDatabase } from "@informach/db";
import { getEnv } from "./env";

let instance: ReadOnlyDatabase | undefined;

/**
 * Conexão das telas. Toda transação nasce só de leitura, então um engano em
 * consulta nunca vira escrita em produção. Ações (banir, encerrar sessões,
 * auditoria) usam o `db` normal através das funções dos pacotes.
 */
export function readDb(): ReadOnlyDatabase {
  if (instance) return instance;
  const env = getEnv();
  instance = createReadOnlyDatabase(env.READONLY_DATABASE_URL || env.DATABASE_URL, {
    max: 5,
    statementTimeoutMs: 15_000,
    applicationName: "bastidores",
  });
  return instance;
}
