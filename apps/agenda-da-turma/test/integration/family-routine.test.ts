import { randomUUID } from "node:crypto";
import { and, db, eq, inArray } from "@informach/db";
import {
  agendaActivities,
  agendaActivityRevisions,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaProfileSubjects,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
  collectionTrials,
  emailDeliveries,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { countPendingActivities } from "@/features/activities/pending-limit";
import { respondSharedActivity } from "@/features/activities/service";
import {
  createCalendarFeed,
  readCalendarFeed,
  revokeCalendarFeeds,
} from "@/features/calendar-feed/service";
import { todayLocalIso } from "@/features/dashboard/date";
import { listAccessibleProfiles } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { getNoticeAction, getNoticeSource, listNoticeActions } from "@/features/notices/repository";
import { confirmNoticeSchema, type NoticeActionInput } from "@/features/notices/schemas";
import { joinTurmaByCode } from "@/features/turmas/service";
import { agendaFixture, family, schoolFixture } from "./compasso-fixture";

const joinPrivateGroup = (actor: AgendaAuthority, profileId: string, code: string | null) => {
  if (!code) throw new Error("Missing class code");
  return joinTurmaByCode(actor, { profileId, code });
};

import {
  confirmNotice as confirmNoticeService,
  setNoticeActionStatus,
  shareSavedWithTurma,
  updateNoticeAction,
} from "@/features/notices/service";
import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/features/notifications/schemas";
import { saveNotificationPreferences } from "@/features/notifications/service";
import { createProfileSubjectActivity } from "@/features/profile-subject-activities/service";
import { createStudentProfile, listStudentProfilesForUser } from "@/features/students/service";
import { removeGroupAdult, rotateGroupCode } from "@/features/turmas/group-access";
import { createOrJoinTurma, listTurmasForCurrentUser } from "@/features/turmas/service";
import { listTasksInDateRange } from "@/features/unified-activities/task-repository";
import { emails } from "@/lib/emails";

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
let owner: string, guest: string, other: string, child: string, sibling: string, otherChild: string;
let school: string, group: string, subject: string;
let ownerActor: AgendaAuthority, guestActor: AgendaAuthority, otherActor: AgendaAuthority;
let childPerson: string;
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
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture row");
  return value;
}
const range = { fromIso: "2026-01-01", toIso: "2030-12-31", profileFilter: null };
type Task = typeof agendaTasks.$inferSelect;
/** Uma prova publicada na turma, pelo formulário único. */
async function sharedExam(title: string, dueAt = date): Promise<Task> {
  const created = value(
    await confirmNotice(ownerActor, {
      noticeId: null,
      allowDuplicates: true,
      actions: [
        {
          ...action(title),
          type: "exam",
          subjectId: subject,
          dueAt,
          dateOrigin: "school",
          shareWithTurma: true,
        },
      ],
    }),
  );
  const [row] = await db
    .select()
    .from(agendaTasks)
    .where(eq(agendaTasks.id, created.ids[0] ?? ""));
  if (!row?.sharedActivityId) throw new Error("Shared exam was not published");
  return row;
}
const action = (title = "Providência sintética", profileId = child): NoticeActionInput => ({
  profileId,
  type: "authorization",
  subjectId: null,
  profileSubjectId: null,
  title,
  description: null,
  dueAt: date,
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
async function invite() {
  const invitation = await family.createInvitation(
    owner,
    ownerActor.familyGroupId,
    `${guest}@example.test`,
  );
  return { invitation, token: invitation.token };
}
async function acceptFamilyInvitation(userId: string, token: string) {
  try {
    await family.acceptInvitation(userId, token);
    for (const action of ["read", "write", "use_ai"] as const)
      await family.grantAccess(owner, {
        groupId: ownerActor.familyGroupId,
        personId: childPerson,
        app: "agenda-da-turma",
        userId,
        action,
      });
    return { ok: true as const, value: { id: userId } };
  } catch (error) {
    return { ok: false as const, error };
  }
}
async function revokeFamilyAccess(userId: string, memberId: string) {
  await family.revokeMember(userId, ownerActor.familyGroupId, memberId);
  return { ok: true as const, value: true };
}
async function downgrade() {
  await db
    .update(collectionTrials)
    .set({
      startsAt: new Date(Date.now() - 15 * 86400000),
      endsAt: new Date(Date.now() - 86400000),
    })
    .where(eq(collectionTrials.groupId, ownerActor.familyGroupId));
}
beforeEach(async () => {
  const f = await agendaFixture(true),
    otherFamily = await agendaFixture(true);
  owner = f.owner;
  guest = f.visitor.userId;
  other = otherFamily.owner;
  ownerActor = f.actor;
  guestActor = f.visitor;
  otherActor = otherFamily.actor;
  child = f.profile.id;
  childPerson = f.target.personId;
  otherChild = otherFamily.profile.id;
  await family.revokeMember(owner, ownerActor.familyGroupId, guest);
  const second = await family.createPerson(owner, {
    groupId: ownerActor.familyGroupId,
    kind: "dependent",
    displayName: "Sibling",
  });
  sibling = value(
    await createStudentProfile(ownerActor, { personId: second.id, birthDate: null }),
  ).id;
  school = await schoolFixture();
  group = value(
    await createOrJoinTurma(ownerActor, {
      profileId: child,
      schoolInepCode: school,
      grade: "4ano",
      year: 2026,
      classLetter: "A",
      shift: "morning",
    }),
  ).turma.id;
  const [discipline] = await db
    .insert(agendaSubjects)
    .values({ turmaId: group, name: "Matéria sintética", createdByUserId: owner })
    .returning();
  subject = required(discipline).id;
  await db.update(agendaNotificationPreferences).set({ emailEnabled: false, pushEnabled: false });
  emails.clearOutbox();
});
afterEach(() => emails.clearOutbox());

describe("private groups and shared activities", () => {
  it("does not join a different family by knowing public class data; rotated codes and removal revoke access", async () => {
    const copied = value(
      await createOrJoinTurma(otherActor, {
        profileId: otherChild,
        schoolInepCode: school,
        grade: "4ano",
        year: 2026,
        classLetter: "A",
        shift: "morning",
      }),
    );
    expect(copied.turma.id).not.toBe(group);
    const [ownGroup] = await db.select().from(agendaTurmas).where(eq(agendaTurmas.id, group));
    if (!ownGroup) throw new Error("Missing group");
    const rotated = value(await rotateGroupCode(owner, group));
    expect(await joinPrivateGroup(otherActor, otherChild, ownGroup.code)).toMatchObject({
      ok: false,
      error: { code: "TURMA_NOT_FOUND" },
    });
    expect(await joinPrivateGroup(otherActor, otherChild, rotated.code)).toMatchObject({
      ok: true,
      value: { turma: { id: group } },
    });
    const created = await sharedExam("Prova compartilhada");
    value(
      await respondSharedActivity(otherActor, {
        activityId: created.sharedActivityId ?? "",
        accepted: true,
      }),
    );
    expect(
      (await listTasksInDateRange(otherActor, range)).map((task) => task.sharedActivityId),
    ).toContain(created.sharedActivityId);
    expect(await countPendingActivities(db, otherActor)).toBe(0);
    value(await removeGroupAdult(owner, group, other));
    expect(await listTasksInDateRange(otherActor, range)).toEqual([]);
    expect(await joinPrivateGroup(otherActor, otherChild, rotated.code)).toMatchObject({
      ok: false,
      error: { code: "TURMA_NOT_FOUND" },
    });
    // Depois da revogação a matéria deixa de ser oferecível: a criança não
    // participa mais daquela turma, e é isso que a gravação confere.
    expect(
      await confirmNotice(otherActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          {
            ...action("Requisição antiga depois da revogação", otherChild),
            subjectId: subject,
            dueAt: date,
            dateOrigin: "school",
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_SUBJECT" } });
  });
  it("preserves recipient completion through correction and downgrade, and blocks unsafe global deletion", async () => {
    const code = value(await rotateGroupCode(owner, group)).code;
    await joinPrivateGroup(otherActor, otherChild, code);
    const created = await sharedExam("Prova compartilhada");
    value(
      await respondSharedActivity(otherActor, {
        activityId: created.sharedActivityId ?? "",
        accepted: true,
      }),
    );
    // A conclusão é da tarefa da família que recebeu — a mesma alternância de
    // qualquer outra atividade desde a convergência.
    const [received] = await listTasksInDateRange(otherActor, range);
    if (!received) throw new Error("Missing received task");
    value(
      await setNoticeActionStatus(otherActor, {
        id: received.id,
        version: received.version,
        status: "done",
      }),
    );
    value(
      await updateNoticeAction(ownerActor, {
        id: created.id,
        version: created.version,
        action: {
          ...action("Prova remarcada"),
          type: "exam",
          subjectId: subject,
          dueAt: "2026-09-28",
          dateOrigin: "school",
          shareWithTurma: true,
        },
      }),
    );
    const [publishedActivity] = await db
      .select()
      .from(agendaActivities)
      .where(eq(agendaActivities.id, created.sharedActivityId ?? ""));
    expect(publishedActivity).toMatchObject({ title: "Prova remarcada", version: 2 });
    expect(
      await updateNoticeAction(ownerActor, {
        id: created.id,
        version: created.version,
        action: {
          ...action("Alteração antiga"),
          type: "exam",
          subjectId: subject,
          dueAt: date,
          dateOrigin: "school",
          shareWithTurma: true,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    await downgrade();
    expect((await listTasksInDateRange(otherActor, range))[0]).toMatchObject({
      title: "Prova remarcada",
      status: "done",
      version: 3,
    });
    await expect(db.delete(users).where(eq(users.id, owner))).rejects.toThrow();
    expect((await listTasksInDateRange(otherActor, range))[0]).toMatchObject({
      createdByUserId: owner,
      status: "done",
      title: "Prova remarcada",
    });
  });
  it("a correção pelo recado leva a data nova à turma, e sem data tira da turma", async () => {
    const correction = async (task: Task, dueAt: string | null) => {
      const [n] = await db
        .insert(agendaNotices)
        .values({
          familyGroupId: ownerActor.familyGroupId,
          createdByUserId: owner,
          captureProfileId: child,
          source: "teams",
          contentHash: randomUUID(),
          status: "ready",
          text: "Retificação fictícia da prova",
        })
        .returning();
      if (!n) throw new Error("Notice missing");
      // A captura manda a caixa da turma desmarcada: a pergunta vem no "Pronto".
      return confirmNotice(ownerActor, {
        noticeId: n.id,
        allowDuplicates: false,
        actions: [
          {
            ...action(task.title),
            type: "exam",
            subjectId: subject,
            dueAt,
            dateOrigin: dueAt ? "school" : "unspecified",
            shareWithTurma: false,
          },
        ],
        resolutions: [{ index: 0, kind: "replace", actionId: task.id, version: task.version }],
      });
    };
    const published = await sharedExam("Prova retificada");
    value(await correction(published, "2026-09-29"));
    const [kept] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, published.id));
    expect(kept?.sharedActivityId).toBe(published.sharedActivityId);
    const [fact] = await db
      .select()
      .from(agendaActivities)
      .where(eq(agendaActivities.id, published.sharedActivityId ?? ""));
    expect(fact?.dueAt).toBe("2026-09-29");

    // Sem data, a cópia não pode ficar ligada à turma com a data velha: como
    // ninguém aceitou ainda, a atividade sai da turma.
    if (!kept) throw new Error("Missing kept task");
    value(await correction(kept, null));
    const [unshared] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, published.id));
    expect(unshared?.sharedActivityId).toBeNull();
    expect(
      await db
        .select()
        .from(agendaActivities)
        .where(eq(agendaActivities.id, published.sharedActivityId ?? "")),
    ).toEqual([]);
  });
  it("manda para a turma depois de salvar só o que pode ir, e só para quem acessa a criança", async () => {
    // O "Pronto" do recado pergunta "Mandar para a turma?" e manda os ids que
    // acabaram de entrar; a gravação é a mesma da edição.
    const saved = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          {
            ...action("Prova para a turma"),
            type: "exam",
            subjectId: subject,
            dateOrigin: "school",
          },
          action("Sem matéria da turma"),
        ],
      }),
    );
    expect(saved.indices).toEqual([0, 1]);
    // Outra família não publica o que não acessa.
    expect(value(await shareSavedWithTurma(otherActor, { ids: saved.ids }))).toEqual({
      shared: 0,
      skipped: 2,
    });
    expect(value(await shareSavedWithTurma(ownerActor, { ids: saved.ids }))).toEqual({
      shared: 1,
      skipped: 1,
    });
    const [published] = await db
      .select()
      .from(agendaTasks)
      .where(eq(agendaTasks.id, saved.ids[0] ?? ""));
    expect(published?.sharedActivityId).toBeTruthy();
    // Mandar para a turma não muda o conteúdo: sem revisão, o card não diz
    // "Mudou depois de salva".
    expect(
      await db
        .select()
        .from(agendaActivityRevisions)
        .where(eq(agendaActivityRevisions.taskId, saved.ids[0] ?? "")),
    ).toEqual([]);
    // Mandar de novo não publica duas vezes.
    expect(value(await shareSavedWithTurma(ownerActor, { ids: saved.ids }))).toEqual({
      shared: 0,
      skipped: 2,
    });
  });
  it("publishes cancellation and revision to an existing private calendar link", async () => {
    await joinPrivateGroup(otherActor, otherChild, value(await rotateGroupCode(owner, group)).code);
    const created = await sharedExam("Prova cancelada");
    value(
      await respondSharedActivity(otherActor, {
        activityId: created.sharedActivityId ?? "",
        accepted: true,
      }),
    );
    const url = value(await createCalendarFeed(ownerActor)).url;
    const token = url.split("/").at(-1) ?? "";
    expect(await readCalendarFeed(token)).toContain("Prova cancelada");
    value(
      await setNoticeActionStatus(ownerActor, {
        id: created.id,
        version: created.version,
        status: "canceled",
      }),
    );
    expect(await readCalendarFeed(token)).toContain("STATUS:CANCELLED");
    expect(await readCalendarFeed(token)).toContain("SEQUENCE:2");
    await revokeCalendarFeeds(ownerActor);
    expect(await readCalendarFeed(token)).toBeNull();
  });
});

describe("o segundo adulto e as turmas", () => {
  it("vê as crianças de quem o convidou, mas as turmas continuam de quem as cadastrou", async () => {
    const { token } = await invite();
    value(await acceptFamilyInvitation(guest, token));

    // A tela de Crianças é escopada por criança acessível: o convidado vê a
    // filha de quem o convidou.
    expect((await listStudentProfilesForUser(guestActor)).map((p) => p.id)).toEqual([child]);

    // A de Turmas é escopada por conta, de propósito: a turma é espaço
    // compartilhado com outras famílias, e o card entrega o código, que é
    // credencial para vincular qualquer criança àquela sala. Quem consentiu
    // com o cuidado de uma filha não consentiu com isso.
    expect(await listTurmasForCurrentUser(guestActor)).toMatchObject([{ id: group, code: null }]);

    // E as duas portas que a tela oferecia continuam fechadas para ele — por
    // isso a tela precisa dizer isso, em vez de convidar.
    expect(
      await createOrJoinTurma(guestActor, {
        profileId: child,
        schoolInepCode: school,
        grade: "5ano",
        year: 2026,
        classLetter: "B",
        shift: "morning",
      }),
    ).toMatchObject({ ok: false, error: { code: "PROFILE_NOT_FOUND" } });
    const [turma] = await db.select().from(agendaTurmas).where(eq(agendaTurmas.id, group));
    expect(await joinPrivateGroup(guestActor, child, required(turma).code)).toMatchObject({
      ok: false,
    });
  });
});

describe("family permissions and action lifecycle", () => {
  it("binds invitations to the verified recipient, scopes access by child, and revokes reads and writes", async () => {
    const { token } = await invite();
    expect((await acceptFamilyInvitation(other, token)).ok).toBe(false);
    const member = value(await acceptFamilyInvitation(guest, token));
    expect((await acceptFamilyInvitation(guest, token)).ok).toBe(true);
    expect((await listAccessibleProfiles(guestActor)).map((p) => p.id)).toEqual([child]);
    expect((await getFamilyEntitlements(guestActor)).proProfileIds).toEqual([child]);
    const created = value(
      await confirmNotice(guestActor, {
        noticeId: null,
        actions: [{ ...action(), assignedToUserId: guest }],
        allowDuplicates: false,
      }),
    );
    const id = created.ids[0];
    if (!id) throw new Error("Action missing");
    expect(
      (
        await confirmNotice(guestActor, {
          noticeId: null,
          actions: [action("Outra criança", sibling)],
          allowDuplicates: false,
        })
      ).ok,
    ).toBe(false);
    value(await setNoticeActionStatus(guestActor, { id, version: 1, status: "done" }));
    expect((await getNoticeAction(ownerActor, id))?.action.status).toBe("done");
    expect(
      await updateNoticeAction(ownerActor, { id, version: 1, action: action() }),
    ).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
    await downgrade();
    expect((await getNoticeAction(guestActor, id))?.action.status).toBe("done");
    value(await revokeFamilyAccess(owner, member.id));
    expect(await getNoticeAction(guestActor, id)).toBeNull();
    expect(
      (await setNoticeActionStatus(guestActor, { id, version: 2, status: "pending" })).ok,
    ).toBe(false);
    expect((await getNoticeAction(ownerActor, id))?.action.assignedToUserId).toBeNull();
  });
  it("só a edição do conteúdo conta como mudança depois de salva, e a versão nova volta", async () => {
    // O card dizia "Mudou depois de salva" a partir de `version > 1`, e concluir
    // e reabrir também sobem a versão. E o "Desfazer" precisa da versão nova
    // na resposta, ou esbarra em conflito.
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [action("Mudou ou não mudou")],
      }),
    );
    const id = required(created.ids[0]);
    const edited = async () =>
      (await listTasksInDateRange(ownerActor, range)).find((task) => task.id === id)
        ?.editedAfterSave;
    expect(await edited()).toBe(false);
    const done = value(await setNoticeActionStatus(ownerActor, { id, version: 1, status: "done" }));
    expect(done).toMatchObject({ id, version: 2 });
    value(await setNoticeActionStatus(ownerActor, { id, version: 2, status: "pending" }));
    expect(await edited()).toBe(false);
    value(
      await updateNoticeAction(ownerActor, { id, version: 3, action: action("Mudou de verdade") }),
    );
    expect(await edited()).toBe(true);
  });
  it("prevents replay duplication and hides mixed-child original documents from a scoped guest", async () => {
    const { token } = await invite();
    value(await acceptFamilyInvitation(guest, token));
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        familyGroupId: ownerActor.familyGroupId,
        createdByUserId: owner,
        captureProfileId: child,
        source: "teams",
        contentHash: randomUUID(),
        status: "ready",
        text: "Texto fictício de duas crianças",
      })
      .returning();
    if (!notice) throw new Error("Notice missing");
    const payload = {
      noticeId: notice.id,
      actions: [action("Autorização A"), action("Autorização B", sibling)],
      allowDuplicates: false,
    };
    value(await confirmNotice(ownerActor, payload));
    expect(value(await confirmNotice(ownerActor, payload)).alreadyConfirmed).toBe(true);
    expect(await listNoticeActions(ownerActor)).toHaveLength(2);
    expect(await getNoticeSource(guestActor, notice.id)).toBeNull();
    expect((await listNoticeActions(guestActor)).map((r) => r.action.title)).toEqual([
      "Autorização A",
    ]);
    expect(await getNoticeSource(otherActor, notice.id)).toBeNull();
  });
  it("detects duplicates and creates only one next occurrence after repeated completion", async () => {
    const weekly = { ...action("Treino semanal"), recurrence: "weekly" as const };
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [weekly],
        allowDuplicates: false,
      }),
    );
    expect(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [weekly],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "POSSIBLE_DUPLICATES" } });
    const id = created.ids[0];
    if (!id) throw new Error("Action missing");
    value(await setNoticeActionStatus(ownerActor, { id, version: 1, status: "done" }));
    value(await setNoticeActionStatus(ownerActor, { id, version: 2, status: "pending" }));
    value(await setNoticeActionStatus(ownerActor, { id, version: 3, status: "done" }));
    expect(await listNoticeActions(ownerActor, { includeFinished: true })).toHaveLength(2);
  });
  it("uses one pending quota under concurrent school, extra and notice creation; completion frees a slot", async () => {
    value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: Array.from({ length: 19 }, (_, i) => action(`Pendência ${i}`)),
        allowDuplicates: false,
      }),
    );
    const [extra] = await db
      .insert(agendaProfileSubjects)
      .values({ profileId: child, name: "Natação" })
      .returning();
    if (!extra) throw new Error("Extra missing");
    await downgrade();
    const results = await Promise.all([
      confirmNotice(ownerActor, {
        noticeId: null,
        actions: [action("Último recado")],
        allowDuplicates: false,
      }),
      confirmNotice(ownerActor, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          { ...action("Última tarefa"), type: "task", subjectId: subject, dateOrigin: "school" },
        ],
      }),
      createProfileSubjectActivity(ownerActor, {
        profileSubjectId: extra.id,
        type: "task",
        title: "Última extra",
        dueAt: date,
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await countPendingActivities(db, ownerActor)).toBe(20);
    const [first] = await listNoticeActions(ownerActor);
    if (!first) throw new Error("Action missing");
    value(
      await setNoticeActionStatus(ownerActor, { id: first.action.id, version: 1, status: "done" }),
    );
    expect(await countPendingActivities(db, ownerActor)).toBe(19);
    value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [action("Novo espaço")],
        allowDuplicates: false,
      }),
    );
    expect(
      (
        await setNoticeActionStatus(ownerActor, {
          id: first.action.id,
          version: 2,
          status: "pending",
        })
      ).ok,
    ).toBe(false);
    expect((await getNoticeAction(ownerActor, first.action.id))?.action.status).toBe("done");
  });
});

