"use server";
import { runAction, verifiedUser } from "@/lib/action";
import { safeDestination } from "@/lib/destination";

/**
 * Depois de entrar, o formulário pergunta ao servidor para onde ir: a sessão
 * é conferida de novo aqui, e o destino pedido só vale se for um caminho
 * interno do portal.
 */
export async function concluirEntradaAction(next: unknown) {
  return runAction(async () => {
    await verifiedUser();
    return { destination: safeDestination(typeof next === "string" ? next : null) };
  });
}
