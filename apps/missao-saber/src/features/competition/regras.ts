import { isSuspended } from "../content/availability";
import {
  courseAssessmentBanks,
  courseLessons,
  courseLine,
  coursesForGrade,
} from "../content/catalog";
import type { Course, Item, Lesson } from "../content/types";
import { desafios, faixaDoAno, ordemFaixa } from "../pecas/catalogo";
import { sorteador } from "../pecas/montagem";
import type { Desafio } from "../pecas/tipos";
import { type Area, areas, FOLGA_MS, PONTOS } from "./constantes";

/**
 * Regras puras da competição em família: quem pode jogar cada área, o que
 * cada criança sorteia, em que ordem as vezes acontecem e como os pontos
 * viram pódio. O servidor usa estas funções; os testes também.
 */

export { type Area, areas, FOLGA_MS, LIMITES, PONTOS } from "./constantes";

export function cursosDaArea(area: Area, ano: number): Course[] {
  const linhas = areas[area].linhas;
  return coursesForGrade(ano).filter((curso) => linhas.includes(courseLine(curso)));
}

export type Elegibilidade = { elegivel: true; nivel: string } | { elegivel: false; motivo: string };
export function elegibilidade(area: Area, ano: number): Elegibilidade {
  const cursos = cursosDaArea(area, ano);
  if (!cursos.length)
    return {
      elegivel: false,
      motivo:
        area === "financeira"
          ? "A Financeira começa no 6º ano."
          : "Ainda não há perguntas desta área para este ano.",
    };
  return { elegivel: true, nivel: cursos.map((curso) => curso.label).join(" e ") };
}

export type Acesso = {
  pago: boolean;
  perfilLiberado: boolean;
  /** Estados de conteúdo publicados (suspensões). */
  estados: ReadonlyMap<string, { status: string }>;
};

export type ProblemaSorteado = { lessonId: string; item: Item };

/** Itens que funcionam numa vez cronometrada: escolha ou número, sem montagem prévia. */
function itemServe(item: Item) {
  return (
    (item.type === "choice" || item.type === "numeric") &&
    !item.exploration &&
    item.purpose !== "discovery"
  );
}

function unidadesLiberadas(cursos: Course[], acesso: Acesso): Lesson[] {
  const unidades = cursos.flatMap((curso) => [
    ...courseLessons(curso),
    ...courseAssessmentBanks(curso),
  ]);
  return unidades.filter(
    (licao) =>
      !isSuspended(acesso.estados.get(licao.id)) &&
      (licao.free || (acesso.pago && acesso.perfilLiberado)),
  );
}

function embaralhar<T>(lista: T[], sorte: () => number) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(sorte() * (i + 1));
    [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
  }
  return copia;
}

/**
 * Sorteia `quantidade` problemas do nível da criança. Prefere o que ela ainda
 * não viu em competições e varia a habilidade e a família de atividade, para
 * que a competição não vire dez contas iguais.
 */
export function sortearProblemas(input: {
  area: Area;
  ano: number;
  quantidade: number;
  semente: number;
  acesso: Acesso;
  vistos: ReadonlySet<string>;
}): ProblemaSorteado[] {
  if (input.quantidade === 0) return [];
  const sorte = sorteador(input.semente);
  const unicos = new Map<string, ProblemaSorteado>();
  for (const licao of unidadesLiberadas(cursosDaArea(input.area, input.ano), input.acesso))
    for (const item of licao.items)
      if (itemServe(item) && !unicos.has(item.id))
        unicos.set(item.id, { lessonId: licao.id, item });
  const candidatos = embaralhar([...unicos.values()], sorte).sort(
    (a, b) => Number(input.vistos.has(a.item.id)) - Number(input.vistos.has(b.item.id)),
  );
  const escolhidos: ProblemaSorteado[] = [];
  const habilidades = new Set<string>();
  const familias = new Set<string>();
  // Primeiro uma passada que exige habilidade nova, depois família nova, depois qualquer.
  for (const exigencia of ["habilidade", "familia", "qualquer"] as const)
    for (const candidato of candidatos) {
      if (escolhidos.length === input.quantidade) return escolhidos;
      if (escolhidos.includes(candidato)) continue;
      if (exigencia === "habilidade" && habilidades.has(candidato.item.skillId)) continue;
      if (exigencia !== "qualquer" && familias.has(candidato.item.familyId)) continue;
      escolhidos.push(candidato);
      habilidades.add(candidato.item.skillId);
      familias.add(candidato.item.familyId);
    }
  if (escolhidos.length < input.quantidade)
    throw new SorteioInsuficiente(
      `Há só ${escolhidos.length} perguntas disponíveis para este nível. Diminua a quantidade de problemas.`,
    );
  return escolhidos;
}

