import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";

export class MigrationChainError extends Error {
  constructor(
    readonly code:
      | "FILES_INVALID"
      | "HISTORY_MISSING"
      | "HISTORY_FUTURE"
      | "HISTORY_INCONSISTENT"
      | "HISTORY_INCOMPLETE"
      | "FILES_CHANGED"
      | "CONNECTION_NOT_OWNED",
  ) {
    super(code);
  }
}
type Receipt = { hash: string; createdAt: string };
type FileIdentity = Pick<MigrationMeta, "hash" | "folderMillis">;

/** Exact known prefix including SQL hashes. A restored copy must already
 * have provenance; this profile deliberately does not bootstrap an empty DB
 * or accept a future suffix that this recovery release cannot interpret. */
export function verifyRestoredMigrationPrefix(
  files: readonly FileIdentity[],
  applied: readonly Receipt[],
) {
  if (files.length === 0 || files.length > 4096) throw new MigrationChainError("FILES_INVALID");
  for (let i = 0; i < files.length; i++) {
    const f = files[i],
      anterior = files[i - 1];
    if (
      !f ||
      !/^[a-f0-9]{64}$/.test(f.hash) ||
      !Number.isSafeInteger(f.folderMillis) ||
      f.folderMillis <= 0 ||
      (i > 0 && (!anterior || f.folderMillis <= anterior.folderMillis))
    )
      throw new MigrationChainError("FILES_INVALID");
  }
  if (applied.length === 0) throw new MigrationChainError("HISTORY_MISSING");
  if (applied.length > files.length) throw new MigrationChainError("HISTORY_FUTURE");
  const last = files.at(-1);
  if (
    last &&
    applied.some(
      (r) => r && /^[1-9]\d*$/.test(r.createdAt) && Number(r.createdAt) > last.folderMillis,
    )
  )
    throw new MigrationChainError("HISTORY_FUTURE");
  for (let i = 0; i < applied.length; i++) {
    const receipt = applied[i],
      file = files[i];
    if (
      !receipt ||
      !file ||
      !/^[1-9]\d*$/.test(receipt.createdAt) ||
      !Number.isSafeInteger(Number(receipt.createdAt)) ||
      Number(receipt.createdAt) !== file.folderMillis ||
      receipt.hash !== file.hash
    )
      throw new MigrationChainError("HISTORY_INCONSISTENT");
  }
  return { before: applied.length, target: files.length, pending: files.length - applied.length };
}

/** Explicit dedicated client and trusted release directory only. Caller owns
 * the destination authorization, exclusivity and lifecycle; no environment,
 * default application pool, seed, history rewrite or cutover is used here. */
export async function migrateOwnedCopyWithVerifiedHistory(config: {
  connection: postgres.Sql;
  migrationsFolder: string;
}) {
  if (config.connection.options.max !== 1) throw new MigrationChainError("CONNECTION_NOT_OWNED");
  const files = readMigrationFiles({ migrationsFolder: config.migrationsFolder });
  const readHistory = async () => {
    const [table] = await config.connection.unsafe<{ name: string | null }[]>(
      "select to_regclass('drizzle.__drizzle_migrations')::text as name",
    );
    if (!table?.name) throw new MigrationChainError("HISTORY_MISSING");
    return config.connection.unsafe<{ hash: string; created_at: string }[]>(
      "select hash,created_at::text from drizzle.__drizzle_migrations order by created_at,id limit 4097",
    );
  };
  const receipts = (rows: Awaited<ReturnType<typeof readHistory>>) =>
    rows.map((r) => ({ hash: r.hash, createdAt: r.created_at }));
  const before = verifyRestoredMigrationPrefix(files, receipts(await readHistory()));
  if (before.pending)
    await migrate(drizzle(config.connection), { migrationsFolder: config.migrationsFolder });
  const after = verifyRestoredMigrationPrefix(files, receipts(await readHistory()));
  if (after.pending !== 0) throw new MigrationChainError("HISTORY_INCOMPLETE");
  const current = readMigrationFiles({ migrationsFolder: config.migrationsFolder });
  if (
    current.length !== files.length ||
    current.some((f, i) => f.hash !== files[i]?.hash || f.folderMillis !== files[i]?.folderMillis)
  )
    throw new MigrationChainError("FILES_CHANGED");
  return {
    receiptsBefore: before.before,
    receiptsAfter: after.target,
    migrationsApplied: before.pending,
    timestampsAndHashesVerified: true as const,
  };
}
