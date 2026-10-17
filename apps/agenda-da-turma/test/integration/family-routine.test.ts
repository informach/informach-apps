import { randomUUID } from "node:crypto";
import { seedAgendaCreditPricing } from "@informach/billing/seeds";
import { and, db, eq, inArray } from "@informach/db";
import {
  agendaActivities,
  agendaActivityRevisions,
  agendaCities,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaProductEvents,
  agendaProfileSubjects,
  agendaSchools,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
  customers,
  emailDeliveries,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanAgendaAccount } from "@/features/account/cleanup";
import { prepareAgendaAccountDeletion } from "@/features/account/deletion";
import { countPendingActivities } from "@/features/activities/pending-limit";
import { respondSharedActivity } from "@/features/activities/service";
import {
  createCalendarFeed,
  readCalendarFeed,
  revokeCalendarFeeds,
} from "@/features/calendar-feed/service";
import { todayLocalIso } from "@/features/dashboard/date";
import { listAccessibleProfiles } from "@/features/family/access";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import {
  acceptFamilyInvitation,
  createFamilyInvitation,
  revokeFamilyAccess,
} from "@/features/family/service";
import { getNoticeAction, getNoticeSource, listNoticeActions } from "@/features/notices/repository";
import type { NoticeActionInput } from "@/features/notices/schemas";
import {
  confirmNotice,
  setNoticeActionStatus,
  shareSavedWithTurma,
  updateNoticeAction,
} from "@/features/notices/service";
import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/features/notifications/schemas";
import { saveNotificationPreferences } from "@/features/notifications/service";
import { createProfileSubjectActivity } from "@/features/profile-subject-activities/service";
import { createStudentProfile, listStudentProfilesForUser } from "@/features/students/service";
import {
  joinPrivateGroup,
  removeGroupAdult,
  rotateGroupCode,
} from "@/features/turmas/group-access";
import { createOrJoinTurma, listTurmasForCurrentUser } from "@/features/turmas/service";
import { listTasksInDateRange } from "@/features/unified-activities/task-repository";
import { emails } from "@/lib/emails";

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
let owner: string, guest: string, other: string, child: string, sibling: string, otherChild: string;
let school: string, group: string, subject: string, customer: string, subscription: string;
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
    await confirmNotice(owner, {
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
  const invitation = value(
    await createFamilyInvitation(owner, { email: `${guest}@e2e.local`, profileIds: [child] }),
  );
  const token = new URL(invitation.url).searchParams.get("token");
  if (!token) throw new Error("Invitation token missing");
  return { invitation, token };
}
async function downgrade() {
  await db
    .update(subscriptions)
    .set({ status: "canceled", canceledAt: new Date() })
    .where(eq(subscriptions.id, subscription));
}

beforeAll(async () => {
  await seedAgendaCreditPricing(db);
});
beforeEach(async () => {
  owner = `routine-test-${randomUUID()}`;
  guest = `routine-test-${randomUUID()}`;
  other = `routine-test-${randomUUID()}`;
  await db.insert(users).values(
    [owner, guest, other].map((id) => ({
      id,
      name: "Adulto fictício",
      email: `${id}@e2e.local`,
      emailVerified: true,
    })),
  );
  const [billingCustomer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `test-${owner}`,
      subjectType: "user",
      subjectId: owner,
      app: "agenda-da-turma",
      email: `${owner}@e2e.local`,
    })
    .returning();
  if (!billingCustomer) throw new Error("Customer missing");
  customer = billingCustomer.id;
  const [billingSubscription] = await db
    .insert(subscriptions)
    .values({
      customerId: customer,
      provider: "stripe",
      providerSubscriptionId: `test-${owner}`,
      productId: "agenda_da_turma_pro_monthly",
      providerPriceId: "price_synthetic",
      status: "active",
      currentPeriodStart: new Date(Date.now() - 86400_000),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    })
    .returning();
  if (!billingSubscription) throw new Error("Subscription missing");
  subscription = billingSubscription.id;
  child = value(
    await createStudentProfile(owner, { name: "Criança A fictícia", birthDate: null }),
  ).id;
  sibling = value(
    await createStudentProfile(owner, { name: "Criança B fictícia", birthDate: null }),
  ).id;
  otherChild = value(
    await createStudentProfile(other, { name: "Criança C fictícia", birthDate: null }),
  ).id;
  const [city] = await db.select({ id: agendaCities.ibgeCode }).from(agendaCities).limit(1);
  if (!city) throw new Error("Local reference cities must be seeded");
  school = `test-${randomUUID()}`;
  await db
    .insert(agendaSchools)
    .values({ inepCode: school, cityIbgeCode: city.id, name: "Escola fictícia de integração" });
  group = value(
    await createOrJoinTurma(owner, {
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
  if (!discipline) throw new Error("Subject missing");
  subject = discipline.id;
  emails.clearOutbox();
});
afterEach(async () => {
  if (!owner) return;
  const ids = [owner, guest, other];
  await db.delete(agendaTurmas).where(eq(agendaTurmas.schoolInepCode, school));
  await db.delete(agendaSchools).where(eq(agendaSchools.inepCode, school));
  await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.userId, ids));
  await db.delete(emailDeliveries).where(inArray(emailDeliveries.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  if (customer) {
    await db.delete(subscriptions).where(eq(subscriptions.customerId, customer));
    await db.delete(customers).where(eq(customers.id, customer));
  }
  emails.clearOutbox();
});

describe("private groups and shared activities", () => {
  it("does not join a different family by knowing public class data; rotated codes and removal revoke access", async () => {
    const copied = value(
      await createOrJoinTurma(other, {
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
    expect(await joinPrivateGroup(other, otherChild, ownGroup.code)).toBeNull();
    expect(await joinPrivateGroup(other, otherChild, rotated.code)).toMatchObject({ id: group });
    const created = await sharedExam("Prova compartilhada");
    value(
      await respondSharedActivity(other, {
        activityId: created.sharedActivityId ?? "",
        accepted: true,
      }),
    );
    expect(
      (await listTasksInDateRange(other, range)).map((task) => task.sharedActivityId),
    ).toContain(created.sharedActivityId);
    expect(await countPendingActivities(db, other)).toBe(0);
    value(await removeGroupAdult(owner, group, other));
    expect(await listTasksInDateRange(other, range)).toEqual([]);
    expect(await joinPrivateGroup(other, otherChild, rotated.code)).toBeNull();
    // Depois da revogação a matéria deixa de ser oferecível: a criança não
    // participa mais daquela turma, e é isso que a gravação confere.
    expect(
      await confirmNotice(other, {
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
  it("preserves recipient completion through correction, downgrade and creator deletion", async () => {
    const code = value(await rotateGroupCode(owner, group)).code;
    await joinPrivateGroup(other, otherChild, code);
    const created = await sharedExam("Prova compartilhada");
    value(
      await respondSharedActivity(other, {
        activityId: created.sharedActivityId ?? "",
        accepted: true,
      }),
    );
    // A conclusão é da tarefa da família que recebeu — a mesma alternância de
    // qualquer outra atividade desde a convergência.
    const [received] = await listTasksInDateRange(other, range);
    if (!received) throw new Error("Missing received task");
    value(
      await setNoticeActionStatus(other, {
        id: received.id,
        version: received.version,
        status: "done",
      }),
    );
    value(
      await updateNoticeAction(owner, {
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
      await updateNoticeAction(owner, {
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
    expect((await listTasksInDateRange(other, range))[0]).toMatchObject({
      title: "Prova remarcada",
      status: "done",
      version: 3,
    });
    await cleanAgendaAccount(owner);
    await db.delete(users).where(eq(users.id, owner));
    expect((await listTasksInDateRange(other, range))[0]).toMatchObject({
      createdByUserId: null,
      status: "done",
      title: "Prova remarcada",
    });
  });
  it("a correção pelo recado leva a data nova à turma, e sem data tira da turma", async () => {
    const correction = async (task: Task, dueAt: string | null) => {
      const [n] = await db
        .insert(agendaNotices)
        .values({
          ownerUserId: owner,
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
      return confirmNotice(owner, {
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
      await confirmNotice(owner, {
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
    expect(value(await shareSavedWithTurma(other, { ids: saved.ids }))).toEqual({
      shared: 0,
      skipped: 2,
    });
    expect(value(await shareSavedWithTurma(owner, { ids: saved.ids }))).toEqual({
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
    expect(value(await shareSavedWithTurma(owner, { ids: saved.ids }))).toEqual({
      shared: 0,
      skipped: 2,
    });
  });
  it("publishes cancellation and revision to an existing private calendar link", async () => {
    await joinPrivateGroup(other, otherChild, value(await rotateGroupCode(owner, group)).code);
    const created = await sharedExam("Prova cancelada");
    value(
      await respondSharedActivity(other, {
        activityId: created.sharedActivityId ?? "",
        accepted: true,
      }),
    );
    const url = value(await createCalendarFeed(owner)).url;
    const token = url.split("/").at(-1) ?? "";
    expect(await readCalendarFeed(token)).toContain("Prova cancelada");
    value(
      await setNoticeActionStatus(owner, {
        id: created.id,
        version: created.version,
        status: "canceled",
      }),
    );
    expect(await readCalendarFeed(token)).toContain("STATUS:CANCELLED");
    expect(await readCalendarFeed(token)).toContain("SEQUENCE:2");
    await revokeCalendarFeeds(owner);
    expect(await readCalendarFeed(token)).toBeNull();
  });
});

describe("o segundo adulto e as turmas", () => {
  it("vê as crianças de quem o convidou, mas as turmas continuam de quem as cadastrou", async () => {
    const { token } = await invite();
    value(await acceptFamilyInvitation(guest, token));

    // A tela de Crianças é escopada por criança acessível: o convidado vê a
    // filha de quem o convidou.
    expect((await listStudentProfilesForUser(guest)).map((p) => p.id)).toEqual([child]);

    // A de Turmas é escopada por conta, de propósito: a turma é espaço
    // compartilhado com outras famílias, e o card entrega o código, que é
    // credencial para vincular qualquer criança àquela sala. Quem consentiu
    // com o cuidado de uma filha não consentiu com isso.
    expect(await listTurmasForCurrentUser(guest)).toEqual([]);

    // E as duas portas que a tela oferecia continuam fechadas para ele — por
    // isso a tela precisa dizer isso, em vez de convidar.
    expect(
      await createOrJoinTurma(guest, {
        profileId: child,
        schoolInepCode: school,
        grade: "5ano",
        year: 2026,
        classLetter: "B",
        shift: "morning",
      }),
    ).toMatchObject({ ok: false, error: { code: "PROFILE_NOT_FOUND" } });
    const [turma] = await db.select().from(agendaTurmas).where(eq(agendaTurmas.id, group));
    expect(await joinPrivateGroup(guest, child, required(turma).code)).toBeNull();
  });
});

describe("family permissions and action lifecycle", () => {
  it("binds invitations to the verified recipient, scopes access by child, and revokes reads and writes", async () => {
    const { token } = await invite();
    expect((await acceptFamilyInvitation(other, token)).ok).toBe(false);
    const member = value(await acceptFamilyInvitation(guest, token));
    expect((await acceptFamilyInvitation(guest, token)).ok).toBe(false);
    expect((await listAccessibleProfiles(guest)).map((p) => p.id)).toEqual([child]);
    expect((await getFamilyEntitlements(guest)).proProfileIds).toEqual([child]);
    const created = value(
      await confirmNotice(guest, {
        noticeId: null,
        actions: [{ ...action(), assignedToUserId: guest }],
        allowDuplicates: false,
      }),
    );
    const id = created.ids[0];
    if (!id) throw new Error("Action missing");
    expect(
      (
        await confirmNotice(guest, {
          noticeId: null,
          actions: [action("Outra criança", sibling)],
          allowDuplicates: false,
        })
      ).ok,
    ).toBe(false);
    value(await setNoticeActionStatus(guest, { id, version: 1, status: "done" }));
    expect((await getNoticeAction(owner, id))?.action.status).toBe("done");
    expect(await updateNoticeAction(owner, { id, version: 1, action: action() })).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
    await downgrade();
    expect((await getNoticeAction(guest, id))?.action.status).toBe("done");
    value(await revokeFamilyAccess(owner, member.id));
    expect(await getNoticeAction(guest, id)).toBeNull();
    expect((await setNoticeActionStatus(guest, { id, version: 2, status: "pending" })).ok).toBe(
      false,
    );
    expect((await getNoticeAction(owner, id))?.action.assignedToUserId).toBeNull();
  });
  it("só a edição do conteúdo conta como mudança depois de salva, e a versão nova volta", async () => {
    // O card dizia "Mudou depois de salva" a partir de `version > 1`, e concluir
    // e reabrir também sobem a versão. E o "Desfazer" precisa da versão nova
    // na resposta, ou esbarra em conflito.
    const created = value(
      await confirmNotice(owner, {
        noticeId: null,
        allowDuplicates: true,
        actions: [action("Mudou ou não mudou")],
      }),
    );
    const id = required(created.ids[0]);
    const edited = async () =>
      (await listTasksInDateRange(owner, range)).find((task) => task.id === id)?.editedAfterSave;
    expect(await edited()).toBe(false);
    const done = value(await setNoticeActionStatus(owner, { id, version: 1, status: "done" }));
    expect(done).toMatchObject({ id, version: 2 });
    value(await setNoticeActionStatus(owner, { id, version: 2, status: "pending" }));
    expect(await edited()).toBe(false);
    value(await updateNoticeAction(owner, { id, version: 3, action: action("Mudou de verdade") }));
    expect(await edited()).toBe(true);
  });
  it("prevents replay duplication and hides mixed-child original documents from a scoped guest", async () => {
    const { token } = await invite();
    value(await acceptFamilyInvitation(guest, token));
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        ownerUserId: owner,
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
    value(await confirmNotice(owner, payload));
    expect(value(await confirmNotice(owner, payload)).alreadyConfirmed).toBe(true);
    expect(await listNoticeActions(owner)).toHaveLength(2);
    expect(await getNoticeSource(guest, notice.id)).toBeNull();
    expect((await listNoticeActions(guest)).map((r) => r.action.title)).toEqual(["Autorização A"]);
    expect(await getNoticeSource(other, notice.id)).toBeNull();
  });
  it("detects duplicates and creates only one next occurrence after repeated completion", async () => {
    const weekly = { ...action("Treino semanal"), recurrence: "weekly" as const };
    const created = value(
      await confirmNotice(owner, { noticeId: null, actions: [weekly], allowDuplicates: false }),
    );
    expect(
      await confirmNotice(owner, { noticeId: null, actions: [weekly], allowDuplicates: false }),
    ).toMatchObject({ ok: false, error: { code: "POSSIBLE_DUPLICATES" } });
    const id = created.ids[0];
    if (!id) throw new Error("Action missing");
    value(await setNoticeActionStatus(owner, { id, version: 1, status: "done" }));
    value(await setNoticeActionStatus(owner, { id, version: 2, status: "pending" }));
    value(await setNoticeActionStatus(owner, { id, version: 3, status: "done" }));
    expect(await listNoticeActions(owner, { includeFinished: true })).toHaveLength(2);
  });
  it("uses one pending quota under concurrent school, extra and notice creation; completion frees a slot", async () => {
    value(
      await confirmNotice(owner, {
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
      confirmNotice(owner, {
        noticeId: null,
        actions: [action("Último recado")],
        allowDuplicates: false,
      }),
      confirmNotice(owner, {
        noticeId: null,
        allowDuplicates: true,
        actions: [
          { ...action("Última tarefa"), type: "task", subjectId: subject, dateOrigin: "school" },
        ],
      }),
      createProfileSubjectActivity(owner, {
        profileSubjectId: extra.id,
        type: "task",
        title: "Última extra",
        dueAt: date,
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await countPendingActivities(db, owner)).toBe(20);
    const [first] = await listNoticeActions(owner);
    if (!first) throw new Error("Action missing");
    value(await setNoticeActionStatus(owner, { id: first.action.id, version: 1, status: "done" }));
    expect(await countPendingActivities(db, owner)).toBe(19);
    value(
      await confirmNotice(owner, {
        noticeId: null,
        actions: [action("Novo espaço")],
        allowDuplicates: false,
      }),
    );
    expect(
      (await setNoticeActionStatus(owner, { id: first.action.id, version: 2, status: "pending" }))
        .ok,
    ).toBe(false);
    expect((await getNoticeAction(owner, first.action.id))?.action.status).toBe("done");
  });
});

describe("routine delivery", () => {
  it("pages through recipients and expires stored attachments even with no eligible message", async () => {
    await db
      .insert(agendaNotificationPreferences)
      .values([owner, guest, other].map((userId) => ({ userId, emailEnabled: true })));
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        ownerUserId: owner,
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
        afterUserId: cursor,
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
    expect([owner, guest, other].every((id) => completed.has(id))).toBe(true);
    const [expired] = await db
      .select()
      .from(agendaNotices)
      .where(eq(agendaNotices.id, notice?.id ?? ""));
    expect(expired?.attachmentData).toBeNull();
  });
  it("requires consent, sends once, avoids stored child content, and does not send a canceled reminder", async () => {
    const now = new Date(`${date}T19:00:00-03:00`);
    const created = value(
      await confirmNotice(owner, {
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
      await saveNotificationPreferences(owner, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        emailEnabled: true,
        // O resumo da semana tem teste próprio; aqui ele só não pode somar um
        // e-mail e confundir a contagem do diário.
        weeklyDigestEnabled: false,
      }),
    );
    value(await setNoticeActionStatus(owner, { id, version: 1, status: "canceled" }));
    await deliverRoutineNotifications(now);
    expect(emails.getOutbox()).toHaveLength(0);
    value(
      await confirmNotice(owner, {
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
  it("preserves the shared identity and Agenda plan when another app still has an active subscription", async () => {
    const [otherCustomer] = await db
      .insert(customers)
      .values({
        app: "cozya",
        provider: "stripe",
        providerCustomerId: `other-${owner}`,
        subjectType: "user",
        subjectId: owner,
        email: `${owner}@e2e.local`,
      })
      .returning();
    if (!otherCustomer) throw new Error("Missing cross-app fixture");
    try {
      await db.insert(subscriptions).values({
        customerId: otherCustomer.id,
        provider: "stripe",
        providerSubscriptionId: `other-${owner}`,
        providerPriceId: "price_synthetic",
        productId: "cozya_pro_monthly",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400_000),
      });
      await expect(prepareAgendaAccountDeletion(owner)).rejects.toThrow("outros apps Informach");
      expect(await db.select({ id: users.id }).from(users).where(eq(users.id, owner))).toHaveLength(
        1,
      );
      const [agendaPlan] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription));
      expect(agendaPlan?.status).toBe("active");
    } finally {
      await db.delete(subscriptions).where(eq(subscriptions.customerId, otherCustomer.id));
      await db.delete(customers).where(eq(customers.id, otherCustomer.id));
    }
  });
  it("lets a caregiver finish their own draft while preventing access to a sibling", async () => {
    const { token } = await invite();
    value(await acceptFamilyInvitation(guest, token));
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        ownerUserId: owner,
        createdByUserId: guest,
        captureProfileId: child,
        source: "batista",
        contentHash: randomUUID(),
        status: "ready",
      })
      .returning();
    if (!notice) throw new Error("Missing draft");
    expect(
      await confirmNotice(guest, {
        noticeId: notice.id,
        actions: [action("Sem permissão", sibling)],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PROFILE" } });
    value(
      await confirmNotice(guest, {
        noticeId: notice.id,
        actions: [{ ...action("Conferir autorização"), assignedToUserId: guest }],
        allowDuplicates: false,
      }),
    );
    expect(await listNoticeActions(owner)).toHaveLength(1);
  });
  it("allows ordinary corrections after downgrade, but prevents adding paid automation", async () => {
    const paidAction = {
      ...action("Material semanal"),
      recurrence: "weekly" as const,
      reminderAt: new Date(`${date}T19:00:00-03:00`).toISOString(),
    };
    const created = value(
      await confirmNotice(owner, { noticeId: null, actions: [paidAction], allowDuplicates: false }),
    );
    const id = created.ids[0];
    if (!id) throw new Error("Missing action");
    await downgrade();
    value(
      await updateNoticeAction(owner, {
        id,
        version: 1,
        action: { ...paidAction, title: "Material corrigido" },
      }),
    );
    expect(
      await updateNoticeAction(owner, {
        id,
        version: 2,
        action: { ...paidAction, reminderAt: new Date(Date.now() + 86400_000).toISOString() },
      }),
    ).toMatchObject({ ok: false, error: { code: "PRO_REQUIRED" } });
    value(await setNoticeActionStatus(owner, { id, version: 2, status: "done" }));
    expect(await listNoticeActions(owner, { includeFinished: true })).toHaveLength(1);
  });
});
