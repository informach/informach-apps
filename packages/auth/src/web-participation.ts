import { and, type Database, eq, or, type SQLWrapper, sql } from "@informach/db";
import {
  sessions,
  ssoAccessTokens,
  ssoRefreshTokens,
  users,
  webParticipations,
} from "@informach/db/schema";
import { ne, notExists } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { logAuditEventStrict } from "./audit";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Database | Transaction;
const userIdSchema = z.string().min(1).max(200);
const revisionSchema = z.number().int().min(0).max(2147483646);
const transitionSchema = z.strictObject({
  userId: userIdSchema,
  operationId: z.uuid(),
  expectedRevision: revisionSchema,
});
type Transition = z.infer<typeof transitionSchema>;

/** Commercial admission spans provider I/O. Its dedicated coordination lock
 * must be acquired together with the account lock, never in a nested pool call. */
export const webCommercialLockKey = (userId: string) =>
  `auth:web-commerce:${userIdSchema.parse(userId)}`;

export class WebParticipationError extends Error {
  constructor(readonly code: "unavailable" | "stale-revision" | "invalid-transition") {
    super(`Web participation: ${code}`);
    this.name = "WebParticipationError";
  }
}

/** Read predicate only. A mutation must also hold lockActiveWebParticipation in its tx. */
export function activeWebParticipationCondition(userId: string | SQLWrapper) {
  return notExists(
    new QueryBuilder()
      .select({ present: sql`1` })
      .from(webParticipations)
      .where(and(eq(webParticipations.userId, userId), ne(webParticipations.state, "active"))),
  );
}

/** A capability belongs to its admission revision. Resuming web participation
 * never reactivates a credential issued before suspension. Missing initial rows
 * have revision zero, matching credentials created before this lifecycle. */
export function currentWebParticipationCondition(
  userId: string | SQLWrapper,
  revision: number | SQLWrapper,
) {
  const currentRevision = new QueryBuilder()
    .select({ revision: webParticipations.revision })
    .from(webParticipations)
    .where(eq(webParticipations.userId, userId));
  // A typed correlated subquery keeps its own column scope in both SELECT and WHERE.
  return sql`(${activeWebParticipationCondition(userId)} AND ${eq(sql`coalesce((${currentRevision}), 0)`, revision)})`;
}

export async function readWebParticipation(reader: Reader, userId: string) {
  userIdSchema.parse(userId);
  const [row] = await reader
    .select({ state: webParticipations.state, revision: webParticipations.revision })
    .from(webParticipations)
    .where(eq(webParticipations.userId, userId));
  return row ?? { state: "active" as const, revision: 0 };
}

async function ensureParticipation(tx: Transaction, userId: string) {
  userIdSchema.parse(userId);
  await tx.insert(webParticipations).values({ userId }).onConflictDoNothing();
}

/**
 * Keep this shared row lock until the domain write commits. Freeze takes UPDATE on
 * the same row, waits for prior writes and blocks later ones. Distinct writers can
 * proceed together. In repeatable read PostgreSQL rejects a stale snapshot.
 * This supplements, never replaces, domain permissions. Do not hold it over I/O.
 * Jobs that cross transactions capture revision at admission and supply it here.
 */
