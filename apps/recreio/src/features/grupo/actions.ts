"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { atualizarCobertura } from "./service";

export async function salvarCoberturaAction(entrada: unknown) {
  return runAction(async () => {
    await atualizarCobertura(await autorDaFamilia(), entrada);
    return { destination: "/conta/grupo?salvo=1" };
  });
}
