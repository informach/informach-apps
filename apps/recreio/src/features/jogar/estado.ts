import { ehErroDoRecreio } from "@informach/recreio/sdk";

/**
 * O estado da página que hospeda um jogo, como uma máquina pequena e sem
 * efeitos: o componente despacha o que aconteceu e desenha o que sai daqui.
 */

/** Por que o jogo não está na tela. */
export type Parada =
  | "sem_login"
  | "sem_acesso"
  | "acesso_perdido"
  | "jogo_indisponivel"
  | "mundo_indisponivel"
  | "iniciando"
  | "outro_lugar"
  | "saiu_da_conta"
  | "sessao_encerrada"
  | "rede"
  | "falha";

export type EstadoDoHospedeiro =
  /** Pedindo o ingresso, abrindo a sessão e baixando o cliente do jogo. */
  | { fase: "carregando" }
  /** O perfil já joga em outro lugar: a página pergunta antes de continuar aqui. */
  | { fase: "ja_aberto" }
  | { fase: "jogando" }
  /** A pessoa pediu para sair; a página encerra a sessão e volta à estante. */
  | { fase: "saindo" }
  | { fase: "parado"; parada: Parada };

export type EventoDoHospedeiro =
  /** Começar, tentar de novo ou continuar aqui. */
  | { tipo: "abrir" }
  | { tipo: "ja_aberto" }
  | { tipo: "montado" }
  | { tipo: "parou"; parada: Parada }
  | { tipo: "sair" };

export const ESTADO_INICIAL: EstadoDoHospedeiro = { fase: "carregando" };

export function reduzir(
  estado: EstadoDoHospedeiro,
  evento: EventoDoHospedeiro,
): EstadoDoHospedeiro {
  // Quem está saindo não volta: o que chegar depois é resto da desmontagem.
  if (estado.fase === "saindo") return estado;
  switch (evento.tipo) {
    case "abrir":
      return estado.fase === "jogando" ? estado : { fase: "carregando" };
    case "ja_aberto":
      return estado.fase === "carregando" ? { fase: "ja_aberto" } : estado;
    case "montado":
      return estado.fase === "carregando" ? { fase: "jogando" } : estado;
    case "parou":
      // O primeiro motivo é o verdadeiro; os seguintes são consequência dele.
      return estado.fase === "parado" ? estado : { fase: "parado", parada: evento.parada };
    case "sair":
      return { fase: "saindo" };
  }
}

/** O motivo que acompanha uma recusa (`detalhe.motivo`), quando é texto. */
function motivoDe(erro: { detalhe: Readonly<Record<string, unknown>> }): string | null {
  return typeof erro.detalhe.motivo === "string" ? erro.detalhe.motivo : null;
}

/** Como uma sessão de jogo que acabou aparece para a pessoa. */
function paradaDoFimDaSessao(motivo: string | null): Parada {
  if (motivo === "replaced") return "outro_lugar";
  if (motivo === "signed_out") return "saiu_da_conta";
  if (motivo === "access_lost") return "acesso_perdido";
  return "sessao_encerrada";
}

/**
 * Traduz o que interrompeu o jogo (a recusa do Recreio, uma falha de rede, um
 * erro do próprio cliente) no motivo que a página mostra.
 */
export function paradaDoErro(erro: unknown): Parada {
  if (!ehErroDoRecreio(erro)) return "falha";
  switch (erro.codigo) {
    case "NAO_AUTENTICADO":
    case "SEM_PERFIL":
      return "sem_login";
    case "ACESSO_NEGADO":
      return "sem_acesso";
    case "ACESSO_PERDIDO": {
      // A renovação recusa com o motivo quando foi a sessão do aparelho que caiu.
      const motivo = motivoDe(erro);
      return motivo === "signed_out" || motivo === "replaced"
        ? paradaDoFimDaSessao(motivo)
        : "acesso_perdido";
    }
    case "SESSAO_ENCERRADA":
      return paradaDoFimDaSessao(motivoDe(erro));
    case "SESSAO_INVALIDA":
    case "INGRESSO_INVALIDO":
      return "sessao_encerrada";
    case "JOGO_INDISPONIVEL":
      return "jogo_indisponivel";
    case "NAO_MEMBRO":
    case "NAO_ENCONTRADO":
    case "MUNDO_INDISPONIVEL":
    case "MUNDO_CHEIO":
    case "POLITICA_INCOMPATIVEL":
      return "mundo_indisponivel";
    case "SEM_INSTANCIA":
      return "iniciando";
    case "INDISPONIVEL":
    case "MUITAS_TENTATIVAS":
      return "rede";
    default:
      return "falha";
  }
}

