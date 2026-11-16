import "server-only";
import { MembroIdSchema, MundoIdSchema } from "@informach/recreio";
import type { AutorDaResponsabilidade } from "./gestao-repository";
import { registrarRemocao } from "./remocao-repository";

export function removerParticipacao(
  autor: AutorDaResponsabilidade,
  mundoId: unknown,
  membroId: unknown,
) {
  return registrarRemocao(autor, MundoIdSchema.parse(mundoId), MembroIdSchema.parse(membroId));
}
