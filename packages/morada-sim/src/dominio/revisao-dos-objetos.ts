import type { EstadoDoMundo } from "./tipos";

/** Relógio durável, independente do contador que aloca IDs de objetos. */
export const CONTADOR_DE_REVISOES_DOS_OBJETOS = "revisao_objeto";

export function revisaoDosObjetos(estado: Pick<EstadoDoMundo, "contadores">): number {
  const revisao = estado.contadores[CONTADOR_DE_REVISOES_DOS_OBJETOS];
  if (typeof revisao !== "number" || !Number.isSafeInteger(revisao) || revisao < 1)
    throw new Error("Relógio de revisões dos objetos inválido");
  return revisao;
}
