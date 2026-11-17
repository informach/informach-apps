import "server-only";
import { db, sql } from "@informach/db";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "./aparelho-repository";

/** Prévia de página, pelo mesmo kernel do ingresso; não cria sessão nem consome tempo. */
export async function conferirAberturaDoJogo(referencia: ReferenciaDeJogador, jogo: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    const identidade = await prepararIdentidadeDoJogo(tx, referencia);
    const admitido = await admitirAparelhoDeJogo(
      tx,
      { ...referencia, jogo, expiraEm: null },
      identidade,
      async () => {},
    );
    if (!admitido.admitida) return false;
    await admitido.conferirPrazo();
    return true;
  });
}
