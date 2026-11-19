import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { CHECAGEM, codigoDoBanco, RESTRICAO, UNICO } from "./apoio";

/** Fixtures SQL não publicam ponteiro de bucket, não simulam aceite do provedor
 * e não são backup. Verificam as fronteiras reais de conteúdo e retenção. */
async function preparar() {
  const [mundo] = await db
    .insert(spaces)
    .values({ gameId: "objetos-schema", name: "Mundo sintético", contentPolicy: "L" })
    .returning();
  if (!mundo) throw new Error("World absent");
  const bytes = Buffer.from("FOTOGRAFIA_SINTETICA_SEM_FAMILIA_REAL");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const [foto] = await db
    .insert(snapshots)
    .values({
      spaceId: mundo.id,
      revision: 0,
      fence: 0,
      schemaVersion: 1,
      journalSeq: 0,
      tick: 0,
      kind: "checkpoint",
      storage: "pg",
      data: bytes,
      byteSize: bytes.length,
      sha256: hash,
    })
    .returning();
  if (!foto) throw new Error("Snapshot absent");
  const cipher = criarCifradorDeObjetos({
    chaveAtiva: "schema-test",
    chaves: new Map([["schema-test", randomBytes(32)]]),
    limiteBytes: 4096,
  });
  const preparado = cipher.cifrar({ tipo: "fotografia", id: mundo.id }, bytes);
  const r = preparado.referencia;
  const linha: typeof deliveries.$inferInsert = {
    snapshotReference: foto.id,
    snapshotId: foto.id,
    spaceId: mundo.id,
    plaintextSha256: r.sha256,
    plaintextBytes: r.bytes,
    storageScope: "qualification",
    bucketId: randomUUID(),
    bucketName: "recreio-fixture",
    objectKey: `recreio/v1/fotografia/${mundo.id}/${r.sha256Cifrado}`,
    cipherSha256: r.sha256Cifrado,
    cipherBytes: r.bytesCifrados,
    encryptionKeyId: r.chaveId,
    formatVersion: 1,
    envelope: preparado.bytes,
    state: "prepared",
    createdAt: new Date(),
  };
  return { mundo, foto, bytes, cipher, preparado, linha };
}

