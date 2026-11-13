import { and, type Database, eq, or, sql } from "@informach/db";
import {
  members,
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  sessions,
  users,
} from "@informach/db/schema";
import { UnauthorizedError } from "./helpers";

/** Facts for a scope-aware closure preview, not permission to delete identity.
 * The caller must also inspect billing and each product's own dependencies.
 * No credentials, tokens, client secrets or another person's identity are read. */
export async function inspectSharedIdentityDependencies(db: Database, actorId: string) {
  const [identity] = await db
    .select({
      id: users.id,
      updatedAt: users.updatedAt,
      hasStaffRole: sql<boolean>`${users.role} in ('owner', 'admin')`.mapWith(Boolean),
      hasOtherRole: sql<boolean>`${users.role} not in ('member', 'owner', 'admin')`.mapWith(
        Boolean,
      ),
      organizationMemberships:
        sql<number>`(select count(*)::integer from ${members} m where m.user_id = ${actorId})`.mapWith(
          Number,
        ),
      desktopAuthorizationPresent: sql<boolean>`(
      exists (select 1 from ${oauthConsents} c where c.user_id = ${actorId}) or
      exists (select 1 from ${oauthRefreshTokens} t where t.user_id = ${actorId}) or
      exists (select 1 from ${oauthAccessTokens} t where t.user_id = ${actorId}) or
      exists (select 1 from ${oauthClients} c where c.user_id = ${actorId})
    )`.mapWith(Boolean),
      // NULL predates the web lineage: it can be Edi, Bastidores or a legacy session.
      // A count must not guess which independent product can be erased.
      unscopedLiveSessions:
        sql<number>`(select count(*)::integer from ${sessions} s where s.user_id = ${actorId} and s.origin_app is null and s.expires_at > now())`.mapWith(
          Number,
        ),
    })
    .from(users)
    .where(
      and(
        eq(users.id, actorId),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= now()`),
      ),
    );
  if (!identity) throw new UnauthorizedError();
  return identity;
}
