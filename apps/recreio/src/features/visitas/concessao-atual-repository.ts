import "server-only";
import { and, eq } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { ErroDoRecreio, type PerfilId } from "@informach/recreio";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import type { ContextoDeConvite } from "@/features/mundos/convites-dirigidos-contexto-repository";
import {
  aprovacoesDaVisita,
  conferirRevisoesDoConvite,
} from "@/features/mundos/convites-dirigidos-estado-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { AnfitriaoAdmitido } from "./contexto-repository";

/** Contas/mundo/perfis e presença já admitidos. Mantém raiz → concessão antes do SID. */
export async function carregarConcessaoDaVisita(
  tx: Transacao,
  ctx: ContextoDeConvite,
  anfitriao: AnfitriaoAdmitido,
  perfilId: PerfilId,
  pista: { conviteId: string; visitaId: string },
) {
  const [convite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, pista.conviteId))
      .for("share"),
    [visita] = await tx.select().from(visits).where(eq(visits.id, pista.visitaId)).for("update"),
    agora = await anfitriao.conferirPrazo();
  assertAllowed(
    convite &&
      visita &&
      convite.state === "accepted" &&
      convite.spaceId === ctx.mundo.id &&
      convite.targetProfileId === perfilId &&
      convite.originProfileId === ctx.origem.fato.id &&
      convite.hostPresenceId === anfitriao.presenca.id &&
      visita.inviteId === convite.id &&
      visita.spaceId === ctx.mundo.id &&
      visita.visitorProfileId === perfilId &&
      visita.hostPresenceId === anfitriao.presenca.id &&
      visita.state === "active" &&
      visita.endedAt === null &&
      visita.expiresAt > agora,
    "PEDIDO",
    "Visita não disponível.",
  );
  return { convite, visita };
}
type ConcessaoDaVisita = Awaited<ReturnType<typeof carregarConcessaoDaVisita>>;

/** Mesmos fatos para a prévia nativa e a admissão de SID, sem conceder uma sessão na prévia. */
export async function conferirConcessaoDaVisita(
  tx: Transacao,
  ctx: ContextoDeConvite,
  anfitriao: AnfitriaoAdmitido,
  perfilId: PerfilId,
  { convite, visita }: ConcessaoDaVisita,
) {
  const [membro] = await tx
    .select({ estado: members.state })
    .from(members)
    .where(and(eq(members.spaceId, ctx.mundo.id), eq(members.profileId, perfilId)));
  if (membro && membro.estado !== "former") throw new ErroDoRecreio("JA_MEMBRO");
  const amizade = await amizadeAtualDoConvite(tx, ctx);
  conferirRevisoesDoConvite(ctx, convite, amizade.revision);
  await conferirConteudoDoConvite(tx, ctx);
  const aprovacoes = await aprovacoesDaVisita(tx, ctx, convite);
  assertAllowed(
    aprovacoes.mundo && aprovacoes.origem && aprovacoes.destino,
    "PEDIDO",
    "A visita precisa das aprovações atuais.",
  );
  const conferirPrazo = async () => {
    const agora = await anfitriao.conferirPrazo();
    if (visita.expiresAt <= agora)
      throw new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "expired" });
    return agora;
  };
  await conferirPrazo();
  return conferirPrazo;
}
