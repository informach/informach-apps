import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrations = fileURLToPath(new URL("../../../db/src/migrations/", import.meta.url));
type HistoricalDatabase = {
  db: Database;
  connection: ReturnType<typeof postgres>;
  migrateTo: (migration?: number) => Promise<void>;
};

/** Immutable migration prefixes in a separate, locally owned database, never the shared fixture. */
export async function withHistoricalDatabase<T>(
  run: (fixture: HistoricalDatabase) => Promise<T>,
): Promise<T> {
  const value = process.env.DATABASE_URL;
  if (!value || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
    throw new Error("Historical migration tests require an explicitly isolated database.");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "postgres"].includes(url.hostname))
    throw new Error("Historical migration tests cannot connect to a remote database.");
  const databaseName = `compasso_upgrade_${randomUUID().replaceAll("-", "")}`;
  if (!/^compasso_upgrade_[a-f0-9]{32}$/.test(databaseName))
    throw new Error("Invalid fixture name");
  const administration = postgres(value, { max: 1, prepare: false, onnotice: () => {} });
  let connection: ReturnType<typeof postgres> | undefined;
  let created = false;
  let root: string | undefined;
  const errors: unknown[] = [];
  let result: T | undefined;
  try {
    await administration.unsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    url.pathname = `/${databaseName}`;
    connection = postgres(url.toString(), { max: 2, prepare: false, onnotice: () => {} });
    const db: Database = drizzle(connection, { schema });
    root = await mkdtemp(join(tmpdir(), "compasso-upgrade-"));
    const directory = root;
    const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    /** `migration` is the number in the tag (0099_…), as docs and tests cite it.
     * It is not the journal idx: Recreio's 0080 came first, so from there the
     * Compasso migrations sit one idx after their number. */
    async function migrateTo(migration?: number) {
      if (migration === undefined) return migrate(db, { migrationsFolder: migrations });
      const tagPrefix = `${String(migration).padStart(4, "0")}_`;
      const matches = journal.entries.filter((entry) => entry.tag.startsWith(tagPrefix));
      const [boundary] = matches;
      if (!boundary || matches.length > 1)
        throw new Error("Unknown or ambiguous historical migration boundary");
      const prefix = join(directory, String(migration));
      await mkdir(join(prefix, "meta"), { recursive: true });
      const entries = journal.entries.filter((entry) => entry.idx <= boundary.idx);
      await writeFile(join(prefix, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
      for (const entry of entries)
        await copyFile(join(migrations, `${entry.tag}.sql`), join(prefix, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: prefix });
    }
    await migrateTo(81);
    result = await run({ db, connection, migrateTo });
  } catch (error) {
    errors.push(error);
  } finally {
    if (connection) await connection.end().catch((error: unknown) => errors.push(error));
    if (created)
      await administration
        .unsafe(`DROP DATABASE "${databaseName}"`)
        .catch((error: unknown) => errors.push(error));
    await administration.end().catch((error: unknown) => errors.push(error));
    if (root) {
      const parent = resolve(tmpdir());
      const target = resolve(root);
      if (dirname(target) !== parent || !basename(target).startsWith("compasso-upgrade-"))
        errors.push(new Error("Refusing to remove an unowned migration directory"));
      else
        await rm(target, { recursive: true, force: true }).catch((error: unknown) =>
          errors.push(error),
        );
    }
  }
  if (errors.length) throw new AggregateError(errors, "Historical database verification failed");
  return result as T;
}
