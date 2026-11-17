"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { salvarSupervisao } from "./service";

export async function salvarSupervisaoAction(entrada: unknown) {
  return runAction(async () => salvarSupervisao(await autorDaFamilia(), entrada));
}
