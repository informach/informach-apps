import { createHash, randomUUID } from "node:crypto";
import { db, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioSnapshotObjectDeliveries as deliveries,
  recreioBackupObjectHolds as holds,
} from "@informach/db/schema";
import { criarIndiceDeRecuperacao } from "../scripts/backup/indice-recuperacao";
import {
  confirmarArquivoGuardado,
  prepararIndiceDuravel,
  prepararPublicacao,
} from "../scripts/backup/publicacao-repository";
import { novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";
export const sha = "a".repeat(64),
  cipher = "b".repeat(64),
  source = "c".repeat(40);
type PerfilDaFixture = {
  foto?: { bucketId: string; bucketName: string; escopo: "qualification" | "production" };
  createdAt?: Date;
  capturedAt?: Date;
};
export async function fixture(
  scope: "qualification" | "production" = "qualification",
  n = 0,
  perfil: PerfilDaFixture = {},
) {
  const id = randomUUID(),
    foto = perfil.foto ?? { bucketId: randomUUID(), bucketName: "recreio-fotos", escopo: scope },
    destino = { bucketId: randomUUID(), bucketName: "recreio-backups", escopo: scope };
  await db.insert(captures).values({
    id,
    protocolVersion: 1,
    storageScope: scope,
    bucketId: foto.bucketId,
    bucketName: foto.bucketName,
    state: "captured",
    createdAt: perfil.createdAt ?? new Date("2020-01-01T00:00:00Z"),
    capturedAt: perfil.capturedAt ?? new Date("2020-01-02T00:00:00Z"),
    inventorySha256: sha,
    objectCount: n,
    objectBytes: n * 100,
  });
  if (n) {
    const mundo = await mundoDe(await novoJogador());
    const refs = await db
      .insert(deliveries)
      .values(
        Array.from({ length: n }, (_, i) => {
          const hash = createHash("sha256").update(String(i)).digest("hex");
          return {
            snapshotReference: randomUUID(),
            spaceId: mundo,
            plaintextSha256: sha,
            plaintextBytes: 0,
            storageScope: scope,
            bucketId: foto.bucketId,
            bucketName: foto.bucketName,
            objectKey: `recreio/v1/fotografia/${mundo}/${hash}`,
            cipherSha256: hash,
            cipherBytes: 100,
            encryptionKeyId: "fixture",
            state: "retiring" as const,
            detachedAt: sql`clock_timestamp()`,
          };
        }),
      )
      .returning({ id: deliveries.id });
    await db
      .insert(holds)
      .values(refs.map((r) => ({ captureId: id, deliveryId: r.id, referenceSha256: sha })));
  }
  const arquivo = {
      formato: "recreio-arquivo-cifrado-v1" as const,
      chaveId: "v1",
      contexto: { tipo: "backup" as const, id },
      bytes: 10,
      sha256: sha,
      bytesCifrados: 110,
      sha256Cifrado: cipher,
    },
    composto = {
      formato: "recreio-captura-composta-v1" as const,
      capturaId: id,
      bytes: 10,
      sha256: sha,
    };
  const indice = criarIndiceDeRecuperacao({
    destino,
    chaveAtiva: "v1",
    chaves: new Map([["v1", Buffer.alloc(32, 7)]]),
  });
  const config = { capturaId: id, destino, source, arquivo, composto };
  return { id, foto, destino, arquivo, composto, indice, config };
}
export async function expirar(id: string) {
  await db.execute(
    sql`update recreio.backup_publications set created_at=created_at-interval '1 day',lease_until=clock_timestamp()-interval '1 second' where capture_id=${id}`,
  );
}
export async function pronta(n = 0, perfil: PerfilDaFixture = {}) {
  const f = await fixture("qualification", n, perfil),
    t = await prepararPublicacao(f.config),
    v = await confirmarArquivoGuardado(t),
    bytes = await prepararIndiceDuravel(t, f.indice.assinar(v), f.indice);
  return { ...f, t, bytes };
}
export async function estados(id: string) {
  const [r] = await db.execute<{ captura: string; publicacao: string; ativas: number }>(sql`
    select c.state as captura,p.state as publicacao,
      (select count(*)::int from recreio.backup_object_holds h where h.capture_id=c.id and released_at is null) as ativas
    from recreio.backup_captures c join recreio.backup_publications p on p.capture_id=c.id where c.id=${id}`);
  return r;
}
