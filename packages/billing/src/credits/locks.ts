import type { Database } from "@informach/db";
import { sql } from "drizzle-orm";
import type { CreditOwner } from "../types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** One lock protocol for reservation, settlement and funding transitions. */
export async function lockCreditOwner(tx: Tx, owner: CreditOwner) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${owner.type}:${owner.id}`}))`);
}
