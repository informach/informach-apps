/**
 * Catálogo dos jogos do Recreio. É a parte do catálogo que muda por deploy:
 * o que o jogo suporta. O que cada perfil pode abrir é decidido pelo Recreio
 * no servidor, e o estado de publicação não é direito de abrir.
 */

export type GameId = "morada";

export type Faixa = "em_analise" | "L" | "6" | "10" | "12" | "14" | "16" | "18";

export type EstadoDoJogo =
  | "interno"
  | "em_breve"
  | "alfa_fechado"
  | "beta_fechado"
  | "acesso_antecipado"
  | "lancado"
  | "manutencao"
  | "aposentado";

export type Aparelho = "computador" | "tablet" | "celular";

/** Onde a simulação de um mundo pode rodar. O Morada só roda no servidor. */
export type LocalDaPosse = "servidor" | "offline" | "navegador";

export type PoliticaDeMundo = {
  id: string;
  faixaMinima: Faixa;
  padrao?: boolean;
};

export type LimitesDoJogo = {
  /** Mundos criados por perfil, sem contar os de outras pessoas em que ele é membro. */
  mundosCriadosPorPerfil: number;
  /** Tamanho máximo de uma fotografia comprimida, em bytes. */
  fotografiaMaxBytes: number;
  /** Tamanho máximo de um lote de entradas do diário, em bytes. */
  diarioLoteMaxBytes: number;
  /** Diário ainda não coberto por fotografia: acima disso o servidor exige checkpoint. */
  diarioPendenteMaxBytes: number;
};

export type GameManifest = {
  /** Imutável. */
  id: GameId;
  nome: string;
  rota: `/jogar/${string}`;
  /** Faixa de versões do SDK do Recreio que o jogo aceita. */
  sdk: string;
  versao: string;
  estado: EstadoDoJogo;
  aparelhos: readonly Aparelho[];
  capacidades: {
    /** Medido, não prometido. 1 = só sozinho. */
    mundos: { membrosMax: number };
    posse: readonly LocalDaPosse[];
    dadosDePerfil: boolean;
    conquistas: boolean;
    textoLivre: boolean;
    conteudoDeUsuario: boolean;
  };
  classificacao: {
    faixa: Faixa;
    descritores: readonly string[];
    interacoes: readonly string[];
  };
  politicasDeMundo?: readonly PoliticaDeMundo[];
  limites: LimitesDoJogo;
};

export const JOGOS = [
  {
    id: "morada",
    nome: "Morada",
    rota: "/jogar/morada",
    sdk: "^0.1",
    versao: "0.1.0",
    estado: "alfa_fechado",
    aparelhos: ["computador"],
    capacidades: {
      mundos: { membrosMax: 8 },
      posse: ["servidor"],
      dadosDePerfil: false,
      conquistas: false,
      textoLivre: false,
      conteudoDeUsuario: false,
    },
    classificacao: {
      faixa: "em_analise",
      descritores: [],
      interacoes: ["interação entre usuários"],
    },
    politicasDeMundo: [
      { id: "todas_as_idades", faixaMinima: "L", padrao: true },
      { id: "completo", faixaMinima: "12" },
    ],
    limites: {
      mundosCriadosPorPerfil: 3,
      fotografiaMaxBytes: 4 * 1024 * 1024,
      diarioLoteMaxBytes: 256 * 1024,
      diarioPendenteMaxBytes: 8 * 1024 * 1024,
    },
  },
] as const satisfies readonly GameManifest[];

export function jogoPorId(id: string): GameManifest | null {
  return JOGOS.find((jogo) => jogo.id === id) ?? null;
}

export function ehGameId(id: string): id is GameId {
  return JOGOS.some((jogo) => jogo.id === id);
}

const ORDEM_DAS_FAIXAS: readonly Faixa[] = ["L", "6", "10", "12", "14", "16", "18"];

/**
 * Um limite de classificação abre um conteúdo de faixa igual ou menor.
 * "em_analise" não abre para ninguém abaixo de 18: classificação provisória
 * não é tratada como definitiva.
 */
export function faixaPermite(limiteDoPerfil: Faixa, faixaDoConteudo: Faixa): boolean {
  if (limiteDoPerfil === "em_analise") return false;
  if (faixaDoConteudo === "em_analise") return limiteDoPerfil === "18";
  return ORDEM_DAS_FAIXAS.indexOf(faixaDoConteudo) <= ORDEM_DAS_FAIXAS.indexOf(limiteDoPerfil);
}
