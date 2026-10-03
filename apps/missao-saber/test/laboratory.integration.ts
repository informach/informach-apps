import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  customers,
  missaoLabExecutions,
  missaoNotes,
  missaoProfiles,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterAll, expect, it } from "vitest";
import { findLesson } from "@/features/content/catalog";
import { getExperiments, saveExperiment } from "@/features/labs/repository";
import { experiencesForItem, labExperiences } from "@/features/labs/runtime/catalog";
import { laboratoryReport } from "@/features/labs/runtime/family-report";
import {
  assessLab,
  labToNotebook,
  listLabs,
  readLab,
  readLabNote,
  saveLab,
  startLab,
} from "@/features/labs/runtime/repository";
import {
  exportFamily,
  history,
  notebookPage,
  recordAnswer,
  startSession,
} from "@/features/learning/repository";
import { createProfile } from "@/features/learning/service";

const owners: string[] = [];
async function family() {
  const owner = randomUUID();
  owners.push(owner);
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Laboratório",
    emailVerified: true,
  });
  const profile = await createProfile(owner, {
    nickname: "Sol",
    grade: 6,
    avatar: "cometa",
    courseId: "canguru-e",
    consent: true,
  });
  return { owner, profile };
}
const experience = labExperiences.find((entry) => entry.lessonId === "fracoes-1");
if (!experience) throw new Error("Missing laboratory fixture");
const experienceId = experience.id;
afterAll(async () => {
  if (owners.length) await db.delete(users).where(inArray(users.id, owners));
});

