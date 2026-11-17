"use server";
import { runAction } from "@/lib/action";
import { removerParticipacao } from "./remocao";
import { autorDaResponsabilidade } from "./responsabilidade-autor";

export async function removerMembroAction(mundoId: unknown, membroId: unknown) {
  return runAction(async () =>
    removerParticipacao(await autorDaResponsabilidade(), mundoId, membroId),
  );
}
