import "server-only";
import { and, eq, gt, ne, sql } from "@informach/db";
import {
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, type PerfilId, PerfilIdSchema } from "@informach/recreio";
import {
  ConsultaDeParticipantesSchema,
  type ParticipantesDoMundo,
} from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  type AutorSocial,
  type ContextoSocial,
  comConsultaSocialNoMundo,
} from "@/features/social/autoridade-repository";
import { comResponsavelSocialNativo } from "@/features/social/responsavel-contexto-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import type { Transacao } from "@/lib/repository";

/** Sem busca pública, presença, conta, papel administrativo ou conteúdo do jogo. */
export async function participantesDoMundo(
  autor: AutorSocial | { responsavel: AutorNativoRecente; perfilId: PerfilId },
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
          ne(members.state, "former"),
        ),
      );
    if (!proprio) throw new ErroDoRecreio("NAO_MEMBRO");
  };
  const travarMundo = async (tx: Transacao) => {
    await exigirMembro(tx);
    const [mundo] = await tx
      .select({ jogo: spaces.gameId })
      .from(spaces)
      .where(and(eq(spaces.id, consulta.mundoId), ne(spaces.status, "deleted")))
      .for("share");
    if (!mundo || ("sid" in autor && autor.jogo !== mundo.jogo))
      throw new ErroDoRecreio("NAO_MEMBRO");
  };
  const consultar = async (tx: Transacao, atual: ContextoSocial) => {
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
          ne(members.state, "former"),
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
  };
  return "responsavel" in autor
    ? comResponsavelSocialNativo(
        autor.responsavel,
        autor.perfilId,
        {
          origemId: autor.perfilId,
          destinoId: null,
          finalidade: "protecao",
          operacao: "leitura",
          antesDosPerfis: travarMundo,
        },
        consultar,
      )
    : comConsultaSocialNoMundo(autor, travarMundo, consultar);
}
