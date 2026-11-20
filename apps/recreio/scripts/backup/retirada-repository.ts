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
import { limitarControleDoBackup, travarCapturaDeBackup } from "./controle-repository";
import { FalhaDaPublicacao } from "./falha-controle";
import type { criarIndiceDeRecuperacao, RetiradaDoBackup } from "./indice-recuperacao";

const Motivo = z.enum(["abandonado", "retencao", "privacidade"]),
  Token = z.strictObject({ capturaId: z.uuid(), tentativa: z.uuid() });
export type TentativaDeRetirada = z.infer<typeof Token>;
type Indice = ReturnType<typeof criarIndiceDeRecuperacao>;
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function exigir(v: unknown, codigo: FalhaDaPublicacao["codigo"]): asserts v {
  if (!v) throw new FalhaDaPublicacao(codigo);
}
function token(v: TentativaDeRetirada) {
  const r = Token.safeParse(v);
  exigir(r.success, "CONFIGURACAO");
  return r.data;
}
async function travarBase(tx: Transacao, id: string) {
  const c = await travarCapturaDeBackup(tx, id);
  const [p] = await tx
    .select()
    .from(publications)
    .where(eq(publications.captureId, id))
    .for("update");
  exigir(
    c.protocolVersion === 1 &&
      c.sealedAt !== null &&
      c.cipherSha256 !== null &&
      c.objectKey !== null &&
      p,
    "ESTADO",
  );
  exigir(
    c.storageScope === p.storageScope &&
      c.objectKey === `recreio/v1/backup/${c.id}/${c.cipherSha256}`,
    "INTEGRIDADE",
  );
  return { c, p, cipherSha256: c.cipherSha256, objectKey: c.objectKey };
}
async function travarRetirada(tx: Transacao, id: string) {
  const b = await travarBase(tx, id),
    [r] = await tx.select().from(retirements).where(eq(retirements.captureId, id)).for("update");
  exigir(r, "ESTADO");
  return { ...b, r };
}
function conferirMarcador(b: Awaited<ReturnType<typeof travarRetirada>>, indice: Indice) {
  const bytes = Buffer.from(b.r.markerBody, "utf8");
  exigir(
    bytes.length > 0 && bytes.length <= 32768 && sha(bytes) === b.r.markerSha256,
    "INTEGRIDADE",
  );
  const r = indice.conferir(bytes, b.c.id);
  exigir(r.tipo === "retirado", "INTEGRIDADE");
  const esperado: RetiradaDoBackup = {
    tipo: "retirado",
    capturaId: b.c.id,
    destino: { bucketId: b.p.bucketId, bucketName: b.p.bucketName, escopo: b.p.storageScope },
    source: b.r.source,
    registradaEm: b.r.createdAt.toISOString(),
    arquivoSha256Cifrado: b.cipherSha256,
    motivo: b.r.reason,
  };
  exigir(isDeepStrictEqual(r, esperado), "INTEGRIDADE");
  return { bytes, marcador: r };
}
async function vigente(
  tx: Transacao,
  b: Awaited<ReturnType<typeof travarRetirada>>,
  t: TentativaDeRetirada,
) {
  exigir(b.r.attempt === t.tentativa, "TENTATIVA");
  const [r] = await tx
    .select({ viva: sql<boolean>`${retirements.leaseUntil}>clock_timestamp()` })
    .from(retirements)
    .where(eq(retirements.captureId, b.c.id));
  exigir(r?.viva, "TENTATIVA");
}
export async function prepararRetirada(id: string, motivo: z.infer<typeof Motivo>, indice: Indice) {
  const m = Motivo.safeParse(motivo);
  exigir(m.success, "CONFIGURACAO");
  return db.transaction(async (tx) => {
    const { c, p } = await travarBase(tx, id);
    const [existente] = await tx
      .select({ id: retirements.captureId })
      .from(retirements)
      .where(eq(retirements.captureId, id));
    exigir(!existente, "ESTADO");
    exigir(m.data !== "retencao" || (c.state === "verified" && p.state === "published"), "ESTADO");
    const [relogio] = await tx.execute<{ agora: string }>(
      sql`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as agora`,
    );
    exigir(relogio, "INTEGRIDADE");
    const criada = new Date(relogio.agora);
    exigir(
      Number.isFinite(criada.getTime()) && criada.toISOString() === relogio.agora,
      "INTEGRIDADE",
    );
    const bytes = indice.assinar({
        tipo: "retirado",
        capturaId: id,
        destino: { bucketId: p.bucketId, bucketName: p.bucketName, escopo: p.storageScope },
        source: p.source,
        registradaEm: criada.toISOString(),
        arquivoSha256Cifrado: c.cipherSha256,
        motivo: m.data,
      }),
      tentativa = randomUUID();
    await tx.insert(retirements).values({
      captureId: id,
      source: p.source,
      reason: m.data,
      state: "prepared",
      markerBody: bytes.toString("utf8"),
      markerSha256: sha(bytes),
      attempt: tentativa,
      createdAt: criada,
      leaseUntil: sql`${AGORA}+interval '20 minutes'`,
    });
    // Prazo vencido não prova término do I/O antigo. Nova publicação também
    // confere a retirada sob a mesma trava da captura antes de qualquer efeito.
    await tx
      .update(publications)
      .set({ attempt: randomUUID() })
      .where(eq(publications.captureId, id));
    await logAuditEventStrict(
      "recreio.backup_retirement_prepared",
      null,
      { app: "recreio", captureId: id, reasonCode: m.data },
      { writer: tx },
    );
    return { capturaId: id, tentativa };
  });
}
export async function assumirRetirada(id: string) {
  return db.transaction(async (tx) => {
    const b = await travarRetirada(tx, id),
      [r] = await tx
        .select({
          livre: sql<boolean>`${retirements.leaseUntil}<=clock_timestamp()`,
          devida: sql<boolean>`${retirements.nextAttemptAt}<=clock_timestamp()`,
        })
        .from(retirements)
        .where(eq(retirements.captureId, id));
    exigir(r?.livre && r.devida, "OCUPADA");
    const tentativa = randomUUID();
    await tx
      .update(retirements)
      .set({ attempt: tentativa, leaseUntil: sql`${AGORA}+interval '20 minutes'` })
      .where(eq(retirements.captureId, id));
    await logAuditEventStrict(
      "recreio.backup_retirement_claimed",
      null,
      { app: "recreio", captureId: b.c.id },
      { writer: tx },
    );
    return { capturaId: id, tentativa };
  });
}
export async function lerRetirada(bruto: TentativaDeRetirada, indice: Indice) {
  const t = token(bruto);
  return db.transaction(async (tx) => {
    const b = await travarRetirada(tx, t.capturaId);
    await vigente(tx, b, t);
    const r = conferirMarcador(b, indice);
    return {
      destino: { bucketId: b.p.bucketId, bucketName: b.p.bucketName, escopo: b.p.storageScope },
      estado: b.r.state,
      bytes: r.bytes,
      marcador: r.marcador,
    };
  });
}
/** Adapter do índice confirma PUT condicional + GET dos MESMOS bytes antes
 * desta chamada. Ausência do payload ainda não foi comprovada. */
