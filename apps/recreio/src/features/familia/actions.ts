"use server";
import { runAction } from "@/lib/action";
import { autorDaFamilia } from "./autor";
import { cadastrarPerfilMenor, cancelarPerfilMenor, prepararPerfilMenor } from "./service";

export async function prepararMenorAction() {
  return runAction(async () => prepararPerfilMenor(await autorDaFamilia()));
}

export async function cadastrarMenorAction(entrada: unknown) {
  return runAction(async () => {
    await cadastrarPerfilMenor(await autorDaFamilia(), entrada);
    return { destination: "/conta/perfis" };
  });
}

export async function cancelarMenorAction(intencaoId: unknown) {
  return runAction(async () => {
    await cancelarPerfilMenor(await autorDaFamilia(), intencaoId);
    return { destination: "/conta/perfis" };
  });
}
