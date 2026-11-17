import { db } from "@informach/db";
import { createFamilyService } from "@informach/family";
import type { ParentAuthority } from "@/features/family/authority";
import { createProfile } from "@/features/learning/service";

export { fixtureAuthority, seedStudent, seedStudents } from "./canonical-fixture";

const service = createFamilyService({ db });
/** Creates identity through the public family service, then calls the actual school activation. */
export async function prepareStudent(
  actor: ParentAuthority,
  input: { nickname: string; avatar?: string; [key: string]: unknown },
) {
  const { nickname, avatar, ...settings } = input;
  const person = await service.createPerson(actor.userId, {
    groupId: actor.familyGroupId,
    kind: "dependent",
    displayName: nickname,
    ...(avatar ? { avatar } : {}),
  });
  return createProfile(actor, { ...settings, personId: person.id });
}
