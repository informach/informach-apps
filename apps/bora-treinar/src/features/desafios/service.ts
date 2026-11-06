import "server-only";
import { type Access, canUseChallenges } from "@/features/acesso/policy";
import { allowedProfileIds } from "@/features/familia/profile-access";
import { listProfiles } from "@/features/familia/repository";
import { familySessionsSince } from "@/features/sessoes/repository";
import { inicioDaSemana, inicioDoDiaLocal, relogioLocal, somarDias } from "@/lib/datas";
import { AppError } from "@/lib/errors";
import type { Desafio, SessaoDaSemana } from "./placar";
import {
  type Cooperativo,
  desafioCooperativo,
  desafiosAte,
  diasRestantes,
  feitoNaSemana,
  SEMANAS_DE_HISTORICO,
} from "./regras";
import { challengeOf, challengesBetween, createMissingProfileChallenges } from "./repository";

export interface SemanaPassada {
  weekStart: string;
  desafio: Desafio;
  feito: number;
  cumprido: boolean;
}

export interface DesafioPessoal {
  desafio: Desafio;
  feito: number;
  progresso: number;
  cumprido: boolean;
}

/** Tudo o que o cartão do desafio precisa, já serializável para o cliente. */
export type DadosDoDesafio =
  | { liberado: false }
  | {
      liberado: true;
      /** Segunda-feira local da semana, AAAA-MM-DD. */
      semana: string;
      /** Dias que faltam, contando hoje (segunda = 7, domingo = 1). */
      diasRestantes: number;
      perfil: { id: string; name: string; color: string };
      pessoal: DesafioPessoal;
      /** O desafio cooperativo da família desta semana, se a casa escolheu um. */
      familia: (Cooperativo & { desafio: Desafio }) | null;
      /** O último desafio da família antes desta semana, para repetir com um toque. */
      ultimoDaFamilia: Desafio | null;
      /** Quantos perfis o plano libera (com um só, o desafio da família não faz sentido). */
      perfisLiberados: number;
      /** As últimas 8 semanas, da mais recente para a mais antiga. */
      historico: { pessoal: SemanaPassada[]; familia: SemanaPassada[] };
    };

const semSemana = (r: Desafio): Desafio => ({
  metric: r.metric,
  exerciseId: r.exerciseId,
  target: r.target,
});

type SessaoComSemana = SessaoDaSemana & { weekStart: string };

/**
 * O desafio da semana de um perfil: o pessoal (criado aqui se ainda não existe, renovado a partir
 * das semanas anteriores) e o cooperativo da família, com o histórico das últimas 8 semanas.
 * Pode ser chamado por várias telas ao mesmo tempo: a criação é idempotente.
 */
export async function dadosDoDesafio(
  userId: string,
  profileId: string,
  fuso: string,
  access: Access,
  agora: Date = new Date(),
): Promise<DadosDoDesafio> {
  if (!canUseChallenges(access)) return { liberado: false };
  const perfis = await listProfiles(userId);
  const liberados = new Set(allowedProfileIds(perfis, access.profileLimit));
  const perfil = perfis.find((p) => p.id === profileId && liberados.has(p.id));
  if (!perfil) throw new AppError("NOT_FOUND", "Perfil não encontrado.");

  const semana = inicioDaSemana(agora, fuso);
  const inicioHistorico = somarDias(semana, -7 * SEMANAS_DE_HISTORICO);
  const [sessoes, registrosPessoais] = await Promise.all([
    familySessionsSince(userId, inicioDoDiaLocal(inicioHistorico, fuso)),
    challengesBetween(userId, profileId, inicioHistorico, somarDias(semana, 7)),
  ]);
  const daFamilia: SessaoComSemana[] = sessoes
    .filter((s) => liberados.has(s.profileId))
    .map((s) => ({
      profileId: s.profileId,
      durationSeconds: s.duration,
      logs: s.logs,
      weekStart: inicioDaSemana(s.startedAt, fuso),
    }));
  const doPerfilNa = (weekStart: string) =>
    daFamilia.filter((s) => s.profileId === profileId && s.weekStart === weekStart);
  const daFamiliaNa = (weekStart: string) => daFamilia.filter((s) => s.weekStart === weekStart);

  const faltam = desafiosAte(
    semana,
    registrosPessoais.map(({ weekStart, ...desafio }) => ({ weekStart, desafio })),
    doPerfilNa,
    perfil.intensity,
  );
  let pessoais = registrosPessoais;
  if (faltam.length) {
    await createMissingProfileChallenges(userId, profileId, faltam);
    // relê: se outra tela criou a semana antes, vale o que ela gravou
    pessoais = await challengesBetween(userId, profileId, inicioHistorico, somarDias(semana, 7));
  }
  const atual = pessoais.find((r) => r.weekStart === semana);
  if (!atual) throw new Error("Desafio pessoal da semana não foi criado.");

  const [familiaAtual, registrosDaFamilia] = await Promise.all([
    challengeOf(userId, semana),
    challengesBetween(userId, null, inicioHistorico, semana),
  ]);
  const perfisLiberados = perfis.filter((p) => liberados.has(p.id));

  const passada = (
    r: { weekStart: string } & Desafio,
    sessoesDa: (weekStart: string) => SessaoDaSemana[],
  ): SemanaPassada => {
    const { weekStart } = r;
    const desafio = semSemana(r);
    const feito = feitoNaSemana(desafio, sessoesDa(weekStart));
    return { weekStart, desafio, feito, cumprido: feito >= desafio.target };
  };
  const desafioPessoal = semSemana(atual);
  const ultimoDaFamilia = registrosDaFamilia.at(-1);
  const feito = feitoNaSemana(desafioPessoal, doPerfilNa(semana));

  return {
    liberado: true,
    semana,
    diasRestantes: diasRestantes(semana, relogioLocal(agora, fuso).data),
    perfil: { id: perfil.id, name: perfil.name, color: perfil.color },
    pessoal: {
      desafio: desafioPessoal,
      feito,
      progresso: Math.min(1, feito / desafioPessoal.target),
      cumprido: feito >= desafioPessoal.target,
    },
    familia: familiaAtual
      ? {
          desafio: familiaAtual,
          ...desafioCooperativo(familiaAtual, daFamiliaNa(semana), perfisLiberados),
        }
      : null,
    ultimoDaFamilia: ultimoDaFamilia ? semSemana(ultimoDaFamilia) : null,
    perfisLiberados: perfisLiberados.length,
    historico: {
      pessoal: pessoais
        .filter((r) => r.weekStart < semana)
        .map((r) => passada(r, doPerfilNa))
        .reverse(),
      familia: registrosDaFamilia.map((r) => passada(r, daFamiliaNa)).reverse(),
    },
  };
}
