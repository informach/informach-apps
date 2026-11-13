import { type Database, db } from "@informach/db";
import { sessions, users, verifications } from "@informach/db/schema";
import { and, desc, eq, gt, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { logAuditEventStrict } from "./audit";
import { UnauthorizedError } from "./helpers";
import { revokeTrustedDevices } from "./sessions";
import { activeWebParticipationCondition } from "./web-participation";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Always precedes locks on central sessions for mutations that can revoke more
 * than one browser, including account lifecycle transitions. */
export async function lockWebSessionChanges(tx: Transaction, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`web-sessions:${userId}`}))`);
}

/** A successful credential entry replaces only the browser presenting the old signed cookie. */
export async function retirePreviousWebBrowser(
  previous: { userId: string; sessionId: string },
  replacement: { userId: string; sessionId: string },
  database = db,
) {
  if (previous.sessionId === replacement.sessionId) return;
  await database.transaction(async (tx) => {
    await lockWebSessionChanges(tx, previous.userId);
    const [next] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, replacement.sessionId),
          eq(sessions.userId, replacement.userId),
          eq(sessions.originApp, "conta"),
          isNull(sessions.parentSessionId),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!next) throw new UnauthorizedError();
    const removed = await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.id, previous.sessionId),
          eq(sessions.userId, previous.userId),
          eq(sessions.originApp, "conta"),
          isNull(sessions.parentSessionId),
        ),
      )
      .returning({ id: sessions.id });
    if (removed.length)
      await logAuditEventStrict(
        "session.revoked",
        previous.userId,
        { scope: "web", mode: "replaced_browser", count: removed.length },
        { writer: tx },
      );
  });
}

async function clientRoot(
  database: Database | Transaction,
  userId: string,
  sessionId: string,
  app: string,
  maxAgeSeconds?: number,
) {
  const child = alias(sessions, "client_session");
  const root = alias(sessions, "root_session");
  const [row] = await database
    .select({
      id: root.id,
      eligible: sql<boolean>`${users.emailVerified} and (${users.banned} = false or ${users.banExpiresAt} <= now())`,
      fresh:
        maxAgeSeconds === undefined
          ? sql<boolean>`true`
          : sql<boolean>`${root.createdAt} <= clock_timestamp() and ${root.createdAt} > clock_timestamp() - (${maxAgeSeconds} * interval '1 second')`,
    })
    .from(child)
    .innerJoin(root, and(eq(root.id, child.parentSessionId), eq(root.userId, child.userId)))
    .innerJoin(users, eq(users.id, child.userId))
    .where(
      and(
        eq(child.id, sessionId),
        eq(child.userId, userId),
        eq(child.originApp, app),
        eq(root.originApp, "conta"),
        isNull(root.parentSessionId),
        gt(child.expiresAt, sql`clock_timestamp()`),
        gt(root.expiresAt, sql`clock_timestamp()`),
        activeWebParticipationCondition(userId),
      ),
    )
    .limit(1);
  return row;
}

/** Live lineage for paired devices: creating a client session never extends its root. */
export async function isActiveWebSession(
  input: { userId: string; sessionId: string; app: string },
  database = db,
) {
  return Boolean((await clientRoot(database, input.userId, input.sessionId, input.app))?.eligible);
}

/** A new app callback is not a new password/MFA authentication. */
export async function isRecentWebAuthentication(
  input: {
    userId: string;
    sessionId: string;
    app: string;
    maxAgeSeconds: number;
  },
  database = db,
) {
  if (
    !Number.isSafeInteger(input.maxAgeSeconds) ||
    input.maxAgeSeconds <= 0 ||
    input.maxAgeSeconds > 3600
  )
    throw new Error("Invalid authentication freshness window");
  const root = await clientRoot(
    database,
    input.userId,
    input.sessionId,
    input.app,
    input.maxAgeSeconds,
  );
  return !!root?.eligible && root.fresh;
}

/** Signing out of a Compasso app also closes silent sign-in in this browser, including child-device handoff. */
export async function revokeWebBrowserFromClient(
  userId: string,
  sessionId: string,
  app: string,
  database = db,
) {
  return database.transaction(async (tx) => {
    await lockWebSessionChanges(tx, userId);
    const root = await clientRoot(tx, userId, sessionId, app);
    if (!root) return; // An already revoked/expired browser has nothing left to reopen.
    await tx.delete(sessions).where(and(eq(sessions.id, root.id), eq(sessions.userId, userId)));
    await logAuditEventStrict(
      "session.revoked",
      userId,
      { scope: "web", mode: "browser", app, count: 1 },
      { writer: tx },
    );
  });
}

async function currentSession(tx: Transaction, userId: string, sessionId: string) {
  const source = alias(sessions, "requesting_session");
  const [current] = await tx
    .select({ id: source.id })
    .from(source)
    .innerJoin(users, eq(users.id, source.userId))
    .where(
      and(
        eq(source.id, sessionId),
        eq(source.userId, userId),
        eq(source.originApp, "conta"),
        isNull(source.parentSessionId),
        gt(source.expiresAt, new Date()),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= now()`),
      ),
    )
    .for("update", { of: source });
  if (!current) throw new UnauthorizedError();
}

