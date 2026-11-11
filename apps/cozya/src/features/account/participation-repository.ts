import "server-only";
import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import { type Database, db, type SQLWrapper, sql } from "@informach/db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Live read predicate: ownership remains personal even when a family funds usage. */
export function activeCozyaUserCondition(column: SQLWrapper, userId: string) {
  return sql`(${column} = ${userId} and ${activeWebParticipationCondition(userId)})`;
}

/** Personal content only. Family-funded writes must lock their group first. */
export function withActiveCozyaUser<T>(userId: string, write: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, userId);
    return write(tx);
  });
}
