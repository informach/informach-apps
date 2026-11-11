import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@informach/db";
import { sessions } from "@informach/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { activeWebParticipationCondition } from "./web-participation";
import type { WebSsoConfig } from "./web-sso-contract";

type Parent = { id: string; userId: string; expiresAt: Date };
const requestIdentity = new AsyncLocalStorage<{ parent?: Parent }>();

/** One callback request, never a process-global identity or a browser-supplied field. */
export function withWebSsoRequest<T>(work: () => T): T {
  return requestIdentity.run({}, work);
}

/** Called only AFTER the generic OIDC adapter verifies signature/issuer/audience/nonce. */
export async function bindWebSsoParent(userId: string, sessionId: string) {
  const scope = requestIdentity.getStore();
  if (!scope || scope.parent) return false;
  const [parent] = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        eq(sessions.originApp, "conta"),
        isNull(sessions.parentSessionId),
        gt(sessions.expiresAt, new Date()),
        activeWebParticipationCondition(userId),
      ),
    )
    .limit(1);
  if (!parent) return false;
  scope.parent = parent;
  return true;
}

export function webSsoSessionData(
  config: WebSsoConfig,
  session: { userId: string; expiresAt?: Date },
) {
  if (config.role === "provider") return { originApp: "conta", parentSessionId: null };
  const parent = requestIdentity.getStore()?.parent;
  if (!parent || parent.userId !== session.userId || parent.expiresAt <= new Date()) return null;
  // The composite FK closes a revocation race after this check: an insert either
  // fails against the removed parent or is removed by its cascading deletion.
  return {
    originApp: config.app,
    parentSessionId: parent.id,
    expiresAt:
      session.expiresAt && session.expiresAt < parent.expiresAt
        ? session.expiresAt
        : parent.expiresAt,
  };
}
