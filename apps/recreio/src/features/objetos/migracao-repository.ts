import "server-only";
import { db, sql } from "@informach/db";
import { MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import type { configuracaoDaMigracaoDeFotografias } from "@/lib/object-migration-environment";

export class FalhaDaFilaDeMigracao extends Error {
  constructor(readonly codigo: "BACKUP" | "FILA") {
    super(`recreio.snapshot_migration.${codigo}`);
  }
}
const Linha = z.strictObject({
  mundoId: MundoIdSchema,
  jogo: z.string().min(1).max(64),
  revisao: z.number().int().nonnegative(),
});

/** A recent published capture is an operational prerequisite, not proof that
 * every selected photo belongs to it. Source bytes are independently verified
 * again by the delivery protocol; creation time alone is never membership. */
export async function listarFotografiasParaMigracao(
  config: NonNullable<ReturnType<typeof configuracaoDaMigracaoDeFotografias>>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await tx.execute(sql`select set_config('statement_timeout','3000ms',true),
      set_config('lock_timeout','1000ms',true),set_config('transaction_timeout','5000ms',true)`);
    const [backup] = await tx.execute<{ valido: boolean }>(sql`select exists(
      select 1 from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id
      where c.id=${config.backupId}::uuid and c.protocol_version=1 and c.state='verified'
        and c.storage_scope=${config.objetos.escopo} and c.bucket_id=${config.objetos.bucketId}::uuid
        and c.bucket_name=${config.objetos.bucketName} and p.storage_scope=c.storage_scope and p.state='published'
        and c.created_at<=c.captured_at and c.captured_at<=clock_timestamp()
        and c.captured_at>=clock_timestamp()-interval '5 hours 30 minutes'
        and not exists(select 1 from recreio.backup_retirements r where r.capture_id=c.id)
      ) as valido`);
    if (backup?.valido !== true) throw new FalhaDaFilaDeMigracao("BACKUP");
    const [revisao] = await tx.execute<{ necessaria: boolean }>(sql`select exists(
      select 1 from recreio.space_snapshots s join recreio.snapshot_object_deliveries d on d.snapshot_reference=s.id
      where s.storage='pg' and (d.state<>'prepared' or d.snapshot_id is null or
        d.storage_scope<>${config.objetos.escopo} or d.bucket_id<>${config.objetos.bucketId}::uuid or
        d.bucket_name<>${config.objetos.bucketName}) limit 1) as necessaria`);
    if (revisao?.necessaria !== false) throw new FalhaDaFilaDeMigracao("FILA");
    const linhas =
      await tx.execute(sql`select s.space_id as "mundoId",w.game_id as jogo,s.revision as revisao
      from recreio.space_snapshots s join recreio.spaces w on w.id=s.space_id
      join recreio.backup_captures c on c.id=${config.backupId}::uuid
      left join recreio.snapshot_object_deliveries d on d.snapshot_reference=s.id
      where s.storage='pg' and s.created_at<=c.created_at and w.status='hibernating'
        and not exists(select 1 from recreio.space_leases l where l.space_id=w.id and l.released_at is null)
        and (d.id is null or (d.state='prepared' and d.next_attempt_at<=clock_timestamp()
          and (d.lease_until is null or d.lease_until<=clock_timestamp())))
      order by s.created_at,s.id limit ${config.batch}`);
    const parsed = z.array(Linha).max(config.batch).safeParse(linhas);
    if (!parsed.success) throw new FalhaDaFilaDeMigracao("FILA");
    return parsed.data;
  });
}