/** Freshness is the original password/MFA entry, never an app callback or refresh. */
export async function isRecentCentralAuthentication(
  userId: string,
  sessionId: string,
  maxAgeSeconds = 900,
  database: Pick<Database, "select"> = db,
) {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 3600)
    throw new Error("Invalid authentication freshness window");
  const [row] = await database
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        eq(sessions.originApp, "conta"),
        isNull(sessions.parentSessionId),
        gt(sessions.expiresAt, sql`clock_timestamp()`),
        sql`${sessions.createdAt} <= clock_timestamp()`,
        sql`${sessions.createdAt} > clock_timestamp() - (${maxAgeSeconds} * interval '1 second')`,
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= now()`),
      ),
    );
  return !!row;
}

/** Holds the exact central login until a sensitive state change commits. The
 * caller must serialize requests for the actor before acquiring this lock. */
export async function lockRecentCentralAuthentication(
  tx: Transaction,
  userId: string,
  sessionId: string,
) {
  const [session] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, userId), eq(sessions.originApp, "conta")),
    )
    .for("share");
  return !!session && isRecentCentralAuthentication(userId, sessionId, 900, tx);
}

export async function listWebSessions(userId: string, currentSessionId: string, database = db) {
  return database.transaction(async (tx) => {
    await currentSession(tx, userId, currentSessionId);
    const roots = await tx
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.originApp, "conta"),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .limit(51);
    const shown = roots.slice(0, 50);
    const children = shown.length
      ? await tx
          .selectDistinct({ parentId: sessions.parentSessionId, app: sessions.originApp })
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, userId),
              inArray(
                sessions.parentSessionId,
                shown.map((row) => row.id),
              ),
              gt(sessions.expiresAt, new Date()),
            ),
          )
      : [];
    return {
      hasMore: roots.length > 50,
      sessions: shown.map(({ userAgent, ...row }) => ({
        ...row,
        current: row.id === currentSessionId,
        device: deviceLabel(userAgent),
        apps: children
          .filter((child) => child.parentId === row.id)
          .map((child) => child.app)
          .filter((app): app is string => app !== null),
      })),
    };
  });
}

export type WebSessionRevocation = { mode: "all" | "others" } | { mode: "one"; sessionId: string };
export async function revokeWebSessions(
  userId: string,
  currentSessionId: string,
  input: WebSessionRevocation,
  database = db,
) {
  return database.transaction(async (tx) => {
    // Serialize changes for one account, then verify the requesting session again.
    await lockWebSessionChanges(tx, userId);
    await currentSession(tx, userId, currentSessionId);
    const removed = await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.originApp, "conta"),
          input.mode === "one"
            ? eq(sessions.id, input.sessionId)
            : input.mode === "others"
              ? ne(sessions.id, currentSessionId)
              : undefined,
        ),
      )
      .returning({ id: sessions.id });
    // Password-authenticated pending challenges must not reopen a closed session.
    // Trusted-device receipts are also invalidated; no factor secret is removed.
    await tx
      .delete(verifications)
      .where(and(eq(verifications.value, userId), like(verifications.identifier, "2fa-%")));
    await revokeTrustedDevices(userId, tx);
    await logAuditEventStrict(
      "session.revoked",
      userId,
      {
        scope: "web",
        mode: input.mode,
        count: removed.length,
        ...(input.mode === "one" ? { sessionId: input.sessionId } : {}),
      },
      { writer: tx },
    );
    return {
      count: removed.length,
      currentRevoked: removed.some((row) => row.id === currentSessionId),
    };
  });
}

/** A coarse device label, never the raw header, IP address or a session credential. */
function deviceLabel(agent: string | null) {
  const value = (agent ?? "").slice(0, 500);
  const browser = /Edg\//.test(value)
    ? "Edge"
    : /Firefox\//.test(value)
      ? "Firefox"
      : /Chrome\//.test(value)
        ? "Chrome"
        : /Safari\//.test(value)
          ? "Safari"
          : "Navegador";
  const platform = /Android/.test(value)
    ? "Android"
    : /iPhone|iPad/.test(value)
      ? "iPhone ou iPad"
      : /Windows/.test(value)
        ? "Windows"
        : /Macintosh/.test(value)
          ? "Mac"
          : /Linux/.test(value)
            ? "Linux"
            : "aparelho";
  return `${browser} · ${platform}`;
}
