import "server-only";
import { createAccountService } from "@informach/account";
import { inspectAccountDeparture } from "@informach/account/departure";
import { beginDepartureReview, readDepartureReview } from "@informach/account/departure-reviews";
import { accountExportJson } from "@informach/account/privacy";
import { db } from "@informach/db";
import { getEnv } from "./env";
import { compassoProducts } from "./products";

export function inspectDeparture(input: Omit<Parameters<typeof inspectAccountDeparture>[0], "db">) {
  return inspectAccountDeparture({ ...input, db });
}

export function requestAppDepartureReview(actorId: string, refresh: boolean) {
  return beginDepartureReview(db, actorId, refresh);
}

export function readAppDepartureReview(actorId: string, reviewId: string) {
  return readDepartureReview(db, actorId, reviewId);
}

export function createAccountExport(
  input: Omit<Parameters<typeof accountExportJson>[0], "db">,
  onComplete?: () => Promise<void>,
) {
  return accountExportJson({ ...input, db }, onComplete);
}
export const {
  requestFamilyPersonTransfer,
  resolveFamilyPersonTransfer,
  accountOverview,
  createAccountFamily,
  addFamilyPerson,
  beginTrial,
  updateFamilyPerson,
  classifyFamilyPerson,
  archiveFamilyPerson,
  restoreFamilyPerson,
  associateFamilyProfile,
  inviteFamilyMember,
  acceptFamilyInvitation,
  revokeFamilyInvitation,
  revokeFamilyMember,
  transferFamilyAdministration,
  grantFamilyAccess,
  revokeFamilyAccess,
} = createAccountService({
  db,
  products: compassoProducts(getEnv()),
});
