import { db, sql } from "@informach/db";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { exigir } from "../scripts/backup/provas-arquivos";

/** Real external append followed by an injected SQL audit failure. Only a
 * disposable synthetic database may use this fixture; no intent is forged. */
export async function interromperPublicacaoDeEncerramento(
  config: Parameters<typeof publicarProximoConsentimento>[0],
  operacaoId: string,
) {
  const [livre] = await db.execute<{ livre: boolean }>(
    sql`select to_regprocedure('audit.recusar_publicacao_encerramento()') is null and not exists(select 1 from pg_trigger where tgname='recusar_publicacao_encerramento') as livre`,
  );
  exigir(livre?.livre, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`create function audit.recusar_publicacao_encerramento() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_admitted' then raise exception using errcode='P7780',message='Synthetic native closure publication failure'; end if; return new; end $$`,
    );
    await tx.execute(
      sql`create trigger recusar_publicacao_encerramento before insert on audit.events for each row execute function audit.recusar_publicacao_encerramento()`,
    );
  });
  try {
    let recusou = false;
    try {
      await publicarProximoConsentimento(config);
    } catch (erro) {
      let atual: unknown = erro;
      for (let n = 0; n < 8; n++) {
        if (atual && typeof atual === "object" && "code" in atual && atual.code === "P7780") {
          recusou = true;
          break;
        }
        if (!(atual instanceof Error) || !atual.cause) break;
        atual = atual.cause;
      }
      if (!recusou) throw erro;
    }
    exigir(recusou, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
  } finally {
    await db.transaction(async (tx) => {
      await tx.execute(sql`drop trigger recusar_publicacao_encerramento on audit.events`);
      await tx.execute(sql`drop function audit.recusar_publicacao_encerramento()`);
    });
  }
  const [pendente] = await db.execute<{ valida: boolean }>(
    sql`select state='publishing' and preparation_id is not null and recovery_source_id is null and admitted_at is null and admitted_head_sha256 is null as valida from recreio.rights_operations where id=${operacaoId}::uuid`,
  );
  exigir(pendente?.valida, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
}
