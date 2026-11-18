import "server-only";
import { and, db, eq } from "@informach/db";
import {
  recreioDirectedInviteWorldApprovals as approvals,
  recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { MundoIdSchema, type PerfilId, PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import {
  ComposicaoSocialMudou,
  travarComposicaoDeConvite,
} from "@/features/social/composicao-repository";
import { admitirPerfilSocial } from "@/features/social/perfis-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import {
  type ContextoDeConvite,
  travarMundoDoConvite,
} from "./convites-dirigidos-contexto-repository";
import type { ConviteDoMundo } from "./convites-dirigidos-estado-repository";
import { limitarGestao } from "./gestao-repository";

type DecisaoNativa = { tipo: "responsavel" | "mundo"; perfilId: PerfilId };
type Decisor = {
  perfil: Awaited<ReturnType<typeof admitirPerfilSocial>>;
  membro: typeof members.$inferSelect | null;
  porResponsavel: boolean;
};

/** Login nativo recente, sem emprestar a sessão de um jogador nem exigir cobertura comercial. */
export async function comDecisorNativoDoConvite<T>(
  autor: AutorNativoRecente,
  conviteId: string,
  decisao: DecisaoNativa,
  executar: (
    tx: Transacao,
    ctx: ContextoDeConvite,
    convite: ConviteDoMundo,
    decisor: Decisor,
  ) => Promise<T>,
  leitura = false,
) {
  const tentar = async () => {
    const [pista] = await db.select().from(invites).where(eq(invites.id, conviteId));
    assertAllowed(pista, "PEDIDO", "Convite não disponível.");
    const pontas = {
      mundoId: MundoIdSchema.parse(pista.spaceId),
      origemId: PerfilIdSchema.parse(pista.originProfileId),
      destinoId: PerfilIdSchema.parse(pista.targetProfileId),
    };
    const [anterior] = leitura
      ? await db
          .select({ perfilId: members.profileId })
          .from(approvals)
          .innerJoin(
            members,
            and(
              eq(members.spaceId, approvals.spaceId),
              eq(members.id, approvals.approvedByMemberId),
            ),
          )
          .where(eq(approvals.inviteId, conviteId))
      : [];
    const resultado = await db.transaction(async (tx) => {
      await limitarGestao(tx);
      const composicao = await travarComposicaoDeConvite(
        tx,
        { tipo: "responsavel", contaId: autor.contaId },
        [
          ...new Set([
            pontas.origemId,
            pontas.destinoId,
            decisao.perfilId,
            ...(anterior?.perfilId ? [PerfilIdSchema.parse(anterior.perfilId)] : []),
          ]),
        ],
        async () => {
          await travarMundoDoConvite(tx, pontas);
        },
      );
      const nativa = await autorizarContaNativa(tx, autor);
      const prova = leitura ? undefined : autor.login;
      const agora = await nativa.conferirPrazo(prova);
      const perfil = composicao.perfis.find((p) => p.id === decisao.perfilId);
      const porResponsavel =
        perfil?.kind === "minor" &&
        composicao.vinculos.some(
          (v) => v.profileId === perfil.id && v.guardianUserId === autor.contaId,
        );
      assertAllowed(
        perfil?.status === "active" &&
          (porResponsavel ||
            (decisao.tipo === "mundo" &&
              perfil.kind === "adult" &&
              perfil.userId === autor.contaId &&
              nativa.perfilId === perfil.id)),
        "PEDIDO",
        "Esta decisão não está disponível para esta conta.",
      );
      const [mundo] = await tx.select().from(spaces).where(eq(spaces.id, pontas.mundoId));
      const [convite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, conviteId))
        .for("update");
      assertAllowed(
        mundo &&
          convite &&
          convite.spaceId === pista.spaceId &&
          convite.originProfileId === pista.originProfileId &&
          convite.targetProfileId === pista.targetProfileId,
        "PEDIDO",
        "Convite não disponível.",
      );
      const [membro] =
        decisao.tipo === "mundo"
          ? await tx
              .select()
              .from(members)
              .where(and(eq(members.spaceId, mundo.id), eq(members.profileId, perfil.id)))
              .for("update")
          : [];
      if (decisao.tipo === "responsavel")
        assertAllowed(
          porResponsavel &&
            (perfil.id === convite.originProfileId || perfil.id === convite.targetProfileId),
          "PEDIDO",
          "Esta decisão não está disponível para esta conta.",
        );
      else
        assertAllowed(
          membro &&
            membro.state !== "former" &&
            ((membro.role === "steward" && mundo.stewardProfileId === perfil.id) ||
              (!porResponsavel && membro.role === "coadmin")),
          "RESPONSAVEL",
          "Esta decisão não está disponível para esta conta.",
        );
      const origem = await admitirPerfilSocial(tx, composicao, pontas.origemId, agora);
      const destino = await admitirPerfilSocial(tx, composicao, pontas.destinoId, agora);
      const perfilDoDecisor =
        perfil.id === pontas.origemId
          ? origem
          : perfil.id === pontas.destinoId
            ? destino
            : await admitirPerfilSocial(tx, composicao, decisao.perfilId, agora);
      if (origem.recalculou || destino.recalculou || perfilDoDecisor.recalculou)
        return { executou: false as const };
      const conferirPrazo = async () => {
        const instante = await nativa.conferirPrazo(prova);
        origem.conferirPrazo(instante);
        destino.conferirPrazo(instante);
        perfilDoDecisor.conferirPrazo(instante);
        return instante;
      };
      const valor = await executar(
        tx,
        { mundo, composicao, origem, destino, contaId: autor.contaId, conferirPrazo },
        convite,
        { perfil: perfilDoDecisor, membro: membro ?? null, porResponsavel },
      );
      await conferirPrazo();
      return { executou: true as const, valor };
    });
    if (!resultado.executou)
      throw new AppError("CONFLITO", "As regras mudaram. Confira novamente antes de decidir.");
    return resultado.valor;
  };
  try {
    return await tentar();
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar();
  }
}
