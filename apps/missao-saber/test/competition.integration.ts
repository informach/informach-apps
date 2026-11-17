import { randomUUID } from "node:crypto";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq } from "@informach/db";
import {
  collectionTrials,
  missaoCompetitionTurns,
  missaoCompetitors,
  missaoFamilies,
  users,
} from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import {
  answerTurn,
  competitionView,
  createCompetition,
  deleteCompetition,
  endTurn,
  listCompetitions,
  startTurn,
} from "@/features/competition/service";
import { findContentUnit } from "@/features/content/catalog";
import { type Item, itemSchema } from "@/features/content/types";
import type { ParentAuthority } from "@/features/family/authority";
import { exportFamily } from "@/features/learning/repository";
import { desafiosPorFaixa, encontrarDesafio } from "@/features/pecas/catalogo";
import { solucaoComoMontagem } from "@/features/pecas/montagem";
import { recordSolve } from "@/features/pecas/repository";
import { AppError } from "@/lib/errors";
import { fixtureAuthority, seedStudents } from "./canonical-fixture";

const owner = randomUUID();
const stranger = randomUUID();
let lia = "";
let theo = "";
let parent: ParentAuthority;
let outsider: ParentAuthority;

beforeAll(async () => {
  await db.insert(users).values([
    { id: owner, email: `${owner}@example.test`, name: "Competição", emailVerified: true },
    { id: stranger, email: `${stranger}@example.test`, name: "Outra casa", emailVerified: true },
  ]);
  await db.insert(missaoFamilies).values([
    { userId: owner, consentVersion: "test" },
    { userId: stranger, consentVersion: "test" },
  ]);
  const criados = await seedStudents([
    { userId: owner, nickname: "Lia", grade: 5, avatar: "cometa", courseId: "canguru-e" },
    { userId: owner, nickname: "Theo", grade: 8, avatar: "lua", courseId: "obmep-n2" },
  ]);
  lia = criados.find((p) => p.nickname === "Lia")?.id ?? "";
  theo = criados.find((p) => p.nickname === "Theo")?.id ?? "";
  if (!lia || !theo) throw new Error("Perfis de teste ausentes");
  parent = await fixtureAuthority(owner);
  outsider = await fixtureAuthority(stranger);
});

const nova = (extra: Record<string, unknown> = {}) => ({
  titulo: "Sábado de matemática",
  area: "matematica",
  perfis: [lia, theo],
  problemas: 2,
  desafios: 1,
  segundosProblema: 90,
  segundosDesafio: 300,
  requestKey: randomUUID(),
  ...extra,
});

async function vezNoBanco(id: string) {
  const [vez] = await db
    .select()
    .from(missaoCompetitionTurns)
    .where(eq(missaoCompetitionTurns.id, id));
  if (!vez) throw new Error("Vez ausente");
  return vez;
}
function respostaCerta(item: Item) {
  if (item.type === "choice") return item.answer;
  if (item.type === "numeric") return String(item.grading.value);
  throw new Error("Tipo inesperado na competição");
}
function respostaErrada(item: Item) {
  if (item.type === "choice") return item.options.find((o) => o !== item.answer) ?? "";
  if (item.type === "numeric") return String(item.grading.value + 1000);
  throw new Error("Tipo inesperado na competição");
}
async function codigo(promessa: Promise<unknown>) {
  try {
    await promessa;
    return "ok";
  } catch (erro) {
    if (erro instanceof AppError) return erro.code;
    throw erro;
  }
}

