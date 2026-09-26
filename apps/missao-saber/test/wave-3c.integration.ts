import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { assessment, coursesForGrade, findCourse } from "@/features/content/catalog";
import { begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Responsável da 1ª série",
    emailVerified: true,
  });
});

describe("onda 3c em PostgreSQL isolado: OLITEF N3", () => {
  it("oferece a OLITEF N3 no ensino médio e abre a primeira unidade sem assinatura", async () => {
    for (const grade of [10, 11, 12])
      expect(coursesForGrade(grade).map((course) => course.id)).toContain("olitef-n3");
    const profile = await createProfile(owner, {
      nickname: "Caê",
      grade: 10,
      birthMonth: null,
      avatar: "bussola",
      courseId: "olitef-n3",
      consent: true,
    });
    expect((await dashboard(owner, profile.id)).course?.id).toBe("olitef-n3");
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "modelos-financeiros-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("modelos-financeiros-1");
    const course = findCourse("olitef-n3");
    if (!course) throw new Error("Missing olitef-n3");
    const diagnostico = assessment(course, "diagnostic");
    expect(diagnostico.items).toHaveLength(12);
    expect(new Set(diagnostico.items.map((item) => item.skillId))).toEqual(new Set(course.skills));
  });
});