it("creates multiple independent runs, retries idempotently, and blocks other owners/profiles", async () => {
  const { owner, profile } = await family();
  const other = await family();
  const input = { profileId: profile.id, experienceId, id: randomUUID() };
  const run = await startLab(owner, input);
  expect((await startLab(owner, input)).id).toBe(run.id);
  await startLab(owner, { ...input, id: randomUUID() });
  expect(await listLabs(owner, profile.id)).toHaveLength(2);
  await expect(readLab(other.owner, { profileId: profile.id, id: run.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(readLab(owner, { profileId: other.profile.id, id: run.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    saveLab(other.owner, {
      profileId: profile.id,
      id: run.id,
      revision: run.revision,
      document: run.document,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(startLab(other.owner, input)).rejects.toMatchObject({ code: "PROFILE" });
  expect((await exportFamily(owner)).labExecutions).toHaveLength(2);
});

it("rejects unavailable exact paths, grades, malformed tool states and stale revisions", async () => {
  const { owner, profile } = await family();
  const forbidden = labExperiences.find((entry) => entry.lessonId === "fracoes-5");
  if (!forbidden) throw new Error("Missing fixture");
  await expect(
    startLab(owner, { profileId: profile.id, experienceId: forbidden.id, id: randomUUID() }),
  ).rejects.toMatchObject({ code: "LAB_ACCESS" });
  const run = await startLab(owner, { profileId: profile.id, experienceId, id: randomUUID() });
  const input = {
    profileId: profile.id,
    id: run.id,
    revision: run.revision,
    document: { ...run.document, prediction: "Metade do inteiro" },
  };
  const saved = await saveLab(owner, input);
  expect(saved.revision).toBe(2);
  expect((await saveLab(owner, input)).revision).toBe(2);
  await expect(
    saveLab(owner, { ...input, document: { ...run.document, prediction: "Outro aparelho" } }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    saveLab(owner, {
      ...input,
      revision: 2,
      document: { ...run.document, state: { forged: true } },
    }),
  ).rejects.toThrow();
  await db
    .update(missaoLabExecutions)
    .set({ version: 2 })
    .where(eq(missaoLabExecutions.id, run.id));
  await expect(readLab(owner, { profileId: profile.id, id: run.id })).rejects.toMatchObject({
    code: "LAB_VERSION",
  });
  await expect(saveLab(owner, { ...input, revision: 2 })).rejects.toMatchObject({
    code: "LAB_VERSION",
  });
  await db
    .update(missaoLabExecutions)
    .set({ version: 1 })
    .where(eq(missaoLabExecutions.id, run.id));
  await db
    .update(missaoProfiles)
    .set({ grade: 3, courseId: "canguru-p" })
    .where(eq(missaoProfiles.id, profile.id));
  await expect(readLab(owner, { profileId: profile.id, id: run.id })).rejects.toMatchObject({
    code: "LAB_ACCESS",
  });
  await expect(saveLab(owner, { ...input, revision: 2 })).rejects.toMatchObject({
    code: "LAB_ACCESS",
  });
  expect(await listLabs(owner, profile.id)).toEqual([]);
});

it("freezes notebook snapshots and clones the saved montage after the live run changes", async () => {
  const { owner, profile } = await family();
  const run = await startLab(owner, { profileId: profile.id, experienceId, id: randomUUID() });
  await saveLab(owner, {
    profileId: profile.id,
    id: run.id,
    revision: 1,
    document: { ...run.document, explanation: "As partes precisam ter o mesmo tamanho." },
  });
  const noteId = randomUUID();
  const noteInput = { profileId: profile.id, id: run.id, noteId, revision: 2 };
  await labToNotebook(owner, noteInput);
  await labToNotebook(owner, noteInput);
  const before = (await notebookPage(owner, profile.id)).items;
  expect(before).toHaveLength(1);
  expect(before[0]?.labAttachment?.document.explanation).toBe(
    "As partes precisam ter o mesmo tamanho.",
  );
  await saveLab(owner, {
    profileId: profile.id,
    id: run.id,
    revision: 2,
    document: { ...run.document, explanation: "Segunda investigação" },
  });
  // A lost response may retry the old intent, but its ID cannot claim to have
  // saved a newer revision. A new snapshot receives a new request ID.
  expect(await labToNotebook(owner, noteInput)).toEqual({ id: noteId });
  await expect(labToNotebook(owner, { ...noteInput, revision: 3 })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect((await readLabNote(owner, profile.id, noteId)).document.explanation).toBe(
    "As partes precisam ter o mesmo tamanho.",
  );
  const clone = await startLab(owner, {
    profileId: profile.id,
    experienceId,
    id: randomUUID(),
    noteId,
  });
  expect(clone.document.explanation).toBe("As partes precisam ter o mesmo tamanho.");
  expect(clone.id).not.toBe(run.id);
  const [note] = await db.select().from(missaoNotes).where(eq(missaoNotes.id, noteId));
  expect(note?.labAttachment).toEqual(before[0]?.labAttachment);
  // The same lesson can be eligible in another year; copying must retain the
  // original authored numbers/constraints rather than reinterpret the saved work.
  await db.update(missaoProfiles).set({ grade: 5 }).where(eq(missaoProfiles.id, profile.id));
  const laterNoteCopy = await startLab(owner, {
    profileId: profile.id,
    experienceId,
    id: randomUUID(),
    noteId,
  });
  const laterRunCopy = await startLab(owner, {
    profileId: profile.id,
    experienceId,
    id: randomUUID(),
    duplicateId: run.id,
  });
  expect(laterNoteCopy.grade).toBe(6);
  expect(laterRunCopy.grade).toBe(6);
  expect(laterNoteCopy.activity).toEqual(run.activity);
  expect((await readLabNote(owner, profile.id, noteId)).grade).toBe(6);
});

it("records assistance before mission exploration, keeps reserved items out and never grants mastery", async () => {
  const { owner, profile } = await family();
  const lesson = findLesson("fracoes-1");
  if (!lesson?.items[0]) throw new Error("Missing fixture");
  const session = await startSession(owner, profile.id, lesson, "mission", randomUUID());
  const context = { sessionId: session.id, itemId: lesson.items[0].id };
  const linked = experiencesForItem(lesson.id, context.itemId)[0];
  if (!linked) throw new Error("Missing mission tool");
  const request = { profileId: profile.id, experienceId: linked.id, id: randomUUID(), context };
  const run = await startLab(owner, request);
  await expect(
    assessLab(owner, { profileId: profile.id, id: run.id, revision: 1, variant: 1 }),
  ).rejects.toMatchObject({ code: "LAB_ANSWER" });
  await saveLab(owner, {
    profileId: profile.id,
    id: run.id,
    revision: 1,
    document: { ...run.document, transferAnswer: "0" },
  });
  const oldUpdate = new Date("2000-01-01T12:00:00Z");
  await db
    .update(missaoLabExecutions)
    .set({ updatedAt: oldUpdate })
    .where(eq(missaoLabExecutions.id, run.id));
  const assessed = await assessLab(owner, {
    profileId: profile.id,
    id: run.id,
    revision: 2,
    variant: 1,
  });
  expect(new Date(assessed.updatedAt).getTime()).toBeGreaterThan(oldUpdate.getTime());
  expect((await readLab(owner, { profileId: profile.id, id: run.id })).updatedAt).toBe(
    assessed.updatedAt,
  );
  const noteId = randomUUID();
  await labToNotebook(owner, { profileId: profile.id, id: run.id, revision: 2, noteId });
  const note = await readLabNote(owner, profile.id, noteId);
  expect(note.missionContext).toMatchObject({ ...context, prompt: lesson.items[0].prompt });
  expect(note.question).toBe(run.activity.prompt);
  expect(note.transfer?.question).toBe(run.transfer.prompt);
  expect(note.transfer?.summary).not.toBe(note.summary);
  expect((await history(owner, profile.id)).evidence).toHaveLength(0);
  await recordAnswer(owner, {
    sessionId: session.id,
    itemId: context.itemId,
    answer: "__skip__",
    requestKey: randomUUID(),
  });
  expect((await history(owner, profile.id)).evidence[0]?.helpCount).toBe(1);
  expect((await startLab(owner, request)).id).toBe(run.id);
  await expect(
    startLab(owner, {
      ...request,
      id: randomUUID(),
      context: { ...context, itemId: "reserved-item" },
    }),
  ).rejects.toMatchObject({ code: "LAB_CONTEXT" });
  const [stored] = await db
    .select()
    .from(missaoLabExecutions)
    .where(eq(missaoLabExecutions.id, run.id));
  expect(stored?.context).toEqual(context);
});

it("resumes one mission investigation across new request IDs and concurrent opens, without replacing it with copies", async () => {
  const { owner, profile } = await family();
  const lesson = findLesson("fracoes-1");
  if (!lesson?.items[0]) throw new Error("Missing mission");
  const session = await startSession(owner, profile.id, lesson, "mission", randomUUID());
  const context = { sessionId: session.id, itemId: lesson.items[0].id };
  const linked = experiencesForItem(lesson.id, context.itemId)[0];
  if (!linked) throw new Error("Missing mission tool");
  const input = { profileId: profile.id, experienceId: linked.id, context };
  const [first, concurrent] = await Promise.all([
    startLab(owner, { ...input, id: randomUUID() }),
    startLab(owner, { ...input, id: randomUUID() }),
  ]);
  expect(concurrent.id).toBe(first.id);
  await saveLab(owner, {
    profileId: profile.id,
    id: first.id,
    revision: 1,
    document: { ...first.document, prediction: "Comparar as partes", transferHelp: true },
  });
  const copy = await startLab(owner, {
    profileId: profile.id,
    id: randomUUID(),
    experienceId: linked.id,
    duplicateId: first.id,
  });
  expect(copy.id).not.toBe(first.id);
  const resumed = await startLab(owner, { ...input, id: randomUUID() });
  expect(resumed.id).toBe(first.id);
  expect(resumed.document).toMatchObject({ prediction: "Comparar as partes", transferHelp: true });
  expect(await listLabs(owner, profile.id)).toHaveLength(2);
  await expect(
    startLab(owner, { ...input, id: randomUUID(), duplicateId: first.id }),
  ).rejects.toMatchObject({ code: "LAB_CONTEXT" });
});

it("reports recent milestones even when more than forty older investigations were edited later", async () => {
  const { owner, profile } = await family();
  const run = await startLab(owner, { profileId: profile.id, id: randomUUID(), experienceId });
  const old = "2025-01-01T12:00:00.000Z";
  const recent = "2026-10-02T12:00:00.000Z";
  await db
    .update(missaoLabExecutions)
    .set({
      events: [{ kind: "explored", at: recent, revision: 1, summary: "Descoberta recente" }],
      updatedAt: new Date(recent),
    })
    .where(eq(missaoLabExecutions.id, run.id));
  await db.insert(missaoLabExecutions).values(
    Array.from({ length: 45 }, () => ({
      id: randomUUID(),
      profileId: profile.id,
      experienceId,
      version: 1,
      grade: 6,
      courseId: "canguru-e",
      document: run.document,
      updatedAt: new Date("2026-10-03T12:00:00.000Z"),
      events: [{ kind: "explored" as const, at: old, revision: 1, summary: "Descoberta antiga" }],
    })),
  );
  const report = await laboratoryReport(owner, profile.id, new Date("2026-10-01T00:00:00.000Z"));
  expect(report).toHaveLength(1);
  expect(report[0]).toMatchObject({ id: run.id, summary: "Descoberta recente", date: recent });
  expect((await laboratoryReport(owner, profile.id))[0]?.id).toBe(run.id);
  const other = await family();
  expect(await laboratoryReport(other.owner, profile.id)).toEqual([]);
});

it("preserves legacy experiments when new runs are created and edited", async () => {
  const { owner, profile } = await family();
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_lab_${randomUUID()}`,
      subjectType: "user",
      subjectId: owner,
      app: "missao-saber",
      email: `${owner}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing test customer");
  await db.insert(subscriptions).values({
    customerId: customer.id,
    productId: "missao_family_monthly",
    provider: "stripe",
    providerSubscriptionId: `sub_lab_${randomUUID()}`,
    providerPriceId: "price_local",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  const state = {
    kind: "grid" as const,
    cells: Array.from({ length: 20 }, (_, index) => index < 8),
    previsao: "Mesmo contorno?",
    observacao: "Há lados compartilhados.",
  };
  await saveExperiment(owner, profile.id, state, 0);
  await startLab(owner, { profileId: profile.id, experienceId, id: randomUUID() });
  const target = labExperiences.find(
    (entry) => entry.lessonId === "medidas-1" && entry.mode === "area-e-contorno",
  );
  if (!target) throw new Error("Missing legacy import target");
  const request = {
    profileId: profile.id,
    experienceId: target.id,
    id: randomUUID(),
    legacyKind: "grid" as const,
  };
  const imported = await startLab(owner, request);
  expect((await startLab(owner, request)).id).toBe(imported.id);
  expect(imported.document.prediction).toBe(state.previsao);
  expect(imported.document.observation).toBe(state.observacao);
  const cells = imported.document.state.cells as boolean[];
  expect(cells.filter(Boolean)).toHaveLength(8);
  expect(cells.slice(0, 12)).toEqual([
    true,
    true,
    true,
    true,
    true,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
  ]);
  const [row] = await db
    .select()
    .from(missaoLabExecutions)
    .where(eq(missaoLabExecutions.id, imported.id));
  expect(row?.legacy).toMatchObject({ version: 1, revision: 1, state });
  expect((await getExperiments(owner, profile.id)).grid?.state).toEqual(state);
});

it("binds create tokens to their source and handles more concurrent families than the query pool", async () => {
  const families = await Promise.all(Array.from({ length: 12 }, () => family()));
  const rows = await Promise.all(
    families.map(({ owner, profile }) =>
      startLab(owner, { profileId: profile.id, experienceId, id: randomUUID() }),
    ),
  );
  expect(new Set(rows.map((row) => row.id)).size).toBe(12);
  const first = families[0];
  const run = rows[0];
  if (!first || !run) throw new Error("Missing family");
  await expect(
    startLab(first.owner, {
      profileId: first.profile.id,
      experienceId,
      id: run.id,
      duplicateId: run.id,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
