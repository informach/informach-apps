import "server-only";
import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, asc, db, eq, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { z } from "zod";
import { travarColetaDeObjetos } from "@/features/backup/captura-repository";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { AGORA, type Transacao } from "@/lib/repository";
import { conferirTrabalhoDeColeta, FalhaDaColeta, type TrabalhoDeColeta } from "./coleta-contrato";

async function limitar(tx: Transacao) {
  await tx.execute(sql`select set_config('lock_timeout','5000ms',true),
    set_config('statement_timeout','15000ms',true),set_config('transaction_timeout','30000ms',true)`);
}
async function travar(tx: Transacao, id: string) {
  if (!z.uuid().safeParse(id).success) throw new FalhaDaColeta("CONFIGURACAO");
  await limitar(tx);
  // PRIMEIRA trava: nenhuma linha de mundo/entrega pode preceder a barreira.
  await travarColetaDeObjetos(tx);
  const [pista] = await tx
    .select({ mundoId: deliveries.spaceId })
    .from(deliveries)
    .where(eq(deliveries.id, id));
  if (!pista) throw new FalhaDaColeta("FONTE");
  const [mundo] = await tx
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.id, pista.mundoId))
    .for("update");
  if (!mundo) throw new FalhaDaColeta("FONTE");
  const [e] = await tx
    .select({
      id: deliveries.id,
      spaceId: deliveries.spaceId,
      bucketId: deliveries.bucketId,
      bucketName: deliveries.bucketName,
      storageScope: deliveries.storageScope,
      leaseToken: deliveries.leaseToken,
      cipherSha256: deliveries.cipherSha256,
      objectKey: deliveries.objectKey,
      state: deliveries.state,
      attemptCount: deliveries.attemptCount,
      retiredAt: deliveries.retiredAt,
    })
    .from(deliveries)
    .where(and(eq(deliveries.id, id), eq(deliveries.spaceId, mundo.id)))
    .for("update");
  if (!e) throw new FalhaDaColeta("FONTE");
  await tx
    .select({ id: holds.deliveryId })
    .from(holds)
    .where(sql`${holds.deliveryId}=${id} and ${holds.releasedAt} is null`)
    .limit(1)
    .for("share");
  return e;
}
async function fatos(tx: Transacao, id: string) {
  // Relógio e dependências DEPOIS de esperar todas as travas.
  const [r] = await tx.execute<{
    segura: boolean;
    devida: boolean;
    livre: boolean;
    vigente: boolean;
  }>(sql`
    select coalesce(d.snapshot_id is null and d.detached_at<=clock_timestamp()-interval '24 hours'
      and d.state in ('retiring','retired') and d.envelope is null
      and not exists(select 1 from recreio.backup_object_holds h where h.delivery_id=d.id and h.released_at is null)
      and not exists(select 1 from recreio.space_snapshots s where s.space_id=d.space_id and s.storage='bucket' and s.object_key=d.object_key),false) as segura,
      d.next_attempt_at<=clock_timestamp() as devida,
      coalesce(d.lease_until<=clock_timestamp(),true) as livre,
      coalesce(d.lease_until>clock_timestamp(),false) as vigente
    from recreio.snapshot_object_deliveries d where d.id=${id}`);
  if (!r) throw new FalhaDaColeta("FONTE");
  return r;
}
function mesmoDestino(
  e: Pick<typeof deliveries.$inferSelect, "bucketId" | "bucketName" | "storageScope">,
  alvo: DestinoDeCaptura,
) {
  if (
    e.bucketId !== alvo.bucketId ||
    e.bucketName !== alvo.bucketName ||
    e.storageScope !== alvo.escopo
  )
    throw new FalhaDaColeta("CONFIGURACAO");
}
export async function admitirColeta(
  id: string,
  destino: DestinoDeCaptura,
): Promise<TrabalhoDeColeta | null> {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  if (!alvo.success) throw new FalhaDaColeta("CONFIGURACAO");
  return db.transaction(async (tx) => {
    const e = await travar(tx, id);
    mesmoDestino(e, alvo.data);
    const f = await fatos(tx, id);
    if (!f.segura || !f.devida || !f.livre) return null;
    if (e.attemptCount >= 2147483646) throw new FalhaDaColeta("LIMITE");
    const trabalho = conferirTrabalhoDeColeta({
      id: e.id,
      token: randomUUID(),
      mundoId: e.spaceId,
      destino: alvo.data,
      cipherSha256: e.cipherSha256,
      objectKey: e.objectKey,
    });
    await tx
      .update(deliveries)
      .set({
        leaseToken: trabalho.token,
        leaseUntil: sql`${AGORA}+interval '45 seconds'`,
        lastAttemptAt: AGORA,
        attemptCount: e.attemptCount + 1,
        nextAttemptAt: sql`${AGORA}+interval '5 minutes'`,
      })
      .where(eq(deliveries.id, id));
    await logAuditEventStrict(
      "recreio.snapshot_collection_admitted",
      null,
      { app: "recreio", deliveryId: id, spaceId: e.spaceId, storageScope: e.storageScope },
      { writer: tx },
    );
    return trabalho;
  });
}
async function atual(tx: Transacao, t: TrabalhoDeColeta) {
  const e = await travar(tx, t.id);
  mesmoDestino(e, t.destino);
  if (
    e.leaseToken !== t.token ||
    e.spaceId !== t.mundoId ||
    e.cipherSha256 !== t.cipherSha256 ||
    e.objectKey !== t.objectKey
  )
    throw new FalhaDaColeta("TENTATIVA");
  return e;
}
/** Ausência vem de GET NoSuchKey do transporte fechado ao recibo. O executor
 * interno chama após I/O; não há endpoint que aceite confirmação do navegador. */
