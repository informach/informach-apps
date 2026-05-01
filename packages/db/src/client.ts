import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

type GlobalWithPg = typeof globalThis & {
  __informachPg?: ReturnType<typeof postgres>;
  __informachDb?: DrizzleDb;
};

function createDb(): DrizzleDb {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to instantiate @informach/db client");
  }

  const g = globalThis as GlobalWithPg;
  const client =
    g.__informachPg ??
    postgres(databaseUrl, {
      max: 10,
      prepare: false,
    });

  if (process.env.NODE_ENV !== "production") {
    g.__informachPg = client;
  }

  return drizzle(client, { schema });
}

export type Database = DrizzleDb;

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const g = globalThis as GlobalWithPg;
    g.__informachDb ??= createDb();
    return Reflect.get(g.__informachDb, prop, receiver);
  },
});
