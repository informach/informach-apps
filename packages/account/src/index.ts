import { getCompassoAccess, startCompassoTrial } from "@informach/billing/compasso";
import { createCompassoWallet } from "@informach/billing/credits";
import type { Database } from "@informach/db";
import { createFamilyService, FamilyError } from "@informach/family";
import { z } from "zod";

export function createAccountService({
  db,
  products,
}: {
  db: Database;
  products: Parameters<typeof createCompassoWallet>[0]["products"];
}) {
  const family = createFamilyService({ db });
  const wallet = createCompassoWallet({ db, products });
  async function accountOverview(actorId: string, selectedGroup?: string) {
    const groups = await family.listGroups(actorId);
    if (selectedGroup) z.uuid().parse(selectedGroup);
    const group = selectedGroup
      ? groups.find((item) => item.id === selectedGroup)
      : groups.length === 1
        ? groups[0]
        : undefined;
    if (selectedGroup && !group)
      throw new FamilyError("ACCESS_DENIED", "Você não tem acesso a esta família.");
    if (!group)
      return { groups, group: null, people: [], management: null, access: null, balance: null };
    const [management, access, balance] = await Promise.all([
      family.familyManagement(actorId, group.id),
      getCompassoAccess(db, actorId, group.id),
      wallet.getBalance({ actorId, groupId: group.id }),
    ]);
    return { groups, group, people: management.people, management, access, balance };
  }
  function createAccountFamily(actorId: string, name: string) {
    return family.createGroup(actorId, name);
  }
  function addFamilyPerson(actorId: string, input: Parameters<typeof family.createPerson>[1]) {
    return family.createPerson(actorId, input);
  }
  function beginTrial(actorId: string, groupId: string, trialHashSecret: string) {
    return startCompassoTrial({ db, trialHashSecret }, actorId, groupId);
  }

  return {
    requestFamilyPersonTransfer: family.requestPersonTransfer,
    resolveFamilyPersonTransfer: family.resolvePersonTransfer,
    accountOverview,
    createAccountFamily,
    addFamilyPerson,
    beginTrial,
    updateFamilyPerson: family.updatePerson,
    classifyFamilyPerson: family.classifyPerson,
    archiveFamilyPerson: family.archivePerson,
    associateFamilyProfile: family.associateProfile,
    restoreFamilyPerson: family.restorePerson,
    inviteFamilyMember: family.createInvitation,
    acceptFamilyInvitation: family.acceptInvitation,
    revokeFamilyInvitation: family.revokeInvitation,
    revokeFamilyMember: family.revokeMember,
    transferFamilyAdministration: family.transferAdministration,
    grantFamilyAccess: family.grantAccess,
    revokeFamilyAccess: family.revokeAccess,
  };
}
