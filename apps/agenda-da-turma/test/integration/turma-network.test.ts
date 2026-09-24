import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaCities,
  agendaSchools,
  agendaStates,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptAllSharedActivities,
  getPendingSharedActivitiesForUser,
} from "@/features/activities/service";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { listTurmasNeedingScheduleForUser } from "@/features/onboarding/first-steps-repository";
import { findTurmaForInvite, joinTurmaByCode } from "@/features/turmas/service";

let publisher: string;
let receiver: string;
let outsider: string;
let publisherChild: string;
let receiverChild: string;
let unlinkedChild: string;
let school: string;
let turmaId: string;
let turmaCode: string;
let subjectId: string;

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture");
  return value;
}

async function publishActivity(title: string, dueAt: string) {
  const [activity] = await db
    .insert(agendaActivities)
    .values({
      turmaId,
      subjectId,
      createdByUserId: publisher,
      type: "task",
      visibility: "shared_with_turma",
      title,
      dueAt,
    })
    .returning();
  return required(activity);
}

beforeEach(async () => {
  publisher = `turma-pub-${randomUUID()}`;
  receiver = `turma-rec-${randomUUID()}`;
  outsider = `turma-out-${randomUUID()}`;
  school = `turma-net-${randomUUID()}`.slice(0, 20);
  await db.insert(users).values(
    [publisher, receiver, outsider].map((id) => ({
      id,
      name: "Adulto fictício",
      email: `${id}@e2e.local`,
      emailVerified: true,
    })),
  );
  await db.insert(agendaStates).values({ uf: school, ibgeCode: school, name: "Estado fictício" });
  await db
    .insert(agendaCities)
    .values({ ibgeCode: school, stateUf: school, name: "Cidade fictícia" });
  await db
    .insert(agendaSchools)
    .values({ inepCode: school, cityIbgeCode: school, name: "Escola fictícia" });
  turmaCode = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  const [turma] = await db
    .insert(agendaTurmas)
    .values({
      schoolInepCode: school,
      createdByUserId: publisher,
      code: turmaCode,
      grade: "6ano",
      year: 2026,
      classLetter: "A",
      shift: "morning",
    })
    .returning();
  turmaId = required(turma).id;
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId, createdByUserId: publisher, name: "Ciências" })
    .returning();
  subjectId = required(subject).id;
  const [a] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: publisher, name: "Criança que publica", activeTurmaId: turmaId })
    .returning();
  publisherChild = required(a).id;
  const [b] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: receiver, name: "Criança que recebe", activeTurmaId: turmaId })
    .returning();
  receiverChild = required(b).id;
  const [c] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: outsider, name: "Criança sem turma" })
    .returning();
  unlinkedChild = required(c).id;
  await db.insert(agendaTurmaMembers).values([
    { turmaId, studentProfileId: publisherChild },
    { turmaId, studentProfileId: receiverChild },
  ]);
});
afterEach(async () => {
  await db.delete(agendaTurmas).where(eq(agendaTurmas.schoolInepCode, school));
  await db.delete(agendaSchools).where(eq(agendaSchools.inepCode, school));
  await db.delete(agendaCities).where(eq(agendaCities.ibgeCode, school));
  await db.delete(agendaStates).where(eq(agendaStates.uf, school));
  await db.delete(users).where(inArray(users.id, [publisher, receiver, outsider]));
});

describe("a turma as a network", () => {
  it("accepts every pending shared activity at once, and stays idempotent", async () => {
    const soon = addDaysIso(todayLocalIso(), 3);
    await publishActivity("Ciências: capítulos 10, 11 e 12", soon);
    await publishActivity("Ciências: capítulos 13, 14 e 15", addDaysIso(soon, 7));
    expect(await getPendingSharedActivitiesForUser(receiver)).toHaveLength(2);

    expect(await acceptAllSharedActivities(receiver)).toEqual({
      accepted: 2,
      skipped: 0,
      remaining: 0,
    });
    expect(await getPendingSharedActivitiesForUser(receiver)).toHaveLength(0);
    const tasks = await db
      .select()
      .from(agendaTasks)
      .where(eq(agendaTasks.profileId, receiverChild));
    expect(tasks).toHaveLength(2);

    // Repetir não duplica tarefa nem aceitação: já não há nada pendente.
    expect(await acceptAllSharedActivities(receiver)).toEqual({
      accepted: 0,
      skipped: 0,
      remaining: 0,
    });
    expect(
      await db.select().from(agendaTasks).where(eq(agendaTasks.profileId, receiverChild)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(agendaActivityAcceptances)
        .where(eq(agendaActivityAcceptances.userId, receiver)),
    ).toHaveLength(2);
  });
  it("asks for a schedule from whoever joined the turma, not only from who created it", async () => {
    // A matéria existe, mas sem dias de aula: não sugere prazo nem monta a
    // mochila. O passo tem de continuar aberto — e para quem ENTROU na turma
    // também, que é quem a consulta antiga nunca enxergava.
    expect(await listTurmasNeedingScheduleForUser(receiver)).toEqual([{ turmaId }]);
    expect(await listTurmasNeedingScheduleForUser(publisher)).toEqual([{ turmaId }]);
    // Qualquer membro pode cadastrar matéria, então o passo é acionável nos dois.
    await db
      .update(agendaSubjects)
      .set({ classDays: ["mon", "wed"] })
      .where(eq(agendaSubjects.id, subjectId));
    expect(await listTurmasNeedingScheduleForUser(receiver)).toEqual([]);
    expect(await listTurmasNeedingScheduleForUser(publisher)).toEqual([]);
    // Quem não tem turma não recebe passo de horário de turma nenhuma.
    expect(await listTurmasNeedingScheduleForUser(outsider)).toEqual([]);
  });
  it("never hands another turma's activities to an outsider", async () => {
    await publishActivity("Ciências: capítulos 10, 11 e 12", addDaysIso(todayLocalIso(), 3));
    expect(await getPendingSharedActivitiesForUser(outsider)).toHaveLength(0);
    expect(await acceptAllSharedActivities(outsider)).toEqual({
      accepted: 0,
      skipped: 0,
      remaining: 0,
    });
    expect(
      await db.select().from(agendaTasks).where(eq(agendaTasks.profileId, unlinkedChild)),
    ).toHaveLength(0);
  });
  it("resolves an invite code into the turma, and joining by link links the child", async () => {
    const invite = await findTurmaForInvite(turmaCode);
    expect(invite).toMatchObject({ id: turmaId, schoolName: "Escola fictícia", grade: "6ano" });
    expect(await findTurmaForInvite("NAOEXISTE123")).toBeNull();

    const joined = await joinTurmaByCode(outsider, { code: turmaCode, profileId: unlinkedChild });
    expect(joined.ok).toBe(true);
    const [profile] = await db
      .select({ activeTurmaId: agendaStudentProfiles.activeTurmaId })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.id, unlinkedChild));
    expect(profile?.activeTurmaId).toBe(turmaId);
    // E agora a turma alcança essa família.
    await publishActivity("Ciências: capítulos 13, 14 e 15", addDaysIso(todayLocalIso(), 5));
    expect(await getPendingSharedActivitiesForUser(outsider)).toHaveLength(1);
  });
});
