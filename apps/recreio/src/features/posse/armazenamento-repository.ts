import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "@informach/db";
import {
  recreioSpaceJournal as journal,
  recreioSnapshotObjectDeliveries as objects,
  recreioSpaceSnapshots as snapshots,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import {
  DIARIO_PAGINA_MAX_BYTES,
  DIARIO_PAGINA_MAX_ENTRADAS,
  type MetaDeFotografia,
  MetaDeFotografiaSchema,
} from "@informach/recreio/contrato";
import { conferirReferenciaDoObjeto } from "@/features/objetos/criptografia";
import type { ArmazenamentoDeMundos, EntradaGuardada } from "./armazenamento";

/**
 * A implementação da porta de armazenamento no Postgres: fotografias em
 * `recreio.space_snapshots` (`storage = 'pg'`, bytes em `data`) e o diário em
 * `recreio.space_journal`.
 */

const camposDaMeta = {
  revision: snapshots.revision,
  journalSeq: snapshots.journalSeq,
  tick: snapshots.tick,
  schemaVersion: snapshots.schemaVersion,
  kind: snapshots.kind,
  byteSize: snapshots.byteSize,
  sha256: snapshots.sha256,
};

function meta(linha: {
  revision: number;
  journalSeq: number;
  tick: number;
  schemaVersion: number;
  kind: MetaDeFotografia["tipo"];
  byteSize: number;
  sha256: string;
}): MetaDeFotografia {
  const valor = MetaDeFotografiaSchema.safeParse({
    revisao: linha.revision,
    diarioSeq: linha.journalSeq,
    tick: linha.tick,
    schemaVersion: linha.schemaVersion,
    tipo: linha.kind,
    bytes: linha.byteSize,
    sha256: linha.sha256,
  });
  if (!valor.success) throw new ErroDoRecreio("INDISPONIVEL");
  return valor.data;
}

const camposDaEntrada = {
  seq: journal.seq,
  tick: journal.tick,
  factId: journal.factId,
  payload: journal.payload,
};

function entrada(linha: {
  seq: number;
  tick: number;
  factId: string;
  payload: Buffer;
}): EntradaGuardada {
  return {
    seq: linha.seq,
    tick: linha.tick,
    fatoId: linha.factId,
    bytes: new Uint8Array(linha.payload),
  };
}

export const armazenamentoPg: ArmazenamentoDeMundos = {
  async ultimaFotografia(tx, mundoId) {
    const [linha] = await tx
      .select(camposDaMeta)
      .from(snapshots)
      .where(eq(snapshots.spaceId, mundoId))
      .orderBy(desc(snapshots.revision))
      .limit(1);
    return linha ? meta(linha) : null;
  },

  async prepararLeituraDaFotografia(tx, mundoId, tetoBytes) {
    if (!Number.isSafeInteger(tetoBytes) || tetoBytes < 1) throw new ErroDoRecreio("INDISPONIVEL");
    const [linha] = await tx
      .select({
        ...camposDaMeta,
        id: snapshots.id,
        storage: snapshots.storage,
        objectKey: snapshots.objectKey,
        bytesPg: sql<number | null>`octet_length(${snapshots.data})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
      })
      .from(snapshots)
      .where(eq(snapshots.spaceId, mundoId))
      .orderBy(desc(snapshots.revision))
      .limit(1);
    if (!linha) return null;
    const metadados = meta(linha);
    if (metadados.bytes > tetoBytes) throw new ErroDoRecreio("INDISPONIVEL");
    if (linha.storage === "pg") {
      if (linha.objectKey !== null || linha.bytesPg !== metadados.bytes)
        throw new ErroDoRecreio("INDISPONIVEL");
      const [conteudo] = await tx
        .select({ data: snapshots.data })
        .from(snapshots)
        .where(
          and(
            eq(snapshots.id, linha.id),
            eq(snapshots.storage, "pg"),
            sql`octet_length(${snapshots.data})=${metadados.bytes} and octet_length(${snapshots.data})<=${tetoBytes}`,
          ),
        );
      if (
        !conteudo?.data ||
        conteudo.data.length !== metadados.bytes ||
        createHash("sha256").update(conteudo.data).digest("hex") !== metadados.sha256
      )
        throw new ErroDoRecreio("INDISPONIVEL");
      return {
        id: linha.id,
        meta: metadados,
        origem: { tipo: "pg", bytes: new Uint8Array(conteudo.data) },
      };
    }
    if (linha.storage !== "bucket" || linha.bytesPg !== null || !linha.objectKey)
      throw new ErroDoRecreio("INDISPONIVEL");
    // Nunca carregar o envelope temporário nesta leitura; somente referência confirmada.
    const [objeto] = await tx
      .select({
        snapshotReference: objects.snapshotReference,
        spaceId: objects.spaceId,
        plaintextSha256: objects.plaintextSha256,
        plaintextBytes: objects.plaintextBytes,
        bucketId: objects.bucketId,
        bucketName: objects.bucketName,
        escopo: objects.storageScope,
        objectKey: objects.objectKey,
        state: objects.state,
        verifiedAt: objects.verifiedAt,
        keyId: objects.encryptionKeyId,
        formatVersion: objects.formatVersion,
        cipherSha256: objects.cipherSha256,
        cipherBytes: objects.cipherBytes,
      })
      .from(objects)
      .where(eq(objects.snapshotId, linha.id));
    if (
      !objeto ||
      objeto.snapshotReference !== linha.id ||
      objeto.spaceId !== mundoId ||
      objeto.state !== "verified" ||
      !objeto.verifiedAt ||
      objeto.objectKey !== linha.objectKey ||
      objeto.plaintextSha256 !== metadados.sha256 ||
      objeto.plaintextBytes !== metadados.bytes ||
      objeto.formatVersion !== 1
    )
      throw new ErroDoRecreio("INDISPONIVEL");
    const referencia = conferirReferenciaDoObjeto({
      formato: "recreio-objeto-cifrado-v1",
      chaveId: objeto.keyId,
      contexto: { tipo: "fotografia", id: mundoId },
      bytes: objeto.plaintextBytes,
      sha256: objeto.plaintextSha256,
      sha256Cifrado: objeto.cipherSha256,
      bytesCifrados: objeto.cipherBytes,
    });
    return {
      id: linha.id,
      meta: metadados,
      origem: {
        tipo: "bucket",
        bucketId: objeto.bucketId,
        bucketName: objeto.bucketName,
        escopo: objeto.escopo,
        objeto: referencia,
      },
    };
  },

  async gravarFotografia(tx, mundoId, foto) {
    await tx.insert(snapshots).values({
      spaceId: mundoId,
      revision: foto.revisao,
      fence: foto.cerca,
      schemaVersion: foto.schemaVersion,
      journalSeq: foto.diarioSeq,
      tick: foto.tick,
      kind: foto.tipo,
      storage: "pg",
      data: Buffer.from(foto.bytes),
      byteSize: foto.bytes.length,
      sha256: foto.sha256,
    });
  },

  async apararFotografias(tx, mundoId, guardar) {
    const comuns = await tx
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(and(eq(snapshots.spaceId, mundoId), ne(snapshots.kind, "pinned")))
      .orderBy(desc(snapshots.revision));
    const sobram = comuns.slice(guardar).map((linha) => linha.id);
    if (sobram.length > 0) await tx.delete(snapshots).where(inArray(snapshots.id, sobram));
    const [maisAntiga] = await tx
      .select({ journalSeq: snapshots.journalSeq })
      .from(snapshots)
      .where(eq(snapshots.spaceId, mundoId))
      .orderBy(asc(snapshots.revision))
      .limit(1);
    return maisAntiga?.journalSeq ?? 0;
  },

  async lerDiario(tx, mundoId, apos) {
    // Primeiro só tamanhos/ids: não carregar 256 payloads grandes para depois
    // descobrir que excedem o orçamento da página. A linha do mundo está travada.
    const metas = await tx
      .select({ seq: journal.seq, bytes: journal.byteSize })
      .from(journal)
      .where(and(eq(journal.spaceId, mundoId), gt(journal.seq, apos)))
      .orderBy(asc(journal.seq))
      .limit(DIARIO_PAGINA_MAX_ENTRADAS + 1);
    const seqs: number[] = [];
    let bytes = 0;
    for (const meta of metas) {
      if (
        seqs.length === DIARIO_PAGINA_MAX_ENTRADAS ||
        bytes + meta.bytes > DIARIO_PAGINA_MAX_BYTES
      )
        break;
      seqs.push(meta.seq);
      bytes += meta.bytes;
    }
    if (metas.length > 0 && seqs.length === 0)
      throw new Error("Entrada do diário maior que a página");
    const entradas = await this.entradasPorSeq(tx, mundoId, seqs);
    entradas.sort((a, b) => a.seq - b.seq);
    return { entradas, proximoApos: metas.length > seqs.length ? (seqs.at(-1) ?? null) : null };
  },

  async entradasPorSeq(tx, mundoId, seqs) {
    if (seqs.length === 0) return [];
    const linhas = await tx
      .select(camposDaEntrada)
      .from(journal)
      .where(and(eq(journal.spaceId, mundoId), inArray(journal.seq, [...seqs])));
    return linhas.map(entrada);
  },

  async fatosJaGravados(tx, mundoId, fatoIds) {
    if (fatoIds.length === 0) return [];
    const linhas = await tx
      .select({ factId: journal.factId })
      .from(journal)
      .where(and(eq(journal.spaceId, mundoId), inArray(journal.factId, [...fatoIds])));
    return linhas.map((linha) => linha.factId);
  },

  async bytesDepoisDe(tx, mundoId, coberto) {
    const [soma] = await tx
      .select({
        total: sql<number>`coalesce(sum(${journal.byteSize}), 0)`.mapWith(Number),
      })
      .from(journal)
      .where(and(eq(journal.spaceId, mundoId), gt(journal.seq, coberto)));
    return soma?.total ?? 0;
  },

  async anexarAoDiario(tx, mundoId, cerca, entradas) {
    if (entradas.length === 0) return;
    await tx.insert(journal).values(
      entradas.map((item) => ({
        spaceId: mundoId,
        seq: item.seq,
        fence: cerca,
        tick: item.tick,
        factId: item.fatoId,
        payload: Buffer.from(item.bytes),
        byteSize: item.bytes.length,
      })),
    );
  },

  async compactarDiario(tx, mundoId, ate) {
    if (ate <= 0) return;
    await tx
      .delete(journal)
      .where(and(eq(journal.spaceId, mundoId), sql`${journal.seq} <= ${ate}`));
  },
};
