import {
  type EstadoDoMundo,
  type FamiliaId,
  type Fase,
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
  /** O apelido de outro jogador, se quem hospeda o jogo souber. */
  apelidoDe?(jogadorId: string): string | undefined;
};

/** As famílias que a pessoa pode ver, na ordem do mundo. */
export function familiasDoJogador(estado: EstadoDoMundo, jogadorId: string): FamiliaId[] {
  const minhas = new Set(
    estado.acessos.filter((acesso) => acesso.perfilId === jogadorId).map((a) => a.familiaId),
  );
  return estado.familias.ordem.filter((id) => minhas.has(id));
}

/** Como chamar outro jogador: pelo apelido, se houver; senão, sem inventar nome. */
export function nomeDoJogador(jogadorId: string, opcoes: OpcoesDosRetratos): string {
  if (jogadorId === opcoes.jogadorId) return "você";
  return opcoes.apelidoDe?.(jogadorId) || "outra pessoa";
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
    const quem = nomeDoJogador(reserva.perfilId, opcoes);
    // Na plaquinha cabe pouco: o apelido, se houver; sem ele, só que o morador está ocupado.
    const apelido = opcoes.apelidoDe?.(reserva.perfilId);
    const emEspera = presenca.jogadores.some(
      (jogador) => jogador.perfilId === reserva.perfilId && jogador.estado === "em_graca",
    );
    return {
      ...base,
      estado: "outro",
      legenda: emEspera ? `Dirigido por ${quem}, em espera` : `Dirigido por ${quem}`,
      placa: emEspera ? "em espera" : apelido || "ocupado",
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

export function resumoDaPresenca(presenca: PresencaVista, jogadorId: string): PresencaResumida {
  const outros = presenca.jogadores.filter((jogador) => jogador.perfilId !== jogadorId);
  const presentes = outros.filter((jogador) => jogador.estado === "presente").length;
  const emEspera = outros.length - presentes;
  let texto = "Só você no mundo";
  if (presentes === 1) texto = "Você e mais 1 pessoa";
  else if (presentes > 1) texto = `Você e mais ${presentes} pessoas`;
  if (emEspera > 0) texto += emEspera === 1 ? " · 1 em espera" : ` · ${emEspera} em espera`;
  return { presentes: presentes + 1, emEspera, texto };
}
