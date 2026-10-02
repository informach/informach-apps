import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import { missaoAttempts, users } from "@informach/db/schema";
import { afterAll, expect, it } from "vitest";
import { findLesson } from "@/features/content/catalog";
import { independenceProgress, skillStates } from "@/features/learning/engine";
import { history, recordAnswer } from "@/features/learning/repository";
import { begin, createProfile } from "@/features/learning/service";

const owners: string[] = [];
afterAll(async () => {
  await db.delete(users).where(inArray(users.id, owners));
});
it("enforces separate recovery days on the server, preserves fresh evidence and respects course access", async () => {
  const owner = randomUUID();
  owners.push(owner);
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Recuperação",
    emailVerified: true,
  });
  const profile = await createProfile(owner, {
    nickname: "Sol",
    grade: 6,
    avatar: "cometa",
    courseId: "olitef-n1",
    consent: true,
  });
  const first = findLesson("fracoes-recuperacao-1");
  const second = findLesson("fracoes-recuperacao-2");
  if (!first || !second) throw new Error("Missing recovery");
  const open = (id: string) =>
    begin(owner, { profileId: profile.id, lessonId: id, mode: "review", requestKey: randomUUID() });
  await expect(open(second.id)).rejects.toMatchObject({ code: "RECOVERY_DATE" });
  await expect(open("funcoes-recuperacao-1")).rejects.toMatchObject({ code: "COURSE" });
  await expect(open("orcamento-recuperacao-1")).rejects.toMatchObject({ code: "PLAN" });
  const a = await open(first.id);
  for (const item of first.items)
    await recordAnswer(owner, {
      sessionId: a.id,
      itemId: item.id,
      answer:
        item.type === "numeric"
          ? String(item.grading.value)
          : item.type === "choice"
            ? item.answer
            : "",
      requestKey: randomUUID(),
    });
  await expect(open(second.id)).rejects.toMatchObject({ code: "RECOVERY_DATE" });
  await db
    .update(missaoAttempts)
    .set({ createdAt: new Date(Date.now() - 86_400_000) })
    .where(eq(missaoAttempts.sessionId, a.id));
  const b = await open(second.id);
  for (const item of second.items)
    await recordAnswer(owner, {
      sessionId: b.id,
      itemId: item.id,
      answer:
        item.type === "numeric"
          ? String(item.grading.value)
          : item.type === "choice"
            ? item.answer
            : "",
      requestKey: randomUUID(),
    });
  const data = await history(owner, profile.id);
  expect(skillStates(data.evidence)[0]).toMatchObject({
    level: "independent",
    independentFamilies: 3,
  });
  expect(independenceProgress(data.evidence, "fracoes")).toEqual({
    families: 3,
    days: 2,
    missingFamilies: 0,
    missingDays: 0,
  });
});
