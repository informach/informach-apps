import "server-only";
import { db, sql } from "@informach/db";
import type { MundoId, PerfilId } from "@informach/recreio";
import {
  admitirAparelhoAtual,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import {
  confirmarCoparticipacao,
  travarMundoCompartilhado,
} from "@/features/mundos/coparticipacao-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { AppError } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { ComposicaoSocialMudou, travarComposicaoSocial } from "./composicao-repository";
import { comPartidaSocial } from "./partida-repository";
import { admitirPerfilSocial } from "./perfis-repository";

export type ContextoSocial = {
  origem: Awaited<ReturnType<typeof admitirPerfilSocial>>["fato"];
  destino: Awaited<ReturnType<typeof admitirPerfilSocial>>["fato"] | null;
  politicaDeJogo: Awaited<ReturnType<typeof admitirPerfilSocial>>["politicaDeJogo"];
  contaId: string | null;
  conferirPrazo: () => Promise<Date>;
  mundoCompartilhado?: MundoId | null;
};
export type AutorSocial = ReferenciaDeJogador | SessaoDeJogoAtiva;
export type ContextoDeProtecaoSocial = {
  perfilId: PerfilId;
  alvoId: PerfilId;
  contaId: string | null;
  conferirPrazo: () => Promise<Date>;
  mundoCompartilhado?: MundoId | null;
};

/** Cookies nativos/pareados; este caminho não aceita token de partida como identidade. */
async function tentar<T>(
  referencia: AutorSocial,
  alvo: PerfilId | null,
  finalidade: "contato" | "protecao",
  executar: (tx: Transacao, atual: ContextoSocial) => Promise<T>,
  antesDosPerfis?: (tx: Transacao) => Promise<void>,
) {
  if ("sid" in referencia)
    return comPartidaSocial(referencia, alvo, finalidade, executar, antesDosPerfis);
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    let pistaDeMundo: MundoId | null = null;
    const composicao = await travarComposicaoSocial(
      tx,
      { tipo: "jogador", referencia },
      [...new Set([referencia.perfilId, ...(alvo ? [alvo] : [])])],
      async () => {
        await antesDosPerfis?.(tx);
        if (alvo && finalidade === "protecao")
          pistaDeMundo = await travarMundoCompartilhado(tx, referencia.perfilId, alvo);
      },
    );
    const mundoCompartilhado =
      alvo && finalidade === "protecao"
        ? await confirmarCoparticipacao(tx, pistaDeMundo, referencia.perfilId, alvo)
        : null;
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
      politicaDeJogo: origem.politicaDeJogo,
      contaId: admissao.contaId,
      conferirPrazo,
      mundoCompartilhado,
    });
    await conferirPrazo();
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}

/** Consulta restrita ao mundo: o chamador trava o mundo antes dos perfis e relê a participação. */
export async function comConsultaSocialNoMundo<T>(
  referencia: AutorSocial,
  travarMundo: (tx: Transacao) => Promise<void>,
  executar: (tx: Transacao, atual: ContextoSocial) => Promise<T>,
) {
  try {
    return await tentar(referencia, null, "protecao", executar, travarMundo);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(referencia, null, "protecao", executar, travarMundo);
  }
}

export async function comJogadorSocial<T>(
  referencia: AutorSocial,
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
  referencia: AutorSocial,
  alvoId: PerfilId,
  executar: (tx: Transacao, atual: ContextoDeProtecaoSocial) => Promise<T>,
) {
  const executarProtecao = (tx: Transacao, atual: ContextoSocial) =>
    executar(tx, {
      perfilId: atual.origem.id,
      alvoId,
      contaId: atual.contaId,
      conferirPrazo: atual.conferirPrazo,
      mundoCompartilhado: atual.mundoCompartilhado,
    });
  try {
    return await tentar(referencia, alvoId, "protecao", executarProtecao);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(referencia, alvoId, "protecao", executarProtecao);
  }
}
