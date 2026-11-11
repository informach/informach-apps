import { db } from "@informach/db";
import { familyMigrationSources, missaoProfiles } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import type { ParentAuthority } from "../src/features/family/authority";

const service = createFamilyService({ db });
const families = new Map<string, Promise<ParentAuthority>>();
/** Existing app test accounts model imported families, including explicit legacy billing provenance. */
export function fixtureAuthority(userId: string): Promise<ParentAuthority> {
  let pending = families.get(userId);
  if (!pending) {
    pending = (async () => {
      const group = await service.createGroup(userId, "Família de teste");
      await db
        .insert(familyMigrationSources)
        .values({ app: "missao-saber", sourceOwnerId: userId, groupId: group.id });
      return { kind: "parent" as const, userId, familyGroupId: group.id };
    })();
    families.set(userId, pending);
  }
  return pending;
}
/** Current-schema domain fixture. Identity and activation are created atomically before history. */
export async function seedStudent(
  input: Omit<typeof missaoProfiles.$inferInsert, "familyProfileId" | "userId"> & {
    userId: string;
    nickname: string;
    avatar?: string;
  },
) {
  const { userId, nickname, avatar = "cometa", ...school } = input;
  const actor = await fixtureAuthority(userId);
  const person = await service.createPerson(userId, {
    groupId: actor.familyGroupId,
    kind: "dependent",
    displayName: nickname,
    avatar,
  });
  const activation = await service.activateProfile(
    userId,
    { groupId: actor.familyGroupId, personId: person.id, app: "missao-saber" },
    async (tx, familyProfileId) => {
      const [row] = await tx
        .insert(missaoProfiles)
        .values({ ...school, userId, familyProfileId })
        .returning();
      if (!row) throw new Error("Missing school fixture");
      return { ...row, nickname, avatar };
    },
  );
  return activation.value;
}
export async function seedStudents(inputs: Parameters<typeof seedStudent>[0][]) {
  const rows = [];
  for (const input of inputs) rows.push(await seedStudent(input));
  return rows;
}
