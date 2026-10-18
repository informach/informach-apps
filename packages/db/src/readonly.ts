import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type ReadOnlyDatabaseOptions = {
  /** Conexões no pool. Default 5. */
  max?: number;
  /** Tempo máximo de cada consulta, em milissegundos. Default 15 s. */
  statementTimeoutMs?: number;
  /** Nome que aparece em `pg_stat_activity`. */
  applicationName?: string;
};

/**
 * Conexão em que o próprio Postgres recusa escrita: toda transação nasce com
 * `default_transaction_read_only`. Serve a painéis que só leem (o Bastidores),
 * para que um engano de código não vire `UPDATE` em produção. Escritas legítimas
 * passam pelo cliente normal (`db`) e pelas funções dos pacotes.
 */
export function createReadOnlyDatabase(databaseUrl: string, options: ReadOnlyDatabaseOptions = {}) {
  const client = postgres(databaseUrl, {
    max: options.max ?? 5,
    prepare: false,
    connect_timeout: 10,
    connection: {
      default_transaction_read_only: true,
      statement_timeout: options.statementTimeoutMs ?? 15_000,
      application_name: options.applicationName ?? "informach-readonly",
    },
  });
  return drizzle(client, { schema });
}

export type ReadOnlyDatabase = ReturnType<typeof createReadOnlyDatabase>;
