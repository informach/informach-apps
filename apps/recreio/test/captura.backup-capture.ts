import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import {
  type CapturaAberta,
  comCapturaConsistente,
  travarColetaDeObjetos,
} from "@/features/backup/captura-repository";
import {
  BARREIRA_CAPTURA_COLETA,
  FalhaDaCaptura,
  resumoDaReferencia,
} from "@/features/backup/contrato";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";

const destino = {
  bucketId: randomUUID(),
  bucketName: "recreio-fixture",
  escopo: "qualification",
} satisfies Parameters<typeof comCapturaConsistente>[0];
async function objetos(c: CapturaAberta) {
  const r = [];
  for await (const o of c.objetos()) r.push(o);
  return r;
}
async function reservas(deliveryId: string) {
  return db
    .select()
    .from(holds)
    .where(and(eq(holds.deliveryId, deliveryId), isNull(holds.releasedAt)));
}
async function comFoto<T>(
  executar: (f: {
    fotoId: string;
    mundoId: string;
    entregaId: string;
    bytes: Buffer;
  }) => Promise<T>,
) {
  const mundoId = await mundoDe(await novoJogador()),
    bytes = Buffer.from("FOTOGRAFIA_SINTETICA_CAPTURA"),
    fotoId = randomUUID(),
    entregaId = randomUUID();
  const codec = criarCifradorDeObjetos({
    chaveAtiva: "fixture",
    chaves: new Map([["fixture", randomBytes(32)]]),
    limiteBytes: 4096,
  });
  const { referencia: ref } = codec.cifrar({ tipo: "fotografia", id: mundoId }, bytes);
  const key = `recreio/v1/fotografia/${mundoId}/${ref.sha256Cifrado}`;
  await db.insert(snapshots).values({
    id: fotoId,
    spaceId: mundoId,
    revision: 1,
    fence: 0,
    schemaVersion: 1,
    journalSeq: 0,
    tick: 0,
    kind: "checkpoint",
    storage: "bucket",
    data: null,
    objectKey: key,
    byteSize: bytes.length,
    sha256: ref.sha256,
  });
  await db.insert(deliveries).values({
    id: entregaId,
    snapshotReference: fotoId,
    snapshotId: fotoId,
    spaceId: mundoId,
    plaintextSha256: ref.sha256,
    plaintextBytes: ref.bytes,
    storageScope: "qualification",
    bucketId: destino.bucketId,
    bucketName: destino.bucketName,
    objectKey: key,
    cipherSha256: ref.sha256Cifrado,
    cipherBytes: ref.bytesCifrados,
    encryptionKeyId: ref.chaveId,
    state: "verified",
    verifiedAt: sql`clock_timestamp()`,
  });
  try {
    return await executar({ fotoId, mundoId, entregaId, bytes });
  } finally {
    await db.transaction(async (tx) => {
      await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, mundoId)).for("update");
      await tx
        .update(deliveries)
        .set({
          snapshotId: null,
          detachedAt: sql`clock_timestamp()`,
          state: "retiring",
          envelope: null,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(eq(deliveries.id, entregaId));
      await tx
        .update(snapshots)
        .set({ storage: "pg", data: bytes, objectKey: null })
        .where(eq(snapshots.id, fotoId));
    });
  }
}
const sinal = () => {
  let resolver: () => void = () => {
    throw new Error("Sinal ainda não preparado");
  };
  const pronto = new Promise<void>((r) => {
    resolver = r;
  });
  return { pronto, resolver: () => resolver() };
};
async function alterarEnquantoEspera(
  f: { mundoId: string },
  mudar: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>,
  executar: () => Promise<void>,
) {
  const travado = sinal(),
    liberar = sinal();
  let pid = 0;
  const trava = db.transaction(async (tx) => {
    await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, f.mundoId)).for("update");
    const [r] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    if (!r) throw new Error("PID ausente");
    pid = r.pid;
    travado.resolver();
    await liberar.pronto;
    await mudar(tx);
  });
  await travado.pronto;
  const operacao = executar();
  try {
    await expect
      .poll(
        async () => {
          const [r] = await db.execute<{ n: number }>(
            sql`select count(*)::int as n from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`,
          );
          return r?.n ?? 0;
        },
        { timeout: 5000, interval: 20 },
      )
      .toBeGreaterThan(0);
  } finally {
    liberar.resolver();
    await trava;
  }
  await operacao;
}

