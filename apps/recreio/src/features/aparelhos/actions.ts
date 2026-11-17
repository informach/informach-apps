"use server";
import { ErroDoRecreio } from "@informach/recreio";
import { atorAtual } from "@/features/sessao/ator";
import { runAction, verifiedUser } from "@/lib/action";
import { desconectarAparelho } from "./service";

export async function desconectarAparelhoAction(alvo: unknown) {
  return runAction(async () => {
    await verifiedUser();
    const ator = await atorAtual();
    if (!ator) throw new ErroDoRecreio("NAO_AUTENTICADO");
    return desconectarAparelho(ator, alvo);
  });
}
