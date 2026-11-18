import "server-only";
import { db, sql } from "@informach/db";
import type { recreioProfiles } from "@informach/db/schema";
import type { ContaId, PerfilId } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import {
  ComposicaoSocialMudou,
  travarComposicaoSocial,
} from "@/features/social/composicao-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

export type ContextoDaRestricao = {
  perfil: typeof recreioProfiles.$inferSelect;
  contaId: ContaId;
  tipo: "titular" | "responsavel";
  conferirPrazo: () => Promise<Date>;
};

async function tentar<T>(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  leitura: boolean,
  executar: (tx: Transacao, atual: ContextoDaRestricao) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const composicao = await travarComposicaoSocial(
      tx,
      { tipo: "responsavel", contaId: autor.contaId },
      [perfilId],
    );
    const nativa = await autorizarContaNativa(tx, autor);
    const conferirPrazo = () => nativa.conferirPrazo(leitura ? undefined : autor.login);
    await conferirPrazo();
    const perfil = composicao.perfis.find((p) => p.id === perfilId);
    const proprio = perfil?.kind === "adult" && perfil.userId === autor.contaId;
    const responsavel =
      perfil?.kind === "minor" &&
      composicao.vinculos.some(
        (v) => v.profileId === perfilId && v.guardianUserId === autor.contaId,
      );
    assertAllowed(
      perfil && (proprio || responsavel),
      "PERFIL",
      "Perfil indisponível para esta conta.",
    );
    const valor = await executar(tx, {
      perfil,
      contaId: autor.contaId,
      tipo: proprio ? "titular" : "responsavel",
      conferirPrazo,
    });
    await conferirPrazo();
    return valor;
  });
}

/** O perfil suspenso continua com direitos. Não exige gameplay, cobertura ou aparelho infantil. */
export async function comGestorDaRestricao<T>(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  leitura: boolean,
  executar: (tx: Transacao, atual: ContextoDaRestricao) => Promise<T>,
) {
  try {
    return await tentar(autor, perfilId, leitura, executar);
  } catch (erro) {
    if (erro instanceof ComposicaoSocialMudou) return tentar(autor, perfilId, leitura, executar);
    if (erro instanceof AppError && erro.code === "CONTATO")
      throw new AppError("PERFIL", "Perfil indisponível para esta conta.");
    throw erro;
  }
}
