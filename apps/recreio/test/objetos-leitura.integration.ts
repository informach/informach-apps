import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceLeases as leases,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  conferirReferenciaDoObjeto,
  criarCifradorDeObjetos,
} from "@/features/objetos/criptografia";
import { executarEntregaDaFotografia } from "@/features/objetos/entregas";
import {
  confirmarEntregaDaFotografia,
  registrarFalhaDaEntrega,
  reservarEntregaDaFotografia,
} from "@/features/objetos/entregas-repository";
import {
  type DestinoDeFotografias,
  prepararEntregaDaFotografia,
} from "@/features/objetos/fotografias-repository";
import { criarArmazenamentoPrivadoS3 } from "@/features/objetos/s3";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { conferirFotografiaDeCheckpoint } from "@/features/posse/prova-fotografia";
import {
  conferirPosse,
  lerFotografiaDoMundo,
  type PedidoComPosse,
} from "@/features/posse/repository";
import {
  aplicarRecuperacao,
  type PedidoDeRecuperacao,
  prepararRecuperacao,
} from "@/features/recuperacao/repository";
import { aposentarInstancias, eventosCom, novoJogador } from "./apoio";
import { abrirPelaRota, entrarNoJogo, MORADA, mundoDe, novaInstancia } from "./jogo-apoio";
import { criarBucketS3DeTeste } from "./objetos-s3-apoio";

/** A promoção é fixture SQL explícita de leitor, não prova do futuro worker.
 * Rede usa SDK real/HTTP fechado; fonte, posse e recibo usam PostgreSQL real. */
