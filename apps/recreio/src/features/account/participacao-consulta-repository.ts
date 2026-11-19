import "server-only";
import { db, sql } from "@informach/db";
import { autorizarContaNativaParaDireitos, type IdentidadeNativa } from "./autoridade-repository";

/** Só a própria conta irrestrita; não exige jogador nem cobertura comercial. */
export function consultarParticipacaoDaContaNoBanco(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const nativa = await autorizarContaNativaParaDireitos(tx, autor);
    await nativa.conferirPrazo();
    return {
      estado: nativa.participacao.estado,
      revisao: nativa.participacao.revisao,
      iniciadaEm: nativa.participacao.iniciadaEm?.toISOString() ?? null,
      encerradaEm: nativa.participacao.encerradaEm?.toISOString() ?? null,
    };
  });
}
