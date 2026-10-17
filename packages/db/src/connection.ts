import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Owned connection for deployment commands and one-off jobs; never closes the server pool. */
export function createDatabaseConnection(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 10 }) };
}
