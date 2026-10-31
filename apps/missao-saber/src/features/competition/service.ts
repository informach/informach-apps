import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { AppError, assertAllowed } from "@/lib/errors";
import { getAccess } from "../billing/service";
import { skillNames } from "../content/catalog";
import { type Item, itemSchema, type PublicItem, publicItem } from "../content/types";
import { allowedProfileIds } from "../family/profile-access";
import { gradeLabel } from "../family/school-year";
import { gradeAnswer, numericSolution } from "../learning/engine";
import { contentStates, getProfiles } from "../learning/repository";
import { encontrarDesafio, faixaDoAno } from "../pecas/catalogo";
import { lerMontagem } from "../pecas/esquema";
import { verificar } from "../pecas/verificar";
import {
  type Area,
  areas,
  elegibilidade,
  LIMITES,
  ordemDasVezes,
  podio,
  pontosDaVez,
  prazoEsgotado,
  SorteioInsuficiente,
  sortearDesafios,
  sortearProblemas,
} from "./regras";
import * as repo from "./repository";

/** Perfis da família com o que cada um pode jogar em cada área. */
export async function competitionSetup(userId: string) {
  const [perfis, acesso] = await Promise.all([getProfiles(userId), getAccess(userId)]);
  return {
    pago: acesso.paid,
    perfis: perfis.map((perfil) => ({
      id: perfil.id,
      apelido: perfil.nickname,
      avatar: perfil.avatar,
      ano: gradeLabel(perfil.grade),
      areas: {
        matematica: elegibilidade("matematica", perfil.grade),
        financeira: elegibilidade("financeira", perfil.grade),
      },
    })),
  };
}

const segundos = (permitidos: readonly number[]) =>
  z
    .number()
    .int()
    .refine((v) => permitidos.includes(v), "Tempo fora das opções.");
export const createSchema = z
  .object({
    titulo: z.string().trim().min(2).max(60),
    area: z.enum(["matematica", "financeira"]),
    perfis: z
      .array(z.string().uuid())
      .min(LIMITES.competidores.min)
      .max(LIMITES.competidores.max)
      .refine((ids) => new Set(ids).size === ids.length, "Perfil repetido."),
    problemas: z.number().int().min(LIMITES.problemas.min).max(LIMITES.problemas.max),
    desafios: z.number().int().min(LIMITES.desafios.min).max(LIMITES.desafios.max),
    segundosProblema: segundos(LIMITES.segundosProblema),
    segundosDesafio: segundos(LIMITES.segundosDesafio),
    requestKey: z.string().uuid(),
  })
  .refine((v) => v.problemas + v.desafios > 0, "Escolha ao menos um problema ou um desafio.");

/**
 * Sorteia e grava a competição inteira de uma vez: cada criança recebe os
 * próprios problemas e desafios agora, e a ordem das vezes fica fixa.
 */
