import "server-only";
import { and, asc, eq, gt, isNull, ne, or } from "@informach/db";
import {
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { MundoIdSchema, type PerfilId, podeConvidar } from "@informach/recreio";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { jogoAbre, jogoDoCatalogo } from "@/features/jogos/config";
import { comJogadorSocial } from "@/features/social/autoridade-repository";
import { exigirNovosContatos } from "@/features/social/disponibilidade";
import { assertAllowed } from "@/lib/errors";
import { amizadeAtualEntre } from "./convites-dirigidos-amizade-repository";

/** Metadados dos próprios mundos; enviar ainda exige a autoridade transacional completa. */
export async function opcoesParaConvidarAmigo(
  autor: ReferenciaDeJogador,
  destinoId: PerfilId,
  apos?: string,
) {
  exigirNovosContatos();
  const cursor = MundoIdSchema.optional().parse(apos);
  return comJogadorSocial(autor, destinoId, async (tx, ctx) => {
    assertAllowed(ctx.destino, "PEDIDO", "Contato não disponível.");
    await amizadeAtualEntre(tx, ctx.origem, ctx.destino);
    const [contato] = await tx
      .select({ apelido: profiles.nickname, avatar: profiles.avatar })
      .from(profiles)
      .where(eq(profiles.id, destinoId));
    assertAllowed(contato, "PEDIDO", "Contato não disponível.");
    const linhas = await tx
      .select({
        id: spaces.id,
        nome: spaces.name,
        jogo: spaces.gameId,
        papel: members.role,
        politica: spaces.membersInvite,
        responsavelId: spaces.stewardProfileId,
      })
      .from(members)
      .innerJoin(spaces, eq(spaces.id, members.spaceId))
      .where(
        and(
          eq(members.profileId, autor.perfilId),
          eq(members.state, "active"),
          ne(spaces.status, "deleted"),
          isNull(spaces.archivedAt),
          or(
            eq(members.role, "steward"),
            eq(members.role, "coadmin"),
            ne(spaces.membersInvite, "no"),
          ),
          cursor ? gt(spaces.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(spaces.id))
      .limit(11);
    const pagina = linhas.slice(0, 10);
    return {
      contato,
      mundos: pagina
        .filter(
          (m) =>
            jogoAbre(m.jogo) &&
            podeConvidar(m.papel, m.politica).pode &&
            (m.papel !== "coadmin" || ctx.origem.tipo === "adulto") &&
            (m.papel !== "steward" || m.responsavelId === autor.perfilId),
        )
        .map((m) => ({ id: m.id, nome: m.nome, jogo: jogoDoCatalogo(m.jogo).nome })),
      proximo: linhas.length > 10 ? (pagina.at(-1)?.id ?? null) : null,
    };
  });
}
