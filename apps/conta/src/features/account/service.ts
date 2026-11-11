import "server-only";
import { isRecentCentralAuthentication } from "@informach/auth/web-sessions";
import { getAuth } from "@/lib/auth";

export async function hasRecentFamilyAuthentication(actorId: string, requestHeaders: Headers) {
  const current = await getAuth().getSession(requestHeaders);
  return Boolean(
    current?.user.id === actorId &&
      (await isRecentCentralAuthentication(actorId, current.session.id, 900)),
  );
}

export {
  acceptFamilyInvitation,
  accountOverview,
  addFamilyPerson,
  archiveFamilyPerson,
  associateFamilyProfile,
  beginTrial,
  classifyFamilyPerson,
  createAccountFamily,
  grantFamilyAccess,
  inviteFamilyMember,
  requestFamilyPersonTransfer,
  resolveFamilyPersonTransfer,
  restoreFamilyPerson,
  revokeFamilyAccess,
  revokeFamilyInvitation,
  revokeFamilyMember,
  transferFamilyAdministration,
  updateFamilyPerson,
} from "@/lib/account";
