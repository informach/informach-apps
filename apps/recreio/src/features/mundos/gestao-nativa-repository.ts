import "server-only";
import { and, db, eq, inArray, ne } from "@informach/db";
import { recreioSpaceMembers as members, recreioSpaces as spaces } from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import { autorizarContaNativa } from "@/features/account/autoridade-repository";
import {
  ComposicaoSocialMudou,
  travarComposicaoSocial,
} from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type AutorDaGestaoDeMundo, identidadeDoGestor } from "./gestao-nativa-autor";
import { type AutorDaResponsabilidade, limitarGestao } from "./gestao-repository";

/** Contas ordenadas → mundo → perfis → aparelho → participações. Sem cobertura comercial. */
async function contextoNativoDaParticipacao(
  tx: Transacao,
  autor: AutorDaGestaoDeMundo,
  mundoId: string,
  alvoId?: string,
) {
  const identidade = identidadeDoGestor(autor);
  const antes = await tx
    .select({ id: members.id, perfilId: members.profileId })
    .from(members)
    .where(and(eq(members.spaceId, mundoId), eq(members.profileId, autor.perfilId)));
  const proprioAntes = antes[0];
  assertAllowed(proprioAntes, "MUNDO", "Mundo indisponível.");
  const [alvoAntes] = alvoId
    ? await tx
        .select({ id: members.id, perfilId: members.profileId })
        .from(members)
        .where(and(eq(members.spaceId, mundoId), eq(members.id, alvoId)))
    : [];
  assertAllowed(!alvoId || alvoAntes, "MUNDO", "Participação indisponível.");
  const perfis = [autor.perfilId];
  if (alvoAntes?.perfilId && alvoAntes.perfilId !== autor.perfilId)
    perfis.push(PerfilIdSchema.parse(alvoAntes.perfilId));
  const composicao = await travarComposicaoSocial(
    tx,
    { tipo: "responsavel", contaId: identidade.contaId },
    perfis,
    async () => {
      const [mundo] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.id, mundoId), ne(spaces.status, "deleted")))
        .for("update");
      assertAllowed(mundo, "MUNDO", "Mundo indisponível.");
    },
  );
  const nativa = await autorizarContaNativa(tx, identidade);
  const perfil = composicao.perfis.find((p) => p.id === autor.perfilId);
  const porResponsavel =
    "responsavel" in autor &&
    perfil?.kind === "minor" &&
    composicao.vinculos.some(
      (v) => v.profileId === autor.perfilId && v.guardianUserId === identidade.contaId,
    );
  const proprioAdulto =
    !("responsavel" in autor) &&
    perfil?.kind === "adult" &&
    perfil.userId === identidade.contaId &&
    nativa.perfilId === autor.perfilId;
  assertAllowed(
    perfil?.status === "active" && (proprioAdulto || porResponsavel),
    "responsavel" in autor ? "PERFIL" : "AUTH",
    "A gestão deste perfil está indisponível para esta conta.",
  );
  const [mundo] = await tx.select().from(spaces).where(eq(spaces.id, mundoId));
  assertAllowed(mundo, "MUNDO", "Mundo indisponível.");
  const vinculos = await tx
    .select()
    .from(members)
    .where(
      and(
        eq(members.spaceId, mundoId),
        inArray(members.id, [proprioAntes.id, ...(alvoId ? [alvoId] : [])]),
      ),
    )
    .orderBy(members.id)
    .for("update");
  const proprio = vinculos.find((m) => m.id === proprioAntes.id),
    alvo = alvoId ? vinculos.find((m) => m.id === alvoId) : undefined;
  assertAllowed(
    proprio?.profileId === autor.perfilId && proprio.state !== "former",
    "MUNDO",
    "Participação indisponível.",
  );
  if (alvoId)
    assertAllowed(
      alvo && alvo.profileId === alvoAntes?.perfilId,
      "CONFLITO",
      "A participação mudou. Atualize a página antes de continuar.",
    );
  const responsavel = proprio.role === "steward" && mundo.stewardProfileId === perfil.id;
  const conferirPrazo = (recente = true) =>
    nativa.conferirPrazo(recente ? identidade.login : undefined);
  await conferirPrazo(false);
  return {
    mundo,
    proprio,
    alvo,
    perfilAlvo: composicao.perfis.find((p) => p.id === alvo?.profileId),
    responsavel,
    porResponsavel,
    perfilGerido: perfil,
    composicao,
    contaId: identidade.contaId,
    conferirPrazo,
  };
}

export async function contextoNativoDoMundo(
  tx: Transacao,
  autor: AutorDaGestaoDeMundo,
  mundoId: string,
  alvoId?: string,
) {
  const ctx = await contextoNativoDaParticipacao(tx, autor, mundoId, alvoId);
  assertAllowed(
    ctx.responsavel || (!ctx.porResponsavel && ctx.proprio.role === "coadmin"),
    "RESPONSAVEL",
    "A gestão deste mundo está indisponível para este perfil.",
  );
  return ctx;
}

async function comContextoNativoDoMundo<T>(
  autor: AutorDaGestaoDeMundo,
  mundoId: string,
  alvoId: string | undefined,
  executar: (tx: Transacao, ctx: Awaited<ReturnType<typeof contextoNativoDoMundo>>) => Promise<T>,
  leitura = false,
  gestao = true,
) {
  const tentar = () =>
    db.transaction(async (tx) => {
      await limitarGestao(tx);
      const ctx = await (gestao ? contextoNativoDoMundo : contextoNativoDaParticipacao)(
        tx,
        autor,
        mundoId,
        alvoId,
      );
      const resultado = await executar(tx, ctx);
      await ctx.conferirPrazo(!leitura);
      return resultado;
    });
  try {
    return await tentar();
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar();
  }
}

export function comGestaoNativaDoMundo<T>(
  autor: AutorDaGestaoDeMundo,
  mundoId: string,
  alvoId: string | undefined,
  executar: (tx: Transacao, ctx: Awaited<ReturnType<typeof contextoNativoDoMundo>>) => Promise<T>,
  leitura = false,
) {
  return comContextoNativoDoMundo(autor, mundoId, alvoId, executar, leitura, true);
}

/** Aceitar uma proposta própria não exige ser administrador do mundo antes do aceite. */
export function comParticipacaoNativaDoMundo<T>(
  autor: AutorDaResponsabilidade,
  mundoId: string,
  alvoId: string,
  executar: (tx: Transacao, ctx: Awaited<ReturnType<typeof contextoNativoDoMundo>>) => Promise<T>,
  leitura = false,
) {
  return comContextoNativoDoMundo(autor, mundoId, alvoId, executar, leitura, false);
}
