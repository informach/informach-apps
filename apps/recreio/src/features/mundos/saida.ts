import "server-only";
import { MundoIdSchema } from "@informach/recreio";
import { assertAllowed } from "@/lib/errors";
import { type AutorDaSaida, registrarSaida } from "./saida-repository";

/** Acesso comercial não é pré-condição para deixar uma participação. */
export async function sairDoMundo(autor: AutorDaSaida, mundoId: unknown) {
  const id = MundoIdSchema.safeParse(mundoId);
  assertAllowed(id.success, "MUNDO", "Mundo indisponível.");
  return registrarSaida(autor, id.data);
}
