import "server-only";
import { createActionFactory } from "@informach/auth/server-actions";
import { getAuth } from "./auth";
import { logger } from "./logger";
export function getActions() {
  return createActionFactory({
    helpers: getAuth(),
    onError: ({ actorId }) => logger.error({ actorId }, "action.unexpected_failure"),
  }).action;
}
