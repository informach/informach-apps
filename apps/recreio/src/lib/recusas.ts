import type { CodigoDeErro } from "@informach/recreio";

/**
 * O que a pessoa lê quando o Recreio recusa um pedido feito pelo portal. Só os
 * códigos que uma tela do portal pode provocar; os outros seguem para o
 * tratamento de erro inesperado.
 */
const MENSAGENS: Partial<Record<CodigoDeErro, string>> = {
  ACESSO_NEGADO: "O seu acesso aos jogos não está ativo.",
  JOGO_INDISPONIVEL: "Este jogo não está disponível agora.",
  LIMITE_DE_MUNDOS: "Você já criou o máximo de mundos deste jogo.",
  CONVITE_INVALIDO:
    "Confira o código. Ele pode estar incorreto, ter expirado ou já ter sido usado.",
  JA_MEMBRO: "Você já participa deste mundo.",
  MUNDO_CHEIO: "Este mundo já está com todos os lugares ocupados.",
  SEM_PERMISSAO: "Só quem é responsável pelo mundo pode convidar.",
  NAO_MEMBRO: "Mundo não encontrado.",
  MUNDO_INDISPONIVEL: "Este mundo não está disponível.",
  MUITAS_TENTATIVAS: "Muitas tentativas. Espere alguns minutos e tente de novo.",
  ENTRADA_INVALIDA: "Confira os campos e tente novamente.",
};

export function mensagemDaRecusa(codigo: CodigoDeErro): string | null {
  return MENSAGENS[codigo] ?? null;
}
