import "server-only";
import { and, eq, type SQLWrapper, sql } from "@informach/db";
import { recreioSpaceSnapshots as snapshots } from "@informach/db/schema";
import { ErroDoRecreio, type MundoId } from "@informach/recreio";
import { FalhaDoObjetoPrivado } from "@/features/objetos/criptografia";
import { leitorDeFotografias } from "@/features/objetos/runtime";
import type { Transacao } from "@/lib/repository";
import type { LeitorDeFotografiasPrivadas, ReferenciaDeFotografia } from "./armazenamento";
import { armazenamentoPg } from "./armazenamento-repository";

/** PG confere bytes limitados; bucket exige recibo íntegro e destino legível.
 * O recibo só pode ser produzido pelo writer depois de reabrir o objeto inteiro.
 * Não executa rede sob as travas de encerramento/checkpoint. */
export async function conferirFotografiaDeCheckpoint(
  tx: Transacao,
  prova: {
    mundoId: MundoId;
    cerca: number;
    revisao: number;
    diarioSeq: number;
    diarioAtual: number;
    fotografiaMaxBytes: number;
    criadaApos: SQLWrapper;
  },
  leitor: LeitorDeFotografiasPrivadas | null = leitorDeFotografias(),
) {
  const [foto] = await tx
    .select({ id: snapshots.id, fence: snapshots.fence, journalSeq: snapshots.journalSeq })
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
    foto.journalSeq !== prova.diarioAtual
  )
    throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
  let fonte: ReferenciaDeFotografia | null;
  try {
    fonte = await armazenamentoPg.prepararLeituraDaFotografia(
      tx,
      prova.mundoId,
      prova.fotografiaMaxBytes,
      prova.revisao,
    );
  } catch (erro) {
    if (erro instanceof ErroDoRecreio || erro instanceof FalhaDoObjetoPrivado)
      throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
    throw erro;
  }
  if (
    !fonte ||
    fonte.id !== foto.id ||
    (fonte.origem.tipo === "bucket" &&
      (!leitor ||
        leitor.bucketId !== fonte.origem.bucketId ||
        leitor.bucketName !== fonte.origem.bucketName ||
        leitor.escopo !== fonte.origem.escopo))
  )
    throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
}
