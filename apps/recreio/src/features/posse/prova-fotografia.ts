import "server-only";
import { createHash } from "node:crypto";
import { and, eq, type SQLWrapper, sql } from "@informach/db";
import { recreioSpaceSnapshots as snapshots } from "@informach/db/schema";
import { ErroDoRecreio, type MundoId } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/** Confere os bytes guardados, além dos metadados e da cobertura do diário. */
export async function conferirFotografiaDeCheckpoint(
  tx: Transacao,
  prova: {
    mundoId: MundoId;
    cerca: number;
    revisao: number;
    diarioSeq: number;
    diarioAtual: number;
    criadaApos: SQLWrapper;
  },
) {
  const [foto] = await tx
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.spaceId, prova.mundoId),
        eq(snapshots.revision, prova.revisao),
        sql`${snapshots.createdAt}>=${prova.criadaApos}`,
      ),
    );
  if (
    !foto ||
    foto.fence !== prova.cerca ||
    foto.journalSeq !== prova.diarioSeq ||
    foto.journalSeq !== prova.diarioAtual ||
    foto.storage !== "pg" ||
    !foto.data ||
    foto.data.byteLength !== foto.byteSize ||
    createHash("sha256").update(foto.data).digest("hex") !== foto.sha256
  )
    throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
}
