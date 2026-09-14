import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  events as auditEvents,
  customers,
  missaoContentControls,
  missaoFamilies,
  missaoProfiles,
  missaoReports,
  missaoSessions,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findLesson } from "@/features/content/catalog";
import { contentHash, itemHash } from "@/features/content/version";
import {
  contentReports,
  recordContentControl,
  reportHistory,
  updateReport,
} from "@/features/content-maintenance/repository";
import { invalidateReportedVersion } from "@/features/content-maintenance/service";
import {
  history,
  readSession,
  recordAnswer,
  saveReport,
  startSession,
} from "@/features/learning/repository";
import { productMetrics } from "@/features/product-metrics/repository";
import { env } from "@/lib/env";

const owner = randomUUID();
const stranger = randomUUID();
let profileId = "";

beforeAll(async () => {
  await db.insert(users).values([
    { id: owner, email: `${owner}@example.test`, name: "Observation owner", emailVerified: true },
    { id: stranger, email: `${stranger}@example.test`, name: "Other owner", emailVerified: true },
  ]);
  await db.insert(missaoFamilies).values([
    { userId: owner, consentVersion: "test" },
    { userId: stranger, consentVersion: "test" },
  ]);
  const [profile] = await db
    .insert(missaoProfiles)
    .values({
      userId: owner,
      nickname: "Sol",
      grade: 6,
      avatar: "cometa",
      courseId: "olitef-n1",
    })
    .returning({ id: missaoProfiles.id });
  if (!profile) throw new Error("Profile fixture was not created");
  profileId = profile.id;
});

afterAll(async () => {
  await db.delete(missaoReports).where(eq(missaoReports.userId, owner));
  await db.delete(missaoContentControls).where(eq(missaoContentControls.actorId, owner));
  await db.delete(users).where(inArray(users.id, [owner, stranger]));
});

