"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { autorizarExperimento, retirarConsentimentoDoTeste } from "./service";

export async function autorizarTesteAction(entrada: unknown) {
  return runAction(async () => autorizarExperimento(await autorDaFamilia(), entrada));
}

export async function retirarTesteAction(id: unknown) {
  return runAction(async () => retirarConsentimentoDoTeste(await autorDaFamilia(), id));
}
