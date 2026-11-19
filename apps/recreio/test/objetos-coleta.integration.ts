import { randomUUID } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
  recreioSpaceSnapshots as snapshots,
} from "@informach/db/schema";
import type { MundoId } from "@informach/recreio";
import { afterEach, describe, expect, it } from "vitest";
import { BARREIRA_CAPTURA_COLETA, type DestinoDeCaptura } from "@/features/backup/contrato";
import {
  admitirColeta,
  confirmarColeta,
  listarColetasDevidas,
  reagendarColeta,
} from "@/features/objetos/coleta-repository";
import { criarColetorDeObjetosS3 } from "@/features/objetos/coleta-s3";
import { executarColeta, executarLoteDeColetas } from "@/features/objetos/coleta-service";
import { novoJogador, sinal } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

const limpezas: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (limpezas.length) await limpezas.pop()?.();
});
async function fixture(
  destino: DestinoDeCaptura = {
    bucketId: randomUUID(),
    bucketName: "recreio-fixture",
    escopo: "qualification",
  },
  mundo?: MundoId,
) {
  const mundoId = mundo ?? (await mundoDe(await novoJogador())),
    id = randomUUID(),
    cipherSha256 = id.replaceAll("-", "").repeat(2);
  await db.insert(deliveries).values({
    id,
    snapshotReference: randomUUID(),
    spaceId: mundoId,
    storageScope: destino.escopo,
    bucketId: destino.bucketId,
    bucketName: destino.bucketName,
    plaintextSha256: "a".repeat(64),
    plaintextBytes: 0,
    cipherSha256,
    cipherBytes: 100,
    encryptionKeyId: "fixture",
    objectKey: `recreio/v1/fotografia/${mundoId}/${cipherSha256}`,
    state: "retiring",
    createdAt: new Date("2020-01-01T00:00:00Z"),
    detachedAt: new Date("2020-01-02T00:00:00Z"),
    nextAttemptAt: new Date("2020-01-03T00:00:00Z"),
  });
  const registro = () =>
    db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .then((r) => r[0]);
  return { id, mundoId, destino, registro };
}
async function reservar(id: string) {
  const [c] = await db
    .insert(captures)
    .values({
      storageScope: "qualification",
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
    })
    .returning();
  if (!c) throw new Error("Fixture sem captura");
  await db
    .insert(holds)
    .values({ captureId: c.id, deliveryId: id, referenceSha256: "a".repeat(64) });
  return c.id;
}
async function devida(id: string) {
  await db
    .update(deliveries)
    .set({ nextAttemptAt: new Date("2020-01-03T00:00:00Z") })
    .where(eq(deliveries.id, id));
}
async function comS3() {
  const b = await criarBucketS3DeTeste();
  limpezas.push(b.fechar);
  const f = await fixture(),
    transporte = criarColetorDeObjetosS3({
      cliente: b.cliente,
      destino: f.destino,
      tempoLimiteMs: 2000,
    });
  const r = await f.registro();
  if (!r) throw new Error("Fixture ausente");
  return { ...f, b, transporte, path: `/recreio-fixture/${r.objectKey}` };
}
async function recusarAudit(evento: string, executar: () => Promise<void>) {
  await db.execute(sql`create function audit.recusar_coleta_teste() returns trigger language plpgsql as $$
    begin if new.event_type=TG_ARGV[0] then raise exception 'recusa sintetica'; end if; return new; end $$`);
  await db.execute(
    sql.raw(
      `create trigger recusar_coleta_teste before insert on audit.events for each row execute function audit.recusar_coleta_teste('${evento}')`,
    ),
  );
  try {
    await executar();
  } finally {
    await db.execute(sql`drop trigger recusar_coleta_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_coleta_teste()`);
  }
}

