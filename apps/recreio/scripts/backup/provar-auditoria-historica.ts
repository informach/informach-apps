import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { exigir } from "./provas-arquivos";

/** Cold synthetic cluster only; compare all caller-selected rows around a
 * real audit exception, then remove exactly this owned trigger/function. */
export async function provarAuditoriaHistoricaAtomica(
  copia: postgres.Sql,
  executar: () => Promise<unknown>,
  ler: () => Promise<unknown>,
) {
  exigir(
    process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && !process.env.DATABASE_URL,
    "ENCERRAMENTO_AUSENTE_DIVERGENTE",
  );
  const antes = await ler();
  const [livre] = await copia.unsafe<{ livre: boolean }[]>(
    `select to_regprocedure('audit.recusar_selecao_historica()') is null and not exists(select 1 from pg_trigger where tgname='recusar_selecao_historica') as livre`,
  );
  exigir(livre?.livre, "ENCERRAMENTO_AUSENTE_DIVERGENTE");
  await copia.begin(async (tx) => {
    await tx.unsafe(
      `create function audit.recusar_selecao_historica() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_historical_admitted' then raise exception using errcode='P7783',message='Synthetic historical selection audit failure'; end if; return new; end $$`,
    );
    await tx.unsafe(
      `create trigger recusar_selecao_historica before insert on audit.events for each row execute function audit.recusar_selecao_historica()`,
    );
  });
  try {
    let recusou = false;
    try {
      await executar();
    } catch (erro) {
      let atual: unknown = erro;
      for (let n = 0; n < 8; n++) {
        if (atual && typeof atual === "object" && "code" in atual && atual.code === "P7783") {
          recusou = true;
          break;
        }
        if (!(atual instanceof Error) || !atual.cause) break;
        atual = atual.cause;
      }
      if (!recusou) throw erro;
    }
    exigir(recusou && isDeepStrictEqual(antes, await ler()), "ENCERRAMENTO_AUSENTE_DIVERGENTE");
  } finally {
    await copia.begin(async (tx) => {
      await tx.unsafe(`drop trigger recusar_selecao_historica on audit.events`);
      await tx.unsafe(`drop function audit.recusar_selecao_historica()`);
    });
  }
}
