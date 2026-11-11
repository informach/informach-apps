import "server-only";
import { activeWebParticipationCondition } from "@informach/auth/web-participation";
import { and, db, desc, eq, gt, sql } from "@informach/db";
import { cozyaAiOperations, familyGroups, familyMembers } from "@informach/db/schema";
import { creationMethodSchema, recipeInputSchema } from "@/features/recipes/schemas";
import { recoverSharedCozyaOperation } from "./shared-recovery";

const recoveredRecipeSchema = recipeInputSchema.extend({
  creationMethod: creationMethodSchema.removeDefault().exclude(["manual"]).default("prompt"),
});

/** Successful recipe drafts remain recoverable by their owner for 24h, without a model call. */
export async function availableCozyaAiOutputs(userId: string, limit?: number) {
  const pending = db
    .select({ id: cozyaAiOperations.id })
    .from(cozyaAiOperations)
    .where(
      and(
        eq(cozyaAiOperations.userId, userId),
        activeWebParticipationCondition(userId),
        gt(cozyaAiOperations.expiresAt, new Date()),
        sql`${cozyaAiOperations.familyGroupId} IS NOT NULL`,
        sql`(${cozyaAiOperations.statusCode} IS NULL OR ${cozyaAiOperations.statusCode} >= 500)`,
      ),
    )
    .orderBy(desc(cozyaAiOperations.createdAt))
    .$dynamic();
  const candidates = limit ? await pending.limit(limit) : await pending;
  for (const operation of candidates)
    await recoverSharedCozyaOperation(operation.id, userId, new Date());
  const query = db
    .select()
    .from(cozyaAiOperations)
    .where(
      and(
        eq(cozyaAiOperations.userId, userId),
        eq(cozyaAiOperations.statusCode, 200),
        activeWebParticipationCondition(userId),
        sql`${cozyaAiOperations.webParticipationRevision} = coalesce((select revision from core.web_participations where user_id = ${userId}), 0)`,
        gt(cozyaAiOperations.expiresAt, new Date()),
        sql`(${cozyaAiOperations.familyGroupId} IS NULL OR EXISTS (
          SELECT 1 FROM ${familyMembers} m JOIN ${familyGroups} g ON g.id = m.group_id
          WHERE m.group_id = ${cozyaAiOperations.familyGroupId} AND m.user_id = ${userId}
          AND m.revoked_at IS NULL AND g.archived_at IS NULL
        ))`,
      ),
    )
    .orderBy(desc(cozyaAiOperations.createdAt))
    .$dynamic();
  return limit ? query.limit(limit) : query;
}

export async function getRecentRecipePreviews(userId: string) {
  const rows = await availableCozyaAiOutputs(userId, 50);
  return rows.flatMap((row) => {
    const body = row.response as { isValidRecipe?: boolean; recipe?: unknown } | null;
    if (body?.isValidRecipe !== true) return [];
    const parsed = recoveredRecipeSchema.safeParse(body.recipe);
    return parsed.success
      ? [
          {
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            recipe: parsed.data,
          },
        ]
      : [];
  });
}

/** How many drafts can still be recovered, so the link only shows when there is one. */
export async function listRecentPreviewCount(userId: string) {
  return (await getRecentRecipePreviews(userId)).length;
}
