import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import { missaoContentControls, users } from "@informach/db/schema";
import { afterAll, describe, expect, it } from "vitest";
import { assessment, findCourse, findLesson } from "@/features/content/catalog";
import { contentHash, itemHash } from "@/features/content/version";
import { recordContentControl } from "@/features/content-maintenance/repository";
import { weekStart } from "@/features/family/desafio";
import {
  familyChallenge,
  history,
  previousAssessment,
  recordAnswer,
  setFamilyChallenge,
  startSession,
} from "@/features/learning/repository";
import { begin, changeCourse, createProfile, sessionView } from "@/features/learning/service";

const owners: string[] = [];

async function family(courseId = "canguru-e") {
  const owner = randomUUID();
  owners.push(owner);
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Revisão funcional",
    emailVerified: true,
  });
  const profile = await createProfile(owner, {
    nickname: "Sol",
    grade: 6,
    avatar: "cometa",
    courseId,
    consent: true,
  });
  return { owner, profile };
}

afterAll(async () => {
  await db.delete(missaoContentControls).where(inArray(missaoContentControls.actorId, owners));
  await db.delete(users).where(inArray(users.id, owners));
});

describe("regressões da revisão funcional", () => {
  it("permite reler a sessão interrompida pela troca de trilha, sem reabrir respostas", async () => {
    const { owner, profile } = await family();
    const session = await begin(owner, {
      profileId: profile.id,
      lessonId: "diagnostic:canguru-e",
      mode: "diagnostic",
      requestKey: randomUUID(),
    });
    await changeCourse(owner, profile.id, "obmep-n1");
    const view = await sessionView(owner, session.id);
    expect(view).toMatchObject({ interrupted: true, interruptionReason: "A trilha mudou" });
    const first = view.lesson.items[0];
    if (!first) throw new Error("Missing diagnostic fixture");
    await expect(
      recordAnswer(owner, {
        sessionId: session.id,
        itemId: first.id,
        answer: "__skip__",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INTERRUPTED" });
    const stranger = await family();
    await expect(sessionView(stranger.owner, session.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("retira do desafio apenas a versão invalidada e preserva a atividade corrigida", async () => {
    const { owner, profile } = await family();
    const lesson = findLesson("fracoes-1");
    const item = lesson?.items[0];
    if (!lesson || !item || item.type !== "choice") throw new Error("Missing choice fixture");
    const week = weekStart(new Date());
    await setFamilyChallenge(owner, week, 4);
    const session = await startSession(owner, profile.id, lesson, "mission", randomUUID());
    await recordAnswer(owner, {
      sessionId: session.id,
      itemId: item.id,
      answer: item.answer,
      requestKey: randomUUID(),
    });
    expect((await familyChallenge(owner, week)).progress).toBe(1);
    await recordContentControl({
      lessonId: lesson.id,
      version: lesson.version,
      contentHash: contentHash(lesson),
      status: "invalidated",
      invalidatedItems: [{ itemId: item.id, itemHash: itemHash(item) }],
      actorId: owner,
      note: "Erro confirmado na versão anterior desta atividade.",
    });
    expect((await history(owner, profile.id)).evidence).toHaveLength(0);
    expect(await familyChallenge(owner, week)).toMatchObject({ progress: 0, contributions: [] });
    const corrected = {
      ...lesson,
      version: lesson.version + 1,
      items: lesson.items.map((entry) =>
        entry.id === item.id ? { ...entry, prompt: `${entry.prompt} Dados revisados.` } : entry,
      ),
    };
    const correctedSession = await startSession(
      owner,
      profile.id,
      corrected,
      "mission",
      randomUUID(),
    );
    await recordAnswer(owner, {
      sessionId: correctedSession.id,
      itemId: item.id,
      answer: item.answer,
      requestKey: randomUUID(),
    });
    expect((await familyChallenge(owner, week)).progress).toBe(1);
    await db.delete(missaoContentControls).where(eq(missaoContentControls.actorId, owner));
  });

  it("exclui a atividade invalidada da comparação com a avaliação anterior", async () => {
    const { owner, profile } = await family();
    const course = findCourse("canguru-e");
    if (!course) throw new Error("Missing course fixture");
    const lesson = assessment(course, "diagnostic");
    const session = await startSession(owner, profile.id, lesson, "diagnostic", randomUUID());
    for (const item of lesson.items) {
      if (item.type !== "choice") throw new Error("Expected diagnostic choices");
      await recordAnswer(owner, {
        sessionId: session.id,
        itemId: item.id,
        answer: item.answer,
        requestKey: randomUUID(),
      });
    }
    const item = lesson.items[0];
    if (!item) throw new Error("Missing diagnostic item");
    const before = new Date(session.createdAt.getTime() + 86_400_000);
    const previous = await previousAssessment(owner, profile.id, "diagnostic", before);
    const original = previous?.counts[item.skillId];
    if (!original) throw new Error("Missing previous assessment counts");
    await recordContentControl({
      lessonId: lesson.id,
      version: lesson.version,
      contentHash: contentHash(lesson),
      status: "invalidated",
      invalidatedItems: [{ itemId: item.id, itemHash: itemHash(item) }],
      actorId: owner,
      note: "Questão da avaliação invalidada após conferência do relato.",
    });
    const after = await previousAssessment(owner, profile.id, "diagnostic", before);
    expect(after?.counts[item.skillId] ?? { correct: 0, total: 0 }).toEqual({
      correct: original.correct - 1,
      total: original.total - 1,
    });
  });
});
