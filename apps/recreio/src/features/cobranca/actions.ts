"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { executarMinhaCompra } from "./envio-service";
import { encerrarCompraNaoEnviada, prepararMinhaCompra } from "./service";

export async function prepararCompraAction(entrada: unknown) {
  return runAction(async () => prepararMinhaCompra(await autorDaFamilia(), entrada));
}
export async function encerrarCompraAction(id: unknown) {
  return runAction(async () => encerrarCompraNaoEnviada(await autorDaFamilia(), id));
}
export async function enviarCompraAction(id: unknown) {
  return runAction(async () => executarMinhaCompra(await autorDaFamilia(), id));
}