describe("routine delivery", () => {
  it("pages through recipients and expires stored attachments even with no eligible message", async () => {
    await db.insert(agendaNotificationPreferences).values(
      [ownerActor, guestActor, otherActor].map((actor) => ({
        userId: actor.userId,
        familyGroupId: actor.familyGroupId,
        emailEnabled: true,
      })),
    );
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        familyGroupId: ownerActor.familyGroupId,
        createdByUserId: owner,
        captureProfileId: child,
        source: "teams",
        contentHash: randomUUID(),
        status: "ready",
        attachmentData: "c3ludGhldGlj",
        attachmentExpiresAt: new Date(`${date}T11:00:00-03:00`),
      })
      .returning();
    let cursor: string | null = null;
    const completed = new Set<string>();
    let hasMore = true;
    for (let i = 0; i < 30 && hasMore; i++) {
      const batch = await deliverRoutineNotifications(new Date(`${date}T12:00:00-03:00`), {
        afterPreferenceId: cursor,
        limit: 1,
      });
      cursor = batch.cursor;
      hasMore = batch.hasMore;
      if (cursor) {
        expect(completed.has(cursor)).toBe(false);
        completed.add(cursor);
      }
    }
    expect(hasMore).toBe(false);
    const expected = await db
      .select({ id: agendaNotificationPreferences.id })
      .from(agendaNotificationPreferences)
      .where(inArray(agendaNotificationPreferences.userId, [owner, guest, other]));
    expect(expected.every((p) => completed.has(p.id))).toBe(true);
    const [expired] = await db
      .select()
      .from(agendaNotices)
      .where(eq(agendaNotices.id, notice?.id ?? ""));
    expect(expired?.attachmentData).toBeNull();
  });
  it("requires consent, sends once, avoids stored child content, and does not send a canceled reminder", async () => {
    const now = new Date(`${date}T19:00:00-03:00`);
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [{ ...action("Autorização do passeio"), reminderAt: now.toISOString() }],
        allowDuplicates: false,
      }),
    );
    const id = created.ids[0];
    if (!id) throw new Error("Action missing");
    await deliverRoutineNotifications(now);
    expect(emails.getOutbox()).toHaveLength(0);
    value(
      await saveNotificationPreferences(ownerActor, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        emailEnabled: true,
        // O resumo da semana tem teste próprio; aqui ele só não pode somar um
        // e-mail e confundir a contagem do diário.
        weeklyDigestEnabled: false,
      }),
    );
    value(await setNoticeActionStatus(ownerActor, { id, version: 1, status: "canceled" }));
    await deliverRoutineNotifications(now);
    expect(emails.getOutbox()).toHaveLength(0);
    value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [action("Separar material")],
        allowDuplicates: false,
      }),
    );
    await Promise.all([deliverRoutineNotifications(now), deliverRoutineNotifications(now)]);
    expect(emails.getOutbox()).toHaveLength(1);
    const [delivery] = await db
      .select()
      .from(emailDeliveries)
      .where(
        and(eq(emailDeliveries.userId, owner), eq(emailDeliveries.category, "agenda.routine")),
      );
    expect(delivery).toMatchObject({ html: null, text: null, status: "sent" });
    expect(JSON.stringify(emails.getOutbox())).toContain("Separar material");
    expect(JSON.stringify(emails.getOutbox())).not.toContain("Autorização do passeio");
    const [scheduled] = await db
      .select()
      .from(agendaNotificationDeliveries)
      .where(eq(agendaNotificationDeliveries.userId, owner));
    expect(scheduled).toMatchObject({ attempts: 1, status: "sent" });
  });
});

