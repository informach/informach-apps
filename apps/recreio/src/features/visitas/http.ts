import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { AppError } from "@/lib/errors";

/** Recusa de autorização tem código fechado; falha de banco/auditoria continua operacional. */
export function traduzirRecusaDeVisita(erro: unknown): never {
  if (erro instanceof AppError) {
    if (erro.code === "PEDIDO" || erro.code === "CONTATO") throw new ErroDoRecreio("SEM_PERMISSAO");
    if (erro.code === "CONFLITO") throw new ErroDoRecreio("REVISAO_DIVERGENTE");
    if (erro.code === "AUTH") throw new ErroDoRecreio("SESSAO_ENCERRADA");
    if (erro.code === "MUITAS_TENTATIVAS") throw new ErroDoRecreio("MUITAS_TENTATIVAS");
  }
  throw erro;
}
