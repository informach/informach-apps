import "server-only";
import { sql } from "@informach/db";
import { comIngressoParaTeste } from "@/features/teste/admissao-repository";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "./aparelho-repository";

/** Prévia de página, pelo mesmo kernel do ingresso; não cria sessão nem consome tempo. */
export async function conferirAberturaDoJogo(referencia: ReferenciaDeJogador, jogo: string) {
  const resultado = await comIngressoParaTeste<boolean>(
    { ...referencia, jogo, expiraEm: null },
    async (tx, provisoria) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      if (provisoria) {
        await provisoria.conferirPrazo();
        return { admitida: true, valor: true };
      }
      const identidade = await prepararIdentidadeDoJogo(tx, referencia);
      const admitido = await admitirAparelhoDeJogo(
        tx,
        { ...referencia, jogo, expiraEm: null },
        identidade,
        async () => {},
      );
      if (!admitido.admitida) return admitido;
      await admitido.conferirPrazo();
      return { admitida: true, valor: true };
    },
  );
  return resultado.admitida && resultado.valor;
}
