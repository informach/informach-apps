import { necessidadesDaFase } from "../conteudo";
import { type Id, type MoradorId, montarId, numeroDoId, type PrefixoDeId, relacaoId } from "./ids";
import { inserir, obter } from "./tabela";
import type { EstadoDoMundo, Fase, Mil, Relacao } from "./tipos";

/** Próximo id de um prefixo. O contador fica no estado, então é determinístico. */
export function novoId<P extends PrefixoDeId>(estado: EstadoDoMundo, prefixo: P): Id<P> {
  const proximo = (estado.contadores[prefixo] ?? 0) + 1;
  estado.contadores[prefixo] = proximo;
  return montarId(prefixo, proximo);
}

/**
 * Avisa o contador de um id que entrou por outro caminho (um fato reaplicado
 * depois de uma queda): o próximo id gerado nunca repete um que já existe.
 */
export function registrarId(estado: EstadoDoMundo, id: string): void {
  const numero = numeroDoId(id);
  if (numero === null) return;
  const prefixo = id.slice(0, id.lastIndexOf("_"));
  if ((estado.contadores[prefixo] ?? 0) < numero) estado.contadores[prefixo] = numero;
}

export function necessidadesIniciais(fase: Fase, valor: Mil = 800_000): Record<string, Mil> {
  const saida: Record<string, Mil> = {};
  for (const def of necessidadesDaFase(fase)) saida[def.id] = valor;
  return saida;
}

/**
 * Ajusta as necessidades de quem mudou de fase: mantém as que continuam,
 * começa as novas e esquece as que deixaram de existir.
 */
export function necessidadesNaNovaFase(
  atuais: Record<string, Mil>,
  fase: Fase,
): Record<string, Mil> {
  const saida: Record<string, Mil> = {};
  for (const def of necessidadesDaFase(fase)) saida[def.id] = atuais[def.id] ?? 700_000;
  return saida;
}

/** A relação de um par, criando-a vazia na primeira vez. */
export function relacaoEntre(estado: EstadoDoMundo, a: MoradorId, b: MoradorId): Relacao {
  if (a === b) throw new Error("Um morador não tem relação consigo mesmo");
  const id = relacaoId(a, b);
  const existente = obter(estado.relacoes, id);
  if (existente) return existente;
  const [primeiro, segundo] = a < b ? [a, b] : [b, a];
  const relacao: Relacao = {
    id,
    a: primeiro,
    b: segundo,
    versao: 1,
    eixos: { amizade: 0, romance: 0, confianca: 0 },
    casal: "nenhum",
    parentesco: null,
    marcos: [],
  };
  inserir(estado.relacoes, id, relacao);
  for (const moradorId of [primeiro, segundo]) {
    const morador = obter(estado.moradores, moradorId);
    if (morador && !morador.relacoes.includes(id)) morador.relacoes.push(id);
  }
  return relacao;
}

export function relacaoExistente(
  estado: EstadoDoMundo,
  a: MoradorId,
  b: MoradorId,
): Relacao | undefined {
  return a === b ? undefined : obter(estado.relacoes, relacaoId(a, b));
}

/** São parentes diretos: pai ou mãe e filho, ou irmãos. */
export function saoParentes(estado: EstadoDoMundo, a: MoradorId, b: MoradorId): boolean {
  return relacaoExistente(estado, a, b)?.parentesco != null;
}

export function tamanhoDaFamilia(estado: EstadoDoMundo, familiaId: string): number {
  let total = 0;
  for (const id of estado.moradores.ordem) {
    if (estado.moradores.porId[id]?.familiaId === familiaId) total++;
  }
  return total;
}
