import "server-only";
import { SessaoDeAparelhoIdSchema } from "@informach/recreio";
import { AppError } from "@/lib/errors";
import {
  type CursorDeAparelhos,
  type DonoDosAparelhos,
  listarAparelhosDaConta,
  revogarOutroAparelho,
} from "./repository";

function lerCursor(entrada: unknown): CursorDeAparelhos | null {
  if (entrada === undefined || entrada === null) return null;
  const cursor = SessaoDeAparelhoIdSchema.safeParse(entrada);
  if (!cursor.success) throw new AppError("INPUT", "Página de aparelhos inválida.");
  return cursor.data;
}

export async function listarAparelhos(ator: DonoDosAparelhos, cursor?: unknown) {
  return listarAparelhosDaConta(ator, lerCursor(cursor));
}

export function desconectarAparelho(ator: DonoDosAparelhos, alvo: unknown) {
  return revogarOutroAparelho(ator, SessaoDeAparelhoIdSchema.parse(alvo));
}
