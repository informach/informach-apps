import { randomUUID } from "node:crypto";
import { seedAgendaCreditPricing } from "@informach/billing/seeds";
import { and, db, eq, inArray } from "@informach/db";
import {
  agendaCities,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaProductEvents,
  agendaProfileSubjects,
  agendaSchools,
  agendaSubjects,
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
import { insertActivityWithTasks } from "@/features/activities/repository";
import {
  createActivity,
  deleteActivity,
  respondSharedActivity,
  updateActivity,
} from "@/features/activities/service";
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
  updateNoticeAction,
} from "@/features/notices/service";
import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { saveNotificationPreferences } from "@/features/notifications/service";
import { createProfileSubjectActivity } from "@/features/profile-subject-activities/service";
import { createStudentProfile } from "@/features/students/service";
import {
  joinPrivateGroup,
  removeGroupAdult,
  rotateGroupCode,
} from "@/features/turmas/group-access";
import { createOrJoinTurma } from "@/features/turmas/service";
import { listTasksInDateRange } from "@/features/unified-activities/task-repository";
import { emails } from "@/lib/emails";

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
let owner: string, guest: string, other: string, child: string, sibling: string, otherChild: string;
let school: string, group: string, subject: string, customer: string, subscription: string;
const date = todayLocalIso();
const range = { fromIso: "2026-01-01", toIso: "2030-12-31", profileFilter: null };
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
  location: null,
  sourceExcerpt: null,
  assignedToUserId: null,
  reminderAt: null,
  recurrence: "none",
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
    const created = value(
      await createActivity(owner, {
        turmaId: group,
        subjectId: subject,
        type: "exam",
        title: "Prova compartilhada",
        dueAt: date,
        visibility: "shared_with_turma",
      }),
    );
    value(await respondSharedActivity(other, { activityId: created.id, accepted: true }));
    expect(
      (await listTasksInDateRange(other, range)).map((task) => task.sharedActivityId),
    ).toContain(created.id);
    expect(await countPendingActivities(db, other)).toBe(0);
    value(await removeGroupAdult(owner, group, other));
    expect(await listTasksInDateRange(other, range)).toEqual([]);
    expect(await joinPrivateGroup(other, otherChild, rotated.code)).toBeNull();
    await expect(
      insertActivityWithTasks({
        turmaId: group,
        subjectId: subject,
        createdByUserId: other,
        type: "task",
        visibility: "shared_with_turma",
        title: "Requisição antiga depois da revogação",
        description: null,
        dueAt: date,
      }),
    ).rejects.toThrow("ACTIVE_PROFILE_REQUIRED");
  });
  it("preserves recipient completion through correction, downgrade and creator deletion", async () => {
    const code = value(await rotateGroupCode(owner, group)).code;
    await joinPrivateGroup(other, otherChild, code);
    const created = value(
      await createActivity(owner, {
        turmaId: group,
        subjectId: subject,
        type: "exam",
        title: "Prova compartilhada",
        dueAt: date,
        visibility: "shared_with_turma",
      }),
    );
    value(await respondSharedActivity(other, { activityId: created.id, accepted: true }));
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
    const changed = value(
      await updateActivity(owner, {
        id: created.id,
        version: 1,
        subjectId: subject,
        type: "exam",
        title: "Prova remarcada",
        dueAt: "2026-09-28",
        visibility: "shared_with_turma",
      }),
    );
    expect(changed.version).toBe(2);
    expect(
      await updateActivity(owner, {
        id: created.id,
        version: 1,
        subjectId: subject,
        type: "exam",
        title: "Alteração antiga",
        dueAt: date,
        visibility: "shared_with_turma",
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
  it("publishes cancellation and revision to an existing private calendar link", async () => {
    await joinPrivateGroup(other, otherChild, value(await rotateGroupCode(owner, group)).code);
    const created = value(
      await createActivity(owner, {
        turmaId: group,
        subjectId: subject,
        type: "exam",
        title: "Prova cancelada",
        dueAt: date,
        visibility: "shared_with_turma",
      }),
    );
    value(await respondSharedActivity(other, { activityId: created.id, accepted: true }));
    const url = value(await createCalendarFeed(owner)).url;
    const token = url.split("/").at(-1) ?? "";
    expect(await readCalendarFeed(token)).toContain("Prova cancelada");
    value(await deleteActivity(owner, { id: created.id }));
    expect(await readCalendarFeed(token)).toContain("STATUS:CANCELLED");
    expect(await readCalendarFeed(token)).toContain("SEQUENCE:2");
    await revokeCalendarFeeds(owner);
    expect(await readCalendarFeed(token)).toBeNull();
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
      createActivity(owner, {
        turmaId: group,
        subjectId: subject,
        type: "task",
        title: "Última tarefa",
        dueAt: date,
        visibility: "individual",
      }),
      createProfileSubjectActivity(owner, {
        profileSubjectId: extra.id,
        type: "task",
        title: "Última extra",
        dueAt: date,
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
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
        emailEnabled: true,
        pushEnabled: false,
        digestHour: 19,
        quietStart: 21,
        quietEnd: 7,
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
