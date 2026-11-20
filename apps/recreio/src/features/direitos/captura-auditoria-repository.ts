import "server-only";
import { sql } from "@informach/db";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

const LinhaSchema = z.strictObject({
  id: z.uuid(),
  instante: z.iso.datetime({ precision: 6 }),
  evento: z.string().regex(/^recreio\.[a-z0-9_.]{1,120}$/),
});

/** Own actions explicitly scoped to Recreio, never a free audit search.
 * Payloads may reference other people; they are not loaded or exported.
 * The exact PostgreSQL microsecond cursor avoids repeating/skipping rows at
 * a page boundary when JavaScript Date would truncate the timestamp. */
export async function copiarAuditoriaPessoalNaTransacao(
  tx: Transacao,
  contaId: string,
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  let apos: z.infer<typeof LinhaSchema> | null = null;
  while (true) {
    const linhas: { id: unknown; instante: unknown; evento: unknown }[] = await tx.execute(sql`
      select e.id,e.event_type as evento,
        to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as instante
      from audit.events e
      where e.actor_id=${contaId} and e.payload->>'app'='recreio'
        and e.event_type like 'recreio.%'
        ${
          apos
            ? sql`and (e.created_at,e.id collate "C")>
          (${apos.instante}::timestamptz,${apos.id} collate "C")`
            : sql``
        }
      order by e.created_at,e.id collate "C" limit ${limites.pagina}`);
    for (const bruta of linhas) {
      const linha = LinhaSchema.parse(bruta);
      assertAllowed(
        apos === null ||
          linha.instante > apos.instante ||
          (linha.instante === apos.instante && linha.id > apos.id),
        "INTEGRIDADE",
        "Não foi possível preparar a cópia.",
      );
      arquivo.adicionar("acao_propria_auditada", {
        evento: linha.evento,
        registradaEm: linha.instante,
      });
      apos = linha;
    }
    await conferirPrazo();
    if (linhas.length < limites.pagina) return;
  }
}
