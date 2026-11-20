import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, asc, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioBackupObjectHolds as holds,
  recreioBackupPublications as publications,
  recreioBackupRetirements as retirements,
} from "@informach/db/schema";
import { z } from "zod";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  conferirDestinoDoControle,
  travarCapturaDeBackup as travarCaptura,
} from "./controle-repository";
import { FalhaDaPublicacao } from "./falha-controle";

export { FalhaDaPublicacao } from "./falha-controle";

import {
  conferirReferenciaDoArquivoCifrado,
  type ReferenciaDoArquivoCifrado,
} from "./arquivo-cifrado";
import {
  conferirReferenciaDoArquivoComposto,
  type ReferenciaDoArquivoComposto,
} from "./arquivo-composto";
import type { criarIndiceDeRecuperacao, PublicacaoDoBackup } from "./indice-recuperacao";

const Token = z.strictObject({ capturaId: z.uuid(), tentativa: z.uuid() });
export type TentativaDePublicacao = z.infer<typeof Token>;
type Captura = typeof captures.$inferSelect;
type Publicacao = typeof publications.$inferSelect;
const hash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function exigir(v: unknown, codigo: FalhaDaPublicacao["codigo"]): asserts v {
  if (!v) throw new FalhaDaPublicacao(codigo);
}
function token(bruto: TentativaDePublicacao) {
  const v = Token.safeParse(bruto);
  exigir(v.success, "CONFIGURACAO");
  return v.data;
}
async function travarPublicacao(tx: Transacao, c: Captura) {
  const [p] = await tx
    .select()
    .from(publications)
    .where(eq(publications.captureId, c.id))
    .for("update");
  exigir(p, "ESTADO");
  exigir(c.protocolVersion === 1, "ESTADO");
  const [retirada] = await tx
    .select({ id: retirements.captureId })
    .from(retirements)
    .where(eq(retirements.captureId, c.id))
    .limit(1);
  exigir(!retirada, "ESTADO");
  exigir(c.storageScope === p.storageScope, "INTEGRIDADE");
  exigir(c.state === "sealed" || (c.state === "verified" && p.state === "published"), "ESTADO");
  return p;
}
async function vigente(tx: Transacao, p: Publicacao, t: TentativaDePublicacao) {
  exigir(p.attempt === t.tentativa, "TENTATIVA");
  const [r] = await tx
    .select({ viva: sql<boolean>`${publications.leaseUntil}>clock_timestamp()` })
    .from(publications)
    .where(eq(publications.captureId, p.captureId));
  exigir(r?.viva, "TENTATIVA");
}
function corpo(c: Captura, p: Publicacao): PublicacaoDoBackup {
  exigir(
    c.archiveSha256 !== null &&
      c.archiveBytes !== null &&
      c.cipherSha256 !== null &&
      c.cipherBytes !== null &&
      c.encryptionKeyId !== null &&
      c.inventorySha256 !== null &&
      c.objectCount !== null &&
      c.objectBytes !== null &&
      p.fileVerifiedAt !== null,
    "INTEGRIDADE",
  );
  const arquivo = conferirReferenciaDoArquivoCifrado({
    formato: "recreio-arquivo-cifrado-v1",
    chaveId: c.encryptionKeyId,
    contexto: { tipo: "backup", id: c.id },
    bytes: c.archiveBytes,
    sha256: c.archiveSha256,
    sha256Cifrado: c.cipherSha256,
    bytesCifrados: c.cipherBytes,
  });
  return {
    tipo: "publicado",
    capturaId: c.id,
    destino: { bucketId: p.bucketId, bucketName: p.bucketName, escopo: p.storageScope },
    source: p.source,
    iniciadaEm: c.createdAt.toISOString(),
    conferidaEm: p.fileVerifiedAt.toISOString(),
    arquivo,
    composto: conferirReferenciaDoArquivoComposto({
      formato: "recreio-captura-composta-v1",
      capturaId: c.id,
      bytes: c.archiveBytes,
      sha256: c.archiveSha256,
    }),
    inventario: {
      quantidade: c.objectCount,
      bytesCifrados: c.objectBytes,
      sha256: c.inventorySha256,
    },
  };
}
function indicePersistido(p: Publicacao) {
  exigir(p.indexBody !== null && p.indexSha256 !== null, "ESTADO");
  const bytes = Buffer.from(p.indexBody, "utf8");
  exigir(bytes.length > 0 && bytes.length <= 32768 && hash(bytes) === p.indexSha256, "INTEGRIDADE");
  return bytes;
}
/** Nenhum I/O externo sob trava. Esta capacidade é interna ao executor de
 * backup; não há rota pública que aceite confirmações do cliente. */