export class SorteioInsuficiente extends Error {}

/** Desafios da faixa da criança; se faltar, completa com as faixas anteriores. */
export function sortearDesafios(input: {
  ano: number;
  quantidade: number;
  semente: number;
  acesso: Pick<Acesso, "pago" | "perfilLiberado">;
  vistos: ReadonlySet<string>;
}): Desafio[] {
  if (input.quantidade === 0) return [];
  const sorte = sorteador(input.semente);
  const faixa = faixaDoAno(input.ano);
  const liberados = desafios.filter(
    (d) => d.gratuito || (input.acesso.pago && input.acesso.perfilLiberado),
  );
  const porProximidade = (d: Desafio) => {
    const distancia = ordemFaixa[faixa] - ordemFaixa[d.faixa];
    // Faixa da criança primeiro, depois as anteriores; faixas acima nunca.
    return distancia < 0 ? Number.POSITIVE_INFINITY : distancia;
  };
  const candidatos = embaralhar(liberados, sorte)
    .filter((d) => Number.isFinite(porProximidade(d)))
    .sort(
      (a, b) =>
        porProximidade(a) - porProximidade(b) ||
        Number(input.vistos.has(a.id)) - Number(input.vistos.has(b.id)),
    );
  if (candidatos.length < input.quantidade)
    throw new SorteioInsuficiente(
      input.acesso.pago
        ? "Não há desafios de peças suficientes para esta faixa. Diminua a quantidade de desafios."
        : "Sem assinatura, há poucos desafios de peças abertos. Diminua a quantidade de desafios.",
    );
  return candidatos.slice(0, input.quantidade);
}

export type Vez = { assento: number; tipo: "problem" | "challenge"; rodada: number };
/** Problemas primeiro, intercalando as crianças; os desafios ficam para o fim. */
export function ordemDasVezes(
  competidores: number,
  problemas: number,
  desafiosPorCrianca: number,
): Vez[] {
  const vezes: Vez[] = [];
  for (let rodada = 0; rodada < problemas; rodada += 1)
    for (let assento = 0; assento < competidores; assento += 1)
      vezes.push({ assento, tipo: "problem", rodada });
  for (let rodada = 0; rodada < desafiosPorCrianca; rodada += 1)
    for (let assento = 0; assento < competidores; assento += 1)
      vezes.push({ assento, tipo: "challenge", rodada });
  return vezes;
}

export function pontosDaVez(tipo: "problem" | "challenge", acertou: boolean) {
  if (!acertou) return 0;
  return tipo === "problem" ? PONTOS.problema : PONTOS.desafio;
}

export type Colocado<T> = T & { pontos: number; posicao: number };
/** Empate divide a posição: 8, 8, 5 viram 1º, 1º e 3º. */
export function podio<T extends { pontos: number }>(competidores: T[]): Colocado<T>[] {
  const ordenados = [...competidores].sort((a, b) => b.pontos - a.pontos);
  return ordenados.map((c) => ({
    ...c,
    posicao: 1 + ordenados.filter((outro) => outro.pontos > c.pontos).length,
  }));
}

export function prazoEsgotado(prazo: Date, agora: Date) {
  return agora.getTime() > prazo.getTime() + FOLGA_MS;
}
