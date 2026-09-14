import { randomUUID } from "node:crypto";
import { db, eq, inArray, sql } from "@informach/db";
import {
  customers,
  missaoAttempts,
  missaoContentControls,
  missaoProfiles,
  missaoSessions,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withBillingLifecycle } from "@/features/billing/repository";
import { getAccess } from "@/features/billing/service";
import {
  assessment,
  assessmentSources,
  courseAssessmentBanks,
  courseLessons,
  courses,
  findContentUnit,
  findLesson,
} from "@/features/content/catalog";
import { lessonSchema } from "@/features/content/types";
import { contentHash, itemHash } from "@/features/content/version";
import { recordContentControl } from "@/features/content-maintenance/repository";
import { getExperiments, saveExperiment } from "@/features/labs/repository";
import {
  clearFamily,
  exportFamily,
  getProfiles,
  history,
  saveNote,
  sessionHistory,
  startSession,
} from "@/features/learning/repository";
import {
  answer,
  begin,
  createProfile,
  dashboard,
  hint,
  interrupt,
  sessionView,
} from "@/features/learning/service";

const owner = randomUUID();
const stranger = randomUUID();
const input = {
  nickname: "Sol",
  grade: 6,
  avatar: "cometa" as const,
  courseId: "olitef-n1",
  consent: true,
};
let profileId = "";
afterAll(async () => {
  await db.delete(missaoContentControls).where(eq(missaoContentControls.actorId, owner));
});
beforeAll(async () => {
  await db.insert(users).values([
    { id: owner, email: `a-${owner}@example.test`, name: "Responsible A", emailVerified: true },
    {
      id: stranger,
      email: `b-${stranger}@example.test`,
      name: "Responsible B",
      emailVerified: true,
    },
  ]);
  profileId = (await createProfile(owner, input)).id;
});
describe("isolated PostgreSQL learning", () => {
  it("isolates profile ownership and serializes the free profile limit", async () => {
    const results = await Promise.allSettled([
      createProfile(stranger, input),
      createProfile(stranger, { ...input, nickname: "Lua" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getProfiles(stranger)).toHaveLength(1);
    await expect(
      begin(stranger, {
        profileId,
        lessonId: "fracoes-1",
        mode: "mission",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PROFILE" });
  });
  it("starts and answers once under concurrent replay, with real server grading", async () => {
    const request = { profileId, lessonId: "fracoes-1", mode: "mission", requestKey: randomUUID() };
    const [a, b] = await Promise.all([begin(owner, request), begin(owner, request)]);
    expect(a.id).toBe(b.id);
    const lesson = findLesson("fracoes-1");
    const item = lesson?.items[0];
    if (item?.type !== "choice") throw new Error("Missing fixture item");
    const response = {
      sessionId: a.id,
      itemId: item.id,
      answer: item.answer,
      requestKey: randomUUID(),
    };
    await Promise.all([answer(owner, response), answer(owner, response)]);
    const view = await sessionView(owner, a.id);
    expect(view.saved).toHaveLength(1);
    expect(view.saved[0]?.feedback?.correct).toBe(true);
    expect(view.lesson.items[0]).not.toHaveProperty("answer");
    expect(view.lesson.items[0]).not.toHaveProperty("hints");
    await expect(answer(owner, { ...response, requestKey: randomUUID() })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(sessionView(stranger, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(answer(stranger, response)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      answer(owner, { ...response, itemId: "fracoes-1-6", requestKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "ORDER" });
  });
  it("counts delivered hints even after replay and resume", async () => {
    const session = await begin(owner, {
      profileId,
      lessonId: "fracoes-2",
      mode: "mission",
      requestKey: randomUUID(),
    });
    const first = findLesson("fracoes-2")?.items[0];
    if (first?.type !== "choice") throw new Error("Missing fixture");
    const request = { sessionId: session.id, itemId: first.id, level: 1 };
    expect(await hint(owner, request)).toHaveLength(1);
    expect(await hint(owner, request)).toHaveLength(1);
    await expect(hint(owner, { ...request, level: 3 })).rejects.toMatchObject({ code: "ORDER" });
    const view = await answer(owner, {
      sessionId: session.id,
      itemId: first.id,
      answer: first.answer,
      requestKey: randomUUID(),
    });
    expect(view.saved[0]?.helpCount).toBe(1);
    expect((await sessionView(owner, session.id)).hints[first.id]).toHaveLength(1);
  });
  it("counts a skipped reflection as an attempted item for journey progression", async () => {
    const lesson = findLesson("fracoes-formatos");
    if (!lesson) throw new Error("Missing format lesson");
    const session = await begin(owner, {
      profileId,
      lessonId: lesson.id,
      mode: "mission",
      requestKey: randomUUID(),
    });
    let view = await sessionView(owner, session.id);
    for (const item of lesson.items) {
      const response =
        item.type === "choice"
          ? item.answer
          : item.type === "numeric"
            ? `${item.grading.value}${item.grading.unit?.required ? ` ${item.grading.unit.symbol}` : ""}`
            : item.type === "ordering"
              ? JSON.stringify(
                  item.grading.mode === "exact"
                    ? item.grading.order
                    : item.steps.map((step) => step.id),
                )
              : "__skip__";
      view = await answer(owner, {
        sessionId: session.id,
        itemId: item.id,
        answer: response,
        requestKey: randomUUID(),
      });
    }
    expect(view.completed).toBe(true);
    const data = await dashboard(owner, profileId);
    expect(data.attemptedItemIds).toEqual(
      expect.arrayContaining(lesson.items.map((item) => item.id)),
    );
    expect(data.evidence.some((row) => row.itemId === lesson.items.at(-1)?.id)).toBe(false);
  });
  it("embargoes diagnostic correction in view, history and export until completion", async () => {
    const session = await begin(owner, {
      profileId,
      lessonId: "diagnostic:olitef-n1",
      mode: "diagnostic",
      requestKey: randomUUID(),
    });
    const first = (await sessionView(owner, session.id)).lesson.items[0];
    if (!first) throw new Error("Missing assessment");
    await answer(owner, {
      sessionId: session.id,
      itemId: first.id,
      answer: "__skip__",
      requestKey: randomUUID(),
    });
    expect((await sessionView(owner, session.id)).saved[0]).toMatchObject({
      feedback: null,
      result: null,
    });
    expect(
      (await history(owner, profileId)).evidence.filter((r) => r.sessionId === session.id),
    ).toHaveLength(0);
    expect(
      (await exportFamily(owner)).attempts.find((r) => r.sessionId === session.id),
    ).toMatchObject({ correct: null, result: null });
    await expect(
      hint(owner, { sessionId: session.id, itemId: first.id, level: 1 }),
    ).rejects.toMatchObject({ code: "MODE" });
    let view = await sessionView(owner, session.id);
    for (const item of view.lesson.items.slice(1))
      view = await answer(owner, {
        sessionId: session.id,
        itemId: item.id,
        answer: "__skip__",
        requestKey: randomUUID(),
      });
    expect(view.completed).toBe(true);
    expect(view.saved.every((r) => r.feedback !== null)).toBe(true);
    expect(view.nextStep).not.toBeNull();
    expect(
      (await exportFamily(owner)).attempts.find((r) => r.sessionId === session.id)?.correct,
    ).not.toBeNull();
  });
  it("rejects unpaid content and preserves historical sessions after cancellation", async () => {
    await expect(
      begin(owner, {
        profileId,
        lessonId: "porcentagem-1",
        mode: "mission",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PLAN" });
    const [customer] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_fixture_${owner}`,
        subjectType: "user",
        subjectId: owner,
        app: "cozya",
        email: `a-${owner}@example.test`,
      })
      .returning();
    if (!customer) throw new Error("Missing customer");
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        productId: "cozya_pro_monthly",
        providerPriceId: "price_fixture",
        provider: "stripe",
        providerSubscriptionId: `sub_fixture_${owner}`,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!subscription) throw new Error("Missing subscription");
    expect((await getAccess(owner)).paid).toBe(false);
    await db.update(customers).set({ app: "missao-saber" }).where(eq(customers.id, customer.id));
    await db
      .update(subscriptions)
      .set({ productId: "missao_family_monthly" })
      .where(eq(subscriptions.id, subscription.id));
    expect(await getAccess(owner)).toMatchObject({ paid: true, profileLimit: 3 });
    const session = await begin(owner, {
      profileId,
      lessonId: "porcentagem-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    const frozenView = await sessionView(owner, session.id);
    const frozen = frozenView.lesson.title;
    const firstItem = findLesson("porcentagem-1")?.items[0];
    if (!firstItem) throw new Error("Missing paid item fixture");
    await db
      .update(subscriptions)
      .set({ status: "past_due" })
      .where(eq(subscriptions.id, subscription.id));
    expect((await getAccess(owner)).paid).toBe(false);
    await expect(sessionView(owner, session.id)).rejects.toMatchObject({ code: "PLAN" });
    await expect(
      answer(owner, {
        sessionId: session.id,
        itemId: firstItem.id,
        answer: firstItem.type === "choice" ? firstItem.answer : "0",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PLAN" });
    await expect(
      hint(owner, { sessionId: session.id, itemId: firstItem.id, level: 1 }),
    ).rejects.toMatchObject({ code: "PLAN" });
    await expect(
      begin(owner, {
        profileId,
        lessonId: "porcentagem-2",
        mode: "mission",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PLAN" });
    await db
      .update(subscriptions)
      .set({ status: "active" })
      .where(eq(subscriptions.id, subscription.id));
    const paidLesson = findLesson("porcentagem-1");
    if (!paidLesson) throw new Error("Missing paid lesson fixture");
    for (const item of paidLesson.items) {
      await answer(owner, {
        sessionId: session.id,
        itemId: item.id,
        answer: "__skip__",
        requestKey: randomUUID(),
      });
    }
    await db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.id, subscription.id));
    expect((await sessionView(owner, session.id)).lesson.title).toBe(frozen);
    await db
      .update(subscriptions)
      .set({ status: "active" })
      .where(eq(subscriptions.id, subscription.id));
  });
  it("separates exam grading from public delivery and ignores mode tampering", async () => {
    const course = courses[0];
    if (!course) throw new Error("Missing course");
    await expect(
      begin(owner, {
        profileId,
        lessonId: "porcentagem-1",
        mode: "diagnostic",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "LESSON" });
    const session = await begin(owner, {
      profileId,
      lessonId: `exam:${course.id}`,
      mode: "exam",
      requestKey: randomUUID(),
    });
    const first = (await sessionView(owner, session.id)).lesson.items[0];
    if (!first) throw new Error("Missing exam");
    const view = await answer(owner, {
      sessionId: session.id,
      itemId: first.id,
      answer: "__skip__",
      requestKey: randomUUID(),
    });
    expect(view.saved[0]).toMatchObject({ feedback: null, result: null });
    expect((await history(owner, profileId)).evidence.some((r) => r.sessionId === session.id)).toBe(
      false,
    );
    expect(
      (await exportFamily(owner)).attempts.find((r) => r.sessionId === session.id)?.correct,
    ).toBeNull();
  });
  it("persists all four activity formats without turning reflection into objective evidence", async () => {
    const lesson = findLesson("fracoes-formatos");
    if (!lesson) throw new Error("Missing format lesson");
    const session = await begin(owner, {
      profileId,
      lessonId: lesson.id,
      mode: "mission",
      requestKey: randomUUID(),
    });
    const initial = await sessionView(owner, session.id);
    for (const item of initial.lesson.items) {
      expect(item).not.toHaveProperty("answer");
      expect(item).not.toHaveProperty("grading");
      expect(item).not.toHaveProperty("rubric");
      expect(item).not.toHaveProperty("sampleResponse");
    }
    let view = initial;
    for (const item of lesson.items) {
      const response =
        item.type === "choice"
          ? item.answer
          : item.type === "numeric"
            ? "1/2 m"
            : item.type === "ordering"
              ? JSON.stringify(["divide", "part", "multiply", "result"])
              : "Usei denominador 40 e comparei 25/40 com 24/40 para justificar a ordem.";
      const requestKey = randomUUID();
      view = await answer(owner, {
        sessionId: session.id,
        itemId: item.id,
        answer: response,
        requestKey,
      });
      if (item.type === "numeric")
        expect(
          await answer(owner, {
            sessionId: session.id,
            itemId: item.id,
            answer: response,
            requestKey,
          }),
        ).toMatchObject({ id: session.id });
    }
    expect(view.completed).toBe(true);
    expect(view.saved.map((saved) => saved.result)).toEqual([
      "correct",
      "correct",
      "correct",
      "reflection",
    ]);
    expect(view.saved.at(-1)?.feedback).toMatchObject({ correct: null });
    expect(
      (await history(owner, profileId)).evidence.filter((row) => row.sessionId === session.id),
    ).toHaveLength(3);
    const exported = await exportFamily(owner);
    expect(
      exported.attempts.find(
        (row) => row.sessionId === session.id && row.itemId === "fracoes-formatos-4",
      ),
    ).toMatchObject({ correct: null, result: "reflection" });
  });
  it("revalidates billing and profile position inside the repository start lock", async () => {
    const paidLesson = findLesson("porcentagem-1");
    if (!paidLesson) throw new Error("Missing paid fixture");
    const paidFirst = paidLesson.items[0];
    if (!paidFirst) throw new Error("Missing paid item fixture");
    const [customer] = await db.select().from(customers).where(eq(customers.subjectId, owner));
    if (!customer) throw new Error("Missing billing fixture");
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id));
    if (!subscription) throw new Error("Missing subscription fixture");
    const second = await createProfile(owner, { ...input, nickname: "Lua" });
    try {
      const secondOpen = await startSession(owner, second.id, paidLesson, "mission", randomUUID());
      await db
        .update(subscriptions)
        .set({ productId: "missao_individual_monthly" })
        .where(eq(subscriptions.id, subscription.id));
      expect((await dashboard(owner, second.id)).profileAllowed).toBe(false);
      await expect(
        startSession(owner, second.id, paidLesson, "mission", randomUUID()),
      ).rejects.toMatchObject({ code: "PROFILE_LIMIT" });
      await expect(sessionView(owner, secondOpen.id)).rejects.toMatchObject({
        code: "PROFILE_LIMIT",
      });
      const raceSession = await startSession(owner, profileId, paidLesson, "mission", randomUUID());
      let unlock = () => {};
      let markLocked = () => {};
      const locked = new Promise<void>((resolve) => {
        markLocked = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const downgrade = withBillingLifecycle(owner, async () => {
        await db
          .update(subscriptions)
          .set({ status: "past_due" })
          .where(eq(subscriptions.id, subscription.id));
        markLocked();
        await hold;
      });
      await locked;
      const rejectedStart = expect(
        startSession(owner, profileId, paidLesson, "mission", randomUUID()),
      ).rejects.toMatchObject({ code: "PLAN" });
      const rejectedAnswer = expect(
        answer(owner, {
          sessionId: raceSession.id,
          itemId: paidFirst.id,
          answer: "__skip__",
          requestKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "PLAN" });
      unlock();
      await downgrade;
      await rejectedStart;
      await rejectedAnswer;
    } finally {
      await db
        .update(subscriptions)
        .set({ status: "active", productId: "missao_family_monthly" })
        .where(eq(subscriptions.id, subscription.id));
      await db.delete(missaoProfiles).where(eq(missaoProfiles.id, second.id));
    }
  });
  it("uses only available assessment sources and invalidates one mixed item precisely", async () => {
    const course = courses[0];
    if (!course) throw new Error("Missing course");
    const unused = courseLessons(course).find((lesson) => lesson.skillId === "fracoes");
    const used = courseAssessmentBanks(course).find((lesson) => lesson.id.startsWith("bank:exam:"));
    if (!unused || !used || unused.id === used.id) throw new Error("Missing source fixtures");
    await recordContentControl({
      lessonId: unused.id,
      version: unused.version,
      contentHash: contentHash(unused),
      status: "suspended",
      actorId: owner,
      note: "Pause a source that the current assessment would not select",
    });
    const session = await begin(owner, {
      profileId,
      lessonId: `exam:${course.id}`,
      mode: "exam",
      requestKey: randomUUID(),
    });
    const [stored] = await db
      .select({ snapshot: missaoSessions.snapshot })
      .from(missaoSessions)
      .where(eq(missaoSessions.id, session.id));
    const snapshot = lessonSchema.parse(stored?.snapshot);
    expect(assessmentSources(snapshot).some((source) => source.id === unused.id)).toBe(false);
    expect(assessmentSources(snapshot).some((source) => source.id === used.id)).toBe(true);
    expect((await history(owner, profileId)).assessmentExposedFamilyIds).toContain(
      snapshot.items[0]?.familyId,
    );
    let view = await sessionView(owner, session.id);
    for (const item of view.lesson.items)
      view = await answer(owner, {
        sessionId: session.id,
        itemId: item.id,
        answer: "__skip__",
        requestKey: randomUUID(),
      });
    const selected = assessment(course, "exam", new Set([unused.id])).items[0];
    if (!selected?.source) throw new Error("Missing item provenance");
    expect(selected.id).toBe(snapshot.items[0]?.id);
    expect(itemHash(selected)).toBe(itemHash(snapshot.items[0] as typeof selected));
    const source = findContentUnit(selected.source.lessonId);
    if (!source) throw new Error("Missing selected source");
    expect(
      (await history(owner, profileId)).evidence.filter((row) => row.sessionId === session.id),
    ).toHaveLength(snapshot.items.length);
    await recordContentControl({
      lessonId: source.id,
      version: source.version,
      contentHash: contentHash(source),
      status: "suspended",
      invalidatedItems: [{ itemId: selected.id, itemHash: itemHash(selected) }],
      actorId: owner,
      note: "Confirmed one incorrect activity and invalidate only its frozen evidence",
    });
    const after = (await history(owner, profileId)).evidence.filter(
      (row) => row.sessionId === session.id,
    );
    expect(after).toHaveLength(snapshot.items.length - 1);
    expect(after.some((row) => row.itemId === selected.id)).toBe(false);
    await expect(
      begin(owner, {
        profileId,
        lessonId: `exam:${course.id}`,
        mode: "exam",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "WITHDRAWN" });
    const legacySnapshot = {
      ...snapshot,
      version: 1,
      items: snapshot.items.map(({ source: _source, ...item }) => item),
    };
    const [legacySession] = await db
      .insert(missaoSessions)
      .values({
        profileId,
        lessonId: snapshot.id,
        version: 1,
        mode: "exam",
        requestKey: randomUUID(),
        snapshot: legacySnapshot,
        completedAt: new Date(),
      })
      .returning();
    if (!legacySession) throw new Error("Missing legacy assessment session");
    expect((await sessionView(owner, legacySession.id)).suspended).toBe(true);
    for (const lesson of [unused, source])
      await recordContentControl({
        lessonId: lesson.id,
        version: lesson.version,
        contentHash: contentHash(lesson),
        status: "available",
        actorId: owner,
        note: "Restore the assessment source after the maintenance scenario",
      });
  });
  it("closes a suspended partial session idempotently without manufacturing completion", async () => {
    const lesson = findLesson("fracoes-1");
    if (!lesson) throw new Error("Missing lesson");
    const session = await begin(owner, {
      profileId,
      lessonId: lesson.id,
      mode: "mission",
      requestKey: randomUUID(),
    });
    const first = lesson.items[0];
    const second = lesson.items[1];
    if (first?.type !== "choice" || second?.type !== "choice") throw new Error("Missing items");
    await answer(owner, {
      sessionId: session.id,
      itemId: first.id,
      answer: first.answer,
      requestKey: randomUUID(),
    });
    await recordContentControl({
      lessonId: lesson.id,
      version: lesson.version,
      contentHash: contentHash(lesson),
      status: "suspended",
      invalidatedItems: [{ itemId: first.id, itemHash: itemHash(first) }],
      actorId: owner,
      note: "Suspend after a partial answer to verify the safe interruption path",
    });
    expect((await sessionView(owner, session.id)).suspended).toBe(true);
    const interrupted = await interrupt(owner, session.id);
    expect(interrupted).toMatchObject({ completed: false, interrupted: true });
    expect((await interrupt(owner, session.id)).interrupted).toBe(true);
    await expect(
      answer(owner, {
        sessionId: session.id,
        itemId: second.id,
        answer: second.answer,
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INTERRUPTED" });
    const exported = await exportFamily(owner);
    expect(exported.sessions.find((row) => row.id === session.id)).toMatchObject({
      completedAt: null,
      interruptionReason: "Conteúdo pausado para correção",
    });
    expect(exported.attempts.some((row) => row.sessionId === session.id)).toBe(true);
    expect(
      (await history(owner, profileId)).evidence.some((row) => row.sessionId === session.id),
    ).toBe(false);
    await recordContentControl({
      lessonId: lesson.id,
      version: lesson.version,
      contentHash: contentHash(lesson),
      status: "available",
      actorId: owner,
      note: "Restore the lesson after testing interrupted session handling",
    });
    expect((await sessionView(owner, session.id)).interrupted).toBe(true);
  });
  it("keeps a suspension across content changes and stores immutable snapshots", async () => {
    const lesson = findLesson("porcentagem-2");
    if (!lesson) throw new Error("Missing lesson");
    await recordContentControl({
      lessonId: lesson.id,
      version: 1,
      contentHash: "0".repeat(64),
      status: "suspended",
      actorId: owner,
      note: "Pause remains active independently from the current content hash",
    });
    await expect(
      begin(owner, { profileId, lessonId: lesson.id, mode: "mission", requestKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "WITHDRAWN" });
    await recordContentControl({
      lessonId: lesson.id,
      version: lesson.version,
      contentHash: contentHash(lesson),
      status: "available",
      actorId: owner,
      note: "Correction verified and mission explicitly made available again",
    });
    const resumed = await begin(owner, {
      profileId,
      lessonId: lesson.id,
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(resumed.lessonId).toBe(lesson.id);
    const existing = await db
      .select()
      .from(missaoSessions)
      .where(eq(missaoSessions.profileId, profileId));
    const stored = existing.find((session) => session.id === resumed.id);
    expect(stored?.version).toBe(lesson.version);
    expect(typeof stored?.snapshot.title).toBe("string");
  });
  it("resumes saved experiments and refuses stale concurrent writes or foreign profiles", async () => {
    const state = { kind: "grid" as const, cells: Array<boolean>(20).fill(true) };
    state.cells[0] = false;
    expect(await saveExperiment(owner, profileId, state, 0)).toBe(1);
    expect(await saveExperiment(owner, profileId, { cells: state.cells, kind: "grid" }, 0)).toBe(1);
    expect((await getExperiments(owner, profileId)).grid?.state).toEqual(state);
    expect(await getExperiments(stranger, profileId)).toEqual({});
    await expect(saveExperiment(stranger, profileId, state, 1)).rejects.toMatchObject({
      code: "PROFILE",
    });
    const changed = { ...state, cells: Array<boolean>(20).fill(false) };
    await expect(saveExperiment(owner, profileId, changed, 0)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await saveExperiment(owner, profileId, changed, 1)).toBe(2);
    expect((await exportFamily(owner)).experiments).toHaveLength(1);
  });
  it("retains paused sessions beyond thirty completions and pages all summaries without answer snapshots", async () => {
    const historyOwner = randomUUID();
    await db
      .insert(users)
      .values({ id: historyOwner, email: `${historyOwner}@example.test`, name: "History test" });
    const historyProfile = (await createProfile(historyOwner, input)).id;
    const lesson = findLesson("fracoes-1");
    if (!lesson) throw new Error("Missing fixture");
    try {
      const [paused] = await db
        .insert(missaoSessions)
        .values({
          profileId: historyProfile,
          lessonId: lesson.id,
          version: lesson.version,
          snapshot: lesson,
          mode: "mission",
          requestKey: randomUUID(),
          createdAt: new Date("2024-01-01Z"),
        })
        .returning();
      if (!paused) throw new Error("Missing paused session");
      const completed = await db
        .insert(missaoSessions)
        .values(
          Array.from({ length: 35 }, (_, i) => ({
            profileId: historyProfile,
            lessonId: lesson.id,
            version: lesson.version,
            snapshot: lesson,
            mode: "mission" as const,
            requestKey: randomUUID(),
            completedAt: new Date(),
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
          })),
        )
        .returning();
      await db
        .update(missaoSessions)
        .set({ createdAt: sql`'2026-09-13T15:00:00.123456Z'::timestamptz` })
        .where(
          inArray(
            missaoSessions.id,
            completed.map((session) => session.id),
          ),
        );
      await db.insert(missaoAttempts).values(
        completed.flatMap((session) =>
          lesson.items.map((item) => ({
            sessionId: session.id,
            itemId: item.id,
            skillId: item.skillId,
            familyId: item.familyId,
            answer: item.type === "choice" ? item.answer : "__skip__",
            correct: true,
            helpCount: 0,
            id: randomUUID(),
          })),
        ),
      );
      const summary = await history(historyOwner, historyProfile);
      expect(summary.recent.some((s) => s.id === paused.id)).toBe(false);
      expect(summary.paused?.id).toBe(paused.id);
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await sessionHistory(historyOwner, historyProfile, cursor);
        for (const item of page.items) {
          expect(item).not.toHaveProperty("snapshot");
          ids.push(item.id);
        }
        cursor = page.next ?? undefined;
      } while (cursor);
      expect(ids).toContain(paused.id);
      expect(new Set(ids).size).toBe(36);
      expect(ids).toHaveLength(36);
      await expect(sessionHistory(stranger, historyProfile)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect((await getAccess(historyOwner)).paid).toBe(false);
      expect((await sessionView(historyOwner, paused.id)).id).toBe(paused.id);
    } finally {
      await db.delete(users).where(eq(users.id, historyOwner));
    }
  });
  it("cascades only the chosen family's pedagogical data", async () => {
    await saveNote(owner, profileId, "Uma referência muda o resultado.");
    const otherProfiles = await getProfiles(stranger);
    await clearFamily(owner);
    expect((await exportFamily(owner)).attempts).toHaveLength(0);
    expect(await getProfiles(owner)).toHaveLength(0);
    expect(await getProfiles(stranger)).toEqual(otherProfiles);
    expect(await db.select().from(users).where(eq(users.id, owner))).toHaveLength(1);
    expect(await db.select().from(customers).where(eq(customers.subjectId, owner))).toHaveLength(1);
  });
});