export async function prepararPublicacao(config: {
  capturaId: string;
  destino: DestinoDeCaptura;
  source: string;
  arquivo: ReferenciaDoArquivoCifrado;
  composto: ReferenciaDoArquivoComposto;
}) {
  const destino = DestinoDeCapturaSchema.safeParse(config.destino),
    source = z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .safeParse(config.source),
    arquivo = conferirReferenciaDoArquivoCifrado(config.arquivo),
    composto = conferirReferenciaDoArquivoComposto(config.composto),
    id = config.capturaId;
  exigir(
    destino.success &&
      source.success &&
      arquivo.contexto.id === id &&
      composto.capturaId === id &&
      arquivo.bytes === composto.bytes &&
      arquivo.sha256 === composto.sha256,
    "CONFIGURACAO",
  );
  return db.transaction(async (tx) => {
    const c = await travarCaptura(tx, id);
    exigir(
      c.protocolVersion === 1 && c.state === "captured" && c.storageScope === destino.data.escopo,
      "ESTADO",
    );
    exigir(
      destino.data.escopo !== "production" ||
        (c.bucketId !== destino.data.bucketId && c.bucketName !== destino.data.bucketName),
      "CONFIGURACAO",
    );
    const [p] = await tx
      .select({ id: publications.captureId })
      .from(publications)
      .where(eq(publications.captureId, id));
    exigir(!p, "OCUPADA");
    const tentativa = randomUUID();
    await tx
      .update(captures)
      .set({
        state: "sealed",
        sealedAt: AGORA,
        archiveSha256: arquivo.sha256,
        archiveBytes: arquivo.bytes,
        cipherSha256: arquivo.sha256Cifrado,
        cipherBytes: arquivo.bytesCifrados,
        encryptionKeyId: arquivo.chaveId,
        objectKey: `recreio/v1/backup/${id}/${arquivo.sha256Cifrado}`,
      })
      .where(eq(captures.id, id));
    await tx.insert(publications).values({
      captureId: id,
      storageScope: destino.data.escopo,
      bucketId: destino.data.bucketId,
      bucketName: destino.data.bucketName,
      source: source.data,
      state: "prepared",
      attempt: tentativa,
      leaseUntil: sql`${AGORA}+interval '20 minutes'`,
    });
    await logAuditEventStrict(
      "recreio.backup_publication_prepared",
      null,
      { app: "recreio", captureId: id, storageScope: destino.data.escopo },
      { writer: tx },
    );
    return { capturaId: id, tentativa };
  });
}
/** Retomada conserva ciphertext/destino/índice. Prazo vencido NÃO prova término
 * de I/O antigo; bytes imutáveis e PUT condicional continuam obrigatórios. */