async function preparar() {
  await aposentarInstancias();
  const adulto = await novoJogador();
  const mundoId = await mundoDe(adulto);
  const sessao = await entrarNoJogo(adulto);
  const instancia = await novaInstancia();
  expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId);
  const pedido: PedidoComPosse = {
    mundoId,
    jogo: MORADA,
    instanciaId: instancia.instanciaId,
    cerca: posse.cerca,
  };
  const bytes = Buffer.from("FOTOGRAFIA_PRIVADA_SINTETICA");
  const [foto] = await db
    .insert(snapshots)
    .values({
      spaceId: mundoId,
      revision: 1,
      fence: posse.cerca,
      schemaVersion: 1,
      journalSeq: 0,
      tick: 0,
      kind: "checkpoint",
      storage: "pg",
      data: bytes,
      byteSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    .returning();
  if (!foto) throw new Error("Snapshot absent");
  return { pedido, foto, bytes, instancia, sessao };
}

async function pararParaRecuperacao(
  f: Awaited<ReturnType<typeof preparar>>,
): Promise<PedidoDeRecuperacao> {
  await f.instancia.cliente.liberarPosse({
    mundoId: f.pedido.mundoId,
    cerca: f.pedido.cerca,
    motivo: "erro",
  });
  await db.update(spaces).set({ revision: 1 }).where(eq(spaces.id, f.pedido.mundoId));
  return {
    mundoId: f.pedido.mundoId,
    jogo: f.pedido.jogo,
    revisaoFonte: 1,
    revisaoEsperada: 1,
    operacaoId: randomUUID(),
    motivo: "ensaio_bucket",
    fotografiaMaxBytes: 4096,
    diarioPendenteMaxBytes: 1024,
  };
}

async function comBucket(
  executar: (
    f: Awaited<ReturnType<typeof preparar>> & {
      s3: Awaited<ReturnType<typeof criarBucketS3DeTeste>>;
      leitor: LeitorDeFotografiasPrivadas;
      entregaId: string;
    },
  ) => Promise<void>,
) {
  const f = await preparar();
  const s3 = await criarBucketS3DeTeste();
  try {
    const envelope = s3.cifrador.cifrar({ tipo: "fotografia", id: f.pedido.mundoId }, f.bytes);
    await s3.storage.enviar(envelope);
    const r = envelope.referencia;
    const bucketId = randomUUID(),
      bucketName = "recreio-fixture";
    const objectKey = `recreio/v1/fotografia/${f.pedido.mundoId}/${r.sha256Cifrado}`;
    const [entrega] = await db
      .insert(deliveries)
      .values({
        snapshotId: f.foto.id,
        snapshotReference: f.foto.id,
        spaceId: f.pedido.mundoId,
        plaintextSha256: r.sha256,
        plaintextBytes: r.bytes,
        storageScope: "qualification",
        bucketId,
        bucketName,
        objectKey,
        cipherSha256: r.sha256Cifrado,
        cipherBytes: r.bytesCifrados,
        encryptionKeyId: r.chaveId,
        formatVersion: 1,
        state: "verified",
        createdAt: new Date(),
        verifiedAt: new Date(),
      })
      .returning({ id: deliveries.id });
    if (!entrega) throw new Error("Delivery absent");
    await db
      .update(snapshots)
      .set({ storage: "bucket", data: null, objectKey })
      .where(eq(snapshots.id, f.foto.id));
    const leitor: LeitorDeFotografiasPrivadas = {
      bucketId,
      bucketName,
      escopo: "qualification",
      ler: s3.storage.recuperar,
    };
    await executar({ ...f, s3, leitor, entregaId: entrega.id });
  } finally {
    await s3.fechar();
  }
}

describe("leitor nativo de fotografias: limites, integridade e posse após I/O", () => {
  it("recupera revisão histórica no bucket, publica pg e repete o recibo sem rede na aplicação", async () =>
    comBucket(async (f) => {
      const pedido = await pararParaRecuperacao(f);
      await db.insert(snapshots).values({
        spaceId: pedido.mundoId,
        revision: 2,
        fence: f.pedido.cerca,
        schemaVersion: 1,
        journalSeq: 0,
        tick: 1,
        kind: "checkpoint",
        storage: "pg",
        data: Buffer.alloc(f.bytes.length),
        byteSize: f.bytes.length,
        sha256: f.foto.sha256,
      });
      await db.update(spaces).set({ revision: 2 }).where(eq(spaces.id, pedido.mundoId));
      pedido.revisaoEsperada = 2;
      const material = await prepararRecuperacao(pedido, f.leitor);
      expect(Buffer.from(material.foto.bytes)).toEqual(f.bytes);
      expect(material.foto.revision).toBe(1);
      const antes = f.s3.pedidos.length;
      const nova = {
        bytes: material.foto.bytes,
        tick: material.foto.tick,
        schemaVersion: material.mundo.schemaVersion,
      };
      const recibo = await aplicarRecuperacao(pedido, material, nova);
      expect(recibo).toMatchObject({ sourceRevision: 1, previousRevision: 2, revision: 3 });
      expect(await aplicarRecuperacao(pedido, material, nova)).toEqual(recibo);
      const fotos = await db
        .select({ revision: snapshots.revision, storage: snapshots.storage, data: snapshots.data })
        .from(snapshots)
        .where(eq(snapshots.spaceId, pedido.mundoId))
        .orderBy(snapshots.revision);
      expect(fotos).toHaveLength(3);
      expect(fotos[0]).toMatchObject({ storage: "bucket", data: null });
      expect(fotos[2]).toMatchObject({ storage: "pg", data: f.bytes });
      expect(f.s3.pedidos).toHaveLength(antes);
    }));
  it.each(["off", "ausente", "corrompido"] as const)(
    "restauração recusa armazenamento %s sem escolher outra fonte",
    async (caso) =>
      comBucket(async (f) => {
        const pedido = await pararParaRecuperacao(f);
        if (caso === "ausente") f.s3.objetos.clear();
        if (caso === "corrompido") f.s3.estado.corromper = true;
        await expect(
          prepararRecuperacao(pedido, caso === "off" ? null : f.leitor),
        ).rejects.toMatchObject({ codigo: "ARMAZENAMENTO_INDISPONIVEL" });
        expect(
          await db
            .select({ id: snapshots.id })
            .from(snapshots)
            .where(eq(snapshots.spaceId, pedido.mundoId)),
        ).toHaveLength(1);
      }),
  );
  it.each(["abertura", "cerca", "fotografia"] as const)(
    "restauração relê %s após o I/O sem travar a rede",
    async (caso) =>
      comBucket(async (f) => {
        const pedido = await pararParaRecuperacao(f);
        let aberto: Uint8Array | undefined;
        const leitor: LeitorDeFotografiasPrivadas = {
          ...f.leitor,
          ler: async (ref) => {
            await db.transaction(async (tx) => {
              await tx.execute(sql`set local lock_timeout='1500ms'`);
              await tx
                .select({ id: spaces.id })
                .from(spaces)
                .where(eq(spaces.id, pedido.mundoId))
                .for("update");
              if (caso === "abertura")
                await tx
                  .update(spaces)
                  .set({ status: "active" })
                  .where(eq(spaces.id, pedido.mundoId));
              if (caso === "cerca")
                await tx
                  .update(spaces)
                  .set({ leaseEpoch: sql`${spaces.leaseEpoch}+1` })
                  .where(eq(spaces.id, pedido.mundoId));
              if (caso === "fotografia")
                await tx.update(snapshots).set({ tick: 1 }).where(eq(snapshots.id, f.foto.id));
            });
            aberto = await f.leitor.ler(ref);
            return aberto;
          },
        };
        await expect(prepararRecuperacao(pedido, leitor)).rejects.toMatchObject({
          codigo: caso === "abertura" ? "MUNDO_NAO_PARADO" : "MATERIAL_ALTERADO",
        });
        expect(aberto?.every((b) => b === 0)).toBe(true);
      }),
  );
  it("recusa confirmação retirada depois da preparação e conserva a fonte anterior", async () =>
    comBucket(async (f) => {
      const pedido = await pararParaRecuperacao(f);
      const material = await prepararRecuperacao(pedido, f.leitor);
      await db
        .update(deliveries)
        .set({ state: "review", reviewReason: "integrity" })
        .where(eq(deliveries.id, f.entregaId));
      await expect(
        aplicarRecuperacao(pedido, material, {
          bytes: material.foto.bytes,
          tick: material.foto.tick,
          schemaVersion: material.mundo.schemaVersion,
        }),
      ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(
        await db
          .select({ id: snapshots.id })
          .from(snapshots)
          .where(eq(snapshots.spaceId, pedido.mundoId)),
      ).toHaveLength(1);
    }));
  it("checkpoint aceita referência confirmada somente no destino legível, sem rede sob trava", async () =>
    comBucket(async (f) => {
      const prova = {
        mundoId: f.pedido.mundoId,
        cerca: f.pedido.cerca,
        revisao: f.foto.revision,
        diarioSeq: 0,
        diarioAtual: 0,
        fotografiaMaxBytes: 4096,
        criadaApos: sql`${f.foto.createdAt.toISOString()}::timestamptz`,
      };
      const conferir = (leitor: LeitorDeFotografiasPrivadas | null) =>
        db.transaction(async (tx) => {
          await conferirPosse(tx, f.pedido);
          await conferirFotografiaDeCheckpoint(tx, prova, leitor);
        });
      const antes = f.s3.pedidos.length;
      await expect(conferir(null)).rejects.toMatchObject({ codigo: "CHECKPOINT_NECESSARIO" });
      await conferir(f.leitor);
      await db
        .update(deliveries)
        .set({ state: "review", reviewReason: "integrity" })
        .where(eq(deliveries.id, f.entregaId));
      await expect(conferir(f.leitor)).rejects.toMatchObject({ codigo: "CHECKPOINT_NECESSARIO" });
      expect(f.s3.pedidos).toHaveLength(antes);
    }));
  it("retenção destaca o recibo antes de apagar a fotografia, preservando o objeto para expurgo próprio", async () =>
    comBucket(async (f) => {
      await db.insert(snapshots).values({
        spaceId: f.pedido.mundoId,
        revision: 2,
        fence: f.pedido.cerca,
        schemaVersion: 1,
        journalSeq: 0,
        tick: 1,
        kind: "checkpoint",
        storage: "pg",
        data: f.bytes,
        byteSize: f.bytes.length,
        sha256: f.foto.sha256,
      });
      const antes = f.s3.pedidos.length;
      await db.transaction(async (tx) => {
        await conferirPosse(tx, f.pedido);
        await armazenamentoPg.apararFotografias(tx, f.pedido.mundoId, 1);
      });
      const [recibo] = await db
        .select({
          state: deliveries.state,
          snapshotId: deliveries.snapshotId,
          detachedAt: deliveries.detachedAt,
          nextAttemptAt: deliveries.nextAttemptAt,
          envelope: deliveries.envelope,
        })
        .from(deliveries)
        .where(eq(deliveries.id, f.entregaId));
      expect(recibo).toMatchObject({ state: "retiring", snapshotId: null, envelope: null });
      expect(recibo?.detachedAt).toBeInstanceOf(Date);
      expect(recibo?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(
        await db.select({ id: snapshots.id }).from(snapshots).where(eq(snapshots.id, f.foto.id)),
      ).toEqual([]);
      expect(f.s3.objetos.size).toBe(1);
      expect(f.s3.pedidos).toHaveLength(antes);
    }));
  it("retenção conserva fotografia fixada e seu vínculo confirmado", async () =>
    comBucket(async (f) => {
      await db.update(snapshots).set({ kind: "pinned" }).where(eq(snapshots.id, f.foto.id));
      await db.transaction(async (tx) => {
        await conferirPosse(tx, f.pedido);
        await armazenamentoPg.apararFotografias(tx, f.pedido.mundoId, 0);
      });
      const [recibo] = await db
        .select({ state: deliveries.state, snapshotId: deliveries.snapshotId })
        .from(deliveries)
        .where(eq(deliveries.id, f.entregaId));
      expect(recibo).toEqual({ state: "verified", snapshotId: f.foto.id });
      expect((await lerFotografiaDoMundo(f.pedido, f.leitor))?.meta.tipo).toBe("pinned");
    }));
  it("conserva leitura pg sem configuração de bucket", async () => {
    const f = await preparar();
    const lida = await lerFotografiaDoMundo(f.pedido);
    expect(lida).toMatchObject({
      meta: { revisao: 1, bytes: f.bytes.length, sha256: f.foto.sha256 },
    });
    expect(Buffer.from(lida?.bytes ?? [])).toEqual(f.bytes);
  });
  it.each(["hash", "tamanho"] as const)("recusa conteúdo pg divergente: %s", async (caso) => {
    const f = await preparar();
    await db
      .update(snapshots)
      .set(
        caso === "hash" ? { data: Buffer.alloc(f.bytes.length) } : { byteSize: f.bytes.length + 1 },
      )
      .where(eq(snapshots.id, f.foto.id));
    await expect(lerFotografiaDoMundo(f.pedido)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });
  it("recusa fotografia maior que o teto do jogo antes de carregar bytes", async () => {
    const f = await preparar();
    await db
      .update(snapshots)
      .set({ byteSize: 4 * 1024 * 1024 + 1 })
      .where(eq(snapshots.id, f.foto.id));
    await expect(lerFotografiaDoMundo(f.pedido)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });
  it("abre o envelope confirmado do destino exato", async () =>
    comBucket(async (f) => {
      expect(await lerFotografiaDoMundo(f.pedido, f.leitor)).toMatchObject({
        bytes: f.bytes,
        meta: { revisao: 1, sha256: f.foto.sha256 },
      });
      expect(f.s3.pedidos.at(-1)).toMatchObject({ metodo: "GET", assinado: true });
    }));
  it.each(["off", "bucketId", "bucketName", "escopo"] as const)(
    "recusa leitor %s sem GET nem fallback",
    async (caso) =>
      comBucket(async (f) => {
        const antes = f.s3.pedidos.length;
        const leitor = caso === "off" ? null : { ...f.leitor };
        if (leitor && caso === "bucketId") leitor.bucketId = randomUUID();
        if (leitor && caso === "bucketName") leitor.bucketName = "outro-bucket";
        if (leitor && caso === "escopo") leitor.escopo = "production";
        await expect(lerFotografiaDoMundo(f.pedido, leitor)).rejects.toMatchObject({
          codigo: "INDISPONIVEL",
        });
        expect(f.s3.pedidos).toHaveLength(antes);
      }),
  );
  it.each(["ausente", "review"] as const)("recusa confirmação %s", async (caso) =>
    comBucket(async (f) => {
      if (caso === "ausente") await db.delete(deliveries).where(eq(deliveries.id, f.entregaId));
      else
        await db
          .update(deliveries)
          .set({ state: "review", reviewReason: "integrity" })
          .where(eq(deliveries.id, f.entregaId));
      const antes = f.s3.pedidos.length;
      await expect(lerFotografiaDoMundo(f.pedido, f.leitor)).rejects.toMatchObject({
        codigo: "INDISPONIVEL",
      });
      expect(f.s3.pedidos).toHaveLength(antes);
    }),
  );
  it.each(["corrompido", "ausente"] as const)(
    "recusa objeto %s sem devolver fotografia antiga",
    async (caso) =>
      comBucket(async (f) => {
        if (caso === "corrompido") f.s3.estado.corromper = true;
        else f.s3.objetos.clear();
        await expect(lerFotografiaDoMundo(f.pedido, f.leitor)).rejects.toMatchObject({
          codigo: "INDISPONIVEL",
        });
      }),
  );
  it.each(["cerca", "vencida", "fotografia", "confirmacao"] as const)(
    "relê %s depois do I/O, sem manter a trava do mundo",
    async (caso) =>
      comBucket(async (f) => {
        let aberto: Uint8Array | undefined;
        const leitor: LeitorDeFotografiasPrivadas = {
          ...f.leitor,
          ler: async (ref) => {
            // Se o leitor mantiver a transação aberta, esta trava falha em vez de pendurar o teste.
            await db.transaction(async (tx) => {
              await tx.execute(sql`set local lock_timeout='1500ms'`);
              await tx
                .select({ id: spaces.id })
                .from(spaces)
                .where(eq(spaces.id, f.pedido.mundoId))
                .for("update");
              if (caso === "cerca")
                await tx
                  .update(leases)
                  .set({ fence: f.pedido.cerca + 1 })
                  .where(eq(leases.spaceId, f.pedido.mundoId));
              if (caso === "vencida")
                await tx
                  .update(leases)
                  .set({ expiresAt: sql`clock_timestamp()-interval '1 millisecond'` })
                  .where(eq(leases.spaceId, f.pedido.mundoId));
              if (caso === "fotografia")
                await tx.insert(snapshots).values({
                  spaceId: f.pedido.mundoId,
                  revision: 2,
                  fence: f.pedido.cerca,
                  schemaVersion: 1,
                  journalSeq: 0,
                  tick: 1,
                  kind: "checkpoint",
                  storage: "pg",
                  data: f.bytes,
                  byteSize: f.bytes.length,
                  sha256: f.foto.sha256,
                });
              if (caso === "confirmacao")
                await tx
                  .update(deliveries)
                  .set({ state: "review", reviewReason: "integrity" })
                  .where(eq(deliveries.id, f.entregaId));
            });
            aberto = await f.leitor.ler(ref);
            return aberto;
          },
        };
        await expect(lerFotografiaDoMundo(f.pedido, leitor)).rejects.toMatchObject({
          codigo: caso === "cerca" || caso === "vencida" ? "POSSE_PERDIDA" : "INDISPONIVEL",
        });
        expect(aberto?.every((b) => b === 0)).toBe(true);
      }),
  );
});

async function prepararEscrow() {
  const f = await preparar();
  await pararParaRecuperacao(f);
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: "original",
    chaves: new Map([["original", randomBytes(32)]]),
    limiteBytes: 4096,
  });
  const destino: DestinoDeFotografias = {
    bucketId: randomUUID(),
    bucketName: "recreio-fixture",
    escopo: "qualification",
  };
  const pedido = { mundoId: f.pedido.mundoId, jogo: f.pedido.jogo, revisao: 1 };
  return { ...f, destino, cifrador, entrega: pedido };
}

describe("preparação durável e aditiva da entrega de fotografias", () => {
  it("falha real de auditoria reverte o registro e conserva todos os bytes PG", async () => {
    const f = await prepararEscrow();
    await db.execute(
      sql`create function audit.recusar_objeto_preparado_em_teste() returns trigger language plpgsql as $$ begin if new.event_type = 'recreio.snapshot_object_prepared' then raise exception 'auditoria indisponível (teste)'; end if; return new; end $$`,
    );
    try {
      await db.execute(
        sql`create trigger recusar_objeto_preparado_em_teste before insert on audit.events for each row execute function audit.recusar_objeto_preparado_em_teste()`,
      );
      await expect(
        prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(
        await db
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(eq(deliveries.spaceId, f.entrega.mundoId)),
      ).toEqual([]);
      const [foto] = await db
        .select({
          storage: snapshots.storage,
          data: snapshots.data,
          objectKey: snapshots.objectKey,
        })
        .from(snapshots)
        .where(eq(snapshots.id, f.foto.id));
      expect(foto).toEqual({ storage: "pg", data: f.bytes, objectKey: null });
    } finally {
      await db.execute(
        sql`drop trigger if exists recusar_objeto_preparado_em_teste on audit.events`,
      );
      await db.execute(sql`drop function if exists audit.recusar_objeto_preparado_em_teste()`);
    }
  });
  it("preparação repetida de objeto confirmado não envia nem refaz o recibo", async () =>
    comBucket(async (f) => {
      await pararParaRecuperacao(f);
      const antes = f.s3.pedidos.length;
      const id = await prepararEntregaDaFotografia(
        { mundoId: f.pedido.mundoId, jogo: f.pedido.jogo, revisao: 1 },
        { bucketId: f.leitor.bucketId, bucketName: f.leitor.bucketName, escopo: f.leitor.escopo },
        f.s3.cifrador,
      );
      expect(id).toBe(f.entregaId);
      expect(f.s3.pedidos).toHaveLength(antes);
    }));
  it("não prepara revisão além do topo persistido do mundo", async () => {
    const f = await prepararEscrow();
    await db.update(spaces).set({ revision: 0 }).where(eq(spaces.id, f.entrega.mundoId));
    await expect(
      prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador),
    ).rejects.toMatchObject({ codigo: "FONTE_INDISPONIVEL" });
    expect(
      await db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(eq(deliveries.spaceId, f.entrega.mundoId)),
    ).toEqual([]);
  });
  it("conserva pg e envelope íntegro antes de qualquer envio, com auditoria mínima", async () => {
    const f = await prepararEscrow();
    const id = await prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador);
    const [entrega] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    if (!entrega?.envelope) throw new Error("Durable envelope absent");
    expect(entrega).toMatchObject({
      state: "prepared",
      snapshotId: f.foto.id,
      verifiedAt: null,
      attemptCount: 0,
      leaseToken: null,
    });
    const ref = conferirReferenciaDoObjeto({
      formato: "recreio-objeto-cifrado-v1",
      chaveId: entrega.encryptionKeyId,
      contexto: { tipo: "fotografia", id: f.entrega.mundoId },
      bytes: entrega.plaintextBytes,
      sha256: entrega.plaintextSha256,
      sha256Cifrado: entrega.cipherSha256,
      bytesCifrados: entrega.cipherBytes,
    });
    expect(f.cifrador.abrir(ref, entrega.envelope)).toEqual(f.bytes);
    expect(entrega.envelope.includes(f.bytes)).toBe(false);
    const [foto] = await db.select().from(snapshots).where(eq(snapshots.id, f.foto.id));
    expect(foto).toMatchObject({ storage: "pg", data: f.bytes, objectKey: null });
    const eventos = (await eventosCom("spaceId", f.entrega.mundoId)).filter(
      (e) => e.eventType === "recreio.snapshot_object_prepared",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.payload).toEqual({
      app: "recreio",
      spaceId: f.entrega.mundoId,
      gameId: f.entrega.jogo,
      revision: 1,
      storageScope: "qualification",
    });
  });
  it("seis preparações concorrentes conservam um IV, recibo e evento", async () => {
    const f = await prepararEscrow();
    const ids = await Promise.all(
      Array.from({ length: 6 }, () =>
        prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    const antes = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, ids[0] ?? ""));
    expect(antes).toHaveLength(1);
    expect(await prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador)).toBe(ids[0]);
    expect(
      await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, ids[0] ?? "")),
    ).toEqual(antes);
    expect(
      (await eventosCom("spaceId", f.entrega.mundoId)).filter(
        (e) => e.eventType === "recreio.snapshot_object_prepared",
      ),
    ).toHaveLength(1);
  });
  it.each(["ativo", "posse"] as const)("recusa mundo %s sem preparar envelope", async (caso) => {
    const f = await preparar();
    if (caso === "posse")
      await db.update(spaces).set({ status: "hibernating" }).where(eq(spaces.id, f.pedido.mundoId));
    const destino: DestinoDeFotografias = {
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      escopo: "qualification",
    };
    const cifrador = criarCifradorDeObjetos({
      chaveAtiva: "test",
      chaves: new Map([["test", randomBytes(32)]]),
      limiteBytes: 4096,
    });
    await expect(
      prepararEntregaDaFotografia(
        { mundoId: f.pedido.mundoId, jogo: f.pedido.jogo, revisao: 1 },
        destino,
        cifrador,
      ),
    ).rejects.toMatchObject({ codigo: "MUNDO_NAO_PARADO" });
    expect(
      await db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(eq(deliveries.spaceId, f.pedido.mundoId)),
    ).toEqual([]);
  });
  it.each(["bucketId", "bucketName", "escopo"] as const)(
    "replay não muda destino %s nem gera envelope novo",
    async (campo) => {
      const f = await prepararEscrow();
      const id = await prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador);
      const antes = await db.select().from(deliveries).where(eq(deliveries.id, id));
      const outro = { ...f.destino };
      if (campo === "bucketId") outro.bucketId = randomUUID();
      if (campo === "bucketName") outro.bucketName = "outro-fixture";
      if (campo === "escopo") outro.escopo = "production";
      await expect(prepararEntregaDaFotografia(f.entrega, outro, f.cifrador)).rejects.toMatchObject(
        { codigo: "DESTINO_DIVERGENTE" },
      );
      expect(await db.select().from(deliveries).where(eq(deliveries.id, id))).toEqual(antes);
    },
  );
  it("chave antiga indisponível não substitui o envelope durável", async () => {
    const f = await prepararEscrow();
    const id = await prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador);
    const antes = await db.select().from(deliveries).where(eq(deliveries.id, id));
    const novo = criarCifradorDeObjetos({
      chaveAtiva: "nova",
      chaves: new Map([["nova", randomBytes(32)]]),
      limiteBytes: 4096,
    });
    await expect(prepararEntregaDaFotografia(f.entrega, f.destino, novo)).rejects.toMatchObject({
      codigo: "CHAVE_INDISPONIVEL",
    });
    expect(await db.select().from(deliveries).where(eq(deliveries.id, id))).toEqual(antes);
  });
  it("envelope corrompido não é refeito nem confirmado silenciosamente", async () => {
    const f = await prepararEscrow();
    const id = await prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador);
    await db
      .update(deliveries)
      .set({ envelope: sql`decode(repeat('00',${deliveries.cipherBytes}),'hex')` })
      .where(eq(deliveries.id, id));
    const antes = await db.select().from(deliveries).where(eq(deliveries.id, id));
    await expect(
      prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador),
    ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
    expect(await db.select().from(deliveries).where(eq(deliveries.id, id))).toEqual(antes);
  });
  it("recibo destacado bloqueia reabertura da mesma identidade de fotografia", async () => {
    const f = await prepararEscrow();
    const id = await prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador);
    await db
      .update(deliveries)
      .set({
        snapshotId: null,
        detachedAt: sql`clock_timestamp()`,
        state: "retiring",
        envelope: null,
      })
      .where(eq(deliveries.id, id));
    await expect(
      prepararEntregaDaFotografia(f.entrega, f.destino, f.cifrador),
    ).rejects.toMatchObject({ codigo: "REVISAO_NECESSARIA" });
    expect(
      await db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(eq(deliveries.snapshotReference, f.foto.id)),
    ).toHaveLength(1);
  });
});

