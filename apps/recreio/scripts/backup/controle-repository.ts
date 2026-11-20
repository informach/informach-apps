import "server-only";
import { eq, sql } from "@informach/db";
import { recreioBackupCaptures as captures } from "@informach/db/schema";
import { z } from "zod";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import type { Transacao } from "@/lib/repository";
import { FalhaDaPublicacao } from "./falha-controle";
/** Recheck the whole persisted destination while its native control is locked.
 * A scanner ID alone never authorizes another bucket's control mutation. */
export function conferirDestinoDoControle(
  atual: { bucketId: string; bucketName: string; storageScope: string },
  destino: DestinoDeCaptura,
) {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  if (
    !alvo.success ||
    atual.bucketId !== alvo.data.bucketId ||
    atual.bucketName !== alvo.data.bucketName ||
    atual.storageScope !== alvo.data.escopo
  )
    throw new FalhaDaPublicacao("CONFIGURACAO");
}
export async function limitarControleDoBackup(tx: Transacao) {
  await tx.execute(sql`select set_config('lock_timeout','5000ms',true),
    set_config('statement_timeout','15000ms',true),set_config('transaction_timeout','30000ms',true)`);
}
export async function travarCapturaDeBackup(tx: Transacao, id: string) {
  if (!z.uuid().safeParse(id).success) throw new FalhaDaPublicacao("CONFIGURACAO");
  await limitarControleDoBackup(tx);
  const [c] = await tx.select().from(captures).where(eq(captures.id, id)).for("update");
  if (!c) throw new FalhaDaPublicacao("ESTADO");
  return c;
}
