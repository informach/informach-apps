import "server-only";
import { MembroIdSchema, MundoIdSchema } from "@informach/recreio";
import type { AutorDaResponsabilidade } from "./gestao-repository";
import { listarMembrosGerenciaveis } from "./remocao-painel-repository";
import { registrarRemocao } from "./remocao-repository";
import type { AutorDaSaida } from "./saida-repository";

export function removerParticipacao(
  autor: AutorDaResponsabilidade,
  mundoId: unknown,
  membroId: unknown,
) {
  return registrarRemocao(autor, MundoIdSchema.parse(mundoId), MembroIdSchema.parse(membroId));
}

export function painelDeMembros(autor: AutorDaSaida, mundoId: unknown, apos: unknown) {
  return listarMembrosGerenciaveis(
    autor,
    MundoIdSchema.parse(mundoId),
    apos === undefined || apos === null ? null : MembroIdSchema.parse(apos),
  );
}