async function comEntrega(
  executar: (
    f: Awaited<ReturnType<typeof prepararEscrow>> & {
      id: string;
      s3: Awaited<ReturnType<typeof criarBucketS3DeTeste>>;
    },
  ) => Promise<void>,
) {
  const f = await prepararEscrow();
  const s3 = await criarBucketS3DeTeste();
  try {
    const id = await prepararEntregaDaFotografia(f.entrega, f.destino, s3.cifrador);
    await executar({ ...f, id, s3 });
  } finally {
    await s3.fechar();
  }
}
async function entregaGuardada(id: string) {
  const [e] = await db.select().from(deliveries).where(eq(deliveries.id, id));
  if (!e) throw new Error("Delivery absent");
  return e;
}
async function tornarEntregaDevida(id: string) {
  await db
    .update(deliveries)
    .set({ nextAttemptAt: sql`clock_timestamp()` })
    .where(eq(deliveries.id, id));
}
async function expirarTentativa(id: string) {
  await db
    .update(deliveries)
    .set({ leaseUntil: sql`clock_timestamp()-interval '1 microsecond'` })
    .where(eq(deliveries.id, id));
}

describe("executor nativo: tentativa durável, confirmação e publicação atômica", () => {
  it("cancelamento após upload verificado conserva PG e permite replay da mesma entrega", async () =>
    comEntrega(async (f) => {
      const ctl = new AbortController();
      const antes = await entregaGuardada(f.id);
      await expect(
        executarEntregaDaFotografia(
          f.id,
          f.destino,
          {
            bucketName: f.s3.storage.bucketName,
            enviar: async (pedido) => {
              const r = await f.s3.storage.enviar(pedido);
              ctl.abort();
              return r;
            },
          },
          ctl.signal,
        ),
      ).rejects.toThrow();
      const [pg] = await db
        .select({
          storage: snapshots.storage,
          data: snapshots.data,
          objectKey: snapshots.objectKey,
        })
        .from(snapshots)
        .where(eq(snapshots.id, f.foto.id));
      expect(pg).toEqual({ storage: "pg", data: f.bytes, objectKey: null });
      const guardada = await entregaGuardada(f.id);
      expect(guardada.state).toBe("prepared");
      expect(guardada.envelope).toEqual(antes.envelope);
      expect(guardada.objectKey).toBe(antes.objectKey);
      expect(f.s3.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
      expect(
        (await eventosCom("spaceId", f.pedido.mundoId)).filter(
          (e) => e.eventType === "recreio.snapshot_object_confirmed",
        ),
      ).toHaveLength(0);
      await expirarTentativa(f.id);
      await tornarEntregaDevida(f.id);
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("concluida");
      expect((await entregaGuardada(f.id)).objectKey).toBe(antes.objectKey);
      expect(
        (await eventosCom("spaceId", f.pedido.mundoId)).filter(
          (e) => e.eventType === "recreio.snapshot_object_confirmed",
        ),
      ).toHaveLength(1);
    }));

  it("rotação sem chave antiga exige revisão e não inicia PUT", async () =>
    comEntrega(async (f) => {
      const cifrador = criarCifradorDeObjetos({
        chaveAtiva: "nova",
        chaves: new Map([["nova", randomBytes(32)]]),
        limiteBytes: 4096,
      });
      const transporte = criarArmazenamentoPrivadoS3({
        cliente: f.s3.cliente,
        bucket: f.destino.bucketName,
        cifrador,
        tempoLimiteMs: 2000,
      });
      expect(await executarEntregaDaFotografia(f.id, f.destino, transporte)).toBe("revisao");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "review",
        reviewReason: "missing_key",
        verifiedAt: null,
      });
      expect(f.s3.pedidos).toEqual([]);
      const [pg] = await db
        .select({ storage: snapshots.storage, data: snapshots.data })
        .from(snapshots)
        .where(eq(snapshots.id, f.foto.id));
      expect(pg).toEqual({ storage: "pg", data: f.bytes });
    }));
  it("só publica bucket após PUT e leitura inteira; o mundo reabre com os mesmos bytes", async () =>
    comEntrega(async (f) => {
      expect(f.s3.pedidos).toEqual([]);
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("concluida");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "verified",
        envelope: null,
        leaseToken: null,
        attemptCount: 1,
      });
      expect(f.s3.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
      expect((await abrirPelaRota(f.sessao, f.pedido.mundoId)).status).toBe(200);
      const posse = await f.instancia.cliente.reivindicarPosse(f.pedido.mundoId);
      const foto = await lerFotografiaDoMundo(
        { ...f.pedido, cerca: posse.cerca },
        { ...f.destino, ler: f.s3.storage.recuperar },
      );
      expect(Buffer.from(foto?.bytes ?? [])).toEqual(f.bytes);
      const antes = f.s3.pedidos.length;
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("concluida");
      expect(f.s3.pedidos).toHaveLength(antes);
      expect(
        (await eventosCom("spaceId", f.pedido.mundoId)).filter(
          (e) => e.eventType === "recreio.snapshot_object_confirmed",
        ),
      ).toHaveLength(1);
    }));
  it("resposta perdida mantém pg/envelope e recupera o mesmo objeto por replay 412", async () =>
    comEntrega(async (f) => {
      const antes = await entregaGuardada(f.id);
      f.s3.estado.perderPut = true;
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("aguardando");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "prepared",
        envelope: antes.envelope,
        verifiedAt: null,
        attemptCount: 1,
        leaseToken: null,
      });
      const [pg] = await db
        .select({ storage: snapshots.storage, data: snapshots.data })
        .from(snapshots)
        .where(eq(snapshots.id, f.foto.id));
      expect(pg).toEqual({ storage: "pg", data: f.bytes });
      expect(f.s3.objetos.size).toBe(1);
      const pedidos = f.s3.pedidos.length;
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("aguardando");
      expect(f.s3.pedidos).toHaveLength(pedidos);
      f.s3.estado.perderPut = false;
      await tornarEntregaDevida(f.id);
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("concluida");
      const depois = await entregaGuardada(f.id);
      expect(depois).toMatchObject({
        state: "verified",
        envelope: null,
        attemptCount: 2,
        cipherSha256: antes.cipherSha256,
        objectKey: antes.objectKey,
      });
      expect(f.s3.objetos.size).toBe(1);
      expect(f.s3.pedidos.map((p) => p.metodo)).toEqual(["PUT", "PUT", "GET"]);
    }));
  it("corrupção no objeto congela a entrega para revisão, sem retirar pg", async () =>
    comEntrega(async (f) => {
      f.s3.estado.corromper = true;
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("revisao");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "review",
        reviewReason: "integrity",
        verifiedAt: null,
        leaseToken: null,
      });
      const [pg] = await db
        .select({ storage: snapshots.storage, data: snapshots.data })
        .from(snapshots)
        .where(eq(snapshots.id, f.foto.id));
      expect(pg).toEqual({ storage: "pg", data: f.bytes });
      expect(f.s3.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
    }));
  it("fonte pg alterada antes da tentativa entra em revisão sem tráfego", async () =>
    comEntrega(async (f) => {
      await db
        .update(snapshots)
        .set({ data: Buffer.alloc(f.bytes.length) })
        .where(eq(snapshots.id, f.foto.id));
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("revisao");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "review",
        reviewReason: "integrity",
        attemptCount: 0,
      });
      expect(f.s3.pedidos).toEqual([]);
    }));
  it("destino diferente do transporte é recusado antes da tentativa", async () =>
    comEntrega(async (f) => {
      await expect(
        executarEntregaDaFotografia(
          f.id,
          { ...f.destino, bucketName: "outro-fixture" },
          f.s3.storage,
        ),
      ).rejects.toMatchObject({ codigo: "DESTINO_DIVERGENTE" });
      expect((await entregaGuardada(f.id)).attemptCount).toBe(0);
      expect(f.s3.pedidos).toEqual([]);
    }));
  it("mundo reaberto durante I/O conserva pg e a mesma entrega recuperável", async () =>
    comEntrega(async (f) => {
      const transporte = {
        ...f.s3.storage,
        enviar: async (preparado: Parameters<typeof f.s3.storage.enviar>[0]) => {
          await db.transaction(async (tx) => {
            await tx.execute(sql`set local lock_timeout='1500ms'`);
            await tx
              .select({ id: spaces.id })
              .from(spaces)
              .where(eq(spaces.id, f.pedido.mundoId))
              .for("update");
            await tx
              .update(spaces)
              .set({ status: "active" })
              .where(eq(spaces.id, f.pedido.mundoId));
          });
          return f.s3.storage.enviar(preparado);
        },
      };
      expect(await executarEntregaDaFotografia(f.id, f.destino, transporte)).toBe("aguardando");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "prepared",
        verifiedAt: null,
        leaseToken: null,
      });
      const [pg] = await db
        .select({ storage: snapshots.storage, data: snapshots.data })
        .from(snapshots)
        .where(eq(snapshots.id, f.foto.id));
      expect(pg).toEqual({ storage: "pg", data: f.bytes });
      await db.update(spaces).set({ status: "hibernating" }).where(eq(spaces.id, f.pedido.mundoId));
      await tornarEntregaDevida(f.id);
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("concluida");
      expect(f.s3.objetos.size).toBe(1);
    }));
  it("tentativa vencida após leitura externa não publica ponteiro", async () =>
    comEntrega(async (f) => {
      const transporte = {
        ...f.s3.storage,
        enviar: async (preparado: Parameters<typeof f.s3.storage.enviar>[0]) => {
          const r = await f.s3.storage.enviar(preparado);
          await expirarTentativa(f.id);
          return r;
        },
      };
      expect(await executarEntregaDaFotografia(f.id, f.destino, transporte)).toBe("aguardando");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "prepared",
        verifiedAt: null,
        leaseToken: null,
      });
    }));
  it("executor antigo não publica nem limpa o token de outro executor", async () =>
    comEntrega(async (f) => {
      const antiga = await reservarEntregaDaFotografia(f.id, f.destino);
      if (antiga.tipo !== "trabalho") throw new Error("First work absent");
      await expirarTentativa(f.id);
      const nova = await reservarEntregaDaFotografia(f.id, f.destino);
      if (nova.tipo !== "trabalho") throw new Error("Second work absent");
      await f.s3.storage.enviar({
        referencia: antiga.trabalho.referencia,
        bytes: antiga.trabalho.envelope,
      });
      expect(await confirmarEntregaDaFotografia(antiga.trabalho)).toBe(false);
      await registrarFalhaDaEntrega(antiga.trabalho, null);
      expect((await entregaGuardada(f.id)).leaseToken).toBe(nova.trabalho.token);
      await f.s3.storage.enviar({
        referencia: nova.trabalho.referencia,
        bytes: nova.trabalho.envelope,
      });
      expect(await confirmarEntregaDaFotografia(nova.trabalho)).toBe(true);
      expect((await entregaGuardada(f.id)).attemptCount).toBe(2);
      expect(f.s3.objetos.size).toBe(1);
    }));
  it("retirada durante envio conserva o tombstone e não ressuscita o vínculo", async () =>
    comEntrega(async (f) => {
      const transporte = {
        ...f.s3.storage,
        enviar: async (preparado: Parameters<typeof f.s3.storage.enviar>[0]) => {
          const r = await f.s3.storage.enviar(preparado);
          await db.transaction(async (tx) => {
            await tx
              .select({ id: spaces.id })
              .from(spaces)
              .where(eq(spaces.id, f.pedido.mundoId))
              .for("update");
            await tx.insert(snapshots).values({
              spaceId: f.pedido.mundoId,
              revision: 2,
              fence: f.pedido.cerca,
              schemaVersion: 1,
              journalSeq: 0,
              tick: 1,
              kind: "checkpoint",
              storage: "pg",
              data: f.bytes,
              byteSize: f.bytes.length,
              sha256: f.foto.sha256,
            });
            await tx.update(spaces).set({ revision: 2 }).where(eq(spaces.id, f.pedido.mundoId));
            await armazenamentoPg.apararFotografias(tx, f.pedido.mundoId, 1);
          });
          return r;
        },
      };
      expect(await executarEntregaDaFotografia(f.id, f.destino, transporte)).toBe("aguardando");
      expect(await entregaGuardada(f.id)).toMatchObject({
        state: "retiring",
        snapshotId: null,
        envelope: null,
        verifiedAt: null,
      });
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("retirada");
      expect(f.s3.objetos.size).toBe(1);
    }));
  it("falha real de auditoria desfaz a publicação; replay recupera o objeto já escrito", async () =>
    comEntrega(async (f) => {
      await db.execute(
        sql`create function audit.recusar_objeto_confirmado_em_teste() returns trigger language plpgsql as $$ begin if new.event_type = 'recreio.snapshot_object_confirmed' then raise exception 'auditoria indisponível (teste)'; end if; return new; end $$`,
      );
      try {
        await db.execute(
          sql`create trigger recusar_objeto_confirmado_em_teste before insert on audit.events for each row execute function audit.recusar_objeto_confirmado_em_teste()`,
        );
        await expect(
          executarEntregaDaFotografia(f.id, f.destino, f.s3.storage),
        ).rejects.toBeInstanceOf(AuditPersistenceError);
        expect(await entregaGuardada(f.id)).toMatchObject({
          state: "prepared",
          verifiedAt: null,
          attemptCount: 1,
        });
        const [pg] = await db
          .select({ storage: snapshots.storage, data: snapshots.data })
          .from(snapshots)
          .where(eq(snapshots.id, f.foto.id));
        expect(pg).toEqual({ storage: "pg", data: f.bytes });
        expect(f.s3.objetos.size).toBe(1);
      } finally {
        await db.execute(
          sql`drop trigger if exists recusar_objeto_confirmado_em_teste on audit.events`,
        );
        await db.execute(sql`drop function if exists audit.recusar_objeto_confirmado_em_teste()`);
      }
      await expirarTentativa(f.id);
      expect(await executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)).toBe("concluida");
      expect(f.s3.objetos.size).toBe(1);
      expect((await entregaGuardada(f.id)).state).toBe("verified");
    }));
  it("seis executores concorrentes fazem uma única tentativa externa", async () =>
    comEntrega(async (f) => {
      const estados = await Promise.all(
        Array.from({ length: 6 }, () => executarEntregaDaFotografia(f.id, f.destino, f.s3.storage)),
      );
      expect(estados).toContain("concluida");
      expect(estados.every((e) => e === "concluida" || e === "ocupada")).toBe(true);
      expect(f.s3.pedidos.map((p) => p.metodo)).toEqual(["PUT", "GET"]);
      expect((await entregaGuardada(f.id)).attemptCount).toBe(1);
    }));
});
