import "server-only";
import { db } from "@informach/db";
import { cozyaProductEvents } from "@informach/db/schema";
import { logger } from "@/lib/logger";

export type ProductEvent =
  | "trial_started"
  | "recipe_saved"
  | "plan_completed"
  | "plan_repeated"
  | "shopping_created"
  | "shopping_used"
  | "cooking_started"
  | "cooking_completed"
  | "offer_seen";

/** Fixed event vocabulary, opaque identifiers only; never ingredient, prompt or profile content. */
export async function recordProductEvent(userId: string, name: ProductEvent, entityKey: string) {
  try {
    await db
      .insert(cozyaProductEvents)
      .values({ userId, name, dedupKey: `${userId}:${name}:${entityKey}` })
      .onConflictDoNothing();
  } catch (error) {
    // The product mutation has already succeeded. Telemetry failure must not prompt a duplicate save.
    logger.error(
      { event: name, error: error instanceof Error ? error.name : "UnknownError" },
      "cozya.product_event_failed",
    );
  }
}
