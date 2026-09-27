import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { assessment, catalogGrades, coursesForGrade, findCourse } from "@/features/content/catalog";
import { gradeLabel } from "@/features/family/school-year";
import { begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();
const outroResponsavel = randomUUID();

beforeAll(async () => {
  await db.insert(users).values([
    {
      id: owner,
      email: `${owner}@example.test`,
      name: "Responsável da 2ª série",
      emailVerified: true,
    },
    {
      id: outroResponsavel,
      email: `${outroResponsavel}@example.test`,
      name: "Responsável da 3ª série",
      emailVerified: true,
    },
  ]);
});

describe("onda 3a em PostgreSQL isolado: ensino médio", () => {
  it("abre o ensino médio e aceita um perfil da 2ª série na Canguru J", async () => {
    expect(catalogGrades).toEqual(expect.arrayContaining([10, 11, 12]));
    expect(gradeLabel(11)).toBe("2ª série do EM");
    expect(coursesForGrade(11).map((course) => course.id)).toEqual(
      expect.arrayContaining(["canguru-j", "obmep-n3"]),
    );
    const profile = await createProfile(owner, {
      nickname: "Rafa",
      grade: 11,
      birthMonth: null,
      avatar: "cometa",
      courseId: "canguru-j",
      consent: true,
    });
    expect((await dashboard(owner, profile.id)).course?.id).toBe("canguru-j");
    // Funções é a primeira habilidade das duas trilhas e abre sem assinatura.
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "funcoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("funcoes-1");
    const course = findCourse("canguru-j");
    if (!course) throw new Error("Missing canguru-j");
    const diagnostico = assessment(course, "diagnostic");
    expect(diagnostico.items).toHaveLength(12);
    expect(new Set(diagnostico.items.map((item) => item.skillId))).toEqual(new Set(course.skills));
  });

  it("aceita a 3ª série na OBMEP N3 e recusa a Canguru J para esse ano", async () => {
    const profile = await createProfile(outroResponsavel, {
      nickname: "Duda",
      grade: 12,
      birthMonth: null,
      avatar: "raio",
      courseId: "obmep-n3",
      consent: true,
    });
    expect((await dashboard(outroResponsavel, profile.id)).course?.id).toBe("obmep-n3");
    await expect(
      createProfile(randomUUID(), {
        nickname: "Téo",
        grade: 12,
        birthMonth: null,
        avatar: "onda",
        courseId: "canguru-j",
        consent: true,
      }),
    ).rejects.toMatchObject({ code: "COURSE" });
  });
});
