"use server";
import { runAction } from "@/lib/action";
import { administrarMundo } from "./administracao";
import { autorDaResponsabilidade } from "./responsabilidade-autor";

export async function administrarMundoAction(entrada: unknown) {
  return runAction(async () => administrarMundo(await autorDaResponsabilidade(), entrada));
}
