import "server-only";
import { and, eq, isNull } from "@informach/db";
import {
  recreioGameInstances as instances,
  recreioSpaceMembers as members,
  recreioWorldHostPresences as presences,
  recreioGameSessions as sessions,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, InstanciaIdSchema, MundoIdSchema } from "@informach/recreio";
import { PresencaParaConviteSchema } from "@informach/recreio/contrato";
import { jogoQueAbre } from "@/features/jogos/config";
import { conferirConteudoDoMundo, conferirPosse } from "@/features/posse/repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { comConsultaSocialNoMundo } from "@/features/social/autoridade-repository";
import { exigirNovosContatos } from "@/features/social/disponibilidade";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import { exigirSessaoSemVisita } from "./sessao-repository";

/** Só lê a própria presença já atestada. Nunca vincula o SID ao mundo ou admite membro. */
export async function presencaDoJogadorParaConvite(autor: SessaoDeJogoAtiva, entrada: unknown) {
  const mundoId = MundoIdSchema.parse(entrada);
  exigirNovosContatos();
  if (env.RECREIO_VISITS_MODE !== "on" || jogoQueAbre(autor.jogo).capacidades.visitas !== true)
    throw new ErroDoRecreio("INDISPONIVEL");
  await limitarTentativas({
    chave: `visita-presenca-propria:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return comConsultaSocialNoMundo(
    autor,
    async (tx) => {
      const [mundo] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.id, mundoId), eq(spaces.gameId, autor.jogo)))
        .for("update");
      if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
    },
    async (tx, ctx) => {
      await exigirSessaoSemVisita(tx, autor.sid);
      const [linha] = await tx
        .select({ presenca: presences, membro: members, mundo: spaces })
        .from(presences)
        .innerJoin(
          sessions,
          and(
            eq(sessions.id, presences.hostSessionId),
            eq(sessions.profileId, autor.perfilId),
            eq(sessions.gameId, autor.jogo),
            eq(sessions.spaceId, mundoId),
            eq(sessions.supportsVisits, true),
            isNull(sessions.endedAt),
          ),
        )
        .innerJoin(spaces, and(eq(spaces.id, mundoId), eq(spaces.status, "active")))
        .innerJoin(
          members,
          and(
            eq(members.id, presences.hostMemberId),
            eq(members.spaceId, mundoId),
            eq(members.profileId, autor.perfilId),
            eq(members.state, "active"),
          ),
        )
        .innerJoin(
          instances,
          and(
            eq(instances.id, presences.instanceId),
            eq(instances.gameId, autor.jogo),
            eq(instances.supportsVisits, true),
            eq(instances.state, "active"),
          ),
        )
        .where(
          and(
            eq(presences.spaceId, mundoId),
            eq(presences.hostProfileId, autor.perfilId),
            eq(presences.hostSessionId, autor.sid),
            eq(presences.state, "active"),
            isNull(presences.closedAt),
          ),
        );
      const vazio = { jogo: autor.jogo, mundoId, presenca: null };
      if (!linha) return PresencaParaConviteSchema.parse(vazio);
      const p = linha.presenca;
      if (
        (linha.membro.role === "steward" && linha.mundo.stewardProfileId !== autor.perfilId) ||
        (linha.membro.role === "coadmin" && ctx.origem.tipo !== "adulto")
      )
        return PresencaParaConviteSchema.parse(vazio);
      const { mundo, posse } = await conferirPosse(tx, {
        jogo: autor.jogo,
        mundoId,
        instanciaId: InstanciaIdSchema.parse(p.instanceId),
        cerca: p.fence,
      });
      await conferirConteudoDoMundo(
        tx,
        mundo,
        autor.jogo,
        ctx.origem.tipo === "protegido" ? ctx.origem.politica : null,
      );
      const fim = await ctx.conferirPrazo();
      if (p.expiresAt <= fim || p.validUntil <= fim || posse.expiresAt <= fim)
        return PresencaParaConviteSchema.parse(vazio);
      return PresencaParaConviteSchema.parse({
        jogo: autor.jogo,
        mundoId,
        presenca: {
          presencaId: p.id,
          estado: p.state,
          expiraEm: p.expiresAt.toISOString(),
          janelaAte: p.validUntil.toISOString(),
        },
      });
    },
  );
}
