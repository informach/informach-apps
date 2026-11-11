import type { Database } from "@informach/db";
import { collectionAccounts, familyEvents, users } from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { BillingError } from "./errors";
import type { CreditOwner, SubjectRef } from "./types";

type Reader = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function openCompassoAccount(db: Database, actorId: string, groupId: string) {
  return db.transaction(async (tx) => {
    const member = await lockFamilyMembership(tx, actorId, groupId);
    const [existing] = await tx
      .select()
      .from(collectionAccounts)
      .where(
        and(
          eq(collectionAccounts.groupId, groupId),
          eq(collectionAccounts.collection, "compasso"),
          isNull(collectionAccounts.closedAt),
        ),
      );
    if (existing) {
      if (existing.payerUserId !== actorId)
        throw new BillingError(
          "This family already has a payer; use the explicit transfer process",
        );
      return existing;
    }
    if (member.role !== "administrator")
      throw new BillingError("Only a family administrator can open its commercial account");
    const [account] = await tx
      .insert(collectionAccounts)
      .values({ collection: "compasso", groupId, payerUserId: actorId })
      .returning();
    if (!account) throw new BillingError("Commercial account was not created");
    await tx
      .insert(familyEvents)
      .values({ groupId, actorId, event: "billing.account_opened", targetId: account.id });
    return account;
  });
}

/** Billing ownership survives leaving a family, so the payer can still cancel their contract. */
export async function assertAccountPayer(reader: Reader, actorId: string, accountId: string) {
  const [account] = await reader
    .select({ account: collectionAccounts, email: users.email })
    .from(collectionAccounts)
    .innerJoin(users, eq(users.id, collectionAccounts.payerUserId))
    .where(
      and(
        eq(collectionAccounts.id, accountId),
        eq(collectionAccounts.payerUserId, actorId),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), lte(users.banExpiresAt, new Date())),
      ),
    )
    .limit(1);
  if (!account) throw new BillingError("Commercial account unavailable to this payer");
  return account;
}

/** Financial recipient is resolved from durable provenance, including delayed paid events. */
export async function resolveCreditOwner(
  reader: Reader,
  scope: string,
  subject: SubjectRef,
): Promise<CreditOwner> {
  if (subject.type !== "billing_account") return { type: subject.type, id: subject.id };
  const [account] = await reader
    .select({ groupId: collectionAccounts.groupId })
    .from(collectionAccounts)
    .where(and(eq(collectionAccounts.id, subject.id), eq(collectionAccounts.collection, scope)))
    .limit(1);
  if (!account)
    throw new BillingError("Commercial credit destination is missing or outside the event scope");
  return { type: "family", id: account.groupId };
}
