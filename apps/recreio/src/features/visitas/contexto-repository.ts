import "server-only";
import { and, eq, isNull } from "@informach/db";
import {
  recreioGameInstances as instances,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioGameSessions as sessions,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  InstanciaIdSchema,
  MundoIdSchema,
  PerfilIdSchema,
  SessaoDeAparelhoIdSchema,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import { admitirAparelhoDeJogo } from "@/features/autoridade-de-jogo/aparelho-repository";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { conferirSessaoAdmitida } from "@/features/autoridade-de-jogo/sessao-repository";
import { jogoQueAbre } from "@/features/jogos/config";
import {
  type ContextoDeConvite,
  comJogadorNoConviteDeVisita,
  type PontasDeConvite,
} from "@/features/mundos/convites-dirigidos-contexto-repository";
import { conferirPosse } from "@/features/posse/repository";
import { exigirNovosContatos } from "@/features/social/disponibilidade";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

/** Contas, mundo e perfis já travados pela composição; o recibo técnico não basta. */
async function admitirAnfitriao(tx: Transacao, ctx: ContextoDeConvite, presencaId: string) {
  const [pista] = await tx
    .select()
    .from(presences)
    .where(
      and(
        eq(presences.id, presencaId),
        eq(presences.spaceId, ctx.mundo.id),
        eq(presences.hostProfileId, ctx.origem.fato.id),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Visita não disponível.");
  const [sessao] = await tx
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, pista.hostSessionId),
        eq(sessions.profileId, pista.hostProfileId),
        eq(sessions.gameId, ctx.mundo.gameId),
        eq(sessions.spaceId, ctx.mundo.id),
        isNull(sessions.endedAt),
        eq(sessions.supportsVisits, true),
      ),
    );
  if (!sessao) throw new ErroDoRecreio("SESSAO_ENCERRADA");
  const perfil = ctx.composicao.perfis.find((p) => p.id === pista.hostProfileId),
    contaId =
      perfil?.kind === "adult"
        ? perfil.userId
        : ctx.composicao.vinculos.find((v) => v.profileId === perfil?.id)?.guardianUserId,
    conta = ctx.composicao.contas.find((c) => c.id === contaId);
  assertAllowed(perfil && conta, "PEDIDO", "Visita não disponível.");
  const referencia = {
      perfilId: PerfilIdSchema.parse(perfil.id),
      sessaoDeAparelhoId: SessaoDeAparelhoIdSchema.parse(sessao.deviceSessionId),
      jogo: ctx.mundo.gameId,
      expiraEm: sessao.expiresAt.getTime(),
    },
    admitida = await admitirAparelhoDeJogo(
      tx,
      referencia,
      { tipo: perfil.kind, conta },
      async () => {},
    );
  if (!admitida.admitida) throw admitida.erro;
  const conferida = await conferirSessaoAdmitida(
    tx,
    {
      sid: SessaoDeJogoIdSchema.parse(sessao.id),
      perfilId: referencia.perfilId,
      jogo: referencia.jogo,
      versaoDaPolitica: admitida.versaoDaPolitica,
    },
    admitida,
  );
  if (!conferida.admitida) throw conferida.erro;
  const [presenca] = await tx
      .select()
      .from(presences)
      .where(
        and(
          eq(presences.id, pista.id),
          eq(presences.spaceId, pista.spaceId),
          eq(presences.hostProfileId, pista.hostProfileId),
          eq(presences.hostSessionId, pista.hostSessionId),
          eq(presences.hostMemberId, pista.hostMemberId),
          eq(presences.instanceId, pista.instanceId),
          eq(presences.fence, pista.fence),
        ),
      )
      .for("share"),
    [instancia] = await tx
      .select()
      .from(instances)
      .where(
        and(
          eq(instances.id, pista.instanceId),
          eq(instances.gameId, ctx.mundo.gameId),
          eq(instances.supportsVisits, true),
        ),
      ),
    [membro] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, pista.hostMemberId),
          eq(members.spaceId, ctx.mundo.id),
          eq(members.profileId, perfil.id),
          eq(members.state, "active"),
        ),
      );
  assertAllowed(
    presenca &&
      instancia &&
      membro &&
      (membro.role !== "steward" || ctx.mundo.stewardProfileId === perfil.id) &&
      (membro.role !== "coadmin" || perfil.kind === "adult"),
    "PEDIDO",
    "Visita não disponível.",
  );
  const { mundo, posse } = await conferirPosse(tx, {
    jogo: ctx.mundo.gameId,
    mundoId: MundoIdSchema.parse(ctx.mundo.id),
    instanciaId: InstanciaIdSchema.parse(pista.instanceId),
    cerca: pista.fence,
  });
  assertAllowed(
    mundo.status === "active" && instancia.state === "active",
    "PEDIDO",
    "Visita não disponível.",
  );
  const conferirPrazo = async () => {
    await ctx.conferirPrazo();
    const agora = await admitida.conferirPrazo();
    assertAllowed(
      presenca.state === "active" &&
        presenca.closedAt === null &&
        presenca.expiresAt > agora &&
        presenca.validUntil > agora &&
        posse.expiresAt > agora &&
        conferida.jogo.expiresAt > agora,
      "PEDIDO",
      "O anfitrião não está mais disponível.",
    );
    return agora;
  };
  await conferirPrazo();
  return { presenca, membro, conferirPrazo };
}
export type AnfitriaoAdmitido = Awaited<ReturnType<typeof admitirAnfitriao>>;

/** Escrita positiva relê o anfitrião e seu prazo até depois do efeito/auditoria. */
export async function comJogadorEAnfitriaoNaVisita<T>(
  autor: AutorDeMundos,
  pontas: PontasDeConvite,
  presencaId: string,
  executar: (tx: Transacao, ctx: ContextoDeConvite, anfitriao: AnfitriaoAdmitido) => Promise<T>,
) {
  exigirNovosContatos();
  if (env.RECREIO_VISITS_MODE !== "on") throw new ErroDoRecreio("INDISPONIVEL");
  return comJogadorNoConviteDeVisita(autor, pontas, async (tx, ctx) => {
    if (jogoQueAbre(ctx.mundo.gameId).capacidades.visitas !== true)
      throw new ErroDoRecreio("INDISPONIVEL");
    if (pontas.conviteId) {
      const [convite] = await tx
        .select({ presencaId: invites.hostPresenceId })
        .from(invites)
        .where(eq(invites.id, pontas.conviteId));
      assertAllowed(
        convite?.presencaId === presencaId,
        "PEDIDO",
        "A visita não corresponde à presença original.",
      );
    }
    const anfitriao = await admitirAnfitriao(tx, ctx, presencaId),
      valor = await executar(tx, ctx, anfitriao);
    await anfitriao.conferirPrazo();
    return valor;
  });
}
