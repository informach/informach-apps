import "server-only";
import { and, eq, gt, ne, sql } from "@informach/db";
import {
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, PerfilIdSchema } from "@informach/recreio";
import {
  ConsultaDeParticipantesSchema,
  type ParticipantesDoMundo,
} from "@informach/recreio/contrato";
import {
  type AutorSocial,
  comConsultaSocialNoMundo,
} from "@/features/social/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import type { Transacao } from "@/lib/repository";

/** Sem busca pública, presença, conta, papel administrativo ou conteúdo do jogo. */
export async function participantesDoMundo(
  autor: AutorSocial,
  entrada: unknown,
): Promise<ParticipantesDoMundo> {
  const consulta = ConsultaDeParticipantesSchema.parse(entrada);
  await limitarTentativas({
    chave: `participantes:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  const exigirMembro = async (tx: Transacao) => {
    const [proprio] = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.spaceId, consulta.mundoId),
          eq(members.profileId, autor.perfilId),
          eq(members.state, "active"),
        ),
      );
    if (!proprio) throw new ErroDoRecreio("NAO_MEMBRO");
  };
  return comConsultaSocialNoMundo(
    autor,
    async (tx) => {
      await exigirMembro(tx);
      const [mundo] = await tx
        .select({ jogo: spaces.gameId })
        .from(spaces)
        .where(and(eq(spaces.id, consulta.mundoId), ne(spaces.status, "deleted")))
        .for("share");
      if (!mundo || ("sid" in autor && autor.jogo !== mundo.jogo))
        throw new ErroDoRecreio("NAO_MEMBRO");
    },
    async (tx, atual) => {
      await exigirMembro(tx);
      const linhas = await tx
        .select({
          perfilId: profiles.id,
          apelido: profiles.nickname,
          avatar: profiles.avatar,
          estado: profiles.status,
          propria: sql<boolean>`coalesce((select blocked from recreio.social_blocks where actor_profile_id=${autor.perfilId} and target_profile_id=${profiles.id}),false)`,
          silenciado: sql<boolean>`coalesce((select muted from recreio.social_blocks where actor_profile_id=${autor.perfilId} and target_profile_id=${profiles.id}),false)`,
          inversa: sql<boolean>`coalesce((select blocked from recreio.social_blocks where actor_profile_id=${profiles.id} and target_profile_id=${autor.perfilId}),false)`,
        })
        .from(members)
        .innerJoin(profiles, eq(profiles.id, members.profileId))
        .where(
          and(
            eq(members.spaceId, consulta.mundoId),
            eq(members.state, "active"),
            ne(profiles.id, autor.perfilId),
            consulta.apos ? gt(profiles.id, consulta.apos) : undefined,
          ),
        )
        .orderBy(profiles.id)
        .limit(11);
      await atual.conferirPrazo();
      return {
        participantes: linhas.slice(0, 10).map((p) => ({
          perfilId: PerfilIdSchema.parse(p.perfilId),
          apelido: !p.propria && !p.inversa && p.estado === "active" ? p.apelido : null,
          avatar: !p.propria && !p.inversa && p.estado === "active" ? p.avatar : null,
          bloqueado: p.propria,
          silenciado: p.silenciado,
        })),
        proximo: linhas.length > 10 && linhas[9] ? PerfilIdSchema.parse(linhas[9].perfilId) : null,
      };
    },
  );
}
