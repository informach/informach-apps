import "server-only";
import { WebParticipationError } from "@informach/auth/web-participation";
import { cozyaProductEvents } from "@informach/db/schema";
import { withActiveCozyaUser } from "@/features/account/participation-repository";
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
  | "cooking_feedback"
  | "today_viewed"
  | "list_shared"
  | "offer_seen";

/** Fixed event vocabulary, opaque identifiers only; never ingredient, prompt or profile content. */
export async function recordProductEvent(userId: string, name: ProductEvent, entityKey: string) {
  try {
    await withActiveCozyaUser(userId, (tx) =>
      tx
        .insert(cozyaProductEvents)
        .values({ userId, name, dedupKey: `${userId}:${name}:${entityKey}` })
        .onConflictDoNothing(),
    );
  } catch (error) {
    // Activity arriving after web participation ended is intentionally discarded.
    if (error instanceof WebParticipationError) return;
    // The product mutation has already succeeded. Telemetry failure must not prompt a duplicate save.
    logger.error(
      { event: name, error: error instanceof Error ? error.name : "UnknownError" },
      "cozya.product_event_failed",
    );
  }
}
