import "server-only";
import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { jogoPorId } from "@informach/config/jogos";
import { and, db, eq, gt, isNull, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceLeases as leases,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  conferirReferenciaDoObjeto,
  FalhaDoObjetoPrivado,
  type ReferenciaDoObjeto,
} from "./criptografia";
import { type DestinoDeFotografias, FalhaDaEntregaDaFotografia } from "./fotografias-repository";

const campos = {
  id: deliveries.id,
  snapshotId: deliveries.snapshotId,
  snapshotReference: deliveries.snapshotReference,
  spaceId: deliveries.spaceId,
  state: deliveries.state,
  bucketId: deliveries.bucketId,
  bucketName: deliveries.bucketName,
  escopo: deliveries.storageScope,
  sha: deliveries.plaintextSha256,
  bytes: deliveries.plaintextBytes,
  cipherSha: deliveries.cipherSha256,
  cipherBytes: deliveries.cipherBytes,
  keyId: deliveries.encryptionKeyId,
  objectKey: deliveries.objectKey,
  format: deliveries.formatVersion,
  leaseToken: deliveries.leaseToken,
  attemptCount: deliveries.attemptCount,
  leaseVigente: sql<boolean>`coalesce(${deliveries.leaseUntil}>clock_timestamp(),false)`,
  devida: sql<boolean>`${deliveries.nextAttemptAt}<=clock_timestamp()`,
  envelopeBytes: sql<number | null>`octet_length(${deliveries.envelope})`.mapWith((v) =>
    v === null ? null : Number(v),
  ),
};

async function travarEntrega(tx: Transacao, id: string) {
  if (!z.uuid().safeParse(id).success) throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
  const [pista] = await tx
    .select({ mundoId: deliveries.spaceId })
    .from(deliveries)
    .where(eq(deliveries.id, id));
  if (!pista) throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
  const [mundo] = await tx
    .select({
      id: spaces.id,
      jogo: spaces.gameId,
      status: spaces.status,
      revisao: spaces.revision,
      diario: spaces.journalSeq,
    })
    .from(spaces)
    .where(eq(spaces.id, pista.mundoId))
    .for("update");
  if (!mundo) throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
  const [entrega] = await tx
    .select(campos)
    .from(deliveries)
    .where(and(eq(deliveries.id, id), eq(deliveries.spaceId, mundo.id)))
    .for("update");
  if (!entrega) throw new FalhaDaEntregaDaFotografia("FONTE_INDISPONIVEL");
  return { mundo, entrega };
}
type Registro = Awaited<ReturnType<typeof travarEntrega>>;

async function marcarParaRevisao(
  tx: Transacao,
  registro: Registro,
  motivo: "integrity" | "unconfirmed_write",
) {
  await tx
    .update(deliveries)
    .set({ state: "review", reviewReason: motivo, leaseToken: null, leaseUntil: null })
    .where(eq(deliveries.id, registro.entrega.id));
  await logAuditEventStrict(
    "recreio.snapshot_object_reviewed",
    null,
    { app: "recreio", spaceId: registro.mundo.id, gameId: registro.mundo.jogo, reasonCode: motivo },
    { writer: tx },
  );
}

async function mundoParado(tx: Transacao, registro: Registro) {
  if (registro.mundo.status !== "hibernating") return false;
  const [posse] = await tx
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.spaceId, registro.mundo.id), isNull(leases.releasedAt)))
    .limit(1);
  return !posse;
}
async function conferirFonte(tx: Transacao, registro: Registro) {
  const { mundo, entrega } = registro;
  const jogo = jogoPorId(mundo.jogo);
  if (!jogo || !entrega.snapshotId || entrega.snapshotReference !== entrega.snapshotId)
    throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
  const [foto] = await tx
    .select({ revisao: snapshots.revision })
    .from(snapshots)
    .where(and(eq(snapshots.id, entrega.snapshotId), eq(snapshots.spaceId, mundo.id)));
  if (!foto) throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
  const fonte = await armazenamentoPg.prepararLeituraDaFotografia(
    tx,
    MundoIdSchema.parse(mundo.id),
    jogo.limites.fotografiaMaxBytes,
    foto.revisao,
  );
  if (
    !fonte ||
    fonte.id !== entrega.snapshotId ||
    fonte.meta.revisao > mundo.revisao ||
    fonte.meta.diarioSeq > mundo.diario ||
    fonte.meta.sha256 !== entrega.sha ||
    fonte.meta.bytes !== entrega.bytes ||
    entrega.format !== 1 ||
    entrega.cipherBytes > fonte.meta.bytes + 1024
  )
    throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
  const referencia = conferirReferenciaDoObjeto({
    formato: "recreio-objeto-cifrado-v1",
    chaveId: entrega.keyId,
    contexto: { tipo: "fotografia", id: mundo.id },
    bytes: entrega.bytes,
    sha256: entrega.sha,
    sha256Cifrado: entrega.cipherSha,
    bytesCifrados: entrega.cipherBytes,
  });
  if (entrega.objectKey !== `recreio/v1/fotografia/${mundo.id}/${referencia.sha256Cifrado}`)
    throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
  return { fonte, referencia };
}

