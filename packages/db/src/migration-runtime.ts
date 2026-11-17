import postgres from "postgres";

/** Só o migrator: os limites nascem com cada conexão, inclusive em reconexão. */
export function createMigrationClient(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 15,
    connection: {
      application_name: "informach-migrator",
      lock_timeout: 1_000,
      statement_timeout: 60_000,
    },
  });
}

const messages = {
  MISSING_DATABASE_URL: "DATABASE_URL is required to run migrations",
  HISTORY_INCONSISTENT:
    "Migration history is inconsistent; reconcile it before applying migrations",
  CUTOVER_HELD:
    "Compasso cutover is held: validate the restored production backup, providers and maintenance window before setting COMPASSO_CUTOVER_RELEASE=compasso-2026-11 on the Railway migrator",
  HISTORY_INCOMPLETE: "Migration history is incomplete after migration",
};

export class MigrationPreconditionError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}

/** Driver errors can contain the URL, SQL and parameters. Emit only a bounded classification. */
export function migrationFailure(error: unknown): { code: string; message?: string } {
  if (error instanceof MigrationPreconditionError)
    return { code: error.code, message: error.message };
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      typeof current.code === "string" &&
      /^[0-9A-Z]{5}$/.test(current.code)
    )
      return { code: current.code };
    current = current instanceof Error ? current.cause : undefined;
  }
  return { code: "MIGRATION_FAILED" };
}
