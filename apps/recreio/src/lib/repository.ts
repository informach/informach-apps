import "server-only";
import { type db, sql } from "@informach/db";

/**
 * Apoio dos repositórios do Recreio: a transação, as travas e o relógio. Só
 * arquivos `repository.ts` importam daqui.
 */

export type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Trava de transação por nome (`pg_advisory_xact_lock`): quem pede a mesma
 * chave espera, e a trava cai sozinha no commit ou no rollback.
 */
export async function travar(tx: Transacao, chave: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${chave}, 0))`);
}

/**
 * O relógio do banco no instante do comando. `now()` devolve o início da
 * transação: quem esperou uma trava julgaria um prazo com a hora de antes da
 * espera. Prazo de posse, de instância e de sessão é julgado com este.
 */
export const AGORA = sql`clock_timestamp()`;

/** O código do erro do Postgres por trás de uma falha do Drizzle (`23505`...). */
export function codigoDoPostgres(erro: unknown): string | undefined {
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 4 && atual; nivel++) {
    if (typeof atual === "object" && "code" in atual && typeof atual.code === "string")
      return atual.code;
    atual = atual instanceof Error ? atual.cause : undefined;
  }
  return undefined;
}

export const VIOLACAO_DE_UNICO = "23505";
