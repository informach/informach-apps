"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { retirarAdultoDoGrupo, sairDoGrupo, usarCoberturaPropria } from "./participacao-service";

export async function sairDoGrupoAction(entrada: unknown) {
  return runAction(async () => {
    await sairDoGrupo(await autorDaFamilia(), entrada);
    return { destination: "/conta/grupo?participacao=encerrada" };
  });
}
export async function retirarAdultoAction(entrada: unknown) {
  return runAction(async () => {
    await retirarAdultoDoGrupo(await autorDaFamilia(), entrada);
    return { destination: "/conta/grupo?participacao=encerrada" };
  });
}
export async function coberturaPropriaAction(entrada: unknown) {
  return runAction(async () => {
    await usarCoberturaPropria(await autorDaFamilia(), entrada);
    return { destination: "/conta/grupo?participacao=propria" };
  });
}
