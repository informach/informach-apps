import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import type { ConsultaDeDenunciasSchema, RevisaoDeDenuncia } from "@informach/recreio/contrato";
import type { z } from "zod";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { AppError } from "@/lib/errors";
import { acompanharDenuncias, pedirRevisaoDaDenuncia } from "./acompanhamento-service";

function traduzir(erro: unknown): never {
  if (erro instanceof AppError) {
    if (erro.code === "PROTOCOLO") throw new ErroDoRecreio("NAO_ENCONTRADO");
    if (["CONFLITO", "CONTATO"].includes(erro.code)) throw new ErroDoRecreio("REVISAO_DIVERGENTE");
    if (erro.code === "AUTH") throw new ErroDoRecreio("SESSAO_INVALIDA");
  }
  throw erro;
}
export async function acompanharDenunciasDoSdk(
  sessao: SessaoDeJogoAtiva,
  entrada: z.infer<typeof ConsultaDeDenunciasSchema>,
) {
  try {
    return await acompanharDenuncias({ tipo: "jogador", jogador: sessao }, entrada.protocolo);
  } catch (erro) {
    return traduzir(erro);
  }
}
export async function reverDenunciaDoSdk(sessao: SessaoDeJogoAtiva, entrada: RevisaoDeDenuncia) {
  try {
    return await pedirRevisaoDaDenuncia({ tipo: "jogador", jogador: sessao }, entrada);
  } catch (erro) {
    return traduzir(erro);
  }
}