export type TrabalhoDeEntrega = {
  id: string;
  token: string;
  destino: DestinoDeFotografias;
  referencia: ReferenciaDoObjeto;
  envelope: Uint8Array;
};
export type ReservaDeEntrega =
  | { tipo: "ocupada" | "aguardando" | "concluida" | "retirada" | "revisao" }
  | { tipo: "trabalho"; trabalho: TrabalhoDeEntrega };

/** A tentativa e o envelope já estão duráveis quando o executor recebe trabalho.
 * Nenhuma destas transações faz I/O. A cerca de entrega não é posse de jogo. */
export function reservarEntregaDaFotografia(
  id: string,
  destino: DestinoDeFotografias,
): Promise<ReservaDeEntrega> {
  return db.transaction(async (tx): Promise<ReservaDeEntrega> => {
    const registro = await travarEntrega(tx, id),
      e = registro.entrega;
    if (
      e.bucketId !== destino.bucketId ||
      e.bucketName !== destino.bucketName ||
      e.escopo !== destino.escopo
    )
      throw new FalhaDaEntregaDaFotografia("DESTINO_DIVERGENTE");
    if (e.state === "retiring" || e.state === "retired") return { tipo: "retirada" };
    if (e.state === "review" || e.state === "quarantined") return { tipo: "revisao" };
    if (e.state === "prepared") {
      if (e.leaseVigente) return { tipo: "ocupada" };
      if (!e.devida || !(await mundoParado(tx, registro))) return { tipo: "aguardando" };
    }
    let conferida: Awaited<ReturnType<typeof conferirFonte>>;
    try {
      conferida = await conferirFonte(tx, registro);
    } catch (erro) {
      if (
        !(
          erro instanceof ErroDoRecreio ||
          erro instanceof FalhaDoObjetoPrivado ||
          erro instanceof FalhaDaEntregaDaFotografia
        )
      )
        throw erro;
      await marcarParaRevisao(tx, registro, "integrity");
      return { tipo: "revisao" };
    }
    const { fonte, referencia } = conferida;
    if (e.state === "verified") {
      if (fonte.origem.tipo !== "bucket") {
        await marcarParaRevisao(tx, registro, "integrity");
        return { tipo: "revisao" };
      }
      return { tipo: "concluida" };
    }
    if (e.state !== "prepared" || fonte.origem.tipo !== "pg" || e.envelopeBytes !== e.cipherBytes)
      throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
    if (e.attemptCount >= 2147483646) {
      await marcarParaRevisao(tx, registro, "unconfirmed_write");
      return { tipo: "revisao" };
    }
    const [corpo] = await tx
      .select({ envelope: deliveries.envelope })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.id, id),
          sql`octet_length(${deliveries.envelope})=${e.cipherBytes} and octet_length(${deliveries.envelope})<=${fonte.meta.bytes + 1024}`,
        ),
      );
    if (!corpo?.envelope) throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
    const token = randomUUID();
    await tx
      .update(deliveries)
      .set({
        leaseToken: token,
        leaseUntil: sql`${AGORA}+interval '45 seconds'`,
        lastAttemptAt: AGORA,
        attemptCount: e.attemptCount + 1,
      })
      .where(eq(deliveries.id, id));
    return {
      tipo: "trabalho",
      trabalho: {
        id,
        token,
        destino: { ...destino },
        referencia,
        envelope: new Uint8Array(corpo.envelope),
      },
    };
  });
}

