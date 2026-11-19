import { createHash, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
  recreioSpaceSnapshots as snapshots,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { codigoDoPostgres } from "@/lib/repository";
import { novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";

const sha = "a".repeat(64),
  cipherSha = "b".repeat(64);
const criado = new Date("2020-01-01T00:00:00Z"),
  posterior = new Date("2020-01-01T00:01:00Z");
type NovaCaptura = typeof captures.$inferInsert;
const base = (): NovaCaptura => ({
  id: randomUUID(),
  storageScope: "qualification",
  bucketId: randomUUID(),
  bucketName: "recreio-fixture",
  createdAt: criado,
});
const inventario = {
  state: "captured",
  inventorySha256: sha,
  objectCount: 0,
  objectBytes: 0,
  capturedAt: posterior,
} satisfies Partial<NovaCaptura>;
function selada(id: string): Partial<NovaCaptura> {
  return {
    ...inventario,
    state: "sealed",
    sealedAt: posterior,
    archiveSha256: sha,
    archiveBytes: 10,
    cipherSha256: cipherSha,
    cipherBytes: 110,
    encryptionKeyId: "fixture",
    objectKey: `recreio/v1/backup/${id}/${cipherSha}`,
  };
}
async function recusar(p: PromiseLike<unknown>, codigo = "23514") {
  const erro: unknown = await Promise.resolve(p).then(
    () => null,
    (e: unknown) => e,
  );
  expect(codigoDoPostgres(erro)).toBe(codigo);
}
async function captura(delta: Partial<NovaCaptura> = {}) {
  const [r] = await db
    .insert(captures)
    .values({ ...base(), ...delta })
    .returning();
  if (!r) throw new Error("Captura ausente");
  return r;
}

/** Fixture SQL de FK/retenção, sem alegar PUT ou publicação nativa. */
async function entrega() {
  const jogador = await novoJogador(),
    mundo = await mundoDe(jogador),
    bytes = Buffer.from("FOTO_SINTETICA_PARA_RESERVA");
  const [foto] = await db
    .insert(snapshots)
    .values({
      spaceId: mundo,
      revision: 1,
      fence: 0,
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
  if (!foto) throw new Error("Fotografia ausente");
  const [r] = await db
    .insert(deliveries)
    .values({
      snapshotReference: foto.id,
      snapshotId: foto.id,
      spaceId: mundo,
      plaintextSha256: foto.sha256,
      plaintextBytes: bytes.length,
      storageScope: "qualification",
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      objectKey: `recreio/v1/fotografia/${mundo}/${cipherSha}`,
      cipherSha256: cipherSha,
      cipherBytes: bytes.length + 100,
      encryptionKeyId: "fixture",
      envelope: Buffer.alloc(bytes.length + 100),
    })
    .returning();
  if (!r) throw new Error("Entrega ausente");
  return { r, foto };
}

describe("capturas/reservas: integridade PostgreSQL real", () => {
  it("nasce sem inventário, arquivo ou prova fabricada", async () => {
    expect(await captura()).toMatchObject({
      state: "preparing",
      capturedAt: null,
      verifiedAt: null,
      objectCount: null,
      objectKey: null,
    });
  });
  it.each([
    { state: "captured" as const },
    { ...inventario, inventorySha256: null },
    { ...inventario, objectCount: null },
    { ...inventario, objectBytes: null },
    { ...inventario, objectCount: 1_000_001 },
    { ...inventario, objectBytes: 68_719_476_737 },
    { ...inventario, inventorySha256: "invalido" },
  ])("recusa inventário incompleto/fora do teto: %j", async (delta) => {
    await recusar(db.insert(captures).values({ ...base(), ...delta }));
  });
  it("aceita captura vazia completa, sem confundir com arquivo verificado", async () => {
    const r = await captura(inventario);
    expect(r.objectCount).toBe(0);
    expect(r.verifiedAt).toBeNull();
    await recusar(
      db
        .update(captures)
        .set({ state: "verified", verifiedAt: posterior })
        .where(eq(captures.id, r.id)),
    );
  });
  it("arquivo preparado exige referência inteira, tamanho e chave do contexto", async () => {
    const r = await captura(inventario),
      completa = selada(r.id);
    for (const delta of [
      { ...completa, cipherBytes: null },
      { ...completa, encryptionKeyId: null },
      { ...completa, cipherBytes: 20 },
      { ...completa, objectKey: `recreio/v1/backup/${randomUUID()}/${cipherSha}` },
    ])
      await recusar(db.update(captures).set(delta).where(eq(captures.id, r.id)));
    await db.update(captures).set(completa).where(eq(captures.id, r.id));
    const [guardada] = await db.select().from(captures).where(eq(captures.id, r.id));
    expect(guardada).toMatchObject({
      state: "sealed",
      verifiedAt: null,
      archiveBytes: 10,
      cipherBytes: 110,
    });
  });
  it("abandono após preparação exige ausência confirmada; expiração não é prova", async () => {
    const r = await captura(inventario);
    await db.update(captures).set(selada(r.id)).where(eq(captures.id, r.id));
    await recusar(
      db
        .update(captures)
        .set({ state: "abandoned", abandonedAt: posterior })
        .where(eq(captures.id, r.id)),
    );
    await db
      .update(captures)
      .set({ state: "abandoned", abandonedAt: posterior, absenceConfirmedAt: posterior })
      .where(eq(captures.id, r.id));
  });
  it("revisão exige motivo; verificação não pode coexistir com ausência", async () => {
    const r = await captura(inventario);
    await recusar(db.update(captures).set({ state: "review" }).where(eq(captures.id, r.id)));
    await db
      .update(captures)
      .set({ state: "review", reviewReason: "source_lost" })
      .where(eq(captures.id, r.id));
    const s = await captura(inventario);
    await db.update(captures).set(selada(s.id)).where(eq(captures.id, s.id));
    await recusar(
      db
        .update(captures)
        .set({ state: "verified", verifiedAt: posterior, absenceConfirmedAt: posterior })
        .where(eq(captures.id, s.id)),
    );
    await db
      .update(captures)
      .set({ state: "verified", verifiedAt: posterior })
      .where(eq(captures.id, s.id));
  });
  it("recusa datas anteriores à captura e infinitas", async () => {
    await recusar(
      db
        .insert(captures)
        .values({ ...base(), ...inventario, capturedAt: new Date("2019-01-01T00:00:00Z") }),
    );
    await recusar(
      db.execute(
        sql`insert into recreio.backup_captures (storage_scope,bucket_id,bucket_name,created_at) values ('qualification',${randomUUID()},'recreio-fixture','infinity')`,
      ),
    );
  });
  it("FKs impedem reservas de captura ou entrega inexistentes", async () => {
    const c = await captura();
    await recusar(
      db.insert(holds).values({ captureId: c.id, deliveryId: randomUUID(), referenceSha256: sha }),
      "23503",
    );
    const { r } = await entrega();
    await recusar(
      db.insert(holds).values({ captureId: randomUUID(), deliveryId: r.id, referenceSha256: sha }),
      "23503",
    );
  });
  it("destacar/apagar fotografia preserva reserva e impede apagar recibos", async () => {
    const c = await captura(),
      { r, foto } = await entrega();
    await db.insert(holds).values({ captureId: c.id, deliveryId: r.id, referenceSha256: sha });
    await db
      .update(deliveries)
      .set({
        snapshotId: null,
        detachedAt: sql`clock_timestamp()`,
        state: "retiring",
        envelope: null,
      })
      .where(eq(deliveries.id, r.id));
    await db.delete(snapshots).where(eq(snapshots.id, foto.id));
    expect(await db.select().from(holds).where(eq(holds.captureId, c.id))).toHaveLength(1);
    await recusar(db.delete(deliveries).where(eq(deliveries.id, r.id)), "23503");
    await recusar(db.delete(captures).where(eq(captures.id, c.id)), "23503");
  });
  it("liberação exige data/motivo juntos e conserva unicidade do recibo", async () => {
    const c = await captura(),
      { r } = await entrega();
    const valor = { captureId: c.id, deliveryId: r.id, referenceSha256: sha };
    await db.insert(holds).values(valor);
    await recusar(db.insert(holds).values(valor), "23505");
    await recusar(
      db.update(holds).set({ releaseReason: "abandoned" }).where(eq(holds.captureId, c.id)),
    );
    await recusar(
      db
        .update(holds)
        .set({ releasedAt: criado, releaseReason: "abandoned" })
        .where(eq(holds.captureId, c.id)),
    );
    await db
      .update(holds)
      .set({ releasedAt: sql`clock_timestamp()`, releaseReason: "abandoned" })
      .where(eq(holds.captureId, c.id));
    expect(await db.select().from(holds).where(eq(holds.captureId, c.id))).toHaveLength(1);
    await recusar(db.delete(deliveries).where(eq(deliveries.id, r.id)), "23503");
  });
});
