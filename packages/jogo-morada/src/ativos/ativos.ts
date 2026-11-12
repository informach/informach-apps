import type { Aparencia, Fase, MoradorId, Objeto, ObjetoId } from "@informach/morada-sim";
import type { EntradaDeCatalogo } from "@informach/morada-sim/conteudo";
import type { Intersection, Object3D } from "three";
import type { PontoDaCena } from "../cena/espaco";
import type { PosturaDoCorpo } from "../cena/situacao";

/**
 * Como a cena pede o visual de um morador e dos objetos. A cena cuida de onde
 * cada coisa está, de quem é clicável e de quem dirige quem; os ativos só
 * dizem que cara as coisas têm.
 *
 * Há duas implementações: `AtivosProcedurais` (cápsulas e caixas), que roda
 * em qualquer lugar, e `AtivosDeArte`, que veste os moradores com os pacotes
 * de arte do servidor do jogo e usa as procedurais enquanto eles não chegam.
 *
 * Convenções do que os ativos devolvem, as do glTF: metros, altura em Y, a
 * frente em +Z, a origem no chão (nos pés do morador; no ponto de inserção do
 * objeto).
 */

export type DescricaoDoMorador = {
  moradorId: MoradorId;
  fase: Fase;
  /** Corpo, pele, cabelo, roupa e a semente das variações: o que os pacotes usam para montar. */
  aparencia: Aparencia;
};

export type PoseDoMorador = {
  postura: PosturaDoCorpo;
  andando: boolean;
  /** Está executando a ação em curso. */
  agindo: boolean;
  /** O clipe que a interação pede (`resident.eat.stand`...). O procedural ignora. */
  animacao: string | null;
  /** Este corpo carrega um bebê no colo. */
  carregando: boolean;
  /** Quanto da gravidez passou, de 0 a 1. */
  gravidez: number;
  /** Relógio da cena e tempo desde o quadro anterior, em milissegundos. */
  agoraMs: number;
  dtMs: number;
};

export interface VisualDoMorador {
  /** A cena põe isto no lugar e gira; o visual cuida do que está dentro. */
  readonly raiz: Object3D;
  /** Altura de pé, em metros: onde vão o nome e a marca de quem dirige. */
  readonly altura: number;
  /** Onde fica um bebê que este corpo carrega, no referencial da raiz. */
  readonly colo: PontoDaCena;
  aplicar(pose: PoseDoMorador): void;
  dispose(): void;
}

export type ObjetoDaCena = {
  objeto: Objeto;
  /** A entrada do catálogo; `undefined` se este cliente não conhece a peça. */
  entrada: EntradaDeCatalogo | undefined;
  /** Onde o objeto fica na cena, já com o canto do lote somado. */
  posicao: PontoDaCena;
};

export interface VisualDosObjetos {
  readonly raiz: Object3D;
  /** De um raio que acertou a raiz ao objeto acertado. */
  objetoDe(intersecao: Intersection): ObjetoId | null;
  /** O centro do topo de um objeto na cena, para ancorar o menu. */
  topoDe(objetoId: ObjetoId): PontoDaCena | null;
  /** Quais objetos aparecem: com as paredes baixas, o que fica no alto some. */
  definirVisiveis(visivel: (item: ObjetoDaCena) => boolean): void;
  dispose(): void;
}

export interface Ativos {
  /** O visual de todos os objetos de uma vez, para a implementação poder agrupar em instâncias. */
  criarObjetos(objetos: readonly ObjetoDaCena[]): VisualDosObjetos;
  /** O corpo de um morador. A cena pede outro quando a fase ou a aparência mudam. */
  criarMorador(descricao: DescricaoDoMorador): VisualDoMorador;
  /** A que altura o corpo fica ao usar um ponto do objeto, acima da base dele, em milímetros. */
  apoio(objeto: Objeto, ponto: string, postura: PosturaDoCorpo): number;
  /**
   * Avisa quando há visuais melhores do que os já entregues (um pacote acabou
   * de baixar): a cena refaz o que montou. O procedural nunca avisa.
   */
  aoMudar?(ouvinte: () => void): () => void;
  /** Solta geometrias, materiais e texturas compartilhados. */
  dispose(): void;
}
