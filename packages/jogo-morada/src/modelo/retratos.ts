import {
  type EstadoDoMundo,
  type FamiliaId,
  type Fase,
  type JogadorVisto,
  listar,
  type Morador,
  type MoradorId,
  type PresencaVista,
  temPermissao,
} from "@informach/morada-sim";
import { rotuloDaFase } from "./textos";

/**
 * Os retratos: todos os moradores das famílias a que a pessoa tem acesso, do
 * bebê ao idoso, cada um com o estado de quem o dirige. É por eles que se
 * escolhe um morador; não existe morador "do jogador" fora da reserva.
 */

export type EstadoDoRetrato =
  /** Ninguém dirige e a pessoa pode assumir. */
  | "disponivel"
  | "voce"
  | "outro"
  /** Ninguém dirige e a pessoa não pode assumir: bebê de colo, ou família em que ela só olha. */
  | "autonomo";

export type Retrato = {
  moradorId: MoradorId;
  nome: string;
  fase: Fase;
  rotuloDaFase: string;
  pele: number;
  estado: EstadoDoRetrato;
  /** A frase do estado, como na proposta. */
  legenda: string;
  /** A palavra curta que vai na plaquinha do retrato. */
  placa: string;
  /** Quem dirige caiu e ainda pode voltar. */
  emEspera: boolean;
  /** Tocar no retrato abre os cuidados em vez de pedir a reserva. */
  cuidados: boolean;
};

export type OpcoesDosRetratos = {
  /** Quem a pessoa é neste mundo (`bem_vindo.jogadorId`). */
  jogadorId: string;
};

/** As famílias que a pessoa pode ver, na ordem do mundo. */
export function familiasDoJogador(estado: EstadoDoMundo, jogadorId: string): FamiliaId[] {
  const minhas = new Set(
    estado.acessos.filter((acesso) => acesso.perfilId === jogadorId).map((a) => a.familiaId),
  );
  return estado.familias.ordem.filter((id) => minhas.has(id));
}

/** O apelido de um jogador que está no mundo, como o servidor o conta; `null` se não veio. */
export function apelidoDoJogador(presenca: PresencaVista, jogadorId: string): string | null {
  return presenca.jogadores.find((jogador) => jogador.perfilId === jogadorId)?.apelido || null;
}

/** Como chamar outro jogador: pelo apelido, se houver; senão, sem inventar nome. */
export function nomeDoJogador(
  presenca: PresencaVista,
  jogadorId: string,
  opcoes: OpcoesDosRetratos,
): string {
  if (jogadorId === opcoes.jogadorId) return "você";
  return apelidoDoJogador(presenca, jogadorId) ?? "outra pessoa";
}

function retratoDe(
  estado: EstadoDoMundo,
  presenca: PresencaVista,
  morador: Morador,
  opcoes: OpcoesDosRetratos,
): Retrato {
  const reserva = presenca.reservas.find((r) => r.moradorId === morador.id);
  const base = {
    moradorId: morador.id,
    nome: morador.nome,
    fase: morador.fase,
    rotuloDaFase: rotuloDaFase(morador),
    pele: morador.aparencia.pele,
    cuidados: morador.fase === "colo",
  };
  if (reserva?.perfilId === opcoes.jogadorId) {
    return {
      ...base,
      estado: "voce",
      legenda: "Dirigido por você",
      placa: "você",
      emEspera: false,
    };
  }
  if (reserva) {
    const quem = nomeDoJogador(presenca, reserva.perfilId, opcoes);
    // Na plaquinha cabe pouco: o apelido, se houver; sem ele, só que o morador está ocupado.
    const apelido = apelidoDoJogador(presenca, reserva.perfilId);
    const emEspera = presenca.jogadores.some(
      (jogador) => jogador.perfilId === reserva.perfilId && jogador.estado === "em_graca",
    );
    return {
      ...base,
      estado: "outro",
      legenda: emEspera ? `Dirigido por ${quem}, em espera` : `Dirigido por ${quem}`,
      placa: emEspera ? "em espera" : (apelido ?? "ocupado"),
      emEspera,
    };
  }
  const podeAssumir =
    morador.fase !== "colo" &&
    temPermissao(estado, opcoes.jogadorId, morador.familiaId, "comandar");
  if (podeAssumir) {
    return {
      ...base,
      estado: "disponivel",
      legenda: "Disponível",
      placa: "livre",
      emEspera: false,
    };
  }
  return {
    ...base,
    estado: "autonomo",
    legenda: morador.fase === "colo" ? "Autônomo, pede cuidado" : "Autônomo",
    placa: morador.fase === "colo" ? "cuidar" : "autônomo",
    emEspera: false,
  };
}

