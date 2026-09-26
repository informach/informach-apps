import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { assessment, catalogGrades, coursesForGrade, findCourse } from "@/features/content/catalog";
import { suggestedGrade } from "@/features/family/school-year";
import { begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();
const outroResponsavel = randomUUID();

beforeAll(async () => {
  await db.insert(users).values([
    {
      id: owner,
      email: `${owner}@example.test`,
      name: "Responsável do 3º ano",
      emailVerified: true,
    },
    {
      id: outroResponsavel,
      email: `${outroResponsavel}@example.test`,
      name: "Responsável do 5º ano",
      emailVerified: true,
    },
  ]);
});

describe("onda 2 em PostgreSQL isolado: 3º ao 5º ano", () => {
  it("abre os anos novos e aceita um perfil do 3º ano na Canguru P", async () => {
    expect(catalogGrades).toEqual(expect.arrayContaining([3, 4, 5, 6, 7, 8, 9]));
    expect(coursesForGrade(3).map((course) => course.id)).toContain("canguru-p");
    expect(coursesForGrade(4).map((course) => course.id)).toEqual(["canguru-p", "mirim-2"]);
    expect(
      coursesForGrade(5)
        .map((course) => course.id)
        .sort(),
    ).toEqual(["canguru-e", "mirim-2"]);
    // Uma criança que fez 8 anos em fevereiro de 2026 é sugerida para o 3º ano em 2026.
    expect(suggestedGrade("2018-02", 2026)).toBe(3);
    const profile = await createProfile(owner, {
      nickname: "Iris",
      grade: 3,
      birthMonth: "2018-02",
      avatar: "foguete",
      courseId: "canguru-p",
      consent: true,
    });
    const painel = await dashboard(owner, profile.id);
    expect(painel.course?.id).toBe("canguru-p");
    // A primeira unidade da faixa é gratuita.
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "contagem-inicial-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("contagem-inicial-1");
    const course = findCourse("canguru-p");
    if (!course) throw new Error("Missing canguru-p");
    const diagnostico = assessment(course, "diagnostic");
    expect(diagnostico.items).toHaveLength(12);
    expect(new Set(diagnostico.items.map((item) => item.skillId))).toEqual(new Set(course.skills));
  });

  it("aceita um perfil do 5º ano na Mirim 2 e recusa a Canguru P para esse ano", async () => {
    // Cada conta gratuita tem um perfil; o 5º ano entra em outra conta.
    const profile = await createProfile(outroResponsavel, {
      nickname: "Noah",
      grade: 5,
      birthMonth: null,
      avatar: "lua",
      courseId: "mirim-2",
      consent: true,
    });
    const painel = await dashboard(outroResponsavel, profile.id);
    expect(painel.course?.id).toBe("mirim-2");
    await expect(
      createProfile(randomUUID(), {
        nickname: "Bela",
        grade: 5,
        birthMonth: null,
        avatar: "estrela",
        courseId: "canguru-p",
        consent: true,
      }),
    ).rejects.toMatchObject({ code: "COURSE" });
  });
});