export async function confirmarColeta(bruto: TrabalhoDeColeta, objetoEncontrado: boolean) {
  const t = conferirTrabalhoDeColeta(bruto);
  if (typeof objetoEncontrado !== "boolean") throw new FalhaDaColeta("CONFIGURACAO");
  await db.transaction(async (tx) => {
    const e = await atual(tx, t),
      f = await fatos(tx, t.id);
    if (!f.segura || !f.vigente) throw new FalhaDaColeta("TENTATIVA");
    await logAuditEventStrict(
      "recreio.snapshot_object_retired",
      null,
      {
        app: "recreio",
        deliveryId: e.id,
        spaceId: e.spaceId,
        storageScope: e.storageScope,
        lateObject: e.retiredAt !== null && objetoEncontrado,
      },
      { writer: tx },
    );
    const depois = await fatos(tx, t.id);
    if (!depois.segura || !depois.vigente) throw new FalhaDaColeta("TENTATIVA");
    await tx
      .update(deliveries)
      .set({
        state: "retired",
        retiredAt: sql`coalesce(${deliveries.retiredAt},${AGORA})`,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA}+interval '24 hours'`,
      })
      .where(eq(deliveries.id, e.id));
  });
}
export async function reagendarColeta(bruto: TrabalhoDeColeta) {
  const t = conferirTrabalhoDeColeta(bruto);
  await db.transaction(async (tx) => {
    const e = await atual(tx, t);
    if (e.state !== "retiring" && e.state !== "retired") throw new FalhaDaColeta("TENTATIVA");
    await tx
      .update(deliveries)
      .set({
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA}+interval '5 minutes'`,
      })
      .where(eq(deliveries.id, e.id));
    await logAuditEventStrict(
      "recreio.snapshot_collection_deferred",
      null,
      { app: "recreio", deliveryId: e.id, spaceId: e.spaceId, storageScope: e.storageScope },
      { writer: tx },
    );
  });
}
/** Leitura é só pista; a admissão revalida tudo sob as travas. Nunca varre o
 * bucket e nunca recebe prefixo livre. Máximo vinte por chamada. */
export async function listarColetasDevidas(destino: DestinoDeCaptura) {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  if (!alvo.success) throw new FalhaDaColeta("CONFIGURACAO");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await limitar(tx);
    return tx
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(sql`
    ${deliveries.bucketId}=${alvo.data.bucketId} and ${deliveries.bucketName}=${alvo.data.bucketName}
    and ${deliveries.storageScope}=${alvo.data.escopo} and ${deliveries.state} in ('retiring','retired')
    and ${deliveries.nextAttemptAt}<=clock_timestamp() and ${deliveries.detachedAt}<=clock_timestamp()-interval '24 hours'
    and (${deliveries.leaseUntil} is null or ${deliveries.leaseUntil}<=clock_timestamp())
    and not exists(select 1 from recreio.backup_object_holds h where h.delivery_id=${deliveries.id} and h.released_at is null)
    and not exists(select 1 from recreio.space_snapshots s where s.space_id=${deliveries.spaceId} and s.storage='bucket' and s.object_key=${deliveries.objectKey})
  `)
      .orderBy(asc(deliveries.nextAttemptAt), asc(deliveries.id))
      .limit(20);
  });
}