/** A mudança de acesso que o SDK avisa (`aoMudarAcesso`), como motivo da página. */
export function paradaDaMudanca(mudanca: { codigo: string; motivo?: string }): Parada {
  if (mudanca.codigo === "SESSAO_ENCERRADA") return paradaDoFimDaSessao(mudanca.motivo ?? null);
  if (mudanca.codigo === "ACESSO_PERDIDO")
    return mudanca.motivo === "signed_out" || mudanca.motivo === "replaced"
      ? paradaDoFimDaSessao(mudanca.motivo)
      : "acesso_perdido";
  if (mudanca.codigo === "INDISPONIVEL") return "rede";
  return "sessao_encerrada";
}

export type TextoDaParada = {
  titulo: string;
  texto: string;
  /**
   * O que a pessoa pode fazer além de voltar à estante: `tentar` abre o jogo
   * de novo; `entrar` recarrega a página, e o portal pede o login e traz a
   * pessoa de volta; `nada` deixa só o caminho de volta.
   */
  acao: "tentar" | "entrar" | "nada";
  /** O texto do botão da ação, quando não é o padrão. */
  rotulo?: string;
};

const TEXTOS: Record<Parada, TextoDaParada> = {
  sem_login: {
    titulo: "Entre de novo para jogar",
    texto: "A sua entrada no Recreio terminou neste aparelho.",
    acao: "entrar",
  },
  sem_acesso: {
    titulo: "O seu acesso aos jogos não está ativo",
    texto: "A estante mostra a situação do seu acesso.",
    acao: "nada",
  },
  acesso_perdido: {
    titulo: "O seu acesso aos jogos terminou",
    texto: "O jogo foi fechado. O seu perfil e os seus mundos continuam guardados.",
    acao: "nada",
  },
  jogo_indisponivel: {
    titulo: "Este jogo não está disponível agora",
    texto: "Tente de novo mais tarde.",
    acao: "nada",
  },
  mundo_indisponivel: {
    titulo: "Este mundo não está disponível",
    texto:
      "Ele pode não existir ou você pode não participar dele. Confira os seus mundos na estante.",
    acao: "nada",
  },
  iniciando: {
    titulo: "O jogo está iniciando",
    texto: "Tente de novo em instantes.",
    acao: "tentar",
  },
  outro_lugar: {
    titulo: "Você continuou o jogo em outro lugar",
    texto: "Esta janela foi desconectada. Um perfil joga em um lugar de cada vez.",
    acao: "tentar",
    rotulo: "Jogar aqui",
  },
  saiu_da_conta: {
    titulo: "Você saiu da conta",
    texto: "O jogo foi fechado junto com a sua entrada no Recreio.",
    acao: "entrar",
  },
  sessao_encerrada: {
    titulo: "A sessão de jogo terminou",
    texto: "Abra o jogo de novo para continuar.",
    acao: "tentar",
  },
  rede: {
    titulo: "Não foi possível conectar",
    texto: "Confira a sua internet e tente de novo.",
    acao: "tentar",
  },
  falha: {
    titulo: "Não foi possível abrir o jogo",
    texto: "Tente de novo. Se continuar, volte à estante e abra o mundo outra vez.",
    acao: "tentar",
  },
};

export function textoDaParada(parada: Parada): TextoDaParada {
  return TEXTOS[parada];
}
