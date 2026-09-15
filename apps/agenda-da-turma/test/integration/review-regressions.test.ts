import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  agendaCities,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaProductEvents,
  agendaProfileSubjects,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  creditReservations,
  customers,
  emailDeliveries,
  subscriptions,
  users,
} from "@informach/db/schema";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findActivityHistory } from "@/features/activities/history-repository";
import { listPendingSharedActivitiesForUser } from "@/features/activities/repository";
import {
  createActivity,
  deleteActivity,
  respondSharedActivity,
  updateActivity,
} from "@/features/activities/service";
import { todayLocalIso } from "@/features/dashboard/date";
import { acceptFamilyInvitation, createFamilyInvitation } from "@/features/family/service";
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
import { type NoticeActionInput, parseNoticeSchema } from "@/features/notices/schemas";
import { confirmNotice, setNoticeActionStatus } from "@/features/notices/service";
import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { createProfileSubjectActivity } from "@/features/profile-subject-activities/service";
import { joinPrivateGroup, removeGroupAdult } from "@/features/turmas/group-access";
import { createOrJoinTurma, setActiveTurma } from "@/features/turmas/service";
import type { ActivityOverviewOptions } from "@/features/unified-activities/overview-types";
import { getActivityOverview } from "@/features/unified-activities/service";
import { emails } from "@/lib/emails";

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
  subject: string,
  customerId: string;
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
  location: null,
  sourceExcerpt: null,
  assignedToUserId: null,
  reminderAt: null,
  recurrence: "none",
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
      location: null,
      sourceExcerpt: "Levar material",
    },
  ],
  warnings: [],
};
beforeEach(async () => {
  const prefix = `zz-review-fix-${randomUUID()}`;
  owner = `${prefix}-owner`;
  guest = `${prefix}-guest`;
  outsider = `${prefix}-other`;
  await db.insert(users).values(
    [owner, guest, outsider].map((id) => ({
      id,
      name: "Adulto fictício de revisão",
      email: `${id}@e2e.local`,
      emailVerified: true,
    })),
  );
  const [c] = await db
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
  customerId = required(c).id;
  await db.insert(subscriptions).values({
    customerId,
    provider: "stripe",
    providerSubscriptionId: `test-${owner}`,
    productId: "agenda_da_turma_pro_monthly",
    providerPriceId: "price_synthetic",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
  });
  const p = await db
    .insert(agendaStudentProfiles)
    .values([
      { userId: owner, name: "Criança A revisão" },
      { userId: owner, name: "Criança B restrita revisão" },
      { userId: outsider, name: "Criança C revisão" },
    ])
    .returning();
  child = required(p[0]).id;
  sibling = required(p[1]).id;
  otherChild = required(p[2]).id;
  const [city] = await db.select({ id: agendaCities.ibgeCode }).from(agendaCities).limit(1);
  school = `review-${randomUUID()}`;
  await db.insert(agendaSchools).values({
    inepCode: school,
    cityIbgeCode: required(city).id,
    name: "Escola fictícia de revisão",
  });
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
  const [s] = await db
    .insert(agendaSubjects)
    .values({ turmaId: group, name: "Matéria fictícia", createdByUserId: owner })
    .returning();
  subject = required(s).id;
  const [g] = await db.select().from(agendaTurmas).where(eq(agendaTurmas.id, group));
  await joinPrivateGroup(outsider, otherChild, required(g).code);
  const invite = value(
    await createFamilyInvitation(owner, { email: `${guest}@e2e.local`, profileIds: [child] }),
  );
  value(
    await acceptFamilyInvitation(
      guest,
      required(new URL(invite.url).searchParams.get("token") ?? undefined),
    ),
  );
  emails.clearOutbox();
});
afterEach(async () => {
  const ids = [owner, guest, outsider];
  await db.delete(agendaTurmas).where(eq(agendaTurmas.schoolInepCode, school));
  await db.delete(agendaSchools).where(eq(agendaSchools.inepCode, school));
  await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.userId, ids));
  await db.delete(emailDeliveries).where(inArray(emailDeliveries.userId, ids));
  await db.delete(creditReservations).where(inArray(creditReservations.ownerId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  await db.delete(subscriptions).where(eq(subscriptions.customerId, customerId));
  await db.delete(customers).where(eq(customers.id, customerId));
  emails.clearOutbox();
});
async function notice(text: string, profileId = child) {
  const [n] = await db
    .insert(agendaNotices)
    .values({
      ownerUserId: owner,
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
async function schoolActivity(
  visibility: "individual" | "shared_with_turma" = "shared_with_turma",
  description = "Conteúdo público",
) {
  return value(
    await createActivity(owner, {
      turmaId: group,
      subjectId: subject,
      type: "task",
      visibility,
      title: "Tarefa escolar de revisão",
      description,
      dueAt: date,
    }),
  );
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture row");
  return value;
}

describe("Review regressions", () => {
  it("unifies school, notebook and extra activities with global pagination and shared-child access", async () => {
    const schoolRecord = await schoolActivity("individual");
    const [extra] = await db
      .insert(agendaProfileSubjects)
      .values({ profileId: child, name: "Piano" })
      .returning();
    const extraRecord = value(
      await createProfileSubjectActivity(owner, {
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
      await confirmNotice(owner, {
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
      await confirmNotice(owner, {
        noticeId: null,
        actions: [action("Somente a irmã", sibling)],
        allowDuplicates: false,
      }),
    );
    const options: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: null,
      statusFilter: "pending",
      noticeId: null,
      page: 1,
    };
    const first = await getActivityOverview(owner, options);
    const second = await getActivityOverview(owner, { ...options, page: 2 });
    expect(first.items).toHaveLength(30);
    expect(first.hasNextPage).toBe(true);
    expect(second.items).toHaveLength(2);
    expect(second.hasNextPage).toBe(false);
    const combined = [...first.items, ...second.items];
    expect(new Set(combined.map((item) => item.key)).size).toBe(32);
    expect(combined.some((item) => item.item.sharedActivityId === schoolRecord.id)).toBe(true);
    expect(combined.some((item) => item.item.id === extraRecord.id)).toBe(true);
    expect(
      first.items.every(
        (item) => item.item.dueAt === null && item.item.noticeSource === "notebook",
      ),
    ).toBe(true);
    const projects = await getActivityOverview(owner, { ...options, typeFilter: "project" });
    expect(projects.items.map((item) => item.item.id)).toEqual([extraRecord.id]);
    expect(projects.hasNextPage).toBe(false);
    const exams = await getActivityOverview(guest, { ...options, typeFilter: "exam" });
    expect(exams.items).toHaveLength(30);
    expect(exams.hasNextPage).toBe(false);
    expect(
      (await getActivityOverview(guest, { ...options, profileFilter: sibling })).items,
    ).toHaveLength(0);
    expect((await getActivityOverview(outsider, options)).items).toHaveLength(0);
    // The action is accessible to the invited adult, but the original mentions a restricted sibling.
    expect(await getNoticeSource(guest, original.id)).toBeNull();
    expect(await listNoticeOriginals(guest, { page: 1 })).toHaveLength(0);
    expect(
      (await listNoticeOriginals(owner, { page: 1, profileId: sibling })).map((row) => row.id),
    ).toContain(original.id);
    const firstNotice = first.items.find((item) => item.item.noticeId !== null);
    if (!firstNotice) throw new Error("Missing notice activity");
    value(
      await setNoticeActionStatus(guest, {
        id: firstNotice.item.id,
        version: 1,
        status: "done",
      }),
    );
    const completed = await getActivityOverview(owner, {
      ...options,
      statusFilter: "done",
      noticeId: original.id,
    });
    expect(completed.items.map((item) => item.key)).toEqual([firstNotice.key]);
    expect((await listNoticeActions(owner, { noticeId: original.id })).length).toBe(29);
    expect(
      (await getActivityOverview(owner, { ...options, noticeId: original.id })).items,
    ).toHaveLength(29);
    expect(
      (await getActivityOverview(owner, { ...options, typeFilter: "material" })).items,
    ).toHaveLength(0);
  });

  it("filters activity types before pagination without expanding child access", async () => {
    const exams: string[] = [];
    for (const type of ["task", "exam", "project", "exam"] as const) {
      const activity = value(
        await createActivity(owner, {
          turmaId: group,
          subjectId: subject,
          type,
          visibility: "individual",
          title: `Atividade ${type}`,
          dueAt: date,
        }),
      );
      if (type === "exam") exams.push(activity.id);
    }
    const options: ActivityOverviewOptions = {
      profileFilter: child,
      typeFilter: "exam",
      statusFilter: "pending",
      noticeId: null,
      page: 1,
    };
    const filtered = await getActivityOverview(owner, options);
    expect(filtered.items.map((item) => item.item.sharedActivityId).sort()).toEqual(exams.sort());
    expect((await getActivityOverview(outsider, options)).items).toEqual([]);
    expect(
      (await getActivityOverview(owner, { ...options, profileFilter: sibling })).items,
    ).toEqual([]);
    const allTypes = await getActivityOverview(owner, { ...options, typeFilter: null });
    expect(allTypes.items).toHaveLength(4);
  });

  it("F01 edits the current version twice and rejects an actually stale edit", async () => {
    const a = await schoolActivity();
    const first = value(
      await updateActivity(owner, { ...a, description: "Primeira edição", version: a.version }),
    );
    const listed = await getActivityOverview(owner, {
      profileFilter: null,
      typeFilter: null,
      statusFilter: "pending",
      noticeId: null,
      page: 1,
    });
    const listedSchool = listed.items.find((item) => item.item.sharedActivityId === a.id);
    expect(listedSchool?.item.version).toBe(first.version);
    const second = value(
      await updateActivity(owner, {
        ...first,
        description: "Segunda edição",
        version: first.version,
      }),
    );
    expect(second.version).toBe(3);
    expect(
      await updateActivity(owner, { ...a, description: "Edição antiga", version: 1 }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  });
  it("F02 keeps private snapshots with the owning family and only publishes public snapshots", async () => {
    const a = await schoolActivity("individual", "SEGREDO FICTÍCIO PRIVADO");
    const privateEdit = value(
      await updateActivity(owner, { ...a, description: "SEGREDO PRIVADO 2", version: 1 }),
    );
    const published = value(
      await updateActivity(owner, {
        ...privateEdit,
        description: "Somente conteúdo público",
        visibility: "shared_with_turma",
        version: 2,
      }),
    );
    value(await respondSharedActivity(outsider, { activityId: a.id, accepted: true }));
    value(
      await updateActivity(owner, { ...published, description: "Correção pública", version: 3 }),
    );
    const history = await findActivityHistory(outsider, a.id);
    expect(history?.history).toHaveLength(2);
    expect(JSON.stringify(history)).not.toContain("SEGREDO");
    expect(JSON.stringify(history)).toContain("Somente conteúdo público");
    expect(JSON.stringify(history)).toContain("Correção pública");
    expect(JSON.stringify(await findActivityHistory(owner, a.id))).toContain(
      "SEGREDO FICTÍCIO PRIVADO",
    );
    expect(JSON.stringify(await findActivityHistory(guest, a.id))).toContain(
      "SEGREDO FICTÍCIO PRIVADO",
    );
  });
  it("F03 preserves recipient completion after accept, reject and creator deletion", async () => {
    const a = await schoolActivity();
    value(await respondSharedActivity(outsider, { activityId: a.id, accepted: true }));
    await db
      .update(agendaTasks)
      .set({ status: "done" })
      .where(eq(agendaTasks.profileId, otherChild));
    value(await respondSharedActivity(outsider, { activityId: a.id, accepted: false }));
    value(await deleteActivity(owner, { id: a.id }));
    const statuses = await db
      .select()
      .from(agendaTasks)
      .where(eq(agendaTasks.profileId, otherChild));
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe("done");
    expect((await findActivityHistory(outsider, a.id))?.activity.canceledAt).toBeInstanceOf(Date);
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
    for (const status of ["processing", "ready"] as const) {
      await db.update(agendaNotices).set({ status }).where(eq(agendaNotices.id, n.id));
      expect(await getNoticeSource(guest, n.id)).toBeNull();
      expect((await listReadyNotices(guest)).map((n) => n.id)).not.toContain(n.id);
      expect((await getNoticeSource(owner, n.id))?.attachmentData).toBe(original);
    }
    value(
      await confirmNotice(owner, {
        noticeId: n.id,
        actions: [action("Material A", child)],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    );
    expect(await getNoticeSource(guest, n.id)).toBeNull();
    expect(await listNoticeActions(guest)).toHaveLength(1);
  });
  it("F04 shares a reviewed single-child original and keeps its unknown scope private by default", async () => {
    const n = await notice("Material A");
    value(
      await confirmNotice(owner, { noticeId: n.id, actions: [action()], allowDuplicates: false }),
    );
    expect(await getNoticeSource(guest, n.id)).toBeNull();
    value(
      await confirmNotice(owner, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child],
        allowDuplicates: false,
      }),
    );
    expect((await getNoticeSource(guest, n.id))?.text).toBe("Material A");
    expect(await getNoticeSource(outsider, n.id)).toBeNull();
  });
  it("F04 allows the uploader to review their own draft but cannot grant access by narrowing its scope", async () => {
    const n = await notice("A e B");
    await db
      .update(agendaNotices)
      .set({ createdByUserId: guest })
      .where(eq(agendaNotices.id, n.id));
    expect((await getNoticeSource(guest, n.id))?.id).toBe(n.id);
    value(
      await confirmNotice(owner, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    );
    expect(
      await confirmNotice(guest, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_SOURCE_SCOPE" } });
    expect((await getNoticeSource(owner, n.id))?.sourceProfileIds).toEqual([child, sibling]);
  });
  it("F05 reuses one extraction for another child without duplicating either application", async () => {
    const n = await notice("Levar autorização");
    value(
      await confirmNotice(owner, {
        noticeId: n.id,
        actions: [action()],
        sourceProfileIds: [child],
        allowDuplicates: false,
      }),
    );
    const initiallyConfirmedAt = (await getNoticeSource(owner, n.id))?.confirmedAt;
    expect(initiallyConfirmedAt).toBeInstanceOf(Date);
    const input = parseNoticeSchema.parse({ profileId: sibling, source: "teams", text: n.text });
    const replay = value(
      await reserveNoticeParse({
        userId: owner,
        ownerId: owner,
        profileId: sibling,
        isPro: true,
        input,
        attachment: null,
        contentHash: n.contentHash,
        now: new Date(),
        trialDailyBudget: 100,
      }),
    );
    expect(replay.replay).toBe(true);
    expect(replay.notice.id).toBe(n.id);
    const result = value(
      await confirmNotice(owner, {
        noticeId: n.id,
        actions: [action("Providência de revisão", sibling)],
        sourceProfileIds: [child, sibling],
        allowDuplicates: false,
      }),
    );
    expect(result.alreadyConfirmed).toBe(false);
    expect(await listNoticeActions(owner, { profileId: sibling })).toHaveLength(1);
    for (const profileId of [child, sibling]) {
      expect(
        value(
          await confirmNotice(owner, {
            noticeId: n.id,
            actions: [action("Providência de revisão", profileId)],
            allowDuplicates: false,
          }),
        ).alreadyConfirmed,
      ).toBe(true);
    }
    expect(await listNoticeActions(owner)).toHaveLength(2);
    expect((await getNoticeSource(owner, n.id))?.confirmedAt).toEqual(initiallyConfirmedAt);
    expect(await getNoticeSource(guest, n.id)).toBeNull();
  });
  it("F06 requires a correction decision and updates one stable action with history and a new reminder", async () => {
    const n = await notice("Autorização até 14/09/2030");
    const first = value(
      await confirmNotice(owner, {
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
    expect(await confirmNotice(owner, input)).toMatchObject({
      ok: false,
      error: { code: "POSSIBLE_CORRECTIONS" },
    });
    expect(await listNoticeActions(owner)).toHaveLength(1);
    const saved = value(
      await confirmNotice(owner, {
        ...input,
        resolutions: [{ index: 0, kind: "replace", actionId: id, version: 1 }],
      }),
    );
    expect(saved.ids).toEqual([id]);
    const rows = await listNoticeActions(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toMatchObject({ id, dueAt: "2030-09-16", version: 2 });
    expect(rows[0]?.action.reminderAt?.toISOString()).toBe("2030-09-15T15:00:00.000Z");
    const history = await getNoticeActionHistory(owner, id);
    expect(history[0]?.previous.dueAt).toBe("2030-09-14");
    expect(history[0]?.current.dueAt).toBe("2030-09-16");
    const deliveries = await db
      .select()
      .from(agendaNotificationDeliveries)
      .where(eq(agendaNotificationDeliveries.userId, owner));
    expect(deliveries[0]?.status).toBe("canceled");
    value(
      await confirmNotice(owner, { noticeId: n.id, actions: [action()], allowDuplicates: false }),
    );
    expect((await listNoticeActions(owner)).map((r) => r.action.dueAt)).toEqual(["2030-09-16"]);
  });
  it("F06 preserves completed status and rejects a stale replacement version", async () => {
    const first = value(
      await confirmNotice(owner, { noticeId: null, actions: [action()], allowDuplicates: false }),
    );
    const id = required(first.ids[0]);
    value(await setNoticeActionStatus(owner, { id, version: 1, status: "done" }));
    const n = await notice("RETIFICAÇÃO: prazo novo");
    const input = {
      noticeId: n.id,
      actions: [{ ...action(), dueAt: "2030-09-16" }],
      allowDuplicates: false,
    };
    expect(
      await confirmNotice(owner, {
        ...input,
        resolutions: [{ index: 0, kind: "replace", actionId: id, version: 1 }],
      }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    value(
      await confirmNotice(owner, {
        ...input,
        resolutions: [{ index: 0, kind: "replace", actionId: id, version: 2 }],
      }),
    );
    expect(await listNoticeActions(owner)).toHaveLength(0);
    expect((await listNoticeActions(owner, { includeFinished: true }))[0]?.action).toMatchObject({
      id,
      status: "done",
      version: 3,
      dueAt: "2030-09-16",
    });
  });
  it("F06 allows an explicit decision to keep genuinely separate obligations", async () => {
    value(
      await confirmNotice(owner, { noticeId: null, actions: [action()], allowDuplicates: false }),
    );
    const n = await notice("Outro pedido para uma nova data");
    const input = {
      noticeId: n.id,
      actions: [{ ...action(), dueAt: "2030-09-16" }],
      allowDuplicates: false,
    };
    expect(await confirmNotice(owner, input)).toMatchObject({
      ok: false,
      error: { code: "POSSIBLE_CORRECTIONS" },
    });
    value(await confirmNotice(owner, { ...input, resolutions: [{ index: 0, kind: "separate" }] }));
    expect((await listNoticeActions(owner)).map((r) => r.action.dueAt).sort()).toEqual([
      "2030-09-14",
      "2030-09-16",
    ]);
  });
  it.each([
    "failed",
    "sent",
    "delivered",
  ] as const)("F07 defers interrupted/unknown mail without exhausting retries, then reconciles %s", async (resolvedStatus) => {
    const now = new Date("2030-09-13T15:00:00Z");
    const a = value(
      await confirmNotice(owner, {
        noticeId: null,
        actions: [{ ...action(), reminderAt: new Date(now.valueOf() - 20 * 60000).toISOString() }],
        allowDuplicates: false,
      }),
    );
    await db
      .insert(agendaNotificationPreferences)
      .values({ userId: owner, emailEnabled: true, digestHour: 19, quietStart: 21, quietEnd: 7 });
    const key = `action:${a.ids[0]}:v1`;
    const interruptedAttempt = resolvedStatus === "failed" ? 3 : 1;
    await db.insert(agendaNotificationDeliveries).values({
      userId: owner,
      messageKey: key,
      channel: "email",
      status: "processing",
      attempts: interruptedAttempt,
      lastAttemptAt: new Date(now.valueOf() - 11 * 60000),
    });
    await db.insert(emailDeliveries).values({
      id: randomUUID(),
      recipient: `${owner}@e2e.local`,
      category: "agenda.routine",
      messageKey: `agenda:${owner}:${key}`,
      subject: "Synthetic review reminder",
      userId: owner,
      status: "sending",
      sendingStartedAt: new Date(),
      sendAttempts: 1,
    });
    const options = { afterUserId: owner.slice(0, -5), limit: 1 };
    await deliverRoutineNotifications(now, options);
    await db
      .update(emailDeliveries)
      .set({ status: "unknown" })
      .where(eq(emailDeliveries.userId, owner));
    for (let attempt = 1; attempt <= 5; attempt++)
      await deliverRoutineNotifications(new Date(now.valueOf() + attempt * 11 * 60000), options);
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
    await deliverRoutineNotifications(new Date(now.valueOf() + 70 * 60000), options);
    expect(emails.getOutbox()).toHaveLength(resolvedStatus === "failed" ? 1 : 0);
    const finished = await db
      .select()
      .from(agendaNotificationDeliveries)
      .where(eq(agendaNotificationDeliveries.userId, owner));
    expect(finished[0]?.status).toBe("sent");
    await deliverRoutineNotifications(new Date(now.valueOf() + 85 * 60000), options);
    expect(emails.getOutbox()).toHaveLength(resolvedStatus === "failed" ? 1 : 0);
  });
  it("F08 ignores late completion and output from the replaced attempt", async () => {
    const input = parseNoticeSchema.parse({
      profileId: child,
      source: "teams",
      text: "Levar material",
    });
    const hash = randomUUID();
    const reserve = (now: Date) =>
      reserveNoticeParse({
        userId: owner,
        ownerId: owner,
        profileId: child,
        isPro: true,
        input,
        attachment: null,
        contentHash: hash,
        now,
        trialDailyBudget: 100,
      });
    const first = value(await reserve(new Date(Date.now() - 11 * 60000))).notice;
    const second = value(await reserve(new Date())).notice;
    const firstRun = required(first.billingRunId ?? undefined),
      secondRun = required(second.billingRunId ?? undefined);
    expect(secondRun).not.toBe(firstRun);
    expect(await finishNoticeParse(first.id, firstRun, "failed", "PARSE_FAILED")).toBe(false);
    await expect(persistNoticeExtraction(first.id, firstRun, extraction)).rejects.toThrow();
    let [row] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, second.id));
    expect(row?.billingRunId).toBe(secondRun);
    expect(row?.status).toBe("processing");
    await persistNoticeExtraction(second.id, secondRun, extraction);
    expect(await finishNoticeParse(second.id, secondRun, "ready")).toBe(true);
    expect(await finishNoticeParse(first.id, firstRun, "ready")).toBe(false);
    [row] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, second.id));
    expect(row?.status).toBe("ready");
    expect(row?.parsedResult).toEqual(extraction);
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
    const reactivate = setActiveTurma(outsider, { profileId: otherChild, turmaId: group });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      release();
    }
    await removal;
    expect(await reactivate).toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });
    expect(
      (await listPendingSharedActivitiesForUser(outsider)).map((x) => x.activityId),
    ).not.toContain(a.id);
  });
  it("F09 revocation and activation share the same lock and stale preferences grant no read/write access", async () => {
    const a = await schoolActivity();
    await Promise.all([
      removeGroupAdult(owner, group, outsider),
      setActiveTurma(outsider, { profileId: otherChild, turmaId: group }),
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
      (await listPendingSharedActivitiesForUser(outsider)).map((x) => x.activityId),
    ).not.toContain(a.id);
    expect(
      (
        await createActivity(outsider, {
          turmaId: group,
          subjectId: subject,
          type: "task",
          visibility: "individual",
          title: "Sem acesso",
          dueAt: date,
        })
      ).ok,
    ).toBe(false);
    expect((await respondSharedActivity(outsider, { activityId: a.id, accepted: true })).ok).toBe(
      false,
    );
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
