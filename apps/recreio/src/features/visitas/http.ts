import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { AppError } from "@/lib/errors";

/** Recusa de autorização tem código fechado; falha de banco/auditoria continua operacional. */
export function recusaDeVisita(erro: unknown): unknown {
  if (erro instanceof AppError) {
    if (erro.code === "PEDIDO" || erro.code === "CONTATO")
      return new ErroDoRecreio("SEM_PERMISSAO");
    if (erro.code === "CONFLITO") return new ErroDoRecreio("REVISAO_DIVERGENTE");
    if (erro.code === "AUTH") return new ErroDoRecreio("SESSAO_ENCERRADA");
    if (erro.code === "MUITAS_TENTATIVAS") return new ErroDoRecreio("MUITAS_TENTATIVAS");
  }
  return erro;
}
export function traduzirRecusaDeVisita(erro: unknown): never {
  throw recusaDeVisita(erro);
}
