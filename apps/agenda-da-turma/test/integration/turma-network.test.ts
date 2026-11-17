import { db, eq } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
} from "@informach/db/schema";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptAllSharedActivities,
  getPendingSharedActivitiesForUser,
} from "@/features/activities/service";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import type { AgendaAuthority } from "@/features/family/authority";
import { listTurmasNeedingScheduleForUser } from "@/features/onboarding/first-steps-repository";
import { createOrJoinTurma, findTurmaForInvite, joinTurmaByCode } from "@/features/turmas/service";
import { agendaFixture, schoolFixture, value } from "./compasso-fixture";

let publisherActor: AgendaAuthority;
let receiverActor: AgendaAuthority;
let outsiderActor: AgendaAuthority;
let publisher: string;
let receiver: string;
let publisherChild: string;
let receiverChild: string;
let unlinkedChild: string;
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
      familyGroupId: publisherActor.familyGroupId,
      type: "task",
      visibility: "shared_with_turma",
      title,
      dueAt,
    })
    .returning();
  return required(activity);
}

beforeEach(async () => {
  const pub = await agendaFixture(true),
    rec = await agendaFixture(true),
    out = await agendaFixture(true);
  publisher = pub.owner;
  receiver = rec.owner;
  publisherActor = pub.actor;
  receiverActor = rec.actor;
  outsiderActor = out.actor;
  publisherChild = pub.profile.id;
  receiverChild = rec.profile.id;
  unlinkedChild = out.profile.id;
  const classroom = value(
    await createOrJoinTurma(publisherActor, {
      schoolInepCode: await schoolFixture(),
      grade: "6ano",
      year: 2026,
      classLetter: "A",
      profileId: publisherChild,
    }),
  );
  if (!classroom.turma.code) throw new Error("Missing class code");
  turmaId = classroom.turma.id;
  turmaCode = classroom.turma.code;
  value(await joinTurmaByCode(receiverActor, { code: turmaCode, profileId: receiverChild }));
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId, createdByUserId: publisher, name: "Ciências" })
    .returning();
  subjectId = required(subject).id;
});

describe("a turma as a network", () => {
  it("accepts every pending shared activity at once, and stays idempotent", async () => {
    const soon = addDaysIso(todayLocalIso(), 3);
    await publishActivity("Ciências: capítulos 10, 11 e 12", soon);
    await publishActivity("Ciências: capítulos 13, 14 e 15", addDaysIso(soon, 7));
    expect(await getPendingSharedActivitiesForUser(receiverActor)).toHaveLength(2);

    expect(await acceptAllSharedActivities(receiverActor)).toEqual({
      accepted: 2,
      skipped: 0,
      remaining: 0,
    });
    expect(await getPendingSharedActivitiesForUser(receiverActor)).toHaveLength(0);
    const tasks = await db
      .select()
      .from(agendaTasks)
      .where(eq(agendaTasks.profileId, receiverChild));
    expect(tasks).toHaveLength(2);

    // Repetir não duplica tarefa nem aceitação: já não há nada pendente.
    expect(await acceptAllSharedActivities(receiverActor)).toEqual({
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
    expect(await listTurmasNeedingScheduleForUser(receiverActor)).toEqual([{ turmaId }]);
    expect(await listTurmasNeedingScheduleForUser(publisherActor)).toEqual([{ turmaId }]);
    // Qualquer membro pode cadastrar matéria, então o passo é acionável nos dois.
    await db
      .update(agendaSubjects)
      .set({ classDays: ["mon", "wed"] })
      .where(eq(agendaSubjects.id, subjectId));
    expect(await listTurmasNeedingScheduleForUser(receiverActor)).toEqual([]);
    expect(await listTurmasNeedingScheduleForUser(publisherActor)).toEqual([]);
    // Quem não tem turma não recebe passo de horário de turma nenhuma.
    expect(await listTurmasNeedingScheduleForUser(outsiderActor)).toEqual([]);
  });
  it("never hands another turma's activities to an outsider", async () => {
    await publishActivity("Ciências: capítulos 10, 11 e 12", addDaysIso(todayLocalIso(), 3));
    expect(await getPendingSharedActivitiesForUser(outsiderActor)).toHaveLength(0);
    expect(await acceptAllSharedActivities(outsiderActor)).toEqual({
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
    expect(invite).toMatchObject({ id: turmaId, schoolName: "Synthetic", grade: "6ano" });
    expect(await findTurmaForInvite("NAOEXISTE123")).toBeNull();

    const joined = await joinTurmaByCode(outsiderActor, {
      code: turmaCode,
      profileId: unlinkedChild,
    });
    expect(joined.ok).toBe(true);
    const [profile] = await db
      .select({ activeTurmaId: agendaStudentProfiles.activeTurmaId })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.id, unlinkedChild));
    expect(profile?.activeTurmaId).toBe(turmaId);
    // E agora a turma alcança essa família.
    await publishActivity("Ciências: capítulos 13, 14 e 15", addDaysIso(todayLocalIso(), 5));
    expect(await getPendingSharedActivitiesForUser(outsiderActor)).toHaveLength(1);
  });
});
