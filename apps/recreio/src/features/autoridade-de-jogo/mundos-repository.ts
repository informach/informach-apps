import "server-only";
import { db, sql } from "@informach/db";
import { ErroDoRecreio } from "@informach/recreio";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { comPreparacaoDeMundo } from "@/features/teste/admissao-repository";
import type { Transacao } from "@/lib/repository";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "./aparelho-repository";
import { type Admissao, comSessaoDeJogoAutoritativa } from "./repository";

export type AutorDeMundos = ReferenciaDeJogador | SessaoDeJogoAtiva;

/** Somente preparar/criar/listar o próprio mundo antes da primeira SID de teste.
 * A sessão do SDK nunca recebe essa exceção; permanece no kernel completo.
 */
export function comAutorDaPreparacaoDeMundo<T>(
  autor: AutorDeMundos,
  jogo: string,
  antesDoPerfil: (tx: Transacao) => Promise<void>,
  executar: (
    tx: Transacao,
    contexto: Pick<Admissao, "perfil" | "politica" | "contaId" | "conferirPrazo">,
  ) => Promise<T>,
): Promise<T> {
  if ("sid" in autor) return comAutorDeMundos(autor, jogo, antesDoPerfil, executar);
  return comPreparacaoDeMundo({ ...autor, jogo, expiraEm: null }, antesDoPerfil, executar);
}

/** A mesma transação admite a autoridade e executa a operação de domínio. */
export async function comAutorDeMundos<T>(
  autor: AutorDeMundos,
  jogo: string,
  antesDoPerfil: (tx: Transacao) => Promise<void>,
  executar: (tx: Transacao, admissao: Admissao) => Promise<T>,
  opcoes: {
    antesDaIdentidade?: (tx: Transacao, referencia: ReferenciaDeJogador) => Promise<void>;
  } = {},
): Promise<T> {
  try {
    if ("sid" in autor) {
      if (autor.jogo !== jogo) throw new ErroDoRecreio("SESSAO_INVALIDA");
      return await comSessaoDeJogoAutoritativa(
        autor,
        async () => {},
        (tx, _conta, admissao) => executar(tx, admissao),
        { antesDoPerfil, antesDaIdentidade: opcoes.antesDaIdentidade },
      );
    }
    const resultado = await db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await opcoes.antesDaIdentidade?.(tx, autor);
      const identidade = await prepararIdentidadeDoJogo(tx, autor);
      await antesDoPerfil(tx);
      const admitido = await admitirAparelhoDeJogo(
        tx,
        { ...autor, jogo, expiraEm: null },
        identidade,
        async () => {},
      );
      if (!admitido.admitida) return admitido;
      const valor = await executar(tx, admitido);
      await admitido.conferirPrazo();
      return { admitida: true as const, valor };
    });
    if (!resultado.admitida) throw resultado.erro;
    return resultado.valor;
  } catch (erro) {
    if (erro instanceof ErroDoRecreio && erro.codigo === "ACESSO_PERDIDO")
      throw new ErroDoRecreio("ACESSO_NEGADO", erro.detalhe);
    throw erro;
  }
}