describe("captura consistente: PostgreSQL próprio, sem S3/dados reais", () => {
  it("origem é READ ONLY, snapshot é importável e não há objetos fabricados", async () => {
    const id = await comCapturaConsistente(destino, async (c) => {
      expect(c.inventario).toEqual({
        quantidade: 0,
        bytesCifrados: 0,
        sha256: createHash("sha256").digest("hex"),
      });
      const [r] = await c.origem.unsafe<{ ro: string }[]>(
        "select current_setting('transaction_read_only') as ro",
      );
      expect(r?.ro).toBe("on");
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("Banco ausente");
      const outro = postgres(url, { max: 1, prepare: false });
      try {
        await outro.begin("isolation level repeatable read read only", async (tx) => {
          await tx.unsafe(`set transaction snapshot '${c.snapshot}'`);
          expect(await tx`select id from recreio.backup_captures where id=${c.id}`).toHaveLength(1);
        });
      } finally {
        await outro.end({ timeout: 5 });
      }
      return c.id;
    });
    expect((await db.select().from(captures).where(eq(captures.id, id)))[0]).toMatchObject({
      state: "captured",
      objectCount: 0,
      verifiedAt: null,
    });
  });
  it("fixa referência completa e conserva reservas depois de fechar a visão", async () =>
    comFoto(async (f) => {
      let antiga: CapturaAberta | undefined;
      const id = await comCapturaConsistente(destino, async (c) => {
        antiga = c;
        const lista = await objetos(c);
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({
          entregaId: f.entregaId,
          fotografiaId: f.fotoId,
          mundoId: f.mundoId,
        });
        const r = await reservas(f.entregaId);
        expect(r).toHaveLength(1);
        expect(r[0]?.referenceSha256).toBe(resumoDaReferencia(lista[0]));
        return c.id;
      });
      expect((await reservas(f.entregaId))[0]?.captureId).toBe(id);
      if (!antiga) throw new Error("Captura ausente");
      await expect(objetos(antiga)).rejects.toMatchObject({ codigo: "CAPTURA_ENCERRADA" });
    }));
  it("retenção depois das reservas não altera a visão original nem apaga a reserva", async () =>
    comFoto(async (f) => {
      await comCapturaConsistente(destino, async (c) => {
        await db.transaction(async (tx) => {
          await tx
            .select({ id: spaces.id })
            .from(spaces)
            .where(eq(spaces.id, f.mundoId))
            .for("update");
          await tx
            .update(deliveries)
            .set({ snapshotId: null, detachedAt: sql`clock_timestamp()`, state: "retiring" })
            .where(eq(deliveries.id, f.entregaId));
          await tx.delete(snapshots).where(eq(snapshots.id, f.fotoId));
        });
        expect(await objetos(c)).toHaveLength(1);
        expect(await reservas(f.entregaId)).toHaveLength(1);
      });
    }));
  it("retenção entre inventário e reserva pode destacar a foto sem perder o objeto da captura", async () =>
    comFoto(async (f) => {
      await alterarEnquantoEspera(
        f,
        async (tx) => {
          await tx
            .update(deliveries)
            .set({ snapshotId: null, detachedAt: sql`clock_timestamp()`, state: "retiring" })
            .where(eq(deliveries.id, f.entregaId));
          await tx.delete(snapshots).where(eq(snapshots.id, f.fotoId));
        },
        async () => {
          await comCapturaConsistente(destino, async (c) => {
            expect(await objetos(c)).toHaveLength(1);
            expect((await reservas(f.entregaId))[0]?.captureId).toBe(c.id);
          });
        },
      );
    }));
  it("destino alterado enquanto espera a trava recusa reserva e consumidor", async () =>
    comFoto(async (f) => {
      let chamado = false;
      await alterarEnquantoEspera(
        f,
        async (tx) => {
          await tx
            .update(deliveries)
            .set({ bucketName: "recreio-outro-fixture" })
            .where(eq(deliveries.id, f.entregaId));
        },
        async () => {
          await expect(
            comCapturaConsistente(destino, async () => {
              chamado = true;
            }),
          ).rejects.toMatchObject({ codigo: "FONTE_ALTERADA" });
        },
      );
      expect(chamado).toBe(false);
      expect(await reservas(f.entregaId)).toHaveLength(0);
    }));
  it("coleta espera a barreira e depois encontra a reserva durável", async () =>
    comFoto(async (f) => {
      let coletor: Promise<number> | undefined;
      await comCapturaConsistente(destino, async () => {
        coletor = db.transaction(async (tx) => {
          await travarColetaDeObjetos(tx);
          const r = await tx
            .select({ id: holds.deliveryId })
            .from(holds)
            .where(and(eq(holds.deliveryId, f.entregaId), isNull(holds.releasedAt)));
          return r.length;
        });
        await expect
          .poll(
            async () => {
              const [r] = await db.execute<{ n: number }>(
                sql`select count(*)::int as n from pg_locks where locktype='advisory' and classid=${BARREIRA_CAPTURA_COLETA.grupo}::oid and objid=${BARREIRA_CAPTURA_COLETA.chave}::oid and mode='ShareLock' and not granted`,
              );
              return r?.n ?? 0;
            },
            { timeout: 5000, interval: 20 },
          )
          .toBe(1);
      });
      expect(coletor).toBeDefined();
      expect(await coletor).toBe(1);
    }));
  it("falha no consumidor conserva reservas e registra revisão, sem verificação fictícia", async () =>
    comFoto(async (f) => {
      const falha = new Error("FALHA_SINTETICA");
      await expect(
        comCapturaConsistente(destino, async () => {
          throw falha;
        }),
      ).rejects.toBe(falha);
      const r = await reservas(f.entregaId);
      expect(r).toHaveLength(1);
      expect(
        (await db.select().from(captures).where(eq(captures.id, r[0].captureId)))[0],
      ).toMatchObject({ state: "review", reviewReason: "source_lost", verifiedAt: null });
    }));
  it("ausência de recibo não exclui fotografia silenciosamente do inventário", async () =>
    comFoto(async (f) => {
      await db.delete(deliveries).where(eq(deliveries.id, f.entregaId));
      let chamado = false;
      await expect(
        comCapturaConsistente(destino, async () => {
          chamado = true;
        }),
      ).rejects.toBeInstanceOf(FalhaDaCaptura);
      expect(chamado).toBe(false);
      expect(await reservas(f.entregaId)).toHaveLength(0);
    }));
  it("auditoria recusada não fixa inventário e mantém as reservas já duráveis", async () =>
    comFoto(async (f) => {
      await db.execute(
        sql`create function audit.recusar_inventario_backup_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.backup_inventory_fixed' then raise exception 'recusa sintetica'; end if; return new; end $$`,
      );
      try {
        await db.execute(
          sql`create trigger recusar_inventario_backup_teste before insert on audit.events for each row execute function audit.recusar_inventario_backup_teste()`,
        );
        await expect(
          comCapturaConsistente(destino, async () => {
            throw new Error("NAO_DEVERIA_CHEGAR");
          }),
        ).rejects.toBeInstanceOf(AuditPersistenceError);
        const r = await reservas(f.entregaId);
        expect(r).toHaveLength(1);
        expect(
          (await db.select().from(captures).where(eq(captures.id, r[0].captureId)))[0],
        ).toMatchObject({ state: "review", capturedAt: null, objectCount: null });
      } finally {
        await db.execute(
          sql`drop trigger if exists recusar_inventario_backup_teste on audit.events`,
        );
        await db.execute(sql`drop function audit.recusar_inventario_backup_teste()`);
      }
    }));
  it("queda real do backend de coordenação durante a reserva reverte o lote", async () =>
    comFoto(async (f) => {
      await db.execute(
        sql`create function recreio.derrubar_barreira_backup_teste() returns trigger language plpgsql as $$ begin perform pg_terminate_backend(pid) from pg_locks where locktype='advisory' and classid=1380270930::oid and objid=8::oid and objsubid=2 and mode='ExclusiveLock' and granted and database=(select oid from pg_database where datname=current_database()); return new; end $$`,
      );
      let chamado = false;
      try {
        await db.execute(
          sql`create trigger derrubar_barreira_backup_teste before insert on recreio.backup_object_holds for each row execute function recreio.derrubar_barreira_backup_teste()`,
        );
        await expect(
          comCapturaConsistente(destino, async () => {
            chamado = true;
          }),
        ).rejects.toBeDefined();
        expect(chamado).toBe(false);
        expect(await reservas(f.entregaId)).toHaveLength(0);
      } finally {
        await db.execute(
          sql`drop trigger if exists derrubar_barreira_backup_teste on recreio.backup_object_holds`,
        );
        await db.execute(sql`drop function recreio.derrubar_barreira_backup_teste()`);
      }
    }));
});
