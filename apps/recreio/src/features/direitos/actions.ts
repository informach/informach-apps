"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { env } from "@/lib/env";
import { confirmarRetiradaAtual } from "./consentimento-runtime";
import { confirmarEncerramentoAtual } from "./encerramento-runtime";
import { prepararPedidoDeEncerramento } from "./encerramento-service";
import { comCifradorPessoal } from "./exportacao-runtime";
import { prepararArquivoPessoal, revogarArquivoPessoal } from "./exportacao-service";
import { cancelarPreviaDeDireitos, prepararPedidoDeDireitos } from "./service";

export async function prepararDireitosAction(entrada: unknown) {
  return runAction(async () => prepararPedidoDeDireitos(await autorDaFamilia(), entrada));
}
export async function prepararEncerramentoAction(entrada: unknown) {
  return runAction(async () =>
    prepararPedidoDeEncerramento(await autorDaFamilia(), entrada, env.STRIPE_MODE),
  );
}
export async function confirmarEncerramentoAction(entrada: unknown) {
  return runAction(async () => confirmarEncerramentoAtual(await autorDaFamilia(), entrada));
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
