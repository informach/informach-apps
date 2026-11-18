import "server-only";
import { ehErroDoRecreio } from "@informach/recreio";
import { AppError } from "@/lib/errors";

/** Negativas conhecidas da conferência. Infraestrutura continua erro observável. */
export function painelDeVisitaIndisponivel(erro: unknown) {
  return (
    (erro instanceof AppError &&
      ["PERFIL", "MUNDO", "PEDIDO", "CONTATO", "CONFLITO", "RESPONSAVEL"].includes(erro.code)) ||
    (ehErroDoRecreio(erro) &&
      [
        "JOGO_INDISPONIVEL",
        "INDISPONIVEL",
        "SESSAO_ENCERRADA",
        "SESSAO_INVALIDA",
        "ACESSO_NEGADO",
        "ACESSO_PERDIDO",
        "POSSE_PERDIDA",
        "POLITICA_INCOMPATIVEL",
      ].includes(erro.codigo))
  );
}
