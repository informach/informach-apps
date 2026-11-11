import "server-only";
import { createNativeTrainer, familyService } from "./repository";

/** Identity custody and native creation are atomic; no name-based matching is performed. */
export async function activateTrainer(actorId: string, groupId: string, personId: string) {
  const result = await familyService.activateProfile(
    actorId,
    {
      groupId,
      personId,
      app: "bora-treinar",
    },
    (tx, activationId) => createNativeTrainer(tx, actorId, activationId, groupId),
  );
  return result.value;
}

/** Activation metadata is visible to the identity manager even without domain read access. */
export async function listAvailablePeople(actorId: string, groupId: string) {
  const people = (await familyService.listPeople(actorId, groupId)).filter(
    (person) => person.canManageIdentity,
  );
  const candidates = await Promise.all(
    people.map(async (person) => ({
      person,
      activation: await familyService.findPersonProfile(actorId, {
        groupId,
        personId: person.id,
        app: "bora-treinar",
      }),
    })),
  );
  return candidates.filter(({ activation }) => !activation).map(({ person }) => person);
}