export async function confirmarMarcadorGuardado(
  bruto: TentativaDeRetirada,
  entrada: Uint8Array,
  indice: Indice,
) {
  exigir(
    entrada instanceof Uint8Array && entrada.byteLength > 0 && entrada.byteLength <= 32768,
    "CONFIGURACAO",
  );
  const t = token(bruto),
    bytes = Buffer.from(entrada);
  await db.transaction(async (tx) => {
    const b = await travarRetirada(tx, t.capturaId);
    await vigente(tx, b, t);
    exigir(conferirMarcador(b, indice).bytes.equals(bytes), "INTEGRIDADE");
    if (b.r.markerStoredAt !== null) return;
    await tx
      .update(retirements)
      .set({ state: "marked", markerStoredAt: AGORA })
      .where(eq(retirements.captureId, b.c.id));
    await logAuditEventStrict(
      "recreio.backup_retirement_marked",
      null,
      { app: "recreio", captureId: b.c.id },
      { writer: tx },
    );
    await vigente(tx, b, t);
  });
}
/** Só após GET autenticado NoSuchKey. Preserva o fato histórico de publicação
 * e a PRIMEIRA ausência; uma retomada não apaga essa evidência. */
export async function confirmarAusenciaDoBackup(
  bruto: TentativaDeRetirada,
  objetoEncontrado: boolean,
  indice: Indice,
) {
  exigir(typeof objetoEncontrado === "boolean", "CONFIGURACAO");
  const t = token(bruto);
  await db.transaction(async (tx) => {
    const b = await travarRetirada(tx, t.capturaId);
    await vigente(tx, b, t);
    conferirMarcador(b, indice);
    exigir(
      b.r.markerStoredAt !== null && (b.r.state === "marked" || b.r.state === "absent"),
      "ESTADO",
    );
    await logAuditEventStrict(
      "recreio.backup_retired",
      null,
      {
        app: "recreio",
        captureId: b.c.id,
        reasonCode: b.r.reason,
        lateObject: b.r.firstAbsenceAt !== null && objetoEncontrado,
      },
      { writer: tx },
    );
    await vigente(tx, b, t);
    const [relogio] = await tx.execute<{ agora: string }>(
      sql`select clock_timestamp()::text as agora`,
    );
    exigir(relogio, "INTEGRIDADE");
    const momento = sql`${relogio.agora}::timestamptz`;
    await tx
      .update(retirements)
      .set({
        state: "absent",
        firstAbsenceAt: sql`coalesce(${retirements.firstAbsenceAt},${momento})`,
        lastCheckedAt: momento,
        nextAttemptAt: sql`${momento}+interval '24 hours'`,
      })
      .where(eq(retirements.captureId, b.c.id));
    if (b.c.verifiedAt === null && b.c.state !== "abandoned") {
      await tx
        .update(captures)
        .set({
          state: "abandoned",
          abandonedAt: momento,
          absenceConfirmedAt: momento,
          reviewReason: null,
        })
        .where(eq(captures.id, b.c.id));
    }
  });
}
/** Recibo de retirada/ausência é obrigatório; liberar em lotes não apaga o
 * manifesto ou tombstone nem concede autorização para restaurar os dados. */