export async function assumirPublicacao(id: string, destino: DestinoDeCaptura) {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  exigir(alvo.success, "CONFIGURACAO");
  return db.transaction(async (tx) => {
    const c = await travarCaptura(tx, id),
      p = await travarPublicacao(tx, c);
    conferirDestinoDoControle(p, alvo.data);
    exigir(p.state !== "published", "ESTADO");
    const [r] = await tx
      .select({ ocupada: sql<boolean>`${publications.leaseUntil}>clock_timestamp()` })
      .from(publications)
      .where(eq(publications.captureId, id));
    exigir(!r?.ocupada, "OCUPADA");
    const tentativa = randomUUID();
    await tx
      .update(publications)
      .set({ attempt: tentativa, leaseUntil: sql`${AGORA}+interval '20 minutes'` })
      .where(eq(publications.captureId, id));
    await logAuditEventStrict(
      "recreio.backup_publication_claimed",
      null,
      { app: "recreio", captureId: id },
      { writer: tx },
    );
    return { capturaId: id, tentativa };
  });
}
export async function renovarPublicacao(bruto: TentativaDePublicacao) {
  const t = token(bruto);
  await db.transaction(async (tx) => {
    const c = await travarCaptura(tx, t.capturaId),
      p = await travarPublicacao(tx, c);
    exigir(p.state !== "published", "ESTADO");
    await vigente(tx, p, t);
    await tx
      .update(publications)
      .set({ leaseUntil: sql`${AGORA}+interval '20 minutes'` })
      .where(eq(publications.captureId, c.id));
  });
}
/** Chamado somente após reler/abrir o arquivo guardado e conferir todo composto.
 * O executor não pode usar sucesso de PUT ou existência por HEAD como prova. */
export async function confirmarArquivoGuardado(bruto: TentativaDePublicacao) {
  const t = token(bruto);
  return db.transaction(async (tx) => {
    const c = await travarCaptura(tx, t.capturaId),
      p = await travarPublicacao(tx, c);
    await vigente(tx, p, t);
    exigir(p.state !== "published", "ESTADO");
    if (p.state === "prepared") {
      const [atual] = await tx
        .update(publications)
        .set({ state: "file_verified", fileVerifiedAt: AGORA })
        .where(eq(publications.captureId, c.id))
        .returning();
      exigir(atual, "ESTADO");
      return corpo(c, atual);
    }
    return corpo(c, p);
  });
}
export async function prepararIndiceDuravel(
  bruto: TentativaDePublicacao,
  entrada: Uint8Array,
  indice: ReturnType<typeof criarIndiceDeRecuperacao>,
) {
  exigir(
    entrada instanceof Uint8Array && entrada.byteLength > 0 && entrada.byteLength <= 32768,
    "CONFIGURACAO",
  );
  const t = token(bruto),
    bytes = Buffer.from(entrada),
    v = indice.conferir(bytes, t.capturaId);
  exigir(v.tipo === "publicado", "INTEGRIDADE");
  return db.transaction(async (tx) => {
    const c = await travarCaptura(tx, t.capturaId),
      p = await travarPublicacao(tx, c);
    await vigente(tx, p, t);
    exigir(p.state === "file_verified" || p.state === "index_prepared", "ESTADO");
    exigir(isDeepStrictEqual(v, corpo(c, p)), "INTEGRIDADE");
    if (p.state === "index_prepared") {
      const salvo = indicePersistido(p);
      exigir(salvo.equals(bytes), "INTEGRIDADE");
      return salvo;
    }
    await tx
      .update(publications)
      .set({
        state: "index_prepared",
        indexBody: bytes.toString("utf8"),
        indexSha256: hash(bytes),
        indexPreparedAt: AGORA,
      })
      .where(eq(publications.captureId, c.id));
    return Buffer.from(bytes);
  });
}
/** Capacidade de retomada: só o token atual lê referências/metadados privados.
 * Não retorna credenciais; requer validar novamente as chaves na composição. */
