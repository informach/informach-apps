import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "@informach/db";
import {
  recreioSpaceJournal as journal,
  recreioSpaceSnapshots as snapshots,
} from "@informach/db/schema";
import type { MetaDeFotografia } from "@informach/recreio/contrato";
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
  return {
    revisao: linha.revision,
    diarioSeq: linha.journalSeq,
    tick: linha.tick,
    schemaVersion: linha.schemaVersion,
    tipo: linha.kind,
    bytes: linha.byteSize,
    sha256: linha.sha256,
  };
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

  async lerUltimaFotografia(tx, mundoId) {
    const [linha] = await tx
      .select({ ...camposDaMeta, storage: snapshots.storage, data: snapshots.data })
      .from(snapshots)
      .where(eq(snapshots.spaceId, mundoId))
      .orderBy(desc(snapshots.revision))
      .limit(1);
    if (!linha) return null;
    if (linha.storage !== "pg" || linha.data === null)
      throw new Error(
        "Fotografia guardada fora do Postgres: armazenamento ainda não implementado.",
      );
    return { meta: meta(linha), bytes: new Uint8Array(linha.data) };
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
    const linhas = await tx
      .select(camposDaEntrada)
      .from(journal)
      .where(and(eq(journal.spaceId, mundoId), gt(journal.seq, apos)))
      .orderBy(asc(journal.seq));
    return linhas.map(entrada);
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
