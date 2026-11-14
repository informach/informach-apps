import type { Database } from "@informach/db";
import { users } from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq } from "drizzle-orm";
import { BillingError } from "./errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Internal CLI operations only: never wire to a user-facing action. */
export async function requireBillingOwner(tx: Tx, ownerId: string, groupId: string) {
  await lockFamilyMembership(tx, ownerId, groupId, "administrator");
  const [owner] = await tx
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, ownerId), eq(users.role, "owner")))
    .limit(1);
  if (!owner) throw new BillingError("Owner authorization required");
}
