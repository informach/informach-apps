import { assertPersonAccess, changeAccess } from "./access";
import {
  type AssociateProfileInput,
  associateProfile,
  type ClassifyPersonInput,
  classifyPerson,
} from "./association";
import {
  createGroup,
  listGroups,
  listGroupsPage,
  revokeMember,
  transferAdministration,
} from "./groups";
import { acceptInvitation, createInvitation, revokeInvitation } from "./invitations";
import { activateProfile, findPersonProfile, removeProfile } from "./links";
import { familyManagement } from "./management";
import {
  type RequestPersonTransferInput,
  requestPersonTransfer,
  resolvePersonTransfer,
} from "./management-transfer";
import { archivePerson, createPerson, listPeople, restorePerson, updatePerson } from "./people";
import type {
  CreatePersonInput,
  FamilyServiceConfig,
  FamilyTransaction,
  GrantAccessInput,
  PersonTarget,
  ProfileLinkInput,
  UpdatePersonInput,
} from "./types";

export type { AssociateProfileInput, ClassifyPersonInput } from "./association";
export * from "./errors";
export type * from "./types";

export function createFamilyService(deps: FamilyServiceConfig) {
  return {
    requestPersonTransfer: (actorId: string, input: RequestPersonTransferInput) =>
      requestPersonTransfer(deps, actorId, input),
    resolvePersonTransfer: (actorId: string, requestId: string, decision: "accept" | "revoke") =>
      resolvePersonTransfer(deps, actorId, requestId, decision),
    familyManagement: (actorId: string, groupId: string) =>
      familyManagement(deps, actorId, groupId),
    associateProfile: (actorId: string, input: AssociateProfileInput) =>
      associateProfile(deps, actorId, input),
    classifyPerson: (actorId: string, input: ClassifyPersonInput) =>
      classifyPerson(deps, actorId, input),
    createGroup: (actorId: string, name: string) => createGroup(deps, actorId, name),
    listGroups: (actorId: string) => listGroups(deps, actorId),
    listGroupsPage: (actorId: string, before?: string) => listGroupsPage(deps, actorId, before),
    transferAdministration: (actorId: string, groupId: string, userId: string) =>
      transferAdministration(deps, actorId, groupId, userId),
    revokeMember: (actorId: string, groupId: string, userId: string) =>
      revokeMember(deps, actorId, groupId, userId),
    createPerson: (actorId: string, input: CreatePersonInput) => createPerson(deps, actorId, input),
    listPeople: (actorId: string, groupId: string) => listPeople(deps, actorId, groupId),
    updatePerson: (actorId: string, input: UpdatePersonInput) => updatePerson(deps, actorId, input),
    archivePerson: (actorId: string, groupId: string, personId: string) =>
      archivePerson(deps, actorId, groupId, personId),
    restorePerson: (actorId: string, groupId: string, personId: string) =>
      restorePerson(deps, actorId, groupId, personId),
    assertPersonAccess: (actorId: string, target: PersonTarget) =>
      assertPersonAccess(deps.db, actorId, target, deps.now?.()),
    grantAccess: (actorId: string, input: GrantAccessInput) =>
      changeAccess(deps, actorId, input, true),
    revokeAccess: (actorId: string, input: GrantAccessInput) =>
      changeAccess(deps, actorId, input, false),
    createInvitation: (actorId: string, groupId: string, email: string) =>
      createInvitation(deps, actorId, groupId, email),
    acceptInvitation: (actorId: string, token: string) => acceptInvitation(deps, actorId, token),
    revokeInvitation: (actorId: string, groupId: string, invitationId: string) =>
      revokeInvitation(deps, actorId, groupId, invitationId),
    activateProfile: <T>(
      actorId: string,
      input: ProfileLinkInput,
      create: (tx: FamilyTransaction, profileId: string) => Promise<T>,
    ) => activateProfile(deps, actorId, input, create),
    findPersonProfile: (actorId: string, input: ProfileLinkInput) =>
      findPersonProfile(deps, actorId, input),
    removeProfile: (
      actorId: string,
      app: string,
      profileId: string,
      remove: (tx: FamilyTransaction, profileId: string) => Promise<unknown>,
    ) => removeProfile(deps, actorId, app, profileId, remove),
  };
}

export type FamilyService = ReturnType<typeof createFamilyService>;
