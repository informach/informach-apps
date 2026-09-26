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
    name: "Responsável do 8º ano",
    emailVerified: true,
  });
});

describe("onda 1b em PostgreSQL isolado: OLITEF N2", () => {
  it("oferece as três trilhas de 8º ano e aceita um perfil na OLITEF N2", async () => {
    expect(coursesForGrade(8).map((course) => course.id)).toEqual(
      expect.arrayContaining(["canguru-b", "obmep-n2", "olitef-n2"]),
    );
    const profile = await createProfile(owner, {
      nickname: "Téo",
      grade: 8,
      birthMonth: null,
      avatar: "foguete",
      courseId: "olitef-n2",
      consent: true,
    });
    const painel = await dashboard(owner, profile.id);
    expect(painel.course?.id).toBe("olitef-n2");
    // Proporção é a primeira habilidade e abre sem assinatura.
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "proporcao-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("proporcao-1");
    // O simulado cobre as seis habilidades da trilha, incluindo as cinco novas.
    const course = findCourse("olitef-n2");
    if (!course) throw new Error("Missing olitef-n2");
    const simulado = assessment(course, "exam");
    expect(simulado.items).toHaveLength(12);
    expect(new Set(simulado.items.map((item) => item.skillId))).toEqual(
      new Set([
        "proporcao",
        "porcentagem-n2",
        "juros",
        "orcamento-n2",
        "inflacao",
        "investimentos",
      ]),
    );
    // O simulado é conteúdo pago: sem assinatura, o começo é recusado pelo plano.
    await expect(
      begin(owner, {
        profileId: profile.id,
        lessonId: simulado.id,
        mode: "exam",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PLAN" });
    // O diagnóstico é gratuito e abre normalmente.
    const diagnostico = assessment(course, "diagnostic");
    const inicio = await begin(owner, {
      profileId: profile.id,
      lessonId: diagnostico.id,
      mode: "diagnostic",
      requestKey: randomUUID(),
    });
    expect(inicio.lessonId).toBe(diagnostico.id);
  });
});