export async function liberarReservasRetiradas(id: string, indice: Indice) {
  return db.transaction(async (tx) => {
    const b = await travarRetirada(tx, id);
    conferirMarcador(b, indice);
    exigir(
      b.r.state === "absent" && b.r.firstAbsenceAt !== null && b.r.markerStoredAt !== null,
      "ESTADO",
    );
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
      .set({ releasedAt: AGORA, releaseReason: "abandoned" })
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
      "recreio.backup_abandoned_holds_released",
      null,
      { app: "recreio", captureId: id, objectCount: lote.length },
      { writer: tx },
    );
    return lote.length;
  });
}

/** I/O já terminou sem prova suficiente. Só o mesmo token pode reagendar;
 * não renova autoridade vencida nem altera o marcador/motivo. */
export async function reagendarRetirada(bruto: TentativaDeRetirada) {
  const t = token(bruto);
  await db.transaction(async (tx) => {
    const b = await travarRetirada(tx, t.capturaId);
    exigir(b.r.attempt === t.tentativa, "TENTATIVA");
    await tx
      .update(retirements)
      .set({
        leaseUntil: sql`greatest(${retirements.createdAt}+interval '1 microsecond',clock_timestamp())`,
        nextAttemptAt: sql`${AGORA}+interval '5 minutes'`,
      })
      .where(eq(retirements.captureId, b.c.id));
    await logAuditEventStrict(
      "recreio.backup_retirement_deferred",
      null,
      { app: "recreio", captureId: b.c.id },
      { writer: tx },
    );
  });
}
/** Pista limitada por destino; cada tentativa torna a conferir sob travas.
 * Nem o payload nem os bytes do marcador são carregados pelo scanner. */
export async function listarRetiradasDevidas(destino: DestinoDeCaptura) {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  exigir(alvo.success, "CONFIGURACAO");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await limitarControleDoBackup(tx);
    return tx
      .select({ id: retirements.captureId })
      .from(retirements)
      .innerJoin(publications, eq(publications.captureId, retirements.captureId))
      .innerJoin(captures, eq(captures.id, retirements.captureId))
      .where(sql`${captures.protocolVersion}=1 and ${publications.bucketId}=${alvo.data.bucketId} and ${publications.bucketName}=${alvo.data.bucketName}
        and ${publications.storageScope}=${alvo.data.escopo} and ${retirements.leaseUntil}<=clock_timestamp()
        and ${retirements.nextAttemptAt}<=clock_timestamp()`)
      .orderBy(asc(retirements.nextAttemptAt), asc(retirements.captureId))
      .limit(20);
  });
}
