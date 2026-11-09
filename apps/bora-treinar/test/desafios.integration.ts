import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Access } from "@/features/acesso/policy";
import { challengeOf, setChallenge } from "@/features/desafios/repository";
import { dadosDoDesafio } from "@/features/desafios/service";
import { createProfile } from "@/features/familia/repository";
import type { SessionInput } from "@/features/sessoes/schema";
import { saveSession } from "@/features/sessoes/service";
import { inicioDaSemana } from "@/lib/datas";

const FUSO = "America/Sao_Paulo";
const owner = randomUUID();
const familia: Access = {
  subscribed: true,
  unlocked: true,
  trial: { active: false, endsAt: null, started: false },
  tier: "family",
  profileLimit: 4,
};
const agora = new Date();
const daqui = (semanas: number) => new Date(agora.getTime() + semanas * 7 * 86_400_000);
const semana = inicioDaSemana(agora, FUSO);
let ana = "";
let beto = "";

const pratica = (profileId: string, reps: number): SessionInput => ({
  id: randomUUID(),
  profileId,
  workoutRef: "pratica:agachamento",
  startedAt: agora.getTime() - 1000,
  durationSeconds: 300,
  mode: "manual",
  logs: [
    {
      exerciseId: "agachamento",
      kind: "reps",
      target: reps,
      reps,
      partials: 0,
      holdSeconds: 0,
      seconds: 200,
      issues: {},
    },
  ],
});

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Bora desafios",
    emailVerified: true,
  });
  ana = await createProfile(owner, "Ana", "#3D7BFF", familia.profileLimit);
  beto = await createProfile(owner, "Beto", "#FF7A45", familia.profileLimit);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, owner));
});

const liberado = async (profileId: string, quando: Date) => {
  const dados = await dadosDoDesafio(owner, profileId, FUSO, familia, quando);
  if (!dados.liberado) throw new Error("O desafio deveria estar liberado");
  return dados;
};

describe("desafio pessoal que renova sozinho", () => {
  it("cria o da semana uma vez só, mesmo com telas abertas ao mesmo tempo", async () => {
    await setChallenge(owner, semana, { metric: "treinos", exerciseId: null, target: 2 });
    const telas = await Promise.all([1, 2, 3].map(() => liberado(ana, agora)));
    for (const dados of telas)
      expect(dados.pessoal.desafio).toEqual({
        metric: "repeticoes",
        exerciseId: null,
        target: 250,
      });
    expect(telas[0]?.familia?.desafio).toEqual({ metric: "treinos", exerciseId: null, target: 2 });
  });

  it("soma os treinos do perfil e a parte de cada um no da família", async () => {
    await saveSession(owner, familia, [ana, beto], pratica(ana, 300), FUSO);
    const dados = await liberado(ana, agora);
    expect(dados.pessoal).toMatchObject({ feito: 300, cumprido: true, progresso: 1 });
    expect(dados.familia?.total).toBe(1);
    // na ordem da família, não de quem fez mais
    expect(dados.familia?.partes.map((p) => [p.name, p.valor, p.parte])).toEqual([
      ["Ana", 1, 1],
      ["Beto", 0, 1],
    ]);
  });

  it("na semana seguinte sobe 10% para quem cumpriu, sem mexer no da família", async () => {
    const dados = await liberado(ana, daqui(1));
    expect(dados.pessoal.desafio.target).toBe(275);
    expect(dados.pessoal.feito).toBe(0);
    expect(dados.historico.pessoal).toEqual([
      expect.objectContaining({ weekStart: semana, feito: 300, cumprido: true }),
    ]);
    expect(dados.familia).toBeNull();
    expect(dados.ultimoDaFamilia).toEqual({ metric: "treinos", exerciseId: null, target: 2 });
    expect(dados.historico.familia).toEqual([
      expect.objectContaining({ weekStart: semana, feito: 1, cumprido: false }),
    ]);
    expect(await challengeOf(owner, semana)).toEqual({
      metric: "treinos",
      exerciseId: null,
      target: 2,
    });
  });

  it("o desafio de um perfil não mexe no de outro", async () => {
    const dados = await liberado(beto, daqui(1));
    expect(dados.pessoal.desafio.target).toBe(250);
    expect(dados.historico.pessoal).toEqual([]);
  });

  it("semanas sem abrir o app ganham desafio, e duas sem cumprir descem a meta", async () => {
    const dados = await liberado(ana, daqui(3));
    // semana +1 (275, não cumpriu) → +2 mantém 275 → +3 desce 10% (247,5 → 250)
    expect(dados.historico.pessoal.map((s) => [s.desafio.target, s.cumprido])).toEqual([
      [275, false],
      [275, false],
      [250, true],
    ]);
    expect(dados.pessoal.desafio.target).toBe(250);
  });

  it("no plano gratuito fica bloqueado e não cria nada", async () => {
    const dados = await dadosDoDesafio(
      owner,
      ana,
      FUSO,
      { ...familia, unlocked: false, subscribed: false, tier: "free", profileLimit: 1 },
      daqui(4),
    );
    expect(dados).toEqual({ liberado: false });
    expect((await liberado(ana, daqui(3))).historico.pessoal).toHaveLength(3);
  });
});