describe("objetos: vínculos, envelope e recibos de retenção no PostgreSQL", () => {
  it("mantém fonte pg íntegra e envelope durável antes de qualquer confirmação externa", async () => {
    const f = await preparar();
    const [registro] = await db.insert(deliveries).values(f.linha).returning();
    if (!registro?.envelope) throw new Error("Durable envelope absent");
    expect(registro.state).toBe("prepared");
    expect(registro.verifiedAt).toBeNull();
    expect(f.cipher.abrir(f.preparado.referencia, registro.envelope)).toEqual(f.bytes);
    const [foto] = await db.select().from(snapshots).where(eq(snapshots.id, f.foto.id));
    expect(foto?.storage).toBe("pg");
    expect(foto?.data).toEqual(f.bytes);
  });
  it.each(["mundo", "hash", "tamanho"] as const)(
    "FK recusa %s que não é o da fotografia",
    async (caso) => {
      const f = await preparar(),
        outro = await preparar();
      const linha = { ...f.linha };
      if (caso === "mundo") {
        linha.spaceId = outro.mundo.id;
        linha.objectKey = `recreio/v1/fotografia/${outro.mundo.id}/${linha.cipherSha256}`;
      }
      if (caso === "hash") linha.plaintextSha256 = "0".repeat(64);
      if (caso === "tamanho") linha.plaintextBytes = f.bytes.length + 1;
      expect(await codigoDoBanco(db.insert(deliveries).values(linha))).toBe("23503");
    },
  );
  it("só permite uma entrega vinculada por fotografia e exige destacar antes de apagar", async () => {
    const f = await preparar();
    const [registro] = await db.insert(deliveries).values(f.linha).returning();
    if (!registro) throw new Error("Delivery absent");
    expect(
      await codigoDoBanco(db.insert(deliveries).values({ ...f.linha, bucketId: randomUUID() })),
    ).toBe(UNICO);
    expect(RESTRICAO).toContain(
      await codigoDoBanco(db.delete(snapshots).where(eq(snapshots.id, f.foto.id))),
    );
    await db.transaction(async (tx) => {
      await tx
        .update(deliveries)
        .set({ snapshotId: null, detachedAt: new Date(), state: "retiring", envelope: null })
        .where(eq(deliveries.id, registro.id));
      await tx.delete(snapshots).where(eq(snapshots.id, f.foto.id));
    });
    const [destacado] = await db.select().from(deliveries).where(eq(deliveries.id, registro.id));
    expect(destacado).toMatchObject({
      snapshotReference: f.foto.id,
      snapshotId: null,
      state: "retiring",
      retiredAt: null,
    });
    expect(destacado?.objectKey).toBe(f.linha.objectKey);
  });
  it.each([
    "referencia",
    "caminho",
    "formato",
    "envelope",
    "chave",
    "escopo",
    "confirmacao",
    "confirmacao-sem-liberar-envelope",
    "aposentado-vinculado",
    "lease",
    "tentativa",
  ] as const)("CHECK recusa %s incompatível", async (caso) => {
    const f = await preparar(),
      linha = { ...f.linha };
    if (caso === "referencia") linha.snapshotReference = randomUUID();
    if (caso === "caminho") linha.objectKey = "https://example.test/outro";
    if (caso === "formato") linha.formatVersion = 2;
    if (caso === "envelope") linha.envelope = Buffer.alloc(1);
    if (caso === "chave") linha.encryptionKeyId = "chave com espaço";
    // O bucket é técnico e fixado pela composição, jamais uma URL ou nome de pessoa.
    if (caso === "escopo") linha.bucketName = "https://example.test";
    if (caso === "confirmacao") {
      linha.state = "verified";
      linha.envelope = null;
    }
    if (caso === "confirmacao-sem-liberar-envelope") {
      linha.state = "verified";
      linha.verifiedAt = new Date();
    }
    if (caso === "aposentado-vinculado") {
      linha.state = "retired";
      linha.retiredAt = new Date();
      linha.envelope = null;
    }
    if (caso === "lease") linha.leaseToken = randomUUID();
    if (caso === "tentativa") linha.attemptCount = 1;
    expect(await codigoDoBanco(db.insert(deliveries).values(linha))).toBe(CHECAGEM);
  });
  it("separa verificação, destaque e aposentadoria sem apagar o fato observado", async () => {
    const f = await preparar();
    const [registro] = await db.insert(deliveries).values(f.linha).returning();
    if (!registro) throw new Error("Delivery absent");
    const verificadoEm = new Date();
    await db
      .update(deliveries)
      .set({ state: "verified", verifiedAt: verificadoEm, envelope: null })
      .where(eq(deliveries.id, registro.id));
    expect(
      await codigoDoBanco(
        db.update(deliveries).set({ state: "review" }).where(eq(deliveries.id, registro.id)),
      ),
    ).toBe(CHECAGEM);
    await db
      .update(deliveries)
      .set({ state: "review", reviewReason: "integrity" })
      .where(eq(deliveries.id, registro.id));
    await db
      .update(deliveries)
      .set({ state: "retiring", reviewReason: null, snapshotId: null, detachedAt: new Date() })
      .where(eq(deliveries.id, registro.id));
    await db
      .update(deliveries)
      .set({ state: "retired", retiredAt: new Date() })
      .where(eq(deliveries.id, registro.id));
    const [retirado] = await db.select().from(deliveries).where(eq(deliveries.id, registro.id));
    expect(retirado?.verifiedAt?.getTime()).toBe(verificadoEm.getTime());
    expect(retirado?.retiredAt).not.toBeNull();
    expect(retirado?.snapshotId).toBeNull();
  });

  it("recusa relógio infinito e lease sem prazo finito", async () => {
    const f = await preparar();
    expect(
      await codigoDoBanco(
        db.insert(deliveries).values({ ...f.linha, createdAt: sql`'infinity'::timestamptz` }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(deliveries).values({
          ...f.linha,
          attemptCount: 1,
          lastAttemptAt: new Date(),
          leaseToken: randomUUID(),
          leaseUntil: sql`'infinity'::timestamptz`,
        }),
      ),
    ).toBe(CHECAGEM);
  });
});
