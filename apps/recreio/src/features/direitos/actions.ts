"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { cancelarPreviaDeDireitos, prepararPedidoDeDireitos } from "./service";

export async function prepararDireitosAction(entrada: unknown) {
  return runAction(async () => prepararPedidoDeDireitos(await autorDaFamilia(), entrada));
}
export async function cancelarPreviaAction(entrada: unknown) {
  return runAction(async () => cancelarPreviaDeDireitos(await autorDaFamilia(), entrada));
}
