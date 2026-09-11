import "server-only";
import { and, db, desc, eq, gt } from "@informach/db";
import { cozyaAiOperations } from "@informach/db/schema";
import { creationMethodSchema, recipeInputSchema } from "@/features/recipes/schemas";

const recoveredRecipeSchema = recipeInputSchema.extend({
  creationMethod: creationMethodSchema.removeDefault().exclude(["manual"]).default("prompt"),
});

/** Successful recipe drafts remain recoverable by their owner for 24h, without a model call. */
export async function getRecentRecipePreviews(userId: string) {
  const rows = await db
    .select()
    .from(cozyaAiOperations)
    .where(
      and(
        eq(cozyaAiOperations.userId, userId),
        eq(cozyaAiOperations.statusCode, 200),
        gt(cozyaAiOperations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(cozyaAiOperations.createdAt))
    .limit(50);
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
