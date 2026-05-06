"use server";

import { action, err, ok } from "@/lib/action";
import { logger } from "@/lib/logger";
import {
  deleteRecipeInputSchema,
  recipeInputSchema,
  toggleFavoriteInputSchema,
  updateRecipeInputSchema,
} from "./schemas";
import { createRecipe, deleteRecipe, toggleRecipeFavorite, updateRecipe } from "./service";

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

export const updateRecipeAction = action
  .input(updateRecipeInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "recipes-update", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const { id, ...recipeInput } = input;

    try {
      const result = await updateRecipe(userId, id, recipeInput);
      if (!result.ok) {
        return err(result.error);
      }

      logger.info(
        { userId, recipeId: result.value.id, isFavorite: result.value.isFavorite },
        "cozya.recipe_updated",
      );
      return ok({ id: result.value.id } as const);
    } catch (error) {
      logger.error(
        { userId, recipeId: id, error: error instanceof Error ? error.message : String(error) },
        "cozya.recipe_update.failed",
      );
      return err({ code: "UPDATE_FAILED" } as const);
    }
  });

export const deleteRecipeAction = action
  .input(deleteRecipeInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "recipes-delete", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    try {
      const result = await deleteRecipe(userId, input.id);
      if (!result.ok) {
        return err(result.error);
      }

      logger.info({ userId, recipeId: input.id }, "cozya.recipe_deleted");
      return ok({ id: input.id } as const);
    } catch (error) {
      logger.error(
        {
          userId,
          recipeId: input.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "cozya.recipe_delete.failed",
      );
      return err({ code: "DELETE_FAILED" } as const);
    }
  });

export const toggleRecipeFavoriteAction = action
  .input(toggleFavoriteInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "recipes-favorite", max: 120, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    try {
      const result = await toggleRecipeFavorite(userId, input.id, input.isFavorite);
      if (!result.ok) {
        return err(result.error);
      }

      logger.info(
        { userId, recipeId: result.value.id, isFavorite: result.value.isFavorite },
        "cozya.recipe_favorited",
      );
      return ok({ id: result.value.id, isFavorite: result.value.isFavorite } as const);
    } catch (error) {
      logger.error(
        {
          userId,
          recipeId: input.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "cozya.recipe_favorite.failed",
      );
      return err({ code: "FAVORITE_FAILED" } as const);
    }
  });
