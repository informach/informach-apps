"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { confirmarRetiradaAtual } from "./consentimento-runtime";
import { comCifradorPessoal } from "./exportacao-runtime";
import { prepararArquivoPessoal, revogarArquivoPessoal } from "./exportacao-service";
import { cancelarPreviaDeDireitos, prepararPedidoDeDireitos } from "./service";

export async function prepararDireitosAction(entrada: unknown) {
  return runAction(async () => prepararPedidoDeDireitos(await autorDaFamilia(), entrada));
}
export async function cancelarPreviaAction(entrada: unknown) {
  return runAction(async () => cancelarPreviaDeDireitos(await autorDaFamilia(), entrada));
}
export async function confirmarRetiradaAction(entrada: unknown) {
  return runAction(async () => confirmarRetiradaAtual(await autorDaFamilia(), entrada));
}
export async function prepararArquivoPessoalAction(entrada: unknown) {
  return runAction(async () => {
    const autor = await autorDaFamilia();
    return comCifradorPessoal((cifrador) => prepararArquivoPessoal(autor, entrada, cifrador));
  });
}
export async function revogarArquivoPessoalAction(entrada: unknown) {
  return runAction(async () => revogarArquivoPessoal(await autorDaFamilia(), entrada));
}