export async function lerTentativaDePublicacao(bruto: TentativaDePublicacao) {
  const t = token(bruto);
  return db.transaction(async (tx) => {
    const c = await travarCaptura(tx, t.capturaId),
      p = await travarPublicacao(tx, c);
    await vigente(tx, p, t);
    exigir(p.state !== "published", "ESTADO");
    exigir(
      c.archiveSha256 !== null &&
        c.archiveBytes !== null &&
        c.cipherSha256 !== null &&
        c.cipherBytes !== null &&
        c.encryptionKeyId !== null,
      "INTEGRIDADE",
    );
    return {
      estado: p.state,
      destino: { bucketId: p.bucketId, bucketName: p.bucketName, escopo: p.storageScope },
      source: p.source,
      arquivo: conferirReferenciaDoArquivoCifrado({
        formato: "recreio-arquivo-cifrado-v1",
        contexto: { tipo: "backup", id: c.id },
        chaveId: c.encryptionKeyId,
        bytes: c.archiveBytes,
        sha256: c.archiveSha256,
        bytesCifrados: c.cipherBytes,
        sha256Cifrado: c.cipherSha256,
      }),
      composto: conferirReferenciaDoArquivoComposto({
        formato: "recreio-captura-composta-v1",
        capturaId: c.id,
        bytes: c.archiveBytes,
        sha256: c.archiveSha256,
      }),
      inventario: {
        quantidade: c.objectCount,
        bytesCifrados: c.objectBytes,
        sha256: c.inventorySha256,
      },
      indice: p.indexPreparedAt === null ? null : indicePersistido(p),
    };
  });
}
/** Bytes vêm da leitura autenticada do índice no provedor, após conferir a
 * ausência de tombstone. Nenhuma reserva é liberada nesta transação. */
export async function confirmarPublicacao(bruto: TentativaDePublicacao, confirmado: Uint8Array) {
  exigir(
    confirmado instanceof Uint8Array && confirmado.byteLength > 0 && confirmado.byteLength <= 32768,
    "CONFIGURACAO",
  );
  const t = token(bruto),
    bytes = Buffer.from(confirmado);
  await db.transaction(async (tx) => {
    const c = await travarCaptura(tx, t.capturaId),
      p = await travarPublicacao(tx, c);
    await vigente(tx, p, t);
    exigir(p.state === "index_prepared" || p.state === "published", "ESTADO");
    exigir(indicePersistido(p).equals(bytes), "INTEGRIDADE");
    if (p.state === "published") return;
    const [n] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        liberadas: sql<number>`count(*) filter (where released_at is not null)::int`,
      })
      .from(holds)
      .where(eq(holds.captureId, c.id));
    exigir(n?.n === c.objectCount && n.liberadas === 0, "INTEGRIDADE");
    await tx
      .update(publications)
      .set({ state: "published", publishedAt: AGORA })
      .where(eq(publications.captureId, c.id));
    await tx
      .update(captures)
      .set({ state: "verified", verifiedAt: AGORA })
      .where(eq(captures.id, c.id));
    await logAuditEventStrict(
      "recreio.backup_published",
      null,
      { app: "recreio", captureId: c.id, objectCount: c.objectCount },
      { writer: tx },
    );
    // Auditoria/contagem podem esperar; o relógio inicial não autoriza commit tardio.
    await vigente(tx, p, t);
  });
}
/** Lote limitado e repetível. Publicações antigas sem este controle não
 * satisfazem a prova. Não toma travas de mundo/entrega nem faz DELETE. */
export async function liberarReservasPublicadas(id: string, destino: DestinoDeCaptura) {
  return db.transaction(async (tx) => {
    const c = await travarCaptura(tx, id),
      p = await travarPublicacao(tx, c);
    conferirDestinoDoControle(p, destino);
    exigir(c.state === "verified" && p.state === "published", "ESTADO");
    indicePersistido(p);
    const lote = await tx
      .select({ id: holds.deliveryId })
      .from(holds)
      .where(and(eq(holds.captureId, id), isNull(holds.releasedAt)))
      .orderBy(asc(holds.deliveryId))
      .limit(100)
      .for("update");
    if (!lote.length) return 0;
    await tx
      .update(holds)
      .set({ releasedAt: AGORA, releaseReason: "stored_archive" })
      .where(
        and(
          eq(holds.captureId, id),
          inArray(
            holds.deliveryId,
            lote.map((v) => v.id),
          ),
          isNull(holds.releasedAt),
        ),
      );
    await logAuditEventStrict(
      "recreio.backup_holds_released",
      null,
      { app: "recreio", captureId: id, objectCount: lote.length },
      { writer: tx },
    );
    return lote.length;
  });
}
