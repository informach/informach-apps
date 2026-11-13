import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import {
  agendaActivities,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  emailDeliveries,
} from "@informach/db/schema";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { findActivityHistory } from "@/features/activities/history-repository";
import { countPendingActivities } from "@/features/activities/pending-limit";
import { listPendingSharedActivitiesForUser } from "@/features/activities/repository";
import { respondSharedActivity } from "@/features/activities/service";
import { noticeCostQuote } from "@/features/ai/costs";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { nextSchoolDayIso } from "@/features/dashboard/day-labels";
import { hasSecondAdultInFamily } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { getKidModeSnapshot } from "@/features/kid-mode/service";
import { validateNoticeExtraction } from "@/features/notices/extraction";
import {
  finishNoticeParse,
  persistNoticeExtraction,
  reserveNoticeParse,
} from "@/features/notices/parse-repository";
import {
  getNoticeActionHistory,
  getNoticeSource,
  listNoticeActions,
  listNoticeOriginals,
  listReadyNotices,
} from "@/features/notices/repository";
import {
  confirmNoticeSchema,
  type NoticeActionInput,
  parseNoticeSchema,
} from "@/features/notices/schemas";
import {
  confirmNotice as confirmNoticeService,
  setNoticeActionStatus,
  updateNoticeAction,
} from "@/features/notices/service";
import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { createProfileSubjectActivity } from "@/features/profile-subject-activities/service";
import { createStudentProfile } from "@/features/students/service";
import { removeGroupAdult } from "@/features/turmas/group-access";
import { createOrJoinTurma, joinTurmaByCode, setActiveTurma } from "@/features/turmas/service";
import type { ActivityOverviewOptions } from "@/features/unified-activities/overview-types";
import { getActivityOverview, getRoutineSnapshot } from "@/features/unified-activities/service";
import {
  findTaskForUser,
  listTasksInDateRange,
} from "@/features/unified-activities/task-repository";
import { emails } from "@/lib/emails";
import { agendaFixture, family, schoolFixture } from "./compasso-fixture";

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
let owner: string,
  guest: string,
  outsider: string,
  child: string,
  sibling: string,
  otherChild: string,
  school: string,
  group: string,
  subject: string;
let siblingPerson: string;
let ownerActor: AgendaAuthority, guestActor: AgendaAuthority, outsiderActor: AgendaAuthority;
function confirmNotice(actor: AgendaAuthority, input: z.input<typeof confirmNoticeSchema>) {
  return confirmNoticeService(
    actor,
    confirmNoticeSchema.parse({
      sourceReviewed: true,
      shareOriginal: !!input.sourceProfileIds,
      ...input,
      sourceProfileIds: input.sourceProfileIds ?? [
        ...new Set(input.actions.map((a) => a.profileId)),
      ],
    }),
  );
}
const date = todayLocalIso();
const action = (title = "Providência de revisão", profileId = child): NoticeActionInput => ({
  profileId,
  type: "authorization",
  subjectId: null,
  profileSubjectId: null,
  title,
  description: null,
  dueAt: "2030-09-14",
  dateOrigin: "family",
  time: null,
  estimatedMinutes: null,
  location: null,
  sourceExcerpt: null,
  assignedToUserId: null,
  reminderAt: null,
  recurrence: "none",
  shareWithTurma: false,
});
const extraction = {
  actions: [
    {
      type: "material" as const,
      title: "Material A",
      description: null,
      dueAt: null,
      dateOrigin: "unspecified" as const,
      time: null,
      estimatedMinutes: null,
      location: null,
      sourceExcerpt: "Levar material",
    },
  ],
  warnings: [],
};
beforeEach(async () => {
  const f = await agendaFixture(true),
    other = await agendaFixture(true);
  owner = f.owner;
  guest = f.visitor.userId;
  outsider = other.owner;
  ownerActor = f.actor;
  guestActor = f.visitor;
  outsiderActor = other.actor;
  child = f.profile.id;
  otherChild = other.profile.id;
  await family.revokeMember(outsider, other.actor.familyGroupId, other.visitor.userId);
  for (const action of ["read", "write", "use_ai"] as const)
    await family.grantAccess(owner, {
      groupId: f.actor.familyGroupId,
      personId: f.target.personId,
      app: "agenda-da-turma",
      userId: guest,
      action,
    });
  const person = await family.createPerson(owner, {
    groupId: f.actor.familyGroupId,
    kind: "dependent",
    displayName: "Criança B restrita revisão",
  });
  siblingPerson = person.id;
  sibling = value(
    await createStudentProfile(ownerActor, { personId: person.id, birthDate: null }),
  ).id;
  school = await schoolFixture();
  const classroom = value(
    await createOrJoinTurma(ownerActor, {
      profileId: child,
      schoolInepCode: school,
      grade: "4ano",
      year: 2026,
      classLetter: "A",
      shift: "morning",
    }),
  );
  group = classroom.turma.id;
  if (!classroom.turma.code) throw new Error("Missing class code");
  const [s] = await db
    .insert(agendaSubjects)
    .values({ turmaId: group, name: "Matéria fictícia", createdByUserId: owner })
    .returning();
  subject = required(s).id;
  value(
    await joinTurmaByCode(outsiderActor, { profileId: otherChild, code: classroom.turma.code }),
  );
  await db.update(agendaNotificationPreferences).set({ emailEnabled: false, pushEnabled: false });
  emails.clearOutbox();
});
afterEach(() => emails.clearOutbox());
async function notice(text: string, profileId = child) {
  const [n] = await db
    .insert(agendaNotices)
    .values({
      familyGroupId: ownerActor.familyGroupId,
      captureProfileId: profileId,
      createdByUserId: owner,
      source: "teams",
      text,
      contentHash: randomUUID(),
      status: "ready",
      parsedResult: extraction,
    })
    .returning();
  return required(n);
}
type Task = typeof agendaTasks.$inferSelect;

/**
 * Uma atividade escolar pelo caminho que a família usa: o formulário único.
 *
 * Antes havia um segundo serviço só para escola, e estes testes entravam por
 * ele — provavam o que ninguém mais usava. Agora entram pelo mesmo
 * `confirmNotice` de qualquer atividade, com a matéria da turma e a caixa de
 * compartilhar.
 */
