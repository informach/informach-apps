import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import { missaoAttempts, missaoProfiles, missaoSessions, users } from "@informach/db/schema";
import { afterAll, describe, expect, it } from "vitest";
import { schoolYear } from "@/features/family/school-year";
import { answer, begin, createProfile, dashboard, sessionView } from "@/features/learning/service";

const owners: string[] = [];
async function family() {
  const owner = randomUUID();
  owners.push(owner);
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Revisão pedagógica",
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

afterAll(async () => {
  if (owners.length) await db.delete(users).where(inArray(users.id, owners));
});

describe("revisão 16: continuidade e condições da avaliação", () => {
  it("retoma a missão compartilhada na virada do ano antes de iniciar outra sessão", async () => {
    const { owner, profile } = await family();
    const session = await begin(owner, {
      profileId: profile.id,
      lessonId: "fracoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    const before = await sessionView(owner, session.id);
    const first = before.lesson.items[0];
    const second = before.lesson.items[1];
    if (!first || !second) throw new Error("Missing fraction activities");
    await answer(owner, {
      sessionId: session.id,
      itemId: first.id,
      answer: "__skip__",
      requestKey: randomUUID(),
    });
    await db
      .update(missaoProfiles)
      .set({ gradeYear: schoolYear() - 1 })
      .where(eq(missaoProfiles.id, profile.id));
    const panel = await dashboard(owner, profile.id);
    expect(panel.course?.id).toBe("canguru-b");
    expect(panel.paused?.id).toBe(session.id);
    // Merely rendering the new school year has not changed the stored course.
    const [stored] = await db
      .select()
      .from(missaoProfiles)
      .where(eq(missaoProfiles.id, profile.id));
    expect(stored?.courseId).toBe("canguru-e");
    const resumed = await sessionView(owner, session.id);
    expect(resumed.saved).toHaveLength(1);
    expect(resumed.lesson).toEqual(before.lesson);
    const continued = await answer(owner, {
      sessionId: session.id,
      itemId: second.id,
      answer: "__skip__",
      requestKey: randomUUID(),
    });
    expect(continued.saved).toHaveLength(2);
    expect(continued.interrupted).toBe(false);
  });

  it.each(["first", "last"] as const)(
    "persiste apoio com a resposta %s sem depender da marca separada",
    async (position) => {
      const { owner, profile } = await family();
      const session = await begin(owner, {
        profileId: profile.id,
        lessonId: "diagnostic:canguru-e",
        mode: "diagnostic",
        requestKey: randomUUID(),
      });
      let view = await sessionView(owner, session.id);
      expect(view.readingSupport).toBe(false);
      // The separate reading marker never reached the server. The answer carries
      // the fact that audio was used, even if it is the final answer of the session.
      const inputs = view.lesson.items.map((item, index, items) => ({
        sessionId: session.id,
        itemId: item.id,
        answer: "__skip__",
        requestKey: randomUUID(),
        readingSupport: index === (position === "first" ? 0 : items.length - 1),
      }));
      for (const input of inputs) view = await answer(owner, input);
      expect(view.completed).toBe(true);
      expect(view.readingSupport).toBe(true);
      const [persisted] = await db
        .select()
        .from(missaoSessions)
        .where(eq(missaoSessions.id, session.id));
      expect(persisted?.readingSupport).toBe(true);
      expect(persisted?.completedAt).not.toBeNull();
      const last = inputs.at(-1);
      if (!last) throw new Error("Missing final answer");
      // Retrying the response cannot add an attempt or erase a support declaration.
      expect((await answer(owner, { ...last, readingSupport: false })).readingSupport).toBe(true);
      const attempts = await db
        .select()
        .from(missaoAttempts)
        .where(eq(missaoAttempts.sessionId, session.id));
      expect(attempts).toHaveLength(inputs.length);
    },
  );
});