describe("competição em família em PostgreSQL isolado", () => {
  let id = "";

  it("sorteia e grava as vezes intercaladas, problemas antes dos desafios", async () => {
    const chave = randomUUID();
    id = await createCompetition(parent, nova({ requestKey: chave }));
    // A mesma chave não cria outra competição (toque duplo em "Sortear").
    expect(await createCompetition(parent, nova({ requestKey: chave }))).toBe(id);
    await expect(
      createCompetition(parent, nova({ requestKey: chave, titulo: "Outro encontro" })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createCompetition(parent, nova({ requestKey: chave, perfis: [theo, lia] })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const view = await competitionView(parent, id);
    expect(view.status).toBe("ready");
    expect(view.vezes.map((v) => v.tipo)).toEqual([
      "problem",
      "problem",
      "problem",
      "problem",
      "challenge",
      "challenge",
    ]);
    const [lia1, theo1] = view.competidores;
    expect(view.vezes.map((v) => v.competidorId)).toEqual([
      lia1?.id,
      theo1?.id,
      lia1?.id,
      theo1?.id,
      lia1?.id,
      theo1?.id,
    ]);
    // Nenhum enunciado sai do servidor antes de a vez começar.
    expect(view.vezes.every((v) => v.problema === null)).toBe(true);
    expect(lia1?.nivel).toContain("Canguru");
  });

  it("só o dono vê e conduz a competição", async () => {
    expect(await codigo(competitionView(outsider, id))).toBe("NOT_FOUND");
    expect(await codigo(startTurn(outsider, id))).toBe("NOT_FOUND");
  });

  it("abre a vez com prazo do servidor e não reinicia o relógio no segundo toque", async () => {
    const primeira = await startTurn(parent, id);
    const vez = primeira.vezes[0];
    expect(vez?.prazo).toBeTruthy();
    expect(vez?.problema?.item.prompt).toBeTruthy();
    expect(vez?.problema?.devolutiva).toBeNull();
    const segunda = await startTurn(parent, id);
    expect(segunda.vezes[0]?.prazo).toBe(vez?.prazo);
    expect(segunda.status).toBe("running");
  });

  it("acerto vale 1 ponto e mostra a resposta com a explicação", async () => {
    const view = await competitionView(parent, id);
    const vez = view.vezes[0];
    if (!vez) throw new Error("Vez ausente");
    const item = itemSchema.parse((await vezNoBanco(vez.id)).item);
    const depois = await answerTurn(parent, id, { vezId: vez.id, resposta: respostaCerta(item) });
    const fechada = depois.vezes[0];
    expect(fechada?.resultado).toBe("correct");
    expect(fechada?.pontos).toBe(1);
    expect(fechada?.problema?.devolutiva?.explicacao).toBeTruthy();
    expect(depois.competidores[0]?.pontos).toBe(1);
  });

  it("resposta e fim do tempo não somam duas vezes: quem chega primeiro decide", async () => {
    const view = await competitionView(parent, id);
    const vez = view.vezes[0];
    if (!vez) throw new Error("Vez ausente");
    await endTurn(parent, id, { vezId: vez.id, motivo: "timeout" });
    const item = itemSchema.parse((await vezNoBanco(vez.id)).item);
    await answerTurn(parent, id, { vezId: vez.id, resposta: respostaErrada(item) });
    const depois = await competitionView(parent, id);
    expect(depois.vezes[0]?.resultado).toBe("correct");
    expect(depois.competidores[0]?.pontos).toBe(1);
  });

  it("antes do prazo, o fim do tempo é ignorado; depois do prazo, a resposta vira tempo esgotado", async () => {
    const aberta = (await startTurn(parent, id)).vezes[1];
    if (!aberta) throw new Error("Vez ausente");
    await endTurn(parent, id, { vezId: aberta.id, motivo: "timeout" });
    expect((await vezNoBanco(aberta.id)).result).toBeNull();
    await db
      .update(missaoCompetitionTurns)
      .set({ deadlineAt: new Date(Date.now() - 10_000) })
      .where(eq(missaoCompetitionTurns.id, aberta.id));
    const item = itemSchema.parse((await vezNoBanco(aberta.id)).item);
    const depois = await answerTurn(parent, id, {
      vezId: aberta.id,
      resposta: respostaCerta(item),
    });
    expect(depois.vezes[1]?.resultado).toBe("timeout");
    expect(depois.vezes[1]?.pontos).toBe(0);
    expect(depois.vezes[1]?.problema?.devolutiva?.solucao).toBeTruthy();
  });

  it("erro vale 0 e o problema não pode ser encerrado como desistência", async () => {
    const aberta = (await startTurn(parent, id)).vezes[2];
    if (!aberta) throw new Error("Vez ausente");
    expect(await codigo(endTurn(parent, id, { vezId: aberta.id, motivo: "gave_up" }))).toBe(
      "INPUT",
    );
    const item = itemSchema.parse((await vezNoBanco(aberta.id)).item);
    const depois = await answerTurn(parent, id, {
      vezId: aberta.id,
      resposta: respostaErrada(item),
    });
    expect(depois.vezes[2]?.resultado).toBe("incorrect");
    expect(depois.vezes[2]?.pontos).toBe(0);
    const quarta = (await startTurn(parent, id)).vezes[3];
    if (!quarta) throw new Error("Vez ausente");
    const item4 = itemSchema.parse((await vezNoBanco(quarta.id)).item);
    await answerTurn(parent, id, { vezId: quarta.id, resposta: respostaCerta(item4) });
  });

  it("desafio montado no tempo vale 3; montagem que não fecha é recusada", async () => {
    const vez = (await startTurn(parent, id)).vezes[4];
    if (!vez?.desafioId) throw new Error("Desafio ausente");
    const desafio = encontrarDesafio(vez.desafioId);
    if (!desafio) throw new Error("Desafio fora do catálogo");
    expect(await codigo(answerTurn(parent, id, { vezId: vez.id, resposta: "{}" }))).toBe("INPUT");
    const solucao = solucaoComoMontagem(desafio);
    const quebrada =
      solucao.tipo === "malha"
        ? { ...solucao, poses: Object.fromEntries(Object.entries(solucao.poses).slice(1)) }
        : { ...solucao, poses: {} };
    expect(
      await codigo(answerTurn(parent, id, { vezId: vez.id, resposta: JSON.stringify(quebrada) })),
    ).toBe("NOT_SOLVED");
    const depois = await answerTurn(parent, id, {
      vezId: vez.id,
      resposta: JSON.stringify(solucao),
    });
    expect(depois.vezes[4]?.resultado).toBe("correct");
    expect(depois.vezes[4]?.pontos).toBe(3);
  });

  it("o desafio encerrado por quem coordena vale 0 e a última vez fecha a competição com pódio", async () => {
    const vez = (await startTurn(parent, id)).vezes[5];
    if (!vez) throw new Error("Vez ausente");
    const depois = await endTurn(parent, id, { vezId: vez.id, motivo: "gave_up" });
    expect(depois.vezes[5]?.resultado).toBe("gave_up");
    expect(depois.status).toBe("finished");
    const pontos = depois.competidores.map((c) => c.pontos);
    expect(pontos.reduce((a, b) => a + b, 0)).toBe(depois.vezes.reduce((s, v) => s + v.pontos, 0));
    expect(depois.podio?.[0]?.posicao).toBe(1);
    expect(depois.podio?.[0]?.pontos).toBe(Math.max(...pontos));
    expect(await codigo(startTurn(parent, id))).toBe("FINISHED");
    const lista = await listCompetitions(parent);
    expect(lista.find((c) => c.id === id)?.status).toBe("finished");
  });

  it("recusa área sem trilha para o ano e perfil de outra família", async () => {
    expect(await codigo(createCompetition(parent, nova({ area: "financeira" })))).toBe("AREA");
    expect(await codigo(createCompetition(outsider, nova({ perfis: [lia] })))).toBe("PROFILE");
  });

  it("prefere, na competição seguinte, problemas que a criança ainda não viu", async () => {
    const readExposures = (competitionId: string) =>
      db
        .select({ profileId: missaoCompetitors.profileId, itemId: missaoCompetitionTurns.itemId })
        .from(missaoCompetitionTurns)
        .innerJoin(missaoCompetitors, eq(missaoCompetitors.id, missaoCompetitionTurns.competitorId))
        .where(eq(missaoCompetitionTurns.competitionId, competitionId));
    const vistos = new Set(
      (await readExposures(id))
        .filter((turn) => turn.itemId)
        .map((turn) => `${turn.profileId}:${turn.itemId}`),
    );
    const outra = await createCompetition(parent, nova({ desafios: 0 }));
    const novas = await readExposures(outra);
    expect(
      novas.filter((turn) => turn.itemId && vistos.has(`${turn.profileId}:${turn.itemId}`)),
    ).toEqual([]);
    await deleteCompetition(parent, outra);
    expect(await codigo(competitionView(parent, outra))).toBe("NOT_FOUND");
  });

  it("registra montagens do laboratório com o melhor tempo e exporta tudo da família", async () => {
    const puzzle = desafiosPorFaixa.find((entry) => entry.gratuito);
    if (!puzzle) throw new Error("Missing free puzzle fixture");
    await recordSolve(parent, lia, puzzle.id, 120);
    const segunda = await recordSolve(parent, lia, puzzle.id, 90);
    expect(segunda?.solves).toBe(2);
    expect(segunda?.bestSeconds).toBe(90);
    const terceira = await recordSolve(parent, lia, puzzle.id, 200);
    expect(terceira?.bestSeconds).toBe(90);
    const exportado = await exportFamily(parent);
    expect(exportado.competitions.competitions.length).toBeGreaterThan(0);
    // A cópia do item com gabarito não sai na exportação.
    expect(exportado.competitions.turns.every((v) => !("item" in v))).toBe(true);
    expect(exportado.puzzleSolves).toHaveLength(1);
  });
});

it("rechecks Compasso coverage at each paid turn while preserving the recorded event", async () => {
  await startCompassoTrial(
    { db, trialHashSecret: "test-compasso-competition-secret-with-32-characters" },
    owner,
    parent.familyGroupId,
  );
  const eventId = await createCompetition(parent, nova({ desafios: 0 }));
  const [turn] = await db
    .select()
    .from(missaoCompetitionTurns)
    .where(eq(missaoCompetitionTurns.competitionId, eventId))
    .orderBy(missaoCompetitionTurns.position)
    .limit(1);
  const lesson = findContentUnit("porcentagem-1");
  const item = lesson?.items[0];
  if (!turn || !lesson || lesson.free || !item) throw new Error("Paid turn fixture missing");
  await db
    .update(missaoCompetitionTurns)
    .set({ lessonId: lesson.id, itemId: item.id, item })
    .where(eq(missaoCompetitionTurns.id, turn.id));
  const scope = and(
    eq(collectionTrials.groupId, parent.familyGroupId),
    eq(collectionTrials.collection, "compasso"),
  );
  await db
    .update(collectionTrials)
    .set({ startsAt: new Date(Date.now() - 15 * 86_400_000), endsAt: new Date(Date.now() - 1000) })
    .where(scope);
  await expect(startTurn(parent, eventId)).rejects.toMatchObject({ code: "PLAN" });
  expect((await vezNoBanco(turn.id)).startedAt).toBeNull();
  await db
    .update(collectionTrials)
    .set({ endsAt: new Date(Date.now() + 86_400_000) })
    .where(scope);
  await startTurn(parent, eventId);
  await db
    .update(collectionTrials)
    .set({ endsAt: new Date(Date.now() - 1000) })
    .where(scope);
  await expect(
    answerTurn(parent, eventId, { vezId: turn.id, resposta: respostaCerta(item) }),
  ).rejects.toMatchObject({ code: "PLAN" });
  expect((await vezNoBanco(turn.id)).result).toBeNull();
  expect((await competitionView(parent, eventId)).id).toBe(eventId);
  await deleteCompetition(parent, eventId);
});
