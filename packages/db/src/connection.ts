import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Owned connection for deployment commands and one-off jobs; never closes the server pool. */
type ExplicitSocketConnection = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: false;
};

export function createDatabaseConnection(target: string | ExplicitSocketConnection) {
  const limits = { max: 1, prepare: false, connect_timeout: 10 };
  const client =
    typeof target === "string" ? postgres(target, limits) : postgres({ ...target, ...limits });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 10 }) };
}
