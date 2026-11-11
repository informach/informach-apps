import type { Aparelho, EstadoDoJogo, GameId, GameManifest } from "@informach/config/jogos";

/**
 * O que a estante mostra de cada jogo. Só apresentação: quem pode abrir o quê
 * é decidido no servidor, por `decidirAcesso` (`@informach/recreio`), e o
 * estado de publicação não é direito de abrir.
 */
export type CartaoDeJogo = {
  id: GameId;
  nome: string;
  /** Estado de publicação, como a pessoa lê. */
  estado: string;
  /** Onde o jogo roda, como a pessoa lê. Ex.: "computador e tablet". */
  aparelhos: string;
};

const ROTULO_DO_ESTADO: Record<EstadoDoJogo, string> = {
  interno: "uso interno",
  em_breve: "em breve",
  alfa_fechado: "alfa fechado",
  beta_fechado: "beta fechado",
  acesso_antecipado: "acesso antecipado",
  lancado: "disponível",
  manutencao: "em manutenção",
  aposentado: "aposentado",
};

export function rotuloDoEstado(estado: EstadoDoJogo): string {
  return ROTULO_DO_ESTADO[estado];
}

/** "computador", "computador e tablet", "computador, tablet e celular". */
export function rotuloDosAparelhos(aparelhos: readonly Aparelho[]): string {
  if (aparelhos.length <= 1) return aparelhos[0] ?? "";
  return `${aparelhos.slice(0, -1).join(", ")} e ${aparelhos.at(-1)}`;
}

export function cartoesDaEstante(jogos: readonly GameManifest[]): CartaoDeJogo[] {
  return jogos.map((jogo) => ({
    id: jogo.id,
    nome: jogo.nome,
    estado: rotuloDoEstado(jogo.estado),
    aparelhos: rotuloDosAparelhos(jogo.aparelhos),
  }));
}
