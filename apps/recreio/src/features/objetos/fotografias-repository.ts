import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { jogoPorId } from "@informach/config/jogos";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceLeases as leases,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import type { MundoId } from "@informach/recreio";
import { z } from "zod";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { conferirReferenciaDoObjeto, type criarCifradorDeObjetos } from "./criptografia";

type Cifrador = ReturnType<typeof criarCifradorDeObjetos>;
export type DestinoDeFotografias = Pick<
  LeitorDeFotografiasPrivadas,
  "bucketId" | "bucketName" | "escopo"
>;
const DestinoSchema = z.strictObject({
  bucketId: z.uuid(),
  bucketName: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  escopo: z.enum(["qualification", "production"]),
});
export class FalhaDaEntregaDaFotografia extends Error {
  constructor(
    readonly codigo:
      | "MUNDO_NAO_PARADO"
      | "DESTINO_DIVERGENTE"
      | "FONTE_INDISPONIVEL"
      | "REVISAO_NECESSARIA",
  ) {
    super(`recreio.snapshot_delivery.${codigo}`);
    this.name = "FalhaDaEntregaDaFotografia";
  }
}

/** Etapa interna e aditiva: conserva fonte PG e envelope cifrado durável antes
 * de qualquer I/O. Não envia, não confirma objeto e não publica ponteiro.
 * Só o futuro executor operacional autenticado poderá compor esta função;
 * não existe rota ou configuração que a habilite em produção nesta etapa. */
export async function prepararEntregaDaFotografia(
  pedido: { mundoId: MundoId; jogo: string; revisao: number },
  destino: DestinoDeFotografias,
  cifrador: Cifrador,
): Promise<string> {
  const alvo = DestinoSchema.safeParse(destino);
  if (!alvo.success) throw new FalhaDaEntregaDaFotografia("DESTINO_DIVERGENTE");
  const jogo = jogoPorId(pedido.jogo);
  if (!jogo || !Number.isSafeInteger(pedido.revisao) || pedido.revisao < 0)
    throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
  return db.transaction(async (tx) => {
    const [mundo] = await tx
      .select({
        id: spaces.id,
        status: spaces.status,
        revision: spaces.revision,
        journalSeq: spaces.journalSeq,
      })
      .from(spaces)
      .where(and(eq(spaces.id, pedido.mundoId), eq(spaces.gameId, pedido.jogo)))
      .for("update");
    if (!mundo) throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
    const [posse] = await tx
      .select({ id: leases.id })
      .from(leases)
      .where(and(eq(leases.spaceId, mundo.id), isNull(leases.releasedAt)))
      .limit(1);
    if (mundo.status !== "hibernating" || posse)
      throw new FalhaDaEntregaDaFotografia("MUNDO_NAO_PARADO");
    const fonte = await armazenamentoPg.prepararLeituraDaFotografia(
      tx,
      pedido.mundoId,
      jogo.limites.fotografiaMaxBytes,
      pedido.revisao,
    );
    if (!fonte || fonte.meta.revisao > mundo.revision || fonte.meta.diarioSeq > mundo.journalSeq)
      throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
    // Inclui recibos destacados: restaurar uma linha antiga não reabre uma
    // entrega já retirada. Históricos divergentes exigem revisão explícita.
    const anteriores = await tx
      .select({
        id: deliveries.id,
        state: deliveries.state,
        snapshotId: deliveries.snapshotId,
        spaceId: deliveries.spaceId,
        bucketId: deliveries.bucketId,
        bucketName: deliveries.bucketName,
        escopo: deliveries.storageScope,
        plaintextSha256: deliveries.plaintextSha256,
        plaintextBytes: deliveries.plaintextBytes,
        keyId: deliveries.encryptionKeyId,
        cipherSha256: deliveries.cipherSha256,
        cipherBytes: deliveries.cipherBytes,
        objectKey: deliveries.objectKey,
        envelopeBytes: sql<number | null>`octet_length(${deliveries.envelope})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
      })
      .from(deliveries)
      .where(eq(deliveries.snapshotReference, fonte.id))
      .limit(2);
    if (anteriores.length > 1) throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
    const anterior = anteriores[0];
    if (anterior) {
      if (
        anterior.bucketId !== alvo.data.bucketId ||
        anterior.bucketName !== alvo.data.bucketName ||
        anterior.escopo !== alvo.data.escopo
      )
        throw new FalhaDaEntregaDaFotografia("DESTINO_DIVERGENTE");
      if (
        anterior.snapshotId !== fonte.id ||
        anterior.spaceId !== pedido.mundoId ||
        anterior.plaintextSha256 !== fonte.meta.sha256 ||
        anterior.plaintextBytes !== fonte.meta.bytes
      )
        throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
      if (anterior.state === "verified" && fonte.origem.tipo === "bucket") return anterior.id;
      if (
        anterior.state !== "prepared" ||
        fonte.origem.tipo !== "pg" ||
        anterior.envelopeBytes !== anterior.cipherBytes ||
        anterior.cipherBytes > fonte.meta.bytes + 1024
      )
        throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
      const [corpo] = await tx
        .select({ envelope: deliveries.envelope })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.id, anterior.id),
            sql`octet_length(${deliveries.envelope})=${anterior.cipherBytes} and octet_length(${deliveries.envelope})<=${fonte.meta.bytes + 1024}`,
          ),
        );
      if (!corpo?.envelope) throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
      const referencia = conferirReferenciaDoObjeto({
        formato: "recreio-objeto-cifrado-v1",
        chaveId: anterior.keyId,
        contexto: { tipo: "fotografia", id: pedido.mundoId },
        bytes: anterior.plaintextBytes,
        sha256: anterior.plaintextSha256,
        sha256Cifrado: anterior.cipherSha256,
        bytesCifrados: anterior.cipherBytes,
      });
      if (
        anterior.objectKey !== `recreio/v1/fotografia/${pedido.mundoId}/${referencia.sha256Cifrado}`
      )
        throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
      // Replay usa o mesmo IV/envelope; ausência de chave antiga não gera outro objeto.
      cifrador.abrir(referencia, corpo.envelope).fill(0);
      return anterior.id;
    }
    if (fonte.origem.tipo !== "pg") throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
    const envelope = cifrador.cifrar(
      { tipo: "fotografia", id: pedido.mundoId },
      fonte.origem.bytes,
    );
    const r = envelope.referencia;
    const [criada] = await tx
      .insert(deliveries)
      .values({
        snapshotReference: fonte.id,
        snapshotId: fonte.id,
        spaceId: pedido.mundoId,
        plaintextSha256: r.sha256,
        plaintextBytes: r.bytes,
        storageScope: alvo.data.escopo,
        bucketId: alvo.data.bucketId,
        bucketName: alvo.data.bucketName,
        objectKey: `recreio/v1/fotografia/${pedido.mundoId}/${r.sha256Cifrado}`,
        cipherSha256: r.sha256Cifrado,
        cipherBytes: r.bytesCifrados,
        encryptionKeyId: r.chaveId,
        formatVersion: 1,
        envelope: envelope.bytes,
        state: "prepared",
      })
      .returning({ id: deliveries.id });
    if (!criada) throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
    await logAuditEventStrict(
      "recreio.snapshot_object_prepared",
      null,
      {
        app: "recreio",
        spaceId: pedido.mundoId,
        gameId: pedido.jogo,
        revision: pedido.revisao,
        storageScope: alvo.data.escopo,
      },
      { writer: tx },
    );
    return criada.id;
  });
}
