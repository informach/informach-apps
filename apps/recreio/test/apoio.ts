import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { type ContaId, ContaIdSchema } from "@informach/recreio";

/**
 * Apoio dos testes de integração. O banco é descartável (criado e apagado por
 * `scripts/isolated.mjs`), então os testes não limpam o que criam: cada um usa
 * contas novas e não depende do que os outros deixaram.
 */

export type ContaDeTeste = { id: ContaId; email: string };

/**
 * Uma conta como o login compartilhado cria: o id é um UUID, igual em forma ao
 * id de um perfil. A marca do tipo separa os dois na compilação; em execução,
 * quem separa é a consulta, que procura cada id na sua própria tabela.
 */
export async function novaConta(opcoes: { confirmada?: boolean } = {}): Promise<ContaDeTeste> {
  const id = randomUUID();
  const email = `${id}@example.test`;
  await db.insert(users).values({
    id,
    email,
    name: "Integração Recreio",
    emailVerified: opcoes.confirmada ?? true,
  });
  return { id: ContaIdSchema.parse(id), email };
}

/** Uma sessão de login qualquer para a conta, como o Better Auth entregaria. */
export function loginDe(conta: ContaDeTeste) {
  return {
    authSessionId: randomUUID(),
    contaId: conta.id,
    expiraEm: new Date(Date.now() + 7 * 86_400_000),
  };
}

/** O código do erro do Postgres por trás de uma rejeição (`23505`, `23514`, `23001`). */
export async function codigoDoBanco(operacao: Promise<unknown>): Promise<string | undefined> {
  try {
    await operacao;
    return undefined;
  } catch (erro) {
    let atual: unknown = erro;
    for (let nivel = 0; nivel < 4 && atual; nivel++) {
      if (typeof atual === "object" && "code" in atual && typeof atual.code === "string")
        return atual.code;
      atual = atual instanceof Error ? atual.cause : undefined;
    }
    return "sem-codigo";
  }
}

export const UNICO = "23505";
export const CHECAGEM = "23514";
/** `on delete restrict`: há linhas que dependem da que se tentou apagar. */
export const RESTRICAO = "23001";
