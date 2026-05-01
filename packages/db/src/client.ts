import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to instantiate @informach/db client");
}

type GlobalWithPg = typeof globalThis & { __informachPg?: ReturnType<typeof postgres> };
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

export const db = drizzle(client, { schema });
export type Database = typeof db;