export async function lockActiveWebParticipation(
  tx: Transaction,
  userId: string,
  expectedRevision?: number,
) {
  if (expectedRevision !== undefined) revisionSchema.parse(expectedRevision);
  const row = await lockWebParticipation(tx, userId);
  if (row.state !== "active") throw new WebParticipationError("unavailable");
  if (expectedRevision !== undefined && row.revision !== expectedRevision)
    throw new WebParticipationError("stale-revision");
  const [actor] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= clock_timestamp()`),
      ),
    );
  if (!actor) throw new WebParticipationError("unavailable");
  return row.revision;
}

/** Maintenance observes state under the same lock, including frozen/closed users.
 * This grants NO domain access. It permits reconciliation to discard stale private
 * output while settling existing financial facts independently of active access. */
export async function lockWebParticipation(tx: Transaction, userId: string) {
  await ensureParticipation(tx, userId);
  const [row] = await tx
    .select({
      state: webParticipations.state,
      revision: webParticipations.revision,
      operationId: webParticipations.operationId,
    })
    .from(webParticipations)
    .where(eq(webParticipations.userId, userId))
    .for("share");
  if (!row) throw new WebParticipationError("unavailable");
  return row;
}

/** For an already authorized lifecycle worker, never for an app session. The
 * coordinator must fence the durable request/step before invoking this guard. */
export async function lockFrozenWebParticipation(tx: Transaction, raw: Transition) {
  const input = transitionSchema.parse(raw);
  const row = await lockWebParticipation(tx, input.userId);
  if (
    row.state !== "frozen" ||
    row.operationId !== input.operationId ||
    row.revision !== input.expectedRevision
  )
    throw new WebParticipationError("stale-revision");
  return row.revision;
}

/**
 * Internal lifecycle primitive; the account coordinator must authorize, persist
 * its immutable request and verify prerequisites in this SAME transaction.
 * It must NOT hold family/domain locks here: domain writers acquire those first.
 * Resumption is allowed by the coordinator only before irreversible steps.
 * No public route or automatic enrollment calls these functions.
 */
async function transitionParticipation(
  tx: Transaction,
  raw: Transition,
  target: "active" | "frozen" | "closed",
) {
  const input = transitionSchema.parse(raw);
  // Wait for a previously admitted commercial operation to leave its durable
  // intent before freezing; late admissions observe the new state and refuse.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${webCommercialLockKey(input.userId)}, 0))`,
  );
  await ensureParticipation(tx, input.userId);
  const [current] = await tx
    .select()
    .from(webParticipations)
    .where(eq(webParticipations.userId, input.userId))
    .for("update");
  if (!current) throw new WebParticipationError("unavailable");
  const revision = input.expectedRevision + 1;
  if (
    current.state === target &&
    current.operationId === input.operationId &&
    current.revision === revision
  )
    return { state: target, revision };
  if (current.revision !== input.expectedRevision)
    throw new WebParticipationError("stale-revision");
  if (
    (target === "frozen" && current.state !== "active") ||
    (target !== "frozen" &&
      (current.state !== "frozen" || current.operationId !== input.operationId))
  )
    throw new WebParticipationError("invalid-transition");
  await tx
    .update(webParticipations)
    .set({
      state: target,
      revision,
      operationId: input.operationId,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(eq(webParticipations.userId, input.userId));
  // OAuth token FKs use SET NULL, so revocation must be explicit and scoped to
  // the web issuer. The independent desktop OAuth tables are not touched.
  await tx.delete(ssoAccessTokens).where(eq(ssoAccessTokens.userId, input.userId));
  await tx.delete(ssoRefreshTokens).where(eq(ssoRefreshTokens.userId, input.userId));
  // Only web roots; child sessions follow their cascading FK.
  // New central authentication remains possible for status/recovery, but cannot
  // establish app participation. Independent Edi/Bastidores sessions are untouched.
  await tx
    .delete(sessions)
    .where(and(eq(sessions.userId, input.userId), eq(sessions.originApp, "conta")));
  await logAuditEventStrict(
    "user.web_participation_changed",
    input.userId,
    { scope: "compasso-web", state: target, operationId: input.operationId, revision },
    { writer: tx },
  );
  return { state: target, revision };
}

export const freezeWebParticipation = (tx: Transaction, input: Transition) =>
  transitionParticipation(tx, input, "frozen");
export const resumeWebParticipation = (tx: Transaction, input: Transition) =>
  transitionParticipation(tx, input, "active");
export const closeWebParticipation = (tx: Transaction, input: Transition) =>
  transitionParticipation(tx, input, "closed");
