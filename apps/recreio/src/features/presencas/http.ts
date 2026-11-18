import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { AppError } from "@/lib/errors";

/** Recusas esperadas usam o contrato da API; falha de auditoria ou infraestrutura continua erro operacional. */
export function traduzirRecusaDePresenca(erro: unknown): never {
  if (erro instanceof AppError) {
    if (erro.code === "CONFLITO") throw new ErroDoRecreio("REVISAO_DIVERGENTE");
    if (erro.code === "AUTH") throw new ErroDoRecreio("SESSAO_ENCERRADA");
    if (erro.code === "MUITAS_TENTATIVAS") throw new ErroDoRecreio("MUITAS_TENTATIVAS");
  }
  throw erro;
}