/** Os retratos da pessoa, na ordem em que os moradores entraram no mundo. */
export function retratosDe(
  estado: EstadoDoMundo,
  presenca: PresencaVista,
  opcoes: OpcoesDosRetratos,
): Retrato[] {
  const familias = new Set(familiasDoJogador(estado, opcoes.jogadorId));
  return listar(estado.moradores)
    .filter((morador) => morador.familiaId !== null && familias.has(morador.familiaId))
    .map((morador) => retratoDe(estado, presenca, morador, opcoes));
}

export type Vizinho = {
  moradorId: MoradorId;
  nome: string;
  rotuloDaFase: string;
  pele: number;
  /** Está em algum lote agora, de visita. */
  deVisita: boolean;
};

/** Os moradores avulsos do bairro: é convidando um deles que a família conhece gente nova. */
export function vizinhosDe(estado: EstadoDoMundo): Vizinho[] {
  return listar(estado.moradores)
    .filter((morador) => morador.familiaId === null)
    .map((morador) => ({
      moradorId: morador.id,
      nome: morador.nome,
      rotuloDaFase: rotuloDaFase(morador),
      pele: morador.aparencia.pele,
      deVisita: morador.local.t !== "fora",
    }));
}

export type PresencaResumida = {
  /** Quantas pessoas estão conectadas agora, contando a própria. */
  presentes: number;
  /** Quantas caíram e ainda podem voltar. */
  emEspera: number;
  texto: string;
};

/** Quantos apelidos cabem na linha da presença; os outros entram na conta. */
const NOMES_NA_LINHA = 3;

/** "Bruno", "Bruno e Ana", "Bruno, Ana e Caio". */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** Os apelidos que cabem na linha e quantos jogadores ficaram sem nome nela. */
function nomear(jogadores: readonly JogadorVisto[]): { nomes: string[]; resto: number } {
  const nomes = jogadores
    .flatMap((jogador) => (jogador.apelido ? [jogador.apelido] : []))
    .slice(0, NOMES_NA_LINHA);
  return { nomes, resto: jogadores.length - nomes.length };
}

/** Quem está no mundo com a pessoa e quem caiu e ainda pode voltar, pelo apelido de cada um. */
export function resumoDaPresenca(presenca: PresencaVista, jogadorId: string): PresencaResumida {
  const outros = presenca.jogadores.filter((jogador) => jogador.perfilId !== jogadorId);
  const presentes = outros.filter((jogador) => jogador.estado === "presente");
  const emEspera = outros.filter((jogador) => jogador.estado !== "presente");
  let texto = "Só você no mundo";
  if (presentes.length > 0) {
    const { nomes, resto } = nomear(presentes);
    if (resto > 0) nomes.push(resto === 1 ? "mais 1 pessoa" : `mais ${resto} pessoas`);
    texto = enumerar(["Você", ...nomes]);
  }
  if (emEspera.length > 0) {
    const { nomes, resto } = nomear(emEspera);
    if (resto > 0) nomes.push(nomes.length > 0 ? `mais ${resto}` : String(resto));
    texto += ` · ${enumerar(nomes)} em espera`;
  }
  return { presentes: presentes.length + 1, emEspera: emEspera.length, texto };
}
