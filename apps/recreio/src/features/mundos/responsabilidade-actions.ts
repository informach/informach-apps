"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { proporTransferencia, responderTransferencia } from "./responsabilidade";
import { autorDaResponsabilidade } from "./responsabilidade-autor";
import {
  cancelarTransferenciaDoMenor,
  proporTransferenciaDoMenor,
} from "./responsabilidade-infantil";

export async function proporResponsabilidadeAction(mundoId: unknown, membroId: unknown) {
  return runAction(async () =>
    proporTransferencia(await autorDaResponsabilidade(), mundoId, membroId),
  );
}

export async function proporResponsabilidadeDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () =>
    proporTransferenciaDoMenor(await autorDaFamilia(), perfilId, entrada),
  );
}
export async function cancelarResponsabilidadeDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () =>
    cancelarTransferenciaDoMenor(await autorDaFamilia(), perfilId, entrada),
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