describe("family observation and content maintenance", () => {
  it("records an idempotent contextual report only for the session owner and keeps support history", async () => {
    const lesson = findLesson("fracoes-1");
    if (!lesson || !profileId) throw new Error("Missing authored fixture");
    const session = await startSession(owner, profileId, lesson, "mission", randomUUID());
    const itemId = lesson.items[0]?.id;
    if (!itemId) throw new Error("Missing item fixture");
    const request = {
      sessionId: session.id,
      itemId,
      category: "not_understood" as const,
      detail: "",
      requestKey: randomUUID(),
    };
    const first = await saveReport(owner, request);
    expect((await saveReport(owner, request)).id).toBe(first.id);
    expect((await saveReport(owner, { ...request, requestKey: randomUUID() })).id).toBe(first.id);
    expect((await readSession(owner, session.id)).sessionReports).toContainEqual({
      itemId,
      category: "not_understood",
      detail: "",
    });
    await expect(
      saveReport(owner, { ...request, category: "possible_error" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      saveReport(stranger, { ...request, requestKey: randomUUID() }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const queued = (await contentReports()).find((report) => report.id === first.id);
    expect(queued).toMatchObject({
      profileId,
      sessionId: session.id,
      profileNickname: "Sol",
      recurrence: 1,
      status: "open",
    });
    await updateReport(owner, first.id, "investigating", "Conferindo a clareza do enunciado.");
    await updateReport(owner, first.id, "resolved", "Explicação ajustada na próxima versão.");
    expect((await reportHistory([first.id])).map((row) => row.status)).toEqual([
      "investigating",
      "resolved",
    ]);
    expect((await contentReports()).some((report) => report.id === first.id)).toBe(false);
    expect((await contentReports("resolved")).some((report) => report.id === first.id)).toBe(true);
  });

  it("consults and invalidates the reported old snapshot after a corrected version exists", async () => {
    const lesson = findLesson("fracoes-2");
    if (!lesson || !profileId) throw new Error("Missing authored fixture");
    const firstItem = lesson.items[0];
    if (!firstItem || firstItem.type !== "choice") throw new Error("Missing choice fixture");
    const oldSession = await startSession(owner, profileId, lesson, "mission", randomUUID());
    await recordAnswer(owner, {
      sessionId: oldSession.id,
      itemId: firstItem.id,
      answer: firstItem.answer,
      requestKey: randomUUID(),
    });
    expect(
      (await history(owner, profileId)).evidence.some((row) => row.sessionId === oldSession.id),
    ).toBe(true);
    const corrected = {
      ...lesson,
      version: lesson.version + 1,
      items: lesson.items.map((item, index) =>
        index === 0 ? { ...item, prompt: `${item.prompt} Considere os dados revisados.` } : item,
      ),
    };
    await recordContentControl({
      lessonId: corrected.id,
      version: corrected.version,
      contentHash: contentHash(corrected),
      status: "available",
      invalidatedItems: [],
      actorId: owner,
      note: "Nova versão corrigida e disponível para novas sessões.",
    });
    const newSession = await startSession(owner, profileId, corrected, "mission", randomUUID());
    const report = await saveReport(owner, {
      sessionId: oldSession.id,
      itemId: firstItem.id,
      category: "possible_error",
      detail: "A resposta desta versão parece contradizer a explicação.",
      requestKey: randomUUID(),
    });
    const queued = (await contentReports()).find((candidate) => candidate.id === report.id);
    expect(queued?.snapshot).toEqual(lesson);
    const previousManagers = env.MISSAO_CONTENT_MANAGER_EMAILS;
    env.MISSAO_CONTENT_MANAGER_EMAILS = `${owner}@example.test`;
    try {
      await invalidateReportedVersion(owner, {
        reportId: report.id,
        note: "Erro confirmado somente no item da versão anterior relatada.",
      });
    } finally {
      env.MISSAO_CONTENT_MANAGER_EMAILS = previousManagers;
    }
    const [storedOld, storedNew] = await Promise.all([
      db.select().from(missaoSessions).where(eq(missaoSessions.id, oldSession.id)),
      db.select().from(missaoSessions).where(eq(missaoSessions.id, newSession.id)),
    ]);
    expect(storedOld[0]?.version).toBe(lesson.version);
    expect(storedNew[0]?.version).toBe(corrected.version);
    expect(storedOld[0]?.snapshot).not.toEqual(storedNew[0]?.snapshot);
    expect((await history(owner, profileId)).evidence).toHaveLength(0);
    const [invalidation] = await db
      .select()
      .from(missaoContentControls)
      .where(eq(missaoContentControls.contentHash, contentHash(lesson)));
    expect(invalidation).toMatchObject({
      status: "invalidated",
      invalidatedItems: [{ itemId: firstItem.id, itemHash: itemHash(firstItem) }],
    });
    await expect(
      startSession(owner, profileId, corrected, "mission", randomUUID()),
    ).resolves.toBeDefined();
  });

  it("computes the product funnel and week-two retention while excluding configured technical accounts", async () => {
    const technical = randomUUID();
    const family = randomUUID();
    const technicalEmail = `${technical}@example.test`;
    const auditIds = [randomUUID(), randomUUID()];
    const baseline = await productMetrics([technicalEmail]);
    try {
      await db.insert(users).values([
        { id: family, email: `${family}@example.test`, name: "Family metric" },
        { id: technical, email: technicalEmail, name: "Technical metric" },
      ]);
      await db.insert(missaoFamilies).values([
        { userId: family, consentVersion: "test", createdAt: new Date("2026-08-01T12:00:00Z") },
        { userId: technical, consentVersion: "test", createdAt: new Date("2026-08-01T12:00:00Z") },
      ]);
      const metricProfiles = await db
        .insert(missaoProfiles)
        .values(
          [family, technical].map((userId) => ({
            userId,
            nickname: "Metric",
            grade: 6,
            avatar: "cometa",
            courseId: "olitef-n1",
          })),
        )
        .returning({ id: missaoProfiles.id, userId: missaoProfiles.userId });
      const lesson = findLesson("fracoes-1");
      if (!lesson) throw new Error("Missing metric fixture");
      await db.insert(missaoSessions).values(
        metricProfiles.flatMap((profile) => [
          {
            profileId: profile.id,
            lessonId: lesson.id,
            version: lesson.version,
            mode: "mission" as const,
            snapshot: lesson,
            requestKey: randomUUID(),
            completedAt: new Date("2026-08-20T12:00:00Z"),
          },
          {
            profileId: profile.id,
            lessonId: lesson.id,
            version: lesson.version,
            mode: "mission" as const,
            snapshot: lesson,
            requestKey: randomUUID(),
            completedAt: new Date("2026-08-28T12:00:00Z"),
          },
        ]),
      );
      const [familyAuditId, technicalAuditId] = auditIds;
      if (!familyAuditId || !technicalAuditId) throw new Error("Missing audit fixtures");
      await db.insert(auditEvents).values([
        {
          id: familyAuditId,
          eventType: "billing.checkout_started",
          actorId: family,
          payload: { productId: "missao_family_monthly" },
        },
        {
          id: technicalAuditId,
          eventType: "billing.checkout_started",
          actorId: technical,
          payload: { productId: "missao_family_monthly" },
        },
      ]);
      const metricCustomers = await db
        .insert(customers)
        .values(
          [family, technical].map((subjectId) => ({
            provider: "stripe" as const,
            providerCustomerId: `cus_metric_${subjectId}`,
            subjectType: "user" as const,
            subjectId,
            app: "missao-saber",
            email: `${subjectId}@example.test`,
          })),
        )
        .returning();
      await db.insert(subscriptions).values(
        metricCustomers.map((customer) => ({
          customerId: customer.id,
          provider: "stripe" as const,
          providerSubscriptionId: `sub_metric_${customer.subjectId}`,
          productId: "missao_family_monthly",
          providerPriceId: "price_metric",
          status: "active" as const,
          currentPeriodStart: new Date("2026-08-20T12:00:00Z"),
          currentPeriodEnd: new Date("2026-09-20T12:00:00Z"),
          confirmedAt: new Date("2026-08-20T12:00:00Z"),
        })),
      );

      const current = await productMetrics([technicalEmail]);
      expect(current.families - baseline.families).toBe(1);
      expect(current.firstProfiles - baseline.firstProfiles).toBe(1);
      expect(current.firstMissions - baseline.firstMissions).toBe(1);
      expect(current.checkoutStarted - baseline.checkoutStarted).toBe(1);
      expect(current.subscriptionConfirmed - baseline.subscriptionConfirmed).toBe(1);
      expect(current.retentionEligible - baseline.retentionEligible).toBe(1);
      expect(current.returnedWeekTwo - baseline.returnedWeekTwo).toBe(1);
      expect(current.excludedTechnicalAccounts).toBe(1);
    } finally {
      await db.delete(auditEvents).where(inArray(auditEvents.id, auditIds));
      await db
        .delete(subscriptions)
        .where(
          inArray(subscriptions.providerSubscriptionId, [
            `sub_metric_${family}`,
            `sub_metric_${technical}`,
          ]),
        );
      await db.delete(customers).where(inArray(customers.subjectId, [family, technical]));
      await db.delete(users).where(inArray(users.id, [family, technical]));
    }
  });

  it("counts only a durable confirmation milestone after cancellation", async () => {
    const neverConfirmed = randomUUID();
    const confirmed = randomUUID();
    const baseline = await productMetrics([]);
    try {
      await db.insert(users).values([
        { id: neverConfirmed, email: `${neverConfirmed}@example.test`, name: "No payment" },
        { id: confirmed, email: `${confirmed}@example.test`, name: "Paid then canceled" },
      ]);
      const rows = await db
        .insert(customers)
        .values(
          [neverConfirmed, confirmed].map((subjectId) => ({
            provider: "stripe" as const,
            providerCustomerId: `cus_confirm_${subjectId}`,
            subjectType: "user" as const,
            subjectId,
            app: "missao-saber",
            email: `${subjectId}@example.test`,
          })),
        )
        .returning();
      const confirmedCustomer = rows.find((row) => row.subjectId === confirmed);
      if (!confirmedCustomer) throw new Error("Missing confirmed customer");
      await db.insert(subscriptions).values([
        ...rows.map((customer) => ({
          customerId: customer.id,
          provider: "stripe" as const,
          providerSubscriptionId: `sub_confirm_${customer.subjectId}`,
          productId: "missao_individual_monthly",
          providerPriceId: "price_metric",
          status: "canceled" as const,
          currentPeriodStart: new Date("2026-09-01T12:00:00Z"),
          currentPeriodEnd: new Date("2026-10-01T12:00:00Z"),
          confirmedAt: customer.subjectId === confirmed ? new Date("2026-09-01T12:00:00Z") : null,
        })),
        {
          customerId: confirmedCustomer.id,
          provider: "stripe" as const,
          providerSubscriptionId: `sub_confirm_second_${confirmed}`,
          productId: "missao_family_monthly",
          providerPriceId: "price_metric_second",
          status: "canceled" as const,
          currentPeriodStart: new Date("2026-09-02T12:00:00Z"),
          currentPeriodEnd: new Date("2026-10-02T12:00:00Z"),
          confirmedAt: new Date("2026-09-02T12:00:00Z"),
        },
      ]);
      expect(
        (await productMetrics([])).subscriptionConfirmed - baseline.subscriptionConfirmed,
      ).toBe(1);
    } finally {
      await db
        .delete(subscriptions)
        .where(
          inArray(subscriptions.providerSubscriptionId, [
            `sub_confirm_${neverConfirmed}`,
            `sub_confirm_${confirmed}`,
            `sub_confirm_second_${confirmed}`,
          ]),
        );
      await db.delete(customers).where(inArray(customers.subjectId, [neverConfirmed, confirmed]));
      await db.delete(users).where(inArray(users.id, [neverConfirmed, confirmed]));
    }
  });

  it("waits until day 14 and counts returns only on local calendar days 7 through 13", async () => {
    const members = Array.from({ length: 4 }, () => randomUUID());
    const day13 = new Date("2026-09-13T12:00:00Z");
    const day14 = new Date("2026-09-14T03:00:00Z");
    const before13 = await productMetrics([], day13);
    const before14 = await productMetrics([], day14);
    try {
      await db
        .insert(users)
        .values(
          members.map((id) => ({ id, email: `${id}@example.test`, name: "Retention boundary" })),
        );
      await db
        .insert(missaoFamilies)
        .values(members.map((userId) => ({ userId, consentVersion: "test" })));
      const metricProfiles = await db
        .insert(missaoProfiles)
        .values(
          members.map((userId) => ({
            userId,
            nickname: "Boundary",
            grade: 6,
            avatar: "cometa",
            courseId: "olitef-n1",
          })),
        )
        .returning({ id: missaoProfiles.id, userId: missaoProfiles.userId });
      const lesson = findLesson("fracoes-1");
      if (!lesson) throw new Error("Missing retention lesson");
      const returnTimes = [
        "2026-09-07T02:30:00Z",
        "2026-09-08T02:30:00Z",
        "2026-09-14T02:30:00Z",
        "2026-09-15T02:30:00Z",
      ];
      await db.insert(missaoSessions).values(
        metricProfiles.flatMap((profile, index) => [
          {
            profileId: profile.id,
            lessonId: lesson.id,
            version: lesson.version,
            mode: "mission" as const,
            snapshot: lesson,
            requestKey: randomUUID(),
            completedAt: new Date("2026-09-01T02:30:00Z"),
          },
          {
            profileId: profile.id,
            lessonId: lesson.id,
            version: lesson.version,
            mode: "mission" as const,
            snapshot: lesson,
            requestKey: randomUUID(),
            completedAt: new Date(returnTimes[index] ?? "2026-09-07T02:30:00Z"),
          },
        ]),
      );
      const on13 = await productMetrics([], day13);
      expect(on13.retentionEligible - before13.retentionEligible).toBe(0);
      const on14 = await productMetrics([], day14);
      expect(on14.retentionEligible - before14.retentionEligible).toBe(4);
      expect(on14.returnedWeekTwo - before14.returnedWeekTwo).toBe(2);
    } finally {
      await db.delete(users).where(inArray(users.id, members));
    }
  });
});
