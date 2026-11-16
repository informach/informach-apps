"use server";
import { runAction } from "@/lib/action";
import { proporTransferencia, responderTransferencia } from "./responsabilidade";
import { autorDaResponsabilidade } from "./responsabilidade-autor";

export async function proporResponsabilidadeAction(mundoId: unknown, membroId: unknown) {
  return runAction(async () =>
    proporTransferencia(await autorDaResponsabilidade(), mundoId, membroId),
  );
}

export async function responderResponsabilidadeAction(
  mundoId: unknown,
  pedidoId: unknown,
  resposta: unknown,
) {
  return runAction(async () =>
    responderTransferencia(await autorDaResponsabilidade(), mundoId, pedidoId, resposta),
  );
}
