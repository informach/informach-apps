import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { assessment, catalogGrades, courses, findCourse } from "@/features/content/catalog";
import { begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Responsável do 9º ano",
    emailVerified: true,
  });
});

describe("onda 1a em PostgreSQL isolado: 8º e 9º ano", () => {
  it("oferece os anos das trilhas publicadas e aceita um perfil do 9º ano na OBMEP N2", async () => {
    expect(catalogGrades).toEqual([6, 7, 8, 9]);
    expect(courses.map((course) => course.id)).toEqual(
      expect.arrayContaining(["obmep-n2", "canguru-c"]),
    );
    const profile = await createProfile(owner, {
      nickname: "Nina",
      grade: 9,
      birthMonth: null,
      avatar: "foguete",
      courseId: "obmep-n2",
      consent: true,
    });
    const painel = await dashboard(owner, profile.id);
    expect(painel.course?.id).toBe("obmep-n2");
    expect(painel.courseTransition).toBeNull();
    // A primeira unidade da faixa é gratuita: proporção abre sem assinatura.
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "proporcao-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("proporcao-1");
    // O diagnóstico existe, tem 12 questões e cobre todas as habilidades da trilha.
    const course = findCourse("obmep-n2");
    if (!course) throw new Error("Missing obmep-n2");
    const diagnostico = assessment(course, "diagnostic");
    expect(diagnostico.items).toHaveLength(12);
    expect(new Set(diagnostico.items.map((item) => item.skillId))).toEqual(new Set(course.skills));
    const inicio = await begin(owner, {
      profileId: profile.id,
      lessonId: diagnostico.id,
      mode: "diagnostic",
      requestKey: randomUUID(),
    });
    expect(inicio.lessonId).toBe(diagnostico.id);
  });

  it("recusa uma trilha que não cobre o ano escolhido", async () => {
    await expect(
      createProfile(owner, {
        nickname: "Léo",
        grade: 8,
        birthMonth: null,
        avatar: "lua",
        courseId: "canguru-c",
        consent: true,
      }),
    ).rejects.toMatchObject({ code: "COURSE" });
  });
});