function mesmaTentativa(registro: Registro, trabalho: TrabalhoDeEntrega) {
  const e = registro.entrega,
    r = trabalho.referencia;
  return (
    e.state === "prepared" &&
    e.leaseToken === trabalho.token &&
    e.bucketId === trabalho.destino.bucketId &&
    e.bucketName === trabalho.destino.bucketName &&
    e.escopo === trabalho.destino.escopo &&
    e.spaceId === r.contexto.id &&
    r.contexto.tipo === "fotografia" &&
    e.sha === r.sha256 &&
    e.bytes === r.bytes &&
    e.cipherSha === r.sha256Cifrado &&
    e.cipherBytes === r.bytesCifrados &&
    e.keyId === r.chaveId
  );
}

/** Só o executor que acaba de reabrir o objeto inteiro pode chamar a confirmação.
 * Se mundo/lease/recibo mudaram durante I/O, pg permanece e nada é publicado. */
export function confirmarEntregaDaFotografia(
  trabalho: TrabalhoDeEntrega,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  return db.transaction(async (tx) => {
    signal?.throwIfAborted();
    const registro = await travarEntrega(tx, trabalho.id),
      e = registro.entrega;
    if (
      !mesmaTentativa(registro, trabalho) ||
      !e.leaseVigente ||
      !(await mundoParado(tx, registro))
    )
      return false;
    const { fonte, referencia } = await conferirFonte(tx, registro);
    if (
      fonte.origem.tipo !== "pg" ||
      JSON.stringify(referencia) !== JSON.stringify(trabalho.referencia)
    )
      return false;
    signal?.throwIfAborted();
    // Guardar primeiro o recibo, com prazo vivo no próprio UPDATE. Toda a
    // publicação se desfaz se fotografia ou auditoria não forem confirmadas.
    const [guardada] = await tx
      .update(deliveries)
      .set({
        state: "verified",
        verifiedAt: AGORA,
        envelope: null,
        leaseToken: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(deliveries.id, trabalho.id),
          eq(deliveries.state, "prepared"),
          eq(deliveries.leaseToken, trabalho.token),
          gt(deliveries.leaseUntil, AGORA),
        ),
      )
      .returning({ id: deliveries.id });
    if (!guardada) return false;
    const [foto] = await tx
      .update(snapshots)
      .set({ storage: "bucket", data: null, objectKey: e.objectKey })
      .where(
        and(
          eq(snapshots.id, fonte.id),
          eq(snapshots.spaceId, registro.mundo.id),
          eq(snapshots.storage, "pg"),
          eq(snapshots.sha256, referencia.sha256),
          eq(snapshots.byteSize, referencia.bytes),
        ),
      )
      .returning({ id: snapshots.id });
    if (!foto) throw new FalhaDaEntregaDaFotografia("REVISAO_NECESSARIA");
    await logAuditEventStrict(
      "recreio.snapshot_object_confirmed",
      null,
      {
        app: "recreio",
        spaceId: registro.mundo.id,
        gameId: registro.mundo.jogo,
        revision: fonte.meta.revisao,
        storageScope: e.escopo,
      },
      { writer: tx },
    );
    signal?.throwIfAborted();
    return true;
  });
}

export function registrarFalhaDaEntrega(
  trabalho: TrabalhoDeEntrega,
  motivo: "integrity" | "missing_key" | null,
): Promise<void> {
  return db.transaction(async (tx) => {
    const registro = await travarEntrega(tx, trabalho.id);
    if (!mesmaTentativa(registro, trabalho)) return;
    await tx
      .update(deliveries)
      .set({
        state: motivo ? "review" : "prepared",
        reviewReason: motivo,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA}+interval '5 minutes'`,
      })
      .where(and(eq(deliveries.id, trabalho.id), eq(deliveries.leaseToken, trabalho.token)));
    if (motivo)
      await logAuditEventStrict(
        "recreio.snapshot_object_reviewed",
        null,
        {
          app: "recreio",
          spaceId: registro.mundo.id,
          gameId: registro.mundo.jogo,
          reasonCode: motivo,
        },
        { writer: tx },
      );
  });
}
