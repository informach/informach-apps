import "server-only";
import { eq, sql } from "@informach/db";
import { recreioBackupCaptures as captures } from "@informach/db/schema";
import { z } from "zod";
import type { Transacao } from "@/lib/repository";
import { FalhaDaPublicacao } from "./falha-controle";
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
