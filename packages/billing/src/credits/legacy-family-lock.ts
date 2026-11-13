import type { Database } from "@informach/db";
import { familyGroups, familyMigrationSources } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { BillingError } from "../errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Caller holds the source and destination wallet locks when they exist. */
export async function lockLegacySourceFamily(tx: Tx, app: string, userId: string) {
  const condition = and(
    eq(familyMigrationSources.app, app),
    eq(familyMigrationSources.sourceOwnerId, userId),
  );
  const [source] = await tx
    .select({ groupId: familyMigrationSources.groupId })
    .from(familyMigrationSources)
    .where(condition);
  if (!source) return;
  const [group] = await tx
    .select({ id: familyGroups.id })
    .from(familyGroups)
    .where(eq(familyGroups.id, source.groupId))
    .for("update");
  const [current] = await tx
    .select({ groupId: familyMigrationSources.groupId })
    .from(familyMigrationSources)
    .where(condition);
  if (!group || current?.groupId !== source.groupId)
    throw new BillingError("Legacy family provenance changed during financial reconciliation");
}