async function schoolActivity(
  share = true,
  description: string | null = "Conteúdo público",
  title = "Tarefa escolar de revisão",
  type: NoticeActionInput["type"] = "task",
): Promise<Task> {
  const created = value(
    await confirmNotice(ownerActor, {
      noticeId: null,
      allowDuplicates: true,
      actions: [
        {
          ...action(title),
          type,
          subjectId: subject,
          description,
          dueAt: date,
          dateOrigin: "school",
          shareWithTurma: share,
        },
      ],
    }),
  );
  return await reload(required(created.ids[0]));
}
async function reload(id: string): Promise<Task> {
  const [row] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, id));
  return required(row);
}
/** A tarefa de volta ao formato do formulário, para editá-la. */
function taskAction(task: Task, patch: Partial<NoticeActionInput> = {}): NoticeActionInput {
  return {
    profileId: task.profileId,
    type: task.type,
    title: task.title,
    description: task.description,
    subjectId: task.subjectId,
    profileSubjectId: task.profileSubjectId,
    dueAt: task.dueAt,
    dateOrigin: task.dateOrigin,
    time: task.time,
    // Lê o que está gravado, como o formulário de edição. Enquanto os dois
    // fixavam `null`, o teste reproduzia o bug em vez de pegá-lo.
    estimatedMinutes: task.estimatedMinutes,
    location: task.location,
    sourceExcerpt: task.sourceExcerpt,
    assignedToUserId: task.assignedToUserId,
    reminderAt: task.reminderAt?.toISOString() ?? null,
    recurrence: task.recurrence,
    shareWithTurma: task.sharedActivityId !== null,
    ...patch,
  };
}
function sharedId(task: Task): string {
  if (!task.sharedActivityId) throw new Error("Task is not published to a turma");
  return task.sharedActivityId;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture row");
  return value;
}