export async function createCompetition(userId: string, raw: unknown) {
  const dados = createSchema.parse(raw);
  const [perfis, acesso, estados] = await Promise.all([
    getProfiles(userId),
    getAccess(userId),
    contentStates(),
  ]);
  const liberados = allowedProfileIds(perfis, acesso.profileLimit);
  const escolhidos = dados.perfis.map((id) => {
    const perfil = perfis.find((p) => p.id === id);
    assertAllowed(perfil, "PROFILE", "Perfil não encontrado.");
    return perfil;
  });
  const vistos = await repo.seenInCompetitions(
    userId,
    escolhidos.map((p) => p.id),
  );
  const semente = randomInt(1, 2 ** 31 - 1);
  const sorteios = escolhidos.map((perfil, assento) => {
    const nivel = elegibilidade(dados.area, perfil.grade);
    assertAllowed(
      nivel.elegivel,
      "AREA",
      `${perfil.nickname}: ${nivel.elegivel ? "" : nivel.motivo}`,
    );
    const acessoDoPerfil = {
      pago: acesso.paid,
      perfilLiberado: liberados.includes(perfil.id),
      estados,
    };
    try {
      return {
        perfil,
        nivel: nivel.nivel,
        problemas: sortearProblemas({
          area: dados.area,
          ano: perfil.grade,
          quantidade: dados.problemas,
          semente: semente + assento * 1009,
          acesso: acessoDoPerfil,
          vistos: vistos.get(perfil.id) ?? new Set(),
        }),
        desafios: sortearDesafios({
          ano: perfil.grade,
          quantidade: dados.desafios,
          semente: semente + assento * 7919 + 1,
          acesso: acessoDoPerfil,
          vistos: vistos.get(perfil.id) ?? new Set(),
        }),
      };
    } catch (erro) {
      if (erro instanceof SorteioInsuficiente)
        throw new AppError("SORTEIO", `${perfil.nickname}: ${erro.message}`);
      throw erro;
    }
  });
  const vezes = ordemDasVezes(escolhidos.length, dados.problemas, dados.desafios).map(
    (vez, posicao) => {
      const sorteio = sorteios[vez.assento];
      if (!sorteio) throw new Error("Assento sem sorteio");
      if (vez.tipo === "problem") {
        const problema = sorteio.problemas[vez.rodada];
        if (!problema) throw new Error("Rodada sem problema");
        return {
          seat: vez.assento,
          position: posicao,
          kind: "problem" as const,
          lessonId: problema.lessonId,
          itemId: problema.item.id,
          item: problema.item as unknown as Record<string, unknown>,
          seconds: dados.segundosProblema,
        };
      }
      const desafio = sorteio.desafios[vez.rodada];
      if (!desafio) throw new Error("Rodada sem desafio");
      return {
        seat: vez.assento,
        position: posicao,
        kind: "challenge" as const,
        puzzleId: desafio.id,
        seconds: dados.segundosDesafio,
      };
    },
  );
  return repo.createCompetition(
    userId,
    {
      title: dados.titulo,
      area: dados.area,
      problemCount: dados.problemas,
      challengeCount: dados.desafios,
      problemSeconds: dados.segundosProblema,
      challengeSeconds: dados.segundosDesafio,
      seed: semente,
      requestKey: dados.requestKey,
    },
    sorteios.map(({ perfil, nivel }, assento) => ({
      profileId: perfil.id,
      seat: assento,
      nickname: perfil.nickname,
      avatar: perfil.avatar,
      grade: perfil.grade,
      level: nivel,
      band: faixaDoAno(perfil.grade),
    })),
    vezes,
  );
}

export async function listCompetitions(userId: string) {
  return (await repo.listCompetitions(userId)).map(
    ({ competicao, competidores, feitas, total }) => ({
      id: competicao.id,
      titulo: competicao.title,
      area: areas[competicao.area].nome,
      status: competicao.status,
      criadaEm: competicao.createdAt.toISOString(),
      feitas,
      total,
      problemas: competicao.problemCount,
      desafios: competicao.challengeCount,
      segundosProblema: competicao.problemSeconds,
      segundosDesafio: competicao.challengeSeconds,
      nomes: competidores.map((c) => c.nickname),
      podio: podio(competidores.map((c) => ({ id: c.id, apelido: c.nickname, pontos: c.pontos }))),
    }),
  );
}

function lerItem(vez: repo.Turn): Item {
  return itemSchema.parse(vez.item);
}
function solucaoDoItem(item: Item) {
  if (item.type === "choice") return item.answer;
  if (item.type === "numeric") return numericSolution(item);
  return "";
}

export type VezPublica = {
  id: string;
  posicao: number;
  competidorId: string;
  tipo: "problem" | "challenge";
  segundos: number;
  iniciadaEm: string | null;
  prazo: string | null;
  resultado: repo.Turn["result"];
  pontos: number;
  problema: {
    item: PublicItem;
    habilidade: string;
    devolutiva: { resposta: string | null; explicacao: string; solucao: string } | null;
  } | null;
  desafioId: string | null;
};

function vezPublica(vez: repo.Turn): VezPublica {
  let problema: VezPublica["problema"] = null;
  // O enunciado só sai do servidor quando a vez começa, e a resposta só quando ela termina.
  if (vez.kind === "problem" && vez.startedAt) {
    const item = lerItem(vez);
    let devolutiva = null;
    if (vez.result) {
      const avaliacao =
        vez.result === "timeout" || !vez.answer ? null : gradeAnswer(item, vez.answer);
      devolutiva = {
        resposta: vez.result === "timeout" ? null : vez.answer,
        explicacao: avaliacao?.explanation ?? item.explanation,
        solucao: solucaoDoItem(item),
      };
    }
    problema = { item: publicItem(item), habilidade: skillNames[item.skillId] ?? "", devolutiva };
  }
  return {
    id: vez.id,
    posicao: vez.position,
    competidorId: vez.competitorId,
    tipo: vez.kind,
    segundos: vez.seconds,
    iniciadaEm: vez.startedAt?.toISOString() ?? null,
    prazo: vez.deadlineAt?.toISOString() ?? null,
    resultado: vez.result,
    pontos: vez.points,
    problema,
    desafioId: vez.puzzleId,
  };
}

