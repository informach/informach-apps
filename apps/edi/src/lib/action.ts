import "server-only";
import { createActionFactory } from "@informach/auth/server-actions";
import { getAuth } from "./auth";
import { reportOperationalError } from "./observability";
export function getActions() {
  return createActionFactory({
    helpers: getAuth(),
    onError: ({ error, actorId }) =>
      reportOperationalError("action.unexpected_failure", error, { actorId }),
  }).action;
}
