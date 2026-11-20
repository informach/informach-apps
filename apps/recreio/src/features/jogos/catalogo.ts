import { type GameManifest, JOGOS, jogoPorId } from "@informach/config/jogos";

/**
 * O catálogo deste deploy: os jogos públicos de `@informach/config/jogos` e,
 * só quando o ambiente pede, o jogo de teste. Sem ambiente e sem Next, para
 * ser testado direto; quem lê a variável é `config.ts`.
 */

/** Um manifesto como o app o usa: igual ao do catálogo, com o id aberto para o jogo de teste. */
export type ManifestoDoJogo = Omit<GameManifest, "id"> & { id: string };

export const JOGO_DE_TESTE_ID = "teste";
export const JOGO_DE_PERFIL_ID = "perfil-teste";
export const JOGO_DE_CARGA_ID = "carga-teste";

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
    checkpoint: "servidor",
    visitas: true,
    conquistas: false,
    textoLivre: false,
    conteudoDeUsuario: false,
  },
  classificacao: { faixa: "L", descritores: [], interacoes: ["interação entre usuários"] },
  limites: {
    mundosCriadosPorPerfil: 3,
    jogadoresSimultaneosMax: 8,
    fotografiaMaxBytes: 64 * 1024,
    diarioLoteMaxBytes: 16 * 1024,
    diarioPendenteMaxBytes: 256 * 1024,
  },
};

/** Os jogos deste deploy, na ordem do catálogo público; o de teste vem por último. */
export function catalogoDosJogos(comJogoDeTeste: boolean): readonly ManifestoDoJogo[] {
  return comJogoDeTeste ? [...JOGOS, JOGO_DE_TESTE, JOGO_DE_PERFIL, JOGO_DE_CARGA] : JOGOS;
}

/** O manifesto de um jogo deste deploy, ou `null`. Com a opção desligada, `teste` não existe. */
export function manifestoNoCatalogo(jogo: string, comJogoDeTeste: boolean): ManifestoDoJogo | null {
  if (comJogoDeTeste && jogo === JOGO_DE_TESTE_ID) return JOGO_DE_TESTE;
  if (comJogoDeTeste && jogo === JOGO_DE_PERFIL_ID) return JOGO_DE_PERFIL;
  if (comJogoDeTeste && jogo === JOGO_DE_CARGA_ID) return JOGO_DE_CARGA;
  return jogoPorId(jogo);
}

/** Prova de persistência privada, sem servidor de jogo nem mundos. */
export const JOGO_DE_PERFIL: ManifestoDoJogo = {
  ...JOGO_DE_TESTE,
  id: JOGO_DE_PERFIL_ID,
  nome: "Prova de progresso por perfil",
  rota: "/jogar/perfil-teste",
  capacidades: {
    ...JOGO_DE_TESTE.capacidades,
    mundos: null,
    visitas: false,
    posse: [],
    dadosDePerfil: true,
    checkpoint: "perfil",
    conquistas: true,
  },
  conquistas: ["primeiro-ponto"],
  classificacao: { faixa: "L", descritores: [], interacoes: [] },
  limites: { ...JOGO_DE_TESTE.limites, mundosCriadosPorPerfil: 0 },
};

/** Independent protocol benchmark, not a new public title or a change to the
 * four-member counter fixture. Eight native members use the normal kernel. */
export const JOGO_DE_CARGA: ManifestoDoJogo = {
  ...JOGO_DE_TESTE,
  id: JOGO_DE_CARGA_ID,
  nome: "Prova de carga",
  rota: "/jogar/carga-teste",
  capacidades: { ...JOGO_DE_TESTE.capacidades, mundos: { membrosMax: 8 } },
};
