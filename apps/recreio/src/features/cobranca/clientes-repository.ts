import "server-only";
import type { SubjectRef } from "@informach/billing";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";

/** Somente contato do pagante admitido; não altera identidade ou cadastro fiscal. */
export async function emailDoPagante(subject: SubjectRef) {
  assertAllowed(subject.type === "user", "COBRANCA", "Pagante não disponível.");
  const [conta] = await db
    .select({ email: users.email, verified: users.emailVerified })
    .from(users)
    .where(eq(users.id, subject.id));
  assertAllowed(conta?.verified, "AUTH", "Entre novamente para continuar.");
  return conta.email;
}
