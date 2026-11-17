import "server-only";
import type { ParentAuthority } from "./authority";
import { familyService } from "./context-repository";
export async function availableStudents(actor: ParentAuthority) {
  const people = (await familyService.listPeople(actor.userId, actor.familyGroupId)).filter(
    (person) => person.canManageIdentity,
  );
  const candidates = await Promise.all(
    people.map(async (person) => ({
      person,
      activation: await familyService.findPersonProfile(actor.userId, {
        groupId: actor.familyGroupId,
        personId: person.id,
        app: "missao-saber",
      }),
    })),
  );
  return candidates
    .filter(({ activation }) => !activation)
    .map(({ person }) => ({ id: person.id, name: person.displayName }));
}