describe("Review regressions", () => {
  it("unifies school, notebook and extra activities with global pagination and shared-child access", async () => {
    const schoolRecord = await schoolActivity(false);
    const [extra] = await db
      .insert(agendaProfileSubjects)
      .values({ profileId: child, name: "Piano" })
      .returning();
    const extraRecord = value(
      await createProfileSubjectActivity(ownerActor, {
        profileSubjectId: required(extra).id,
        type: "project",
        title: "Preparar apresentação de piano",
        dueAt: date,
      }),
    );
    const original = await notice("Anotações sintéticas da agenda");
    await db
      .update(agendaNotices)
      .set({ source: "notebook" })
      .where(eq(agendaNotices.id, original.id));
    value(
      await confirmNotice(ownerActor, {
        noticeId: original.id,
        actions: Array.from({ length: 30 }, (_, i) => ({
          ...action(`Anotação ${i}`),
          type: "exam" as const,
          dueAt: null,
          dateOrigin: "unspecified" as const,
        })),
        allowDuplicates: true,
        sourceProfileIds: [child, sibling],
      }),
    );
    value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [action("Somente a irmã", sibling)],
        allowDuplicates: false,
      }),
    );
    const options: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: null,
      statusFilter: "pending",
      dueWindow: "all",
      assignedToMe: false,
      noticeId: null,
      page: 1,
    };
    const first = await getActivityOverview(ownerActor, options);
    const second = await getActivityOverview(ownerActor, { ...options, page: 2 });
    expect(first.items).toHaveLength(30);
    expect(first.hasNextPage).toBe(true);
    expect(second.items).toHaveLength(2);
    expect(second.hasNextPage).toBe(false);
    const combined = [...first.items, ...second.items];
    expect(new Set(combined.map((item) => item.key)).size).toBe(32);
    expect(combined.some((item) => item.item.id === schoolRecord.id)).toBe(true);
    expect(combined.some((item) => item.item.id === extraRecord.id)).toBe(true);
    expect(
      first.items.every(
        (item) => item.item.dueAt === null && item.item.noticeSource === "notebook",
      ),
    ).toBe(true);
    const projects = await getActivityOverview(ownerActor, { ...options, typeFilter: "project" });
    expect(projects.items.map((item) => item.item.id)).toEqual([extraRecord.id]);
    expect(projects.hasNextPage).toBe(false);
    const exams = await getActivityOverview(guestActor, { ...options, typeFilter: "exam" });
    expect(exams.items).toHaveLength(30);
    expect(exams.hasNextPage).toBe(false);
    expect(
      (await getActivityOverview(guestActor, { ...options, profileFilter: sibling })).items,
    ).toHaveLength(0);
    expect((await getActivityOverview(outsiderActor, options)).items).toHaveLength(0);
    // The action is accessible to the invited adult, but the original mentions a restricted sibling.
    expect(await getNoticeSource(guestActor, original.id)).toBeNull();
    expect(await listNoticeOriginals(guestActor, { page: 1 })).toHaveLength(0);
    expect(
      (await listNoticeOriginals(ownerActor, { page: 1, profileId: sibling })).map((row) => row.id),
    ).toContain(original.id);
    const firstNotice = first.items.find((item) => item.item.noticeId !== null);
    if (!firstNotice) throw new Error("Missing notice activity");
    value(
      await setNoticeActionStatus(guestActor, {
        id: firstNotice.item.id,
        version: 1,
        status: "done",
      }),
    );
    const completed = await getActivityOverview(ownerActor, {
      ...options,
      statusFilter: "done",
      noticeId: original.id,
    });
    expect(completed.items.map((item) => item.key)).toEqual([firstNotice.key]);
    expect((await listNoticeActions(ownerActor, { noticeId: original.id })).length).toBe(29);
    expect(
      (await getActivityOverview(ownerActor, { ...options, noticeId: original.id })).items,
    ).toHaveLength(29);
    expect(
      (await getActivityOverview(ownerActor, { ...options, typeFilter: "material" })).items,
    ).toHaveLength(0);
  });

  it("editar uma atividade não apaga a duração que a família escolheu", async () => {
    /*
     * A duração é o único campo novo que a interface mostra, e o caminho de
     * gravação é um spread cego (`.set({ ...input.action })`): basta um `null`
     * no valor inicial do formulário para o banco receber `null`. A família
     * abre a atividade para corrigir o título, salva, e o chip some do card sem
     * nenhum aviso — junto com a soma do bucket.
     */
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [{ ...action("Trabalho de Ciências"), estimatedMinutes: 30 }],
      }),
    );
    const id = required(created.ids[0]);
    expect((await reload(id)).estimatedMinutes).toBe(30);

    // Edição que não menciona a duração: ela precisa sobreviver.
    const before = await reload(id);
    value(
      await updateNoticeAction(ownerActor, {
        id,
        version: before.version,
        action: taskAction(before, { title: "Trabalho de Ciências (corrigido)" }),
      }),
    );
    const after = await reload(id);
    expect(after.title).toBe("Trabalho de Ciências (corrigido)");
    expect(after.estimatedMinutes).toBe(30);

    // E limpar continua sendo possível quando é a intenção.
    value(
      await updateNoticeAction(ownerActor, {
        id,
        version: after.version,
        action: taskAction(after, { estimatedMinutes: null }),
      }),
    );
    expect((await reload(id)).estimatedMinutes).toBeNull();
  });

  it("matéria extracurricular pausada some dos números E da lista, juntas", async () => {
    /*
     * "Pausada é silêncio" valia só na exportação em PDF e no card de progresso.
     * A projeção unificada — KPIs, buckets e `/atividades` — não aplicava, e
     * depois que os contadores viraram link isso ficou na cara: o card dizia
     * "Atrasadas 1" com o progresso ao lado dizendo 0 para a mesma criança.
     */
    const [extra] = await db
      .insert(agendaProfileSubjects)
      .values({ profileId: child, name: "Natação do review" })
      .returning();
    const extraId = required(extra).id;
    const [task] = await db
      .insert(agendaTasks)
      .values({
        profileId: child,
        createdByUserId: owner,
        type: "task",
        profileSubjectId: extraId,
        title: "Treino de natação",
        dueAt: todayLocalIso(),
        dateOrigin: "family",
        fingerprint: `e2e-extra-${extraId}`,
      })
      .returning();
    const taskId = required(task).id;

    const options: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: null,
      statusFilter: "pending",
      dueWindow: "all",
      assignedToMe: false,
      noticeId: null,
      page: 1,
    };
    const listed = async () =>
      (await getActivityOverview(ownerActor, options)).items.map((entry) => entry.item.id);
    // Hoje não tem mais os números do topo: o que conta é a linha em "Para hoje".
    const routineToday = async () =>
      (await getRoutineSnapshot(ownerActor, { profileFilter: child })).buckets.attention.map(
        (entry) => entry.item.id,
      );

    const calendarIds = async () =>
      (
        await listTasksInDateRange(ownerActor, {
          fromIso: addDaysIso(todayLocalIso(), -1),
          toIso: addDaysIso(todayLocalIso(), 1),
          profileFilter: child,
        })
      ).map((row) => row.id);
    const digestIds = async () => (await listNoticeActions(ownerActor)).map((row) => row.action.id);

    // Ativa: aparece em todas as superfícies e conta nos dois números.
    expect(await listed()).toContain(taskId);
    expect(await calendarIds()).toContain(taskId);
    expect(await digestIds()).toContain(taskId);
    expect(await routineToday()).toContain(taskId);
    const pendingWithActive = await countPendingActivities(db, ownerActor);

    await db
      .update(agendaProfileSubjects)
      .set({ status: "paused", pausedAt: todayLocalIso() })
      .where(eq(agendaProfileSubjects.id, extraId));

    // Pausada: some dos dois ao mesmo tempo — é essa simultaneidade que importa.
    expect(await listed()).not.toContain(taskId);
    expect(await routineToday()).not.toContain(taskId);

    // O LIMITE do plano gratuito conta o mesmo que a tela mostra. Sem isto a
    // família lê 15 pendências e é recusada ao cadastrar a 16ª, sem causa visível.
    expect(await countPendingActivities(db, ownerActor)).toBe(pendingWithActive - 1);

    // E as outras superfícies que falam da mesma tarefa — aplicar em algumas e
    // não em outras é pior do que não aplicar.
    expect(await calendarIds()).not.toContain(taskId);
    expect(await digestIds()).not.toContain(taskId);

    // E volta inteira ao despausar, nas cinco.
    await db
      .update(agendaProfileSubjects)
      .set({ status: "active", pausedAt: null })
      .where(eq(agendaProfileSubjects.id, extraId));
    expect(await listed()).toContain(taskId);
    expect(await routineToday()).toContain(taskId);
    expect(await countPendingActivities(db, ownerActor)).toBe(pendingWithActive);
    expect(await calendarIds()).toContain(taskId);
    expect(await digestIds()).toContain(taskId);
  });

  it("o filtro do segundo adulto só mostra o que foi combinado com ele", async () => {
    /*
     * Os outros testes exercitam apenas o lado `assignedToMe: false`, que é o
     * curto-circuito do predicado. Este cobre o ramo que o botão "Só o que é
     * meu" liga, e prende a regra de produto: atividade SEM responsável não
     * entra. O filtro responde "o que combinamos comigo", não "o que sobrou".
     */
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          { ...action("Combinada com o titular"), assignedToUserId: owner },
          { ...action("Combinada com o segundo adulto"), assignedToUserId: guest },
          { ...action("Sem responsável definido"), assignedToUserId: null },
        ],
      }),
    );
    const ids = created.ids.map((id) => required(id));
    const mine = required(ids[0]);
    const theirs = required(ids[1]);
    const nobodys = required(ids[2]);

    const base: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: null,
      statusFilter: "pending",
      dueWindow: "all",
      assignedToMe: false,
      noticeId: null,
      page: 1,
    };
    const idsFor = async (actor: AgendaAuthority, assignedToMe: boolean) =>
      (await getActivityOverview(actor, { ...base, assignedToMe })).items.map(
        (entry) => entry.item.id,
      );

    // Sem o filtro, as três aparecem para os dois adultos.
    expect(await idsFor(ownerActor, false)).toEqual(
      expect.arrayContaining([mine, theirs, nobodys]),
    );
    expect(await idsFor(guestActor, false)).toEqual(
      expect.arrayContaining([mine, theirs, nobodys]),
    );

    // Com o filtro, cada um vê só o seu — e a sem responsável some dos dois.
    const ownerMine = await idsFor(ownerActor, true);
    expect(ownerMine).toContain(mine);
    expect(ownerMine).not.toContain(theirs);
    expect(ownerMine).not.toContain(nobodys);

    const guestMine = await idsFor(guestActor, true);
    expect(guestMine).toContain(theirs);
    expect(guestMine).not.toContain(mine);
    expect(guestMine).not.toContain(nobodys);
  });

  it("reconhece o segundo adulto por um EXISTS, dos dois lados do convite", async () => {
    // O botão "Só o que é meu" e o parse de `?responsavel=eu` dependem disto: se
    // der falso, o filtro deixa de existir E deixa de ser aplicado.
    expect(await hasSecondAdultInFamily(ownerActor)).toBe(true);
    expect(await hasSecondAdultInFamily(guestActor)).toBe(true);
    // Quem está sozinho na própria conta não vê o controle.
    expect(await hasSecondAdultInFamily(outsiderActor)).toBe(false);
  });

  it("modo criança autoriza por criança e reusa a lista da rotina", async () => {
    /*
     * A página `/crianca/[perfilId]` tem UM ponto de autorização:
     * `getKidModeSnapshot`. Se ele devolver dados de uma criança à qual quem
     * pede não tem acesso, a tela entrega a rotina alheia inteira — e a
     * página não tem nenhuma outra checagem para segurar isso.
     */
    const task = await schoolActivity(false, null, "Tarefa do modo criança");
    // Uma para a próxima aula e outra para depois dela, ainda na semana: a
    // primeira entra na vez da criança, a segunda fica para adiantar.
    const nextClassIso = nextSchoolDayIso(todayLocalIso());
    const dated = (title: string, dueAt: string) =>
      confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [{ ...action(title), dueAt, dateOrigin: "school" }],
      });
    value(await dated("Para a próxima aula", nextClassIso));
    value(await dated("Para adiantar", addDaysIso(nextClassIso, 1)));

    // O titular entra.
    const asOwner = await getKidModeSnapshot(ownerActor, child);
    expect(asOwner).not.toBeNull();
    expect(asOwner?.profile.id).toBe(child);
    expect(asOwner?.todo.some((entry) => entry.item.id === task.id)).toBe(true);
    expect(asOwner?.todo.some((entry) => entry.item.title === "Para a próxima aula")).toBe(true);
    expect(asOwner?.ahead.map((entry) => entry.item.title)).toContain("Para adiantar");

    // O segundo adulto entra SOMENTE na criança que o convite nomeou.
    expect(await getKidModeSnapshot(guestActor, child)).not.toBeNull();
    expect(await getKidModeSnapshot(guestActor, sibling)).toBeNull();

    // Quem não é da família não entra, e o titular não entra na criança de
    // outra família. Os dois casos devolvem `null` — a página responde 404 sem
    // dizer se a criança existe.
    expect(await getKidModeSnapshot(outsiderActor, child)).toBeNull();
    expect(await getKidModeSnapshot(ownerActor, otherChild)).toBeNull();
    expect(await getKidModeSnapshot(ownerActor, randomUUID())).toBeNull();

    // Uma lista só: o que a criança vê é um pedaço da rotina do responsável,
    // pela mesma projeção: o "Para hoje" e o que vence até a próxima aula, e o
    // resto da semana para adiantar. Se alguém criar uma consulta própria para
    // o modo criança, pai e filha passam a discordar sobre o que falta, e este
    // teste é o que avisa.
    const routine = await getRoutineSnapshot(ownerActor, { profileFilter: child });
    const nextClass = nextSchoolDayIso(routine.todayIso);
    const later = [...routine.buckets.tomorrow, ...routine.buckets.week];
    expect(asOwner?.todo.map((entry) => entry.key)).toEqual([
      ...routine.buckets.attention.map((entry) => entry.key),
      ...later.filter((entry) => (entry.item.dueAt ?? "") <= nextClass).map((entry) => entry.key),
    ]);
    const weekEnd = addDaysIso(routine.todayIso, 6);
    expect(asOwner?.ahead.map((entry) => entry.key)).toEqual(
      later
        .filter((entry) => (entry.item.dueAt ?? "") > nextClass)
        .filter((entry) => (entry.item.dueAt ?? "") <= weekEnd)
        .map((entry) => entry.key),
    );
    expect(asOwner?.nextSchoolDayIso).toBe(nextClass);
  });

  it("recorta a lista pela mesma janela que produziu cada contador da rotina", async () => {
    // O ramo SQL da janela nunca era exercido: os outros testes passam
    // `dueWindow: "all"`, que é exatamente o curto-circuito. Sem isto, trocar o
    // BETWEEN de `getRoutineCounters` deixaria o teste unitário verde enquanto
    // o contador passaria a abrir uma lista que discorda dele.
    const today = todayLocalIso();
    const base = (title: string, dueAt: string | null) => ({
      ...action(title),
      subjectId: subject,
      dueAt,
      dateOrigin: dueAt ? ("school" as const) : ("unspecified" as const),
    });
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          base("Venceu ontem", addDaysIso(today, -1)),
          base("É para hoje", today),
          base("É para amanhã", addDaysIso(today, 1)),
          base("Daqui a duas semanas", addDaysIso(today, 14)),
          base("Sem prazo ainda", null),
        ],
      }),
    );
    const ids = created.ids.map((id) => required(id));
    const overdue = required(ids[0]);
    const todayTask = required(ids[1]);
    const tomorrow = required(ids[2]);
    const faraway = required(ids[3]);
    const undated = required(ids[4]);

    const options: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: null,
      statusFilter: "pending",
      dueWindow: "all",
      assignedToMe: false,
      noticeId: null,
      page: 1,
    };
    const idsFor = async (patch: Partial<ActivityOverviewOptions>) =>
      (await getActivityOverview(ownerActor, { ...options, ...patch })).items
        .map((entry) => entry.item.id)
        .sort();

    expect(await idsFor({ dueWindow: "atrasadas" })).toEqual([overdue].sort());
    expect(await idsFor({ dueWindow: "hoje" })).toEqual([todayTask].sort());
    // Sete dias a partir de amanhã: o de 14 dias fica fora.
    expect(await idsFor({ dueWindow: "semana" })).toEqual([tomorrow].sort());

    // Sem prazo entra em "todos" e sai de qualquer recorte — não há como dizer
    // se um prazo a confirmar cai dentro ou fora da janela.
    expect(await idsFor({ dueWindow: "all" })).toContain(undated);
    for (const window of ["atrasadas", "hoje", "semana", "recentes"] as const) {
      expect(await idsFor({ dueWindow: window })).not.toContain(undated);
    }
    expect(await idsFor({ dueWindow: "all" })).toContain(faraway);

    // "Concluídas nos últimos 7 dias" mede a CONCLUSÃO, não o prazo: a tarefa
    // que venceu ontem e foi cuidada hoje precisa aparecer.
    const before = await reload(overdue);
    value(
      await setNoticeActionStatus(ownerActor, {
        id: overdue,
        version: before.version,
        status: "done",
      }),
    );
    expect(await idsFor({ dueWindow: "recentes", statusFilter: "done" })).toEqual([overdue].sort());
    // E some de "atrasadas", que continua sendo sobre o que está pendente.
    expect(await idsFor({ dueWindow: "atrasadas" })).toEqual([]);
  });

  it("filters activity types before pagination without expanding child access", async () => {
    const exams: string[] = [];
    for (const [index, type] of (["task", "exam", "project", "exam"] as const).entries()) {
      const task = await schoolActivity(false, null, `Atividade ${type} ${index}`, type);
      if (type === "exam") exams.push(task.id);
    }
    const options: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: "exam",
      statusFilter: "pending",
      dueWindow: "all",
      assignedToMe: false,
      noticeId: null,
      page: 1,
    };
    const filtered = await getActivityOverview(ownerActor, options);
    expect(filtered.items.map((item) => item.item.id).sort()).toEqual(exams.sort());
    expect((await getActivityOverview(outsiderActor, options)).items).toEqual([]);
    expect(
      (await getActivityOverview(ownerActor, { ...options, profileFilter: sibling })).items,
    ).toEqual([]);
    const allTypes = await getActivityOverview(ownerActor, { ...options, typeFilter: null });
    expect(allTypes.items).toHaveLength(4);
  });

  it("F01 edits the current version twice and rejects an actually stale edit", async () => {
    const a = await schoolActivity();
    value(
      await updateNoticeAction(ownerActor, {
        id: a.id,
        version: a.version,
        action: taskAction(a, { description: "Primeira edição" }),
      }),
    );
    const listed = await getActivityOverview(ownerActor, {
      profileFilter: null,
      typeFilter: null,
      statusFilter: "pending",
      dueWindow: "all",
      assignedToMe: false,
      noticeId: null,
      page: 1,
    });
    const first = await reload(a.id);
    expect(listed.items.find((item) => item.item.id === a.id)?.item.version).toBe(first.version);
    value(
      await updateNoticeAction(ownerActor, {
        id: a.id,
        version: first.version,
        action: taskAction(first, { description: "Segunda edição" }),
      }),
    );
    expect((await reload(a.id)).version).toBe(3);
    // A correção alcança a turma: o fato publicado subiu junto.
    const [published] = await db
      .select()
      .from(agendaActivities)
      .where(eq(agendaActivities.id, sharedId(a)));
    expect(published).toMatchObject({ description: "Segunda edição", version: 3 });
    expect(
      await updateNoticeAction(ownerActor, {
        id: a.id,
        version: 1,
        action: taskAction(a, { description: "Edição antiga" }),
      }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  });
  it("F02 keeps private snapshots with the owning family and only publishes public snapshots", async () => {
    const a = await schoolActivity(false, "SEGREDO FICTÍCIO PRIVADO");
    value(
      await updateNoticeAction(ownerActor, {
        id: a.id,
        version: a.version,
        action: taskAction(a, { description: "SEGREDO PRIVADO 2" }),
      }),
    );
    const privateEdit = await reload(a.id);
    value(
      await updateNoticeAction(ownerActor, {
        id: a.id,
        version: privateEdit.version,
        action: taskAction(privateEdit, {
          description: "Somente conteúdo público",
          shareWithTurma: true,
        }),
      }),
    );
    const published = await reload(a.id);
    value(
      await respondSharedActivity(outsiderActor, {
        activityId: sharedId(published),
        accepted: true,
      }),
    );
    value(
      await updateNoticeAction(ownerActor, {
        id: a.id,
        version: published.version,
        action: taskAction(published, { description: "Correção pública" }),
      }),
    );
    // O que a turma lê nasce na publicação: os rascunhos privados nunca
    // chegaram a `agenda.activities`, então não há o que filtrar depois.
    const history = await findActivityHistory(outsiderActor, sharedId(published));
    expect(history?.history).toHaveLength(1);
    expect(JSON.stringify(history)).not.toContain("SEGREDO");
    expect(JSON.stringify(history)).toContain("Somente conteúdo público");
    expect(JSON.stringify(history)).toContain("Correção pública");
    // O histórico privado continua com a família, na tarefa.
    expect(JSON.stringify(await getNoticeActionHistory(ownerActor, a.id))).toContain(
      "SEGREDO FICTÍCIO PRIVADO",
    );
    expect(JSON.stringify(await getNoticeActionHistory(guestActor, a.id))).toContain(
      "SEGREDO FICTÍCIO PRIVADO",
    );
    expect(await getNoticeActionHistory(outsiderActor, a.id)).toEqual([]);
  });
  it("F03 preserves recipient completion after accept, reject and creator deletion", async () => {
    const a = await schoolActivity();
    value(await respondSharedActivity(outsiderActor, { activityId: sharedId(a), accepted: true }));
    await db
      .update(agendaTasks)
      .set({ status: "done" })
      .where(eq(agendaTasks.profileId, otherChild));
    value(await respondSharedActivity(outsiderActor, { activityId: sharedId(a), accepted: false }));
    value(
      await setNoticeActionStatus(ownerActor, { id: a.id, version: a.version, status: "canceled" }),
    );
    const statuses = await db
      .select()
      .from(agendaTasks)
      .where(eq(agendaTasks.profileId, otherChild));
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe("done");
    expect(
      (await findActivityHistory(outsiderActor, sharedId(a)))?.activity.canceledAt,
    ).toBeInstanceOf(Date);
  });
  it("publica e despublica pela mesma caixa, e recusa retirar da turma o que já foi recebido", async () => {
    // Criada só para a família: nada foi publicado.
    const own = await schoolActivity(false);
    expect(own.sharedActivityId).toBeNull();

    // A mesma caixa publica depois, e a turma passa a ver.
    value(
      await updateNoticeAction(ownerActor, {
        id: own.id,
        version: own.version,
        action: taskAction(own, { shareWithTurma: true }),
      }),
    );
    const published = await reload(own.id);
    expect(
      (await listPendingSharedActivitiesForUser(outsiderActor)).map((row) => row.activityId),
    ).toContain(sharedId(published));

    // Enquanto ninguém recebeu, retirar da turma é reversível.
    value(
      await updateNoticeAction(ownerActor, {
        id: own.id,
        version: published.version,
        action: taskAction(published, { shareWithTurma: false }),
      }),
    );
    const unpublished = await reload(own.id);
    expect(unpublished.sharedActivityId).toBeNull();
    expect(
      await db
        .select()
        .from(agendaActivities)
        .where(eq(agendaActivities.id, sharedId(published))),
    ).toEqual([]);

    // Depois que outra família recebe, some da vista dela seria pior do que
    // cancelar: a retirada é recusada com o motivo.
    value(
      await updateNoticeAction(ownerActor, {
        id: own.id,
        version: unpublished.version,
        action: taskAction(unpublished, { shareWithTurma: true }),
      }),
    );
    const republished = await reload(own.id);
    value(
      await respondSharedActivity(outsiderActor, {
        activityId: sharedId(republished),
        accepted: true,
      }),
    );
    expect(
      await updateNoticeAction(ownerActor, {
        id: own.id,
        version: republished.version,
        action: taskAction(republished, { shareWithTurma: false }),
      }),
    ).toMatchObject({ ok: false, error: { code: "SHARE_ALREADY_ACCEPTED" } });

    // E quem recebeu não pode retirar da turma o que não publicou.
    const [received] = await db
      .select()
      .from(agendaTasks)
      .where(
        and(
          eq(agendaTasks.sharedActivityId, sharedId(republished)),
          eq(agendaTasks.profileId, otherChild),
        ),
      );
    const mine = required(received);
    expect(
      await updateNoticeAction(outsiderActor, {
        id: mine.id,
        version: mine.version,
        action: taskAction(mine, { shareWithTurma: false }),
      }),
    ).toMatchObject({ ok: false, error: { code: "SHARE_NOT_YOURS" } });
  });
  it("leva a retificação que veio no recado até a turma, como a edição manual leva", async () => {
    const published = await schoolActivity(true, null, "Prova de ciências");
    value(
      await respondSharedActivity(outsiderActor, {
        activityId: sharedId(published),
        accepted: true,
      }),
    );

    // O recado diz que a escola adiou. A família escolhe "esta corrige a
    // anterior" em vez de criar outra.
    const corrected = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          {
            ...action("Prova de ciências"),
            type: "task",
            subjectId: subject,
            dueAt: "2030-10-01",
            dateOrigin: "school",
            shareWithTurma: true,
          },
        ],
        resolutions: [
          { index: 0, kind: "replace", actionId: published.id, version: published.version },
        ],
      }),
    );
    expect(corrected.ids).toEqual([published.id]);

    // A turma recebe a data nova — sem isto, as outras famílias continuariam
    // cobrando a prova no dia velho e ninguém saberia.
    const [fact] = await db
      .select()
      .from(agendaActivities)
      .where(eq(agendaActivities.id, sharedId(published)));
    expect(fact).toMatchObject({ dueAt: "2030-10-01", version: 2 });
    const [received] = await db
      .select()
      .from(agendaTasks)
      .where(
        and(
          eq(agendaTasks.sharedActivityId, sharedId(published)),
          eq(agendaTasks.profileId, otherChild),
        ),
      );
    expect(received).toMatchObject({ dueAt: "2030-10-01" });
  });
  it("não reabre o que foi cancelado, porque a turma não seria avisada de volta", async () => {
    const published = await schoolActivity(true, null, "Prova cancelada");
    value(
      await respondSharedActivity(outsiderActor, {
        activityId: sharedId(published),
        accepted: true,
      }),
    );
    value(
      await setNoticeActionStatus(ownerActor, {
        id: published.id,
        version: published.version,
        status: "canceled",
      }),
    );
    const canceled = await reload(published.id);
    expect(
      await setNoticeActionStatus(ownerActor, {
        id: published.id,
        version: canceled.version,
        status: "pending",
      }),
    ).toMatchObject({ ok: false, error: { code: "ALREADY_CANCELED" } });
  });
  it("aceitar duas vezes não duplica a tarefa da família que recebeu", async () => {
    const published = await schoolActivity();
    for (const _ of [1, 2])
      value(
        await respondSharedActivity(outsiderActor, {
          activityId: sharedId(published),
          accepted: true,
        }),
      );
    const received = await db
      .select()
      .from(agendaTasks)
      .where(
        and(
          eq(agendaTasks.sharedActivityId, sharedId(published)),
          eq(agendaTasks.profileId, otherChild),
        ),
      );
    expect(received).toHaveLength(1);
  });
  it("diz de quem é a família da tarefa, e não quem a digitou", async () => {
    // O detalhe decide por aqui se lembrete e repetição aparecem. Usar quem
    // criou faria a família gratuita que RECEBE de uma Pro ver recursos que a
    // gravação depois recusa — e o segundo adulto de uma família Pro ser
    // tratado como gratuito.
    const published = await schoolActivity(true, null, "Prova de história");
    value(
      await respondSharedActivity(outsiderActor, {
        activityId: sharedId(published),
        accepted: true,
      }),
    );
    const [received] = await db
      .select()
      .from(agendaTasks)
      .where(
        and(
          eq(agendaTasks.sharedActivityId, sharedId(published)),
          eq(agendaTasks.profileId, otherChild),
        ),
      );
    const task = await findTaskForUser(outsiderActor, required(received).id);
    expect(task?.createdByUserId).toBe(owner);
    expect(task?.familyGroupId).toBe(outsiderActor.familyGroupId);
  });
  it("F04 denies unreviewed mixed originals and includes children without extracted actions in scope", async () => {
    const n = await notice("Material da criança A. INFORMAÇÃO RESTRITA DA CRIANÇA B.");
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("RESTRICTED INFORMATION ABOUT CHILD B");
    const original = Buffer.from(await pdf.save()).toString("base64");
    await db
      .update(agendaNotices)
      .set({
        attachmentData: original,
        attachmentName: "mixed-children.pdf",
        attachmentType: "application/pdf",
        attachmentExpiresAt: new Date(Date.now() + 86400000),
      })
      .where(eq(agendaNotices.id, n.id));
    // `ready` por último: a confirmação logo abaixo depende dele.
    for (const status of ["processing", "discarded", "ready"] as const) {
      await db.update(agendaNotices).set({ status }).where(eq(agendaNotices.id, n.id));
      expect(await getNoticeSource(guestActor, n.id)).toBeNull();
      expect((await listReadyNotices(guestActor)).map((n) => n.id)).not.toContain(n.id);
      expect((await getNoticeSource(ownerActor, n.id))?.attachmentData).toBe(original);
    }
    value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action("Material A", child)],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    );
    expect(await getNoticeSource(guestActor, n.id)).toBeNull();
    expect(await listNoticeActions(guestActor)).toHaveLength(1);
  });
  it("F04 shares a reviewed single-child original and keeps its unknown scope private by default", async () => {
    const n = await notice("Material A");
    value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action()],
        allowDuplicates: false,
      }),
    );
    expect(await getNoticeSource(guestActor, n.id)).toBeNull();
    value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child],
        allowDuplicates: false,
      }),
    );
    expect((await getNoticeSource(guestActor, n.id))?.text).toBe("Material A");
    expect(await getNoticeSource(outsiderActor, n.id)).toBeNull();
  });
  it("F04 keeps an uploader's draft private and denies narrowing after a child's grant is revoked", async () => {
    const n = await notice("A e B");
    await db
      .update(agendaNotices)
      .set({ createdByUserId: guest })
      .where(eq(agendaNotices.id, n.id));
    expect((await getNoticeSource(guestActor, n.id))?.id).toBe(n.id);
    expect(await getNoticeSource(ownerActor, n.id)).toBeNull();
    expect(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const target = {
      groupId: ownerActor.familyGroupId,
      personId: siblingPerson,
      app: "agenda-da-turma",
      userId: guest,
    };
    for (const action of ["read", "write"] as const)
      await family.grantAccess(owner, { ...target, action });
    value(
      await confirmNotice(guestActor, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    );
    await family.revokeAccess(owner, { ...target, action: "read" });
    expect(
      await confirmNotice(guestActor, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await getNoticeSource(ownerActor, n.id))?.sourceProfileIds).toEqual([child, sibling]);
  });
  it("F05 reuses one extraction for another child without duplicating either application", async () => {
    const n = await notice("Levar autorização");
    value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child],
        allowDuplicates: false,
      }),
    );
    const initiallyConfirmedAt = (await getNoticeSource(ownerActor, n.id))?.confirmedAt;
    expect(initiallyConfirmedAt).toBeInstanceOf(Date);
    const input = parseNoticeSchema.parse({
      profileId: sibling,
      source: "teams",
      text: n.text,
      acceptedCost: noticeCostQuote({ text: n.text }),
    });
    const replay = value(
      await reserveNoticeParse({
        actor: ownerActor,
        input,
        attachment: null,
        contentHash: n.contentHash,
        now: new Date(),
      }),
    );
    expect(replay.replay).toBe(true);
    expect(replay.notice.id).toBe(n.id);
    const result = value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action("Providência de revisão", sibling)],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    );
    expect(result.alreadyConfirmed).toBe(false);
    expect(await listNoticeActions(ownerActor, { profileId: sibling })).toHaveLength(1);
    for (const profileId of [child, sibling]) {
      expect(
        value(
          await confirmNotice(ownerActor, {
            noticeId: n.id,
            actions: [action("Providência de revisão", profileId)],
            allowDuplicates: false,
          }),
        ).alreadyConfirmed,
      ).toBe(true);
    }
    expect(await listNoticeActions(ownerActor)).toHaveLength(2);
    expect((await getNoticeSource(ownerActor, n.id))?.confirmedAt).toEqual(initiallyConfirmedAt);
    expect(await getNoticeSource(guestActor, n.id)).toBeNull();
  });
  it("F06 requires a correction decision and updates one stable action with history and a new reminder", async () => {
    const n = await notice("Autorização até 14/09/2030");
    const first = value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [{ ...action(), reminderAt: "2030-09-13T15:00:00Z" }],
        allowDuplicates: false,
      }),
    );
    const id = required(first.ids[0]);
    await db.insert(agendaNotificationDeliveries).values({
      userId: owner,
      messageKey: `action:${id}:v1`,
      channel: "email",
      status: "pending",
    });
    const corrected = await notice("RETIFICAÇÃO: autorização passa de 14/09/2030 para 16/09/2030");
    const input = {
      noticeId: corrected.id,
      actions: [{ ...action(), dueAt: "2030-09-16", reminderAt: "2030-09-15T15:00:00Z" }],
      allowDuplicates: false,
    };
    expect(await confirmNotice(ownerActor, input)).toMatchObject({
      ok: false,
      error: { code: "POSSIBLE_CORRECTIONS" },
    });
    expect(await listNoticeActions(ownerActor)).toHaveLength(1);
    const saved = value(
      await confirmNotice(ownerActor, {
        ...input,
        resolutions: [{ index: 0, kind: "replace", actionId: id, version: 1 }],
      }),
    );
    expect(saved.ids).toEqual([id]);
    const rows = await listNoticeActions(ownerActor);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toMatchObject({ id, dueAt: "2030-09-16", version: 2 });
    expect(rows[0]?.action.reminderAt?.toISOString()).toBe("2030-09-15T15:00:00.000Z");
    const history = await getNoticeActionHistory(ownerActor, id);
    expect(history[0]?.previous.dueAt).toBe("2030-09-14");
    expect(history[0]?.current.dueAt).toBe("2030-09-16");
    const deliveries = await db
      .select()
      .from(agendaNotificationDeliveries)
      .where(eq(agendaNotificationDeliveries.userId, owner));
    expect(deliveries[0]?.status).toBe("canceled");
    value(
      await confirmNotice(ownerActor, {
        noticeId: n.id,
        actions: [action()],
        allowDuplicates: false,
      }),
    );
    expect((await listNoticeActions(ownerActor)).map((r) => r.action.dueAt)).toEqual([
      "2030-09-16",
    ]);
  });
  it("F06 preserves completed status and rejects a stale replacement version", async () => {
    const first = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [action()],
        allowDuplicates: false,
      }),
    );
    const id = required(first.ids[0]);
    value(await setNoticeActionStatus(ownerActor, { id, version: 1, status: "done" }));
    const n = await notice("RETIFICAÇÃO: prazo novo");
    const input = {
      noticeId: n.id,
      actions: [{ ...action(), dueAt: "2030-09-16" }],
      allowDuplicates: false,
    };
    expect(
      await confirmNotice(ownerActor, {
        ...input,
        resolutions: [{ index: 0, kind: "replace", actionId: id, version: 1 }],
      }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    value(
      await confirmNotice(ownerActor, {
        ...input,
        resolutions: [{ index: 0, kind: "replace", actionId: id, version: 2 }],
      }),
    );
    expect(await listNoticeActions(ownerActor)).toHaveLength(0);
    expect(
      (await listNoticeActions(ownerActor, { includeFinished: true }))[0]?.action,
    ).toMatchObject({
      id,
      status: "done",
      version: 3,
      dueAt: "2030-09-16",
    });
  });
  it("F06 allows an explicit decision to keep genuinely separate obligations", async () => {
    value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [action()],
        allowDuplicates: false,
      }),
    );
    const n = await notice("Outro pedido para uma nova data");
    const input = {
      noticeId: n.id,
      actions: [{ ...action(), dueAt: "2030-09-16" }],
      allowDuplicates: false,
    };
    expect(await confirmNotice(ownerActor, input)).toMatchObject({
      ok: false,
      error: { code: "POSSIBLE_CORRECTIONS" },
    });
    value(
      await confirmNotice(ownerActor, { ...input, resolutions: [{ index: 0, kind: "separate" }] }),
    );
    expect((await listNoticeActions(ownerActor)).map((r) => r.action.dueAt).sort()).toEqual([
      "2030-09-14",
      "2030-09-16",
    ]);
  });
  it.each(["failed", "sent", "delivered"] as const)(
    "F07 defers interrupted/unknown mail without exhausting retries, then reconciles %s",
    async (resolvedStatus) => {
      const now = new Date("2030-09-13T15:00:00Z");
      const a = value(
        await confirmNotice(ownerActor, {
          noticeId: null,
          actions: [
            { ...action(), reminderAt: new Date(now.valueOf() - 20 * 60000).toISOString() },
          ],
          allowDuplicates: false,
        }),
      );
      await db.insert(agendaNotificationPreferences).values({
        userId: owner,
        familyGroupId: ownerActor.familyGroupId,
        emailEnabled: true,
        digestHour: 19,
        quietStart: 21,
        quietEnd: 7,
      });
      const key = `${ownerActor.familyGroupId}:action:${a.ids[0]}:v1`;
      const interruptedAttempt = resolvedStatus === "failed" ? 3 : 1;
      await db.insert(agendaNotificationDeliveries).values({
        userId: owner,
        familyGroupId: ownerActor.familyGroupId,
        messageKey: key,
        channel: "email",
        status: "processing",
        attempts: interruptedAttempt,
        lastAttemptAt: new Date(Date.now() - 11 * 60000),
      });
      await db.insert(emailDeliveries).values({
        id: randomUUID(),
        recipient: `${owner}@example.test`,
        category: "agenda.routine",
        messageKey: `agenda:${owner}:${key}`,
        subject: "Synthetic review reminder",
        userId: owner,
        status: "sending",
        sendingStartedAt: new Date(),
        sendAttempts: 1,
      });
      const options = { limit: 1 };
      await deliverRoutineNotifications(now, options);
      await db
        .update(emailDeliveries)
        .set({ status: "unknown" })
        .where(eq(emailDeliveries.userId, owner));
      for (let attempt = 1; attempt <= 5; attempt++) {
        // Retry leases use operational time, independently of the school date.
        await db
          .update(agendaNotificationDeliveries)
          .set({ lastAttemptAt: new Date(Date.now() - 11 * 60000) })
          .where(eq(agendaNotificationDeliveries.userId, owner));
        await deliverRoutineNotifications(new Date(now.valueOf() + attempt * 11 * 60000), options);
      }
      const waiting = await db
        .select()
        .from(agendaNotificationDeliveries)
        .where(eq(agendaNotificationDeliveries.userId, owner));
      expect(waiting[0]?.status).toBe("failed");
      expect(waiting[0]?.attempts).toBe(interruptedAttempt - 1);
      expect(emails.getOutbox()).toHaveLength(0);
      await db
        .update(emailDeliveries)
        .set({ status: resolvedStatus })
        .where(eq(emailDeliveries.userId, owner));
      await db
        .update(agendaNotificationDeliveries)
        .set({ lastAttemptAt: new Date(Date.now() - 11 * 60000) })
        .where(eq(agendaNotificationDeliveries.userId, owner));
      await deliverRoutineNotifications(new Date(now.valueOf() + 70 * 60000), options);
      expect(emails.getOutbox()).toHaveLength(resolvedStatus === "failed" ? 1 : 0);
      const finished = await db
        .select()
        .from(agendaNotificationDeliveries)
        .where(eq(agendaNotificationDeliveries.userId, owner));
      expect(finished[0]?.status).toBe("sent");
      await deliverRoutineNotifications(new Date(now.valueOf() + 85 * 60000), options);
      expect(emails.getOutbox()).toHaveLength(resolvedStatus === "failed" ? 1 : 0);
    },
  );
  it("F08 ignores late completion and output from the replaced attempt", async () => {
    const input = parseNoticeSchema.parse({
      profileId: child,
      source: "teams",
      text: "Levar material",
      acceptedCost: noticeCostQuote({ text: "Levar material" }),
    });
    const hash = randomUUID();
    const reserve = (now: Date) =>
      reserveNoticeParse({
        actor: ownerActor,
        input,
        attachment: null,
        contentHash: hash,
        now,
      });
    const first = value(await reserve(new Date(Date.now() - 11 * 60000))).notice;
    const second = value(await reserve(new Date())).notice;
    const firstRun = required(first.billingRunId ?? undefined),
      secondRun = required(second.billingRunId ?? undefined);
    expect(secondRun).not.toBe(firstRun);
    expect(await finishNoticeParse(first.id, firstRun, "failed", "PARSE_FAILED")).toBe(false);
    await expect(
      persistNoticeExtraction(ownerActor, first.id, firstRun, extraction),
    ).rejects.toThrow();
    let [row] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, second.id));
    expect(row?.billingRunId).toBe(secondRun);
    expect(row?.status).toBe("processing");
    await persistNoticeExtraction(ownerActor, second.id, secondRun, extraction);
    expect(await finishNoticeParse(second.id, secondRun, "ready")).toBe(true);
    expect(await finishNoticeParse(first.id, firstRun, "ready")).toBe(false);
    [row] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, second.id));
    expect(row?.status).toBe("ready");
    expect(row?.parsedResult).toMatchObject(extraction);
  });
  it("F09 refuses stale activation after membership was removed during a transaction", async () => {
    const a = await schoolActivity();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready = () => {};
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const removal = db.transaction(async (tx) => {
      await tx
        .delete(agendaTurmaMembers)
        .where(eq(agendaTurmaMembers.studentProfileId, otherChild));
      await tx
        .update(agendaStudentProfiles)
        .set({ activeTurmaId: null })
        .where(eq(agendaStudentProfiles.id, otherChild));
      ready();
      await gate;
    });
    await locked;
    const reactivate = setActiveTurma(outsiderActor, { profileId: otherChild, turmaId: group });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      release();
    }
    await removal;
    expect(await reactivate).toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });
    expect(
      (await listPendingSharedActivitiesForUser(outsiderActor)).map((x) => x.activityId),
    ).not.toContain(sharedId(a));
  });
  it("F09 revocation and activation share the same lock and stale preferences grant no read/write access", async () => {
    const a = await schoolActivity();
    await Promise.all([
      removeGroupAdult(owner, group, outsider),
      setActiveTurma(outsiderActor, { profileId: otherChild, turmaId: group }),
    ]);
    const [profile] = await db
      .select()
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.id, otherChild));
    expect(profile?.activeTurmaId).toBeNull();
    // A historical inconsistent preference must not act as authority either.
    await db
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: group })
      .where(eq(agendaStudentProfiles.id, otherChild));
    expect(
      (await listPendingSharedActivitiesForUser(outsiderActor)).map((x) => x.activityId),
    ).not.toContain(sharedId(a));
    // Preferência velha não vale como autorização: a matéria é da turma de que
    // a criança não participa mais.
    expect(
      (
        await confirmNotice(outsiderActor, {
          noticeId: null,
          allowDuplicates: true,
          actions: [
            {
              ...action("Sem acesso", otherChild),
              subjectId: subject,
              dueAt: date,
              dateOrigin: "school",
            },
          ],
        })
      ).ok,
    ).toBe(false);
    expect(
      (await respondSharedActivity(outsiderActor, { activityId: sharedId(a), accepted: true })).ok,
    ).toBe(false);
  });
  it("F10 accepts a relative date grounded in an explicit publication reference in the original", () => {
    const parsed = validateNoticeExtraction(
      {
        actions: [
          {
            ...extraction.actions[0],
            dueAt: "2030-09-14",
            dateOrigin: "relative",
            sourceExcerpt: "Levar material amanhã.",
          },
        ],
        publicationReference: { date: "2030-09-13", sourceExcerpt: "Publicado em 13/09/2030." },
        warnings: [],
      },
      null,
    );
    expect(parsed.actions[0]?.dueAt).toBe("2030-09-14");
    expect(parsed.actions[0]?.dateOrigin).toBe("relative");
  });
});