describe("coleta restrita: PostgreSQL e SDK nativos com objetos sintéticos", () => {
  it("destaque recente e destino divergente recusam admissão", async () => {
    const f = await fixture();
    await expect(
      admitirColeta(f.id, { ...f.destino, bucketId: randomUUID() }),
    ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
    await db
      .update(deliveries)
      .set({ detachedAt: sql`clock_timestamp()` })
      .where(eq(deliveries.id, f.id));
    expect(await admitirColeta(f.id, f.destino)).toBeNull();
    expect((await f.registro())?.attemptCount).toBe(0);
  });
  it("qualquer ponteiro bucket remanescente impede coleta mesmo com entrega destacada", async () => {
    const f = await fixture(),
      r = await f.registro();
    if (!r) throw new Error("Fixture ausente");
    await db.insert(snapshots).values({
      spaceId: f.mundoId,
      revision: 999,
      fence: 0,
      schemaVersion: 1,
      journalSeq: 0,
      tick: 0,
      kind: "checkpoint",
      storage: "bucket",
      objectKey: r.objectKey,
      byteSize: 0,
      sha256: r.plaintextSha256,
    });
    expect(await admitirColeta(f.id, f.destino)).toBeNull();
    expect(await listarColetasDevidas(f.destino)).toEqual([]);
  });
  it("reserva ativa impede coleta; reserva liberada conserva recibo sem bloquear", async () => {
    const f = await fixture(),
      capturaId = await reservar(f.id);
    expect(await admitirColeta(f.id, f.destino)).toBeNull();
    expect(await listarColetasDevidas(f.destino)).toEqual([]);
    await db
      .update(holds)
      .set({ releasedAt: sql`clock_timestamp()`, releaseReason: "abandoned" })
      .where(and(eq(holds.captureId, capturaId), eq(holds.deliveryId, f.id)));
    expect(await admitirColeta(f.id, f.destino)).toMatchObject({
      id: f.id,
      mundoId: f.mundoId,
      destino: f.destino,
    });
  });
  it("duas admissões só geram um token e fixam tentativa antes de I/O", async () => {
    const f = await fixture(),
      r = await Promise.all([admitirColeta(f.id, f.destino), admitirColeta(f.id, f.destino)]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await f.registro()).toMatchObject({ attemptCount: 1, state: "retiring" });
    expect((await f.registro())?.leaseToken).toBe(r.find(Boolean)?.token);
  });
  it("tentativa vencida/antiga não confirma nem altera próxima tentativa", async () => {
    const f = await fixture(),
      antiga = await admitirColeta(f.id, f.destino);
    if (!antiga) throw new Error("Sem token");
    await db
      .update(deliveries)
      .set({
        lastAttemptAt: new Date("2020-01-03T00:00:00Z"),
        leaseUntil: new Date("2020-01-03T00:01:00Z"),
      })
      .where(eq(deliveries.id, f.id));
    await expect(confirmarColeta(antiga, true)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    await devida(f.id);
    const nova = await admitirColeta(f.id, f.destino);
    if (!nova) throw new Error("Sem token novo");
    await expect(confirmarColeta(antiga, true)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    await expect(reagendarColeta(antiga)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    expect((await f.registro())?.leaseToken).toBe(nova.token);
  });
  it("nova reserva antes da confirmação conserva retirada pendente", async () => {
    const f = await fixture(),
      t = await admitirColeta(f.id, f.destino);
    if (!t) throw new Error("Sem token");
    await reservar(f.id);
    await expect(confirmarColeta(t, true)).rejects.toMatchObject({ codigo: "TENTATIVA" });
    expect(await f.registro()).toMatchObject({ state: "retiring", retiredAt: null });
  });
  it("barreira da captura precede mundo/entrega e a reserva admitida é relida", async () => {
    const f = await fixture(),
      pronto = sinal<number>(),
      liberar = sinal<void>();
    const captura = db.transaction(async (tx) => {
      const [r] = await tx.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid,pg_advisory_xact_lock(${BARREIRA_CAPTURA_COLETA.grupo},${BARREIRA_CAPTURA_COLETA.chave})`,
      );
      if (!r) throw new Error("Sem coordenador");
      pronto.concluir(r.pid);
      await liberar.promessa;
      await tx.execute(sql`select id from recreio.spaces where id=${f.mundoId} for update`);
      const [c] = await tx
        .insert(captures)
        .values({
          storageScope: "qualification",
          bucketId: randomUUID(),
          bucketName: "recreio-fixture",
        })
        .returning();
      if (!c) throw new Error("Sem captura");
      await tx
        .insert(holds)
        .values({ captureId: c.id, deliveryId: f.id, referenceSha256: "a".repeat(64) });
    });
    void captura.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const coleta = admitirColeta(f.id, f.destino);
    void coleta.catch(() => undefined);
    try {
      let bloqueada = false;
      for (let i = 0; i < 80; i++) {
        const [r] = await db.execute<{ bloqueada: boolean }>(
          sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid)) and wait_event='advisory') as bloqueada`,
        );
        if (r?.bloqueada) {
          bloqueada = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(bloqueada).toBe(true);
    } finally {
      liberar.concluir(undefined);
      await captura;
    }
    expect(await coleta).toBeNull();
  });
  it("executor retira, confirma e conserva tombstone e recebimento original", async () => {
    const f = await comS3();
    f.b.objetos.set(f.path, Buffer.from("sintetico"));
    expect(await executarColeta(f.id, f.destino, f.transporte)).toBe("retirada");
    const r = await f.registro();
    expect(r).toMatchObject({ state: "retired", leaseToken: null, leaseUntil: null });
    expect(r?.retiredAt).toBeInstanceOf(Date);
    expect(f.b.objetos.has(f.path)).toBe(false);
    // Precisão sub-ms existe no PostgreSQL, embora Date leia só milissegundos.
    await db.execute(
      sql`update recreio.snapshot_object_deliveries set retired_at=date_trunc('milliseconds',retired_at)+interval '456 microseconds' where id=${f.id}`,
    );
    const [original] = await db.execute<{ instante: string }>(
      sql`select retired_at::text as instante from recreio.snapshot_object_deliveries where id=${f.id}`,
    );
    // PUT tardio de um worker antigo; reconferência não apaga o tombstone.
    f.b.objetos.set(f.path, Buffer.from("PUT_TARDIO"));
    await devida(f.id);
    expect(await executarColeta(f.id, f.destino, f.transporte)).toBe("retirada");
    expect((await f.registro())?.retiredAt).toEqual(r?.retiredAt);
    const [atual] = await db.execute<{ instante: string }>(
      sql`select retired_at::text as instante from recreio.snapshot_object_deliveries where id=${f.id}`,
    );
    expect(atual?.instante).toBe(original?.instante);
    expect(f.b.objetos.has(f.path)).toBe(false);
    const [a] = await db.execute<{ tardia: boolean }>(
      sql`select (payload->>'lateObject')::boolean as tardia from audit.events where event_type='recreio.snapshot_object_retired' and payload->>'deliveryId'=${f.id} order by created_at desc limit 1`,
    );
    expect(a?.tardia).toBe(true);
  });
  it("DELETE inconclusivo reagenda sem falsificar retirada", async () => {
    const f = await comS3();
    f.b.objetos.set(f.path, Buffer.from("sintetico"));
    f.b.estado.preservarDelete = true;
    await expect(executarColeta(f.id, f.destino, f.transporte)).rejects.toMatchObject({
      codigo: "INCONCLUSIVO",
    });
    expect(await f.registro()).toMatchObject({
      state: "retiring",
      retiredAt: null,
      leaseToken: null,
    });
    expect(await listarColetasDevidas(f.destino)).toEqual([]);
  });
  it("falha de auditoria da admissão não deixa token ou tentativa parcial", async () => {
    const f = await fixture();
    await recusarAudit("recreio.snapshot_collection_admitted", async () => {
      await expect(admitirColeta(f.id, f.destino)).rejects.toMatchObject({
        name: "AuditPersistenceError",
      });
    });
    expect(await f.registro()).toMatchObject({ attemptCount: 0, leaseToken: null });
  });
  it("objeto ausente após falha de auditoria é confirmado só na repetição", async () => {
    const f = await comS3();
    f.b.objetos.set(f.path, Buffer.from("sintetico"));
    await recusarAudit("recreio.snapshot_object_retired", async () => {
      await expect(executarColeta(f.id, f.destino, f.transporte)).rejects.toMatchObject({
        name: "AuditPersistenceError",
      });
    });
    expect(f.b.objetos.has(f.path)).toBe(false);
    expect(await f.registro()).toMatchObject({
      state: "retiring",
      retiredAt: null,
      leaseToken: null,
    });
    await devida(f.id);
    expect(await executarColeta(f.id, f.destino, f.transporte)).toBe("retirada");
  });
  it("scanner limita vinte, usa índice parcial válido e separa destino", async () => {
    const f = await fixture();
    for (let i = 0; i < 20; i++) await fixture(f.destino, f.mundoId);
    expect(await listarColetasDevidas(f.destino)).toHaveLength(20);
    expect(await listarColetasDevidas({ ...f.destino, bucketId: randomUUID() })).toEqual([]);
    const [i] = await db.execute<{ valido: boolean; pronto: boolean; parcial: boolean }>(
      sql`select indisvalid as valido,indisready as pronto,indpred is not null as parcial from pg_index where indexrelid=to_regclass('recreio.recreio_snapshot_object_collection')`,
    );
    expect(i).toEqual({ valido: true, pronto: true, parcial: true });
  });
  it("lote parcialmente falho ainda atende outro recibo e reporta falha", async () => {
    const f = await comS3(),
      g = await fixture(f.destino, f.mundoId);
    f.b.objetos.set(f.path, Buffer.from("sintetico"));
    f.b.estado.preservarDelete = true;
    await expect(executarLoteDeColetas(f.destino, f.transporte)).rejects.toMatchObject({
      message: "RECREIO_COLLECTION_BATCH_FAILED",
    });
    expect((await f.registro())?.state).toBe("retiring");
    expect((await g.registro())?.state).toBe("retired");
  });
});
