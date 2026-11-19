"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { cancelarMinhaRenovacao, consultarMeuCancelamentoDaRenovacao } from "./renovacao-service";

export async function cancelarRenovacaoAction(entrada: unknown) {
  return runAction(async () => cancelarMinhaRenovacao(await autorDaFamilia(), entrada));
}
export async function consultarCancelamentoDaRenovacaoAction(entrada: unknown) {
  return runAction(async () =>
    consultarMeuCancelamentoDaRenovacao(await autorDaFamilia(), entrada),
  );
}
