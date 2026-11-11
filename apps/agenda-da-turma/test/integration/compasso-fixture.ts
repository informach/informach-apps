import { randomUUID } from "node:crypto";
import { startCompassoTrial } from "@informach/billing/compasso";
import { db } from "@informach/db";
import { agendaCities, agendaSchools, agendaStates, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { createStudentProfile } from "@/features/students/service";
import { createOrJoinTurma } from "@/features/turmas/service";
export const family = createFamilyService({ db });
export function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
export async function agendaFixture(paid = false) {
  const owner = randomUUID(),
    guest = randomUUID();
  await db.insert(users).values(
    [owner, guest].map((id) => ({
      id,
      name: "Synthetic",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const group = await family.createGroup(owner, "Extra context");
  if (paid)
    await startCompassoTrial(
      { db, trialHashSecret: "agenda-test-trial-secret".repeat(3) },
      owner,
      group.id,
    );
  const actor = { userId: owner, familyGroupId: group.id };
  const visitor = { ...actor, userId: guest };
  const invitation = await family.createInvitation(owner, group.id, `${guest}@example.test`);
  await family.acceptInvitation(guest, invitation.token);
  const person = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Child",
  });
  const profile = value(
    await createStudentProfile(actor, { personId: person.id, birthDate: null }),
  );
  const target = { groupId: group.id, personId: person.id, app: "agenda-da-turma", userId: guest };
  return { owner, actor, visitor, target, profile };
}

export async function schoolFixture() {
  const id = randomUUID();
  await db
    .insert(agendaStates)
    .values({ uf: "ZZ", ibgeCode: "ZZ", name: "Synthetic" })
    .onConflictDoNothing();
  await db.insert(agendaCities).values({ ibgeCode: id, name: "Synthetic", stateUf: "ZZ" });
  await db.insert(agendaSchools).values({ inepCode: id, name: "Synthetic", cityIbgeCode: id });
  return id;
}
export async function classroomFixture(f: Awaited<ReturnType<typeof agendaFixture>>) {
  return value(
    await createOrJoinTurma(f.actor, {
      schoolInepCode: await schoolFixture(),
      grade: "4ano",
      year: 2026,
      classLetter: "A",
      profileId: f.profile.id,
    }),
  );
}
