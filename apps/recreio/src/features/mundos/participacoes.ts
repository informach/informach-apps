import "server-only";
import { MembroIdSchema } from "@informach/recreio";
import { AppError } from "@/lib/errors";
import { listarParticipacoesProprias } from "./participacoes-repository";
import type { AutorDaSaida } from "./saida-repository";

export async function listarParticipacoes(autor: AutorDaSaida, entrada?: unknown) {
  const cursor =
    entrada === undefined || entrada === null ? null : MembroIdSchema.safeParse(entrada);
  if (cursor && !cursor.success) throw new AppError("INPUT", "Página de mundos inválida.");
  return listarParticipacoesProprias(autor, cursor?.data ?? null);
}
