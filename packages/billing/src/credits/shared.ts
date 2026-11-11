import { getAppCollection } from "@informach/config/collections";
import { assertPersonAccess } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import { assertCompassoFundingClear } from "../collection-jobs";
import { BillingError } from "../errors";
import type { ReservationsDeps } from "./reservations";

/** One family wallet, with authority resolved from the authenticated adult and actual app. */
export const authorizeCompassoSpend: NonNullable<ReservationsDeps["authorizeSpend"]> = async (
  tx,
  input,
) => {
  if (
    input.owner.type !== "family" ||
    !input.actorUserId ||
    getAppCollection(input.app) !== "compasso"
  )
    throw new BillingError("Invalid Compasso wallet context");
  await lockFamilyMembership(tx, input.actorUserId, input.owner.id);
  if (input.personId) {
    await assertPersonAccess(tx, input.actorUserId, {
      groupId: input.owner.id,
      personId: input.personId,
      app: input.app,
      action: "use_ai",
    });
  } else if (input.app !== "cozya") {
    throw new BillingError("A family application requires an explicitly authorized person");
  }
  await assertCompassoFundingClear(tx, input.owner.id);
};
