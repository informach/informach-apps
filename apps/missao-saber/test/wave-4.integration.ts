import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { assessment, catalogGrades, coursesForGrade, findCourse } from "@/features/content/catalog";
import { gradeLabel, suggestedGrade } from "@/features/family/school-year";
import { begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Responsável do 2º ano",
    emailVerified: true,
  });
});

describe("onda 4 em PostgreSQL isolado: Mirim 1", () => {
  it("abre o 2º ano e aceita um perfil sugerido pelo mês de nascimento", async () => {
    expect(catalogGrades[0]).toBe(2);
    expect(coursesForGrade(2).map((course) => course.id)).toEqual(["mirim-1"]);
    expect(coursesForGrade(3).map((course) => course.id)).toEqual(
      expect.arrayContaining(["canguru-p", "mirim-1"]),
    );
    // Quem fez 7 anos em fevereiro de 2026 é sugerido para o 2º ano em 2026.
    expect(suggestedGrade("2019-02", 2026)).toBe(2);
    expect(gradeLabel(2)).toBe("2º ano");
    const profile = await createProfile(owner, {
      nickname: "Bento",
      grade: 2,
      birthMonth: "2019-02",
      avatar: "onda",
      courseId: "mirim-1",
      consent: true,
    });
    expect((await dashboard(owner, profile.id)).course?.id).toBe("mirim-1");
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "contar-e-comparar-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("contar-e-comparar-1");
    const course = findCourse("mirim-1");
    if (!course) throw new Error("Missing mirim-1");
    const diagnostico = assessment(course, "diagnostic");
    expect(diagnostico.items).toHaveLength(12);
    expect(new Set(diagnostico.items.map((item) => item.skillId))).toEqual(new Set(course.skills));
  });
});
