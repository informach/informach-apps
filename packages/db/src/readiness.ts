import { sql } from "drizzle-orm";
import { db } from "./client";
// O atributo é obrigatório: três specs do e2e da Agenda importam `@informach/db`,
// e o loader do Playwright é Node ESM puro — sem bundler para relevar a falta.
// O build de produção passava sem ele, então só o CI pegava.
import journal from "./migrations/meta/_journal.json" with { type: "json" };

/**
 * O banco está pelo menos tão novo quanto o build que faz a pergunta?
 *
 * Existe por causa de uma ordem de deploy que só funcionava por convenção. O
 * migrator é um service separado, e a leitura de atividade projeta as colunas
 * explicitamente — uma coluna faltando derruba a tela inteira, não degrada.
 * Enquanto o healthcheck não tocava o banco, um app publicado antes da migração
 * subia verde e servia erro; o runbook mandava conferir na mão, e conferir na
 * mão é o que ninguém faz às onze da noite.
 *
 * A pergunta é deliberadamente "o banco está atrás deste build?", nunca "o
 * banco é exatamente este build". Rollback do app sem desfazer migração é
 * suportado de propósito (ver `infrastructure/railway/migrator.toml`): um build
 * antigo encontra o banco à frente, e isso continua sendo saudável.
 */

type JournalEntry = { idx: number; when: number; tag: string };

const entries = journal.entries as ReadonlyArray<JournalEntry>;

/**
 * A migração mais recente que este build carrega. O journal do Drizzle é o
 * mesmo arquivo que o migrator lê para decidir o que aplicar — não há segunda
 * lista para alguém esquecer de atualizar junto.
 */
export const EXPECTED_MIGRATION: JournalEntry | null = entries.at(-1) ?? null;

export type SchemaReadiness = {
  ok: boolean;
  /** Tag da migração que este build espera encontrar. */
  expected: string | null;
  /** Tag da migração mais recente aplicada, quando reconhecida no journal. */
  applied: string | null;
  /** Só quando `ok` é falso. */
  reason?: "behind" | "unreachable";
};

function tagFor(when: number | null): string | null {
  if (when === null) return null;
  return entries.find((entry) => entry.when === when)?.tag ?? null;
}

/**
 * Lê a tabela de controle do próprio Drizzle (`drizzle.__drizzle_migrations`,
 * coluna `created_at` = o `when` do journal). Ler o controle em vez de sondar
 * uma coluna específica mantém a verificação válida para a próxima migração
 * sem que ninguém precise lembrar de atualizá-la.
 *
 * `statement_timeout` curto porque isto responde a um healthcheck: um banco
 * travado precisa falhar rápido, não segurar a porta aberta.
 */
export async function checkSchemaReadiness(): Promise<SchemaReadiness> {
  const expected = EXPECTED_MIGRATION;
  if (!expected) return { ok: true, expected: null, applied: null };

  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '3000ms'`);
      return tx.execute<{ applied: string | null }>(
        sql`select max(created_at)::text as applied from drizzle.__drizzle_migrations`,
      );
    });
    const raw = rows[0]?.applied ?? null;
    const applied = raw === null ? null : Number(raw);
    if (applied === null || Number.isNaN(applied) || applied < expected.when)
      return { ok: false, reason: "behind", expected: expected.tag, applied: tagFor(applied) };
    return { ok: true, expected: expected.tag, applied: tagFor(applied) };
  } catch {
    // Inclui o banco fora do ar E a tabela de controle inexistente (banco novo
    // que nunca migrou). Nos dois casos a resposta honesta é a mesma: este
    // processo não pode receber tráfego ainda.
    return { ok: false, reason: "unreachable", expected: expected.tag, applied: null };
  }
}
