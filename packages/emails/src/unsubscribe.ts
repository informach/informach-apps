import type { Database } from "@informach/db";
import { emailUnsubscribes, users } from "@informach/db/schema";
import { eq } from "drizzle-orm";
import { type EmailAuditHook, emailAddressAuditPayload, emitEmailAudit } from "./audit";
import { verifyUnsubscribeToken } from "./list-unsubscribe";

export type ProcessUnsubscribeResult =
  | { ok: true; identifier: string; category: string; userId: string | null }
  | { ok: false; reason: "invalid-token" };

export async function processUnsubscribe(
  deps: { db: Database; secret: string; onAudit?: EmailAuditHook },
  token: string,
): Promise<ProcessUnsubscribeResult> {
  const verified = verifyUnsubscribeToken(deps.secret, token);
  if (!verified) {
    return { ok: false, reason: "invalid-token" };
  }

  const { identifier, category } = verified;

  let userId: string | null = null;
  if (identifier.includes("@")) {
    const [user] = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, identifier.toLowerCase()))
      .limit(1);
    userId = user?.id ?? null;
  } else {
    const [user] = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, identifier))
      .limit(1);
    userId = user?.id ?? null;
  }

  if (userId) {
    await deps.db.insert(emailUnsubscribes).values({ userId, category }).onConflictDoNothing();
    emitEmailAudit(deps, {
      eventType: "email.unsubscribe_recorded",
      actorId: userId,
      payload: {
        category,
        identifierKind: identifier.includes("@") ? "email" : "userId",
        ...(identifier.includes("@") ? emailAddressAuditPayload(identifier) : {}),
      },
    });
  }

  return { ok: true, identifier, category, userId };
}