describe("family drafts and subscription transitions", () => {
  it("blocks deleting a shared identity while the household still depends on it", async () => {
    await expect(db.delete(users).where(eq(users.id, owner))).rejects.toThrow();
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, owner))).toHaveLength(
      1,
    );
    expect((await getFamilyEntitlements(ownerActor)).enabled).toBe(true);
  });
  it("lets a caregiver finish their own draft while preventing access to a sibling", async () => {
    const { token } = await invite();
    value(await acceptFamilyInvitation(guest, token));
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        familyGroupId: ownerActor.familyGroupId,
        createdByUserId: guest,
        captureProfileId: child,
        source: "batista",
        contentHash: randomUUID(),
        status: "ready",
      })
      .returning();
    if (!notice) throw new Error("Missing draft");
    expect(
      await confirmNotice(guestActor, {
        noticeId: notice.id,
        actions: [action("Sem permissão", sibling)],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    value(
      await confirmNotice(guestActor, {
        noticeId: notice.id,
        actions: [{ ...action("Conferir autorização"), assignedToUserId: guest }],
        allowDuplicates: false,
      }),
    );
    expect(await listNoticeActions(ownerActor)).toHaveLength(1);
  });
  it("allows ordinary corrections after downgrade, but prevents adding paid automation", async () => {
    const paidAction = {
      ...action("Material semanal"),
      recurrence: "weekly" as const,
      reminderAt: new Date(`${date}T19:00:00-03:00`).toISOString(),
    };
    const created = value(
      await confirmNotice(ownerActor, {
        noticeId: null,
        actions: [paidAction],
        allowDuplicates: false,
      }),
    );
    const id = created.ids[0];
    if (!id) throw new Error("Missing action");
    await downgrade();
    value(
      await updateNoticeAction(ownerActor, {
        id,
        version: 1,
        action: { ...paidAction, title: "Material corrigido" },
      }),
    );
    expect(
      await updateNoticeAction(ownerActor, {
        id,
        version: 2,
        action: { ...paidAction, reminderAt: new Date(Date.now() + 86400_000).toISOString() },
      }),
    ).toMatchObject({ ok: false, error: { code: "PRO_REQUIRED" } });
    value(await setNoticeActionStatus(ownerActor, { id, version: 2, status: "done" }));
    expect(await listNoticeActions(ownerActor, { includeFinished: true })).toHaveLength(1);
  });
});
