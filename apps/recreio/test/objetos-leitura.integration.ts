import { createHash, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceLeases as leases,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { conferirFotografiaDeCheckpoint } from "@/features/posse/prova-fotografia";
import {
  conferirPosse,
  lerFotografiaDoMundo,
  type PedidoComPosse,
} from "@/features/posse/repository";
import { aposentarInstancias, novoJogador } from "./apoio";
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
  return { pedido, foto, bytes };
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
