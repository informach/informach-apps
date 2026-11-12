import { type GameManifest, JOGOS, jogoPorId } from "@informach/config/jogos";

/**
 * O catálogo deste deploy: os jogos públicos de `@informach/config/jogos` e,
 * só quando o ambiente pede, o jogo de teste. Sem ambiente e sem Next, para
 * ser testado direto; quem lê a variável é `config.ts`.
 */

/** Um manifesto como o app o usa: igual ao do catálogo, com o id aberto para o jogo de teste. */
export type ManifestoDoJogo = Omit<GameManifest, "id"> & { id: string };

export const JOGO_DE_TESTE_ID = "teste";

/**
 * O jogo de teste: um contador por mundo, com a lista de quem está presente.
 * Existe para provar a plataforma de ponta a ponta (ingresso, sessão, mundo,
 * posse, diário, fotografia) sem código de jogo nenhum. Não entra em
 * `@informach/config/jogos`, que é o catálogo público: o site, a estante e o
 * Bastidores nunca o veem. O cliente fica em `features/jogo-de-teste` e o
 * servidor em `e2e/servidor`.
 */
export const JOGO_DE_TESTE: ManifestoDoJogo = {
  id: JOGO_DE_TESTE_ID,
  nome: "Jogo de teste",
  rota: "/jogar/teste",
  sdk: "^0.1",
  versao: "0.0.0",
  estado: "interno",
  aparelhos: ["computador"],
  capacidades: {
    mundos: { membrosMax: 4 },
    posse: ["servidor"],
    dadosDePerfil: false,
    conquistas: false,
    textoLivre: false,
    conteudoDeUsuario: false,
  },
  classificacao: { faixa: "L", descritores: [], interacoes: ["interação entre usuários"] },
  limites: {
    mundosCriadosPorPerfil: 3,
    fotografiaMaxBytes: 64 * 1024,
    diarioLoteMaxBytes: 16 * 1024,
    diarioPendenteMaxBytes: 256 * 1024,
  },
};

/** Os jogos deste deploy, na ordem do catálogo público; o de teste vem por último. */
export function catalogoDosJogos(comJogoDeTeste: boolean): readonly ManifestoDoJogo[] {
  return comJogoDeTeste ? [...JOGOS, JOGO_DE_TESTE] : JOGOS;
}

/** O manifesto de um jogo deste deploy, ou `null`. Com a opção desligada, `teste` não existe. */
export function manifestoNoCatalogo(jogo: string, comJogoDeTeste: boolean): ManifestoDoJogo | null {
  if (comJogoDeTeste && jogo === JOGO_DE_TESTE_ID) return JOGO_DE_TESTE;
  return jogoPorId(jogo);
}
