import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  recreioBackupObjectHolds as holds,
  recreioBackupPublications as publications,
} from "@informach/db/schema";
import { z } from "zod";
import { BARREIRA_CAPTURA_COLETA } from "@/features/backup/contrato";
import { AGORA, codigoDoPostgres } from "@/lib/repository";
import { limitarControleDoBackup, travarCapturaDeBackup } from "./controle-repository";
import { FalhaDaPublicacao } from "./falha-controle";

/** Exclusivo do protocolo que persiste referência ANTES de I/O. Não serve para
 * conciliar legacy ou habilitar jobs sobre banco recuperado sem normalização.
 * Barreira EXCLUSIVA precede captura: esperar/falhar, nunca abandonar uma visão
 * ainda coordenada e liberar a reserva enquanto o writer pode admitir PUT. */
export async function abandonarCapturaSemArquivo(id: string) {
  if (!z.uuid().safeParse(id).success) throw new FalhaDaPublicacao("CONFIGURACAO");
  try {
    return await db.transaction(async (tx) => {
      await limitarControleDoBackup(tx);
      await tx.execute(
        sql`select pg_advisory_xact_lock(${BARREIRA_CAPTURA_COLETA.grupo},${BARREIRA_CAPTURA_COLETA.chave})`,
      );
      const c = await travarCapturaDeBackup(tx, id);
      if (c.protocolVersion !== 1 || c.sealedAt !== null || c.verifiedAt !== null)
        throw new FalhaDaPublicacao("ESTADO");
      const [p] = await tx
        .select({ id: publications.captureId })
        .from(publications)
        .where(eq(publications.captureId, id));
      if (p) throw new FalhaDaPublicacao("ESTADO");
      if (c.state === "abandoned") return;
      if (!["preparing", "captured", "review"].includes(c.state))
        throw new FalhaDaPublicacao("ESTADO");
      await tx
        .update(captures)
        .set({ state: "abandoned", abandonedAt: AGORA, reviewReason: null })
        .where(eq(captures.id, id));
      await logAuditEventStrict(
        "recreio.backup_unsealed_abandoned",
        null,
        { app: "recreio", captureId: id },
        { writer: tx },
      );
    });
  } catch (e) {
    if (codigoDoPostgres(e) === "55P03") throw new FalhaDaPublicacao("OCUPADA");
    throw e;
  }
}
/** Abandono confirmado não expira/apaga o recibo. Batches conservam o limite e
 * não tocam em mundo/entrega. Arquivo selado usa outro protocolo de retirada. */
export async function liberarReservasSemArquivo(id: string) {
  if (!z.uuid().safeParse(id).success) throw new FalhaDaPublicacao("CONFIGURACAO");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('lock_timeout','5000ms',true),
      set_config('statement_timeout','15000ms',true),set_config('transaction_timeout','30000ms',true)`);
    const c = await travarCapturaDeBackup(tx, id);
    if (
      c.protocolVersion !== 1 ||
      c.state !== "abandoned" ||
      c.sealedAt !== null ||
      c.abandonedAt === null
    )
      throw new FalhaDaPublicacao("ESTADO");
    const [p] = await tx
      .select({ id: publications.captureId })
      .from(publications)
      .where(eq(publications.captureId, id));
    if (p) throw new FalhaDaPublicacao("ESTADO");
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