export async function competitionView(userId: string, id: string) {
  const { competicao, competidores, vezes } = await repo.readCompetition(userId, id);
  const pontos = (competidorId: string) =>
    vezes.filter((v) => v.competitorId === competidorId).reduce((s, v) => s + v.points, 0);
  const lista = competidores.map((c) => ({
    id: c.id,
    apelido: c.nickname,
    avatar: c.avatar,
    nivel: c.level,
    pontos: pontos(c.id),
    acertos: vezes.filter(
      (v) => v.competitorId === c.id && v.kind === "problem" && v.result === "correct",
    ).length,
    desafiosMontados: vezes.filter(
      (v) => v.competitorId === c.id && v.kind === "challenge" && v.result === "correct",
    ).length,
    problemas: competicao.problemCount,
    desafios: competicao.challengeCount,
  }));
  return {
    id: competicao.id,
    titulo: competicao.title,
    area: areas[competicao.area as Area].nome,
    status: competicao.status,
    competidores: lista,
    podio: competicao.status === "finished" ? podio(lista) : null,
    vezes: vezes.map(vezPublica),
    agora: new Date().toISOString(),
  };
}
export type CompetitionView = Awaited<ReturnType<typeof competitionView>>;

const idSchema = z.string().uuid();

export async function startTurn(userId: string, id: string) {
  await repo.openNextTurn(userId, idSchema.parse(id), new Date());
  return competitionView(userId, id);
}

const respostaSchema = z.object({ vezId: z.string().uuid(), resposta: z.string().max(40_000) });

/** Resposta de problema ou montagem de desafio, corrigida no servidor. */
export async function answerTurn(userId: string, id: string, raw: unknown) {
  const { vezId, resposta } = respostaSchema.parse(raw);
  const agora = new Date();
  await repo.closeTurn(
    userId,
    idSchema.parse(id),
    vezId,
    (vez) => {
      if (vez.deadlineAt && prazoEsgotado(vez.deadlineAt, agora))
        return { answer: null, result: "timeout", points: 0 };
      if (vez.kind === "problem") {
        const avaliacao = gradeAnswer(lerItem(vez), resposta);
        assertAllowed(avaliacao.valid, "INPUT", avaliacao.message ?? "Confira a resposta.");
        const acertou = avaliacao.correct === true;
        return {
          answer: resposta,
          result: acertou ? "correct" : "incorrect",
          points: pontosDaVez("problem", acertou),
        };
      }
      const desafio = encontrarDesafio(vez.puzzleId ?? "");
      const montagem = lerMontagem(resposta);
      assertAllowed(desafio && montagem, "INPUT", "Montagem inválida.");
      assertAllowed(
        verificar(desafio, montagem).montado,
        "NOT_SOLVED",
        "A montagem ainda não fechou.",
      );
      return { answer: resposta, result: "correct", points: pontosDaVez("challenge", true) };
    },
    agora,
  );
  return competitionView(userId, id);
}

const encerrarSchema = z.object({
  vezId: z.string().uuid(),
  motivo: z.enum(["timeout", "gave_up"]),
});
/** Relógio que chegou a zero no aparelho, ou desafio encerrado por quem coordena. */
export async function endTurn(userId: string, id: string, raw: unknown) {
  const { vezId, motivo } = encerrarSchema.parse(raw);
  const agora = new Date();
  await repo.closeTurn(
    userId,
    idSchema.parse(id),
    vezId,
    (vez) => {
      if (motivo === "gave_up") {
        assertAllowed(
          vez.kind === "challenge",
          "INPUT",
          "Só o desafio pode ser encerrado antes do tempo.",
        );
        return { answer: null, result: "gave_up", points: 0 };
      }
      // O aparelho conta a partir do prazo do servidor; um segundo de tolerância
      // cobre a diferença de relógio. Antes disso, o tempo ainda corre.
      if (!vez.deadlineAt || agora.getTime() < vez.deadlineAt.getTime() - 1000) return null;
      return { answer: null, result: "timeout", points: 0 };
    },
    agora,
  );
  return competitionView(userId, id);
}

export async function deleteCompetition(userId: string, id: string) {
  await repo.deleteCompetition(userId, idSchema.parse(id));
}
