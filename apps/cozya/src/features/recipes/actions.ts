"use server";

import { action, err, ok } from "@/lib/action";
import { logger } from "@/lib/logger";
import { recipeInputSchema } from "./schemas";
import { createRecipe } from "./service";

export const createRecipeAction = action
  .input(recipeInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "recipes-create", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    try {
      const result = await createRecipe(userId, input);
      if (!result.ok) {
        return err(result.error);
      }

      logger.info(
        { userId, recipeId: result.value.id, isFavorite: result.value.isFavorite },
        "cozya.recipe_created",
      );
      return ok({ id: result.value.id } as const);
    } catch (error) {
      logger.error(
        { userId, error: error instanceof Error ? error.message : String(error) },
        "cozya.recipe_create.failed",
      );
      return err({ code: "CREATE_FAILED" } as const);
    }
  });
