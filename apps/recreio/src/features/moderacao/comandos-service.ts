import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { verificarProvaDeModeracao } from "@informach/recreio/emissor";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { executarComandoDeModeracaoNoBanco } from "./comandos-repository";

export async function executarComandoDeModeracao(token: string, entrada: unknown) {
  if (!env.RECREIO_MODERATION_SECRET) throw new ErroDoRecreio("INDISPONIVEL");
  const prova = await verificarProvaDeModeracao(
    env.RECREIO_MODERATION_SECRET,
    token,
    entrada,
    new Date(),
  );
  await limitarTentativas({ chave: `moderacao:${prova.contaId}`, max: 60, janelaEmSegundos: 60 });
  try {
    return await executarComandoDeModeracaoNoBanco(prova);
  } catch (erro) {
    if (erro instanceof AppError) {
      if (erro.code === "CONFLITO") throw new ErroDoRecreio("REVISAO_DIVERGENTE");
      if (erro.code === "CONTATO") throw new ErroDoRecreio("NAO_ENCONTRADO");
    }
    throw erro;
  }
}
