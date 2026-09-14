import postgres from "postgres";

type LockGlobal = typeof globalThis & { __informachLockPg?: ReturnType<typeof postgres> };
export class DatabaseLockBusyError extends Error {
  constructor() {
    super("Database operation already in progress");
    this.name = "DatabaseLockBusyError";
  }
}

/** Cross-instance advisory lock for operations that call existing repositories.
 * Lock connections must not come from the query pool: callbacks use that pool,
 * and reserving every query connection before calling back would deadlock.
 * Two extra connections bound provider concurrency and leave query capacity free.
 */
async function withLock<T>(key: string, operation: () => Promise<T>, wait: boolean): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for database locks");
  const global = globalThis as LockGlobal;
  global.__informachLockPg ??= postgres(databaseUrl, {
    max: 2,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  // Wrap the generic value because postgres.begin unwraps arrays in its return type.
  const result = await global.__informachLockPg.begin(async (tx) => {
    if (wait) await tx`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    else {
      const [row] = await tx<
        { acquired: boolean }[]
      >`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as acquired`;
      if (!row?.acquired) throw new DatabaseLockBusyError();
    }
    return { value: await operation() };
  });
  return result.value;
}

export function withDatabaseLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  return withLock(key, operation, false);
}

export function withDatabaseLockWait<T>(key: string, operation: () => Promise<T>): Promise<T> {
  return withLock(key, operation, true);
}
