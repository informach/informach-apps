import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import {
  missaoAttempts,
  missaoFamilies,
  missaoProfiles,
  missaoSessions,
  users,
} from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { findLesson } from "@/features/content/catalog";
import { suggestedGoal, weekStart } from "@/features/family/desafio";
import {
  clearFamilyChallenge,
  familyChallenge,
  setFamilyChallenge,
} from "@/features/learning/repository";

const owner = randomUUID();
const stranger = randomUUID();
let sol = "";
let lua = "";

async function seedCompletedSession(
  profileId: string,
  helpCount: number,
  createdAt?: Date,
  mode: "mission" | "review" | "diagnostic" | "exam" = "mission",
) {
  const lesson = findLesson("fracoes-1");
  if (!lesson) throw new Error("Missing fixture lesson");
  const [session] = await db
    .insert(missaoSessions)
    .values({
      profileId,
      lessonId: lesson.id,
      version: lesson.version,
      mode,
      snapshot: lesson as unknown as Record<string, unknown>,
      requestKey: randomUUID(),
      completedAt: new Date(),
      ...(createdAt ? { createdAt } : {}),
    })
    .returning({ id: missaoSessions.id });
  if (!session) throw new Error("Missing fixture session");
  await db.insert(missaoAttempts).values(
    lesson.items.map((item) => ({
      id: randomUUID(),
      sessionId: session.id,
      itemId: item.id,
      skillId: item.skillId,
      familyId: item.familyId,
      answer: "x",
      correct: true,
      result: "correct" as const,
      helpCount,
      ...(createdAt ? { createdAt } : {}),
    })),
  );
  return lesson;
}

beforeAll(async () => {
  await db.insert(users).values([
    { id: owner, email: `${owner}@example.test`, name: "Desafio", emailVerified: true },
    { id: stranger, email: `${stranger}@example.test`, name: "Outra casa", emailVerified: true },
  ]);
  await db.insert(missaoFamilies).values([
    { userId: owner, consentVersion: "test" },
    { userId: stranger, consentVersion: "test" },
  ]);
  const criados = await db
    .insert(missaoProfiles)
    .values([
      { userId: owner, nickname: "Sol", grade: 6, avatar: "cometa", courseId: "olitef-n1" },
      { userId: owner, nickname: "Lua", grade: 6, avatar: "lua", courseId: "olitef-n1" },
      { userId: stranger, nickname: "Vizinha", grade: 6, avatar: "raio", courseId: "olitef-n1" },
    ])
    .returning({ id: missaoProfiles.id, nickname: missaoProfiles.nickname });
  sol = criados.find((p) => p.nickname === "Sol")?.id ?? "";
  lua = criados.find((p) => p.nickname === "Lua")?.id ?? "";
  if (!sol || !lua) throw new Error("Missing fixture profiles");
});

describe("desafio da família em PostgreSQL isolado", () => {
  it("não varre a semana enquanto nenhuma meta foi aceita", async () => {
    await seedCompletedSession(sol, 0);
    expect(await familyChallenge(owner, weekStart(new Date()))).toEqual({
      goal: null,
      progress: 0,
      contributions: [],
    });
  });

  it("soma estratégias distintas dos perfis da casa, sem contar pistas nem outra família", async () => {
    const semana = weekStart(new Date());
    await setFamilyChallenge(owner, semana, suggestedGoal(2));
    // Mesmo perfil, mesma missão outra vez: variedade não cresce com repetição.
    await seedCompletedSession(sol, 0);
    // Outro perfil da casa soma na mesma barra.
    await seedCompletedSession(lua, 0);
    // Tentativa com pistas não vira evidência de estratégia resolvida sozinha.
    await seedCompletedSession(lua, 2);
    const resultado = await familyChallenge(owner, semana);
    const lesson = findLesson("fracoes-1");
    const familias = new Set(lesson?.items.map((item) => item.familyId)).size;
    expect(resultado.goal).toBe(8);
    expect(resultado.progress).toBe(familias);
    expect(resultado.contributions.map((quem) => quem.nickname).sort()).toEqual(["Lua", "Sol"]);
    // A casa vizinha não aparece nem soma.
    expect(await familyChallenge(stranger, semana)).toEqual({
      goal: null,
      progress: 0,
      contributions: [],
    });
  });

  it("não conta diagnóstico nem simulado, onde pista não existe", async () => {
    const semana = weekStart(new Date());
    const antes = await familyChallenge(owner, semana);
    // Nestes modos toda resposta certa tem zero pistas por construção: um
    // diagnóstico inteiro encheria a meta da semana sozinho.
    await seedCompletedSession(sol, 0, undefined, "diagnostic");
    await seedCompletedSession(sol, 0, undefined, "exam");
    expect((await familyChallenge(owner, semana)).progress).toBe(antes.progress);
  });

  it("ignora o que aconteceu antes da semana e encerra sem dívida", async () => {
    const semana = weekStart(new Date());
    await seedCompletedSession(sol, 0, new Date(Date.now() - 30 * 86_400_000));
    const antes = await familyChallenge(owner, semana);
    const lesson = findLesson("fracoes-1");
    expect(antes.progress).toBe(new Set(lesson?.items.map((item) => item.familyId)).size);
    await clearFamilyChallenge(owner, semana);
    expect(await familyChallenge(owner, semana)).toEqual({
      goal: null,
      progress: 0,
      contributions: [],
    });
  });
});
