import "server-only";
import { and, eq, isNull, or } from "@informach/db";
import { recreioGroupInvites as invites, users } from "@informach/db/schema";
import {
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

/** Endereço atual vem da conta travada, nunca do navegador ou do cache do login. */
export async function admitirDestinatario(tx: Transacao, autor: IdentidadeNativa) {
  const nativa = await autorizarContaNativa(tx, autor);
  const [conta] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, autor.contaId));
  assertAllowed(conta, "AUTH", "Entre novamente para continuar.");
  return { nativa, email: conta.email.trim().toLowerCase() };
}

export function escopoDoDestinatario(contaId: string, email: string) {
  return and(
    eq(invites.recipientEmail, email),
    or(isNull(invites.recipientUserId), eq(invites.recipientUserId, contaId)),
  );
}
