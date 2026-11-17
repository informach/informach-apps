import "server-only";
import { db, sql } from "@informach/db";
import type { PerfilId } from "@informach/recreio";
import {
  admitirAparelhoAtual,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import { AppError } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { ComposicaoSocialMudou, travarComposicaoSocial } from "./composicao-repository";
import { admitirPerfilSocial } from "./perfis-repository";

export type ContextoSocial = {
  origem: Awaited<ReturnType<typeof admitirPerfilSocial>>["fato"];
  destino: Awaited<ReturnType<typeof admitirPerfilSocial>>["fato"] | null;
  contaId: string | null;
  conferirPrazo: () => Promise<Date>;
};

/** Cookies nativos/pareados; este caminho não aceita token de partida como identidade. */
async function tentar<T>(
  referencia: ReferenciaDeJogador,
  alvo: PerfilId | null,
  finalidade: "contato" | "protecao",
  executar: (tx: Transacao, atual: ContextoSocial) => Promise<T>,
) {
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const composicao = await travarComposicaoSocial(tx, { tipo: "jogador", referencia }, [
      ...new Set([referencia.perfilId, ...(alvo ? [alvo] : [])]),
    ]);
    const identidade = await prepararIdentidadeDoJogo(tx, referencia);
    const admissao = await admitirAparelhoAtual(
      tx,
      { ...referencia, expiraEm: null },
      identidade,
      async () => {},
    );
    if (!admissao.admitida) return admissao;
    const origem = await admitirPerfilSocial(
      tx,
      composicao,
      referencia.perfilId,
      await admissao.conferirPrazo(),
    );
    const destino =
      alvo && finalidade === "contato"
        ? await admitirPerfilSocial(tx, composicao, alvo, await admissao.conferirPrazo())
        : null;
    if (origem.recalculou || destino?.recalculou) {
      await admissao.conferirPrazo();
      return {
        admitida: false as const,
        erro: new AppError("CONTATO", "A supervisão mudou. Reabra a tela antes de continuar."),
      };
    }
    const conferirPrazo = async () => {
      const agora = await admissao.conferirPrazo();
      origem.conferirPrazo(agora);
      destino?.conferirPrazo(agora);
      return agora;
    };
    const valor = await executar(tx, {
      origem: origem.fato,
      destino: destino?.fato ?? null,
      contaId: admissao.contaId,
      conferirPrazo,
    });
    await conferirPrazo();
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}

export async function comJogadorSocial<T>(
  referencia: ReferenciaDeJogador,
  alvo: PerfilId | null,
  executar: (tx: Transacao, atual: ContextoSocial) => Promise<T>,
) {
  try {
    return await tentar(referencia, alvo, "contato", executar);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(referencia, alvo, "contato", executar);
  }
}

/** Bloquear/silenciar não exige política de contato ativa da pessoa alvo. */
export async function comProtecaoSocial<T>(
  referencia: ReferenciaDeJogador,
  alvoId: PerfilId,
  executar: (
    tx: Transacao,
    atual: {
      perfilId: PerfilId;
      alvoId: PerfilId;
      contaId: string | null;
      conferirPrazo: () => Promise<Date>;
    },
  ) => Promise<T>,
) {
  const executarProtecao = (tx: Transacao, atual: ContextoSocial) =>
    executar(tx, {
      perfilId: atual.origem.id,
      alvoId,
      contaId: atual.contaId,
      conferirPrazo: atual.conferirPrazo,
    });
  try {
    return await tentar(referencia, alvoId, "protecao", executarProtecao);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(referencia, alvoId, "protecao", executarProtecao);
  }
}
