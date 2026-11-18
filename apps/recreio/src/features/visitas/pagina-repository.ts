import "server-only";
import { and, db, eq } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import {
  ehErroDoRecreio,
  type MundoId,
  MundoIdSchema,
  PerfilIdSchema,
  UuidSchema,
} from "@informach/recreio";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { carregarConcessaoDaVisita, conferirConcessaoDaVisita } from "./concessao-atual-repository";
import { comJogadorEAnfitriaoNaVisita } from "./contexto-repository";
import { recusaDeVisita } from "./http";

/** Nome só após composição atual; não emite ingresso/SID, admite jogador ou aloca posse. */
export async function mundoAtualDaVisita(
  autor: ReferenciaDeJogador,
  jogo: string,
  mundoId: MundoId,
  entrada: string,
): Promise<{ id: MundoId; nome: string } | null> {
  const visitaId = UuidSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-previa:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  const [pista] = await db
    .select({ visita: visits, convite: invites })
    .from(visits)
    .innerJoin(invites, eq(invites.id, visits.inviteId))
    .innerJoin(spaces, eq(spaces.id, visits.spaceId))
    .where(
      and(
        eq(visits.id, visitaId),
        eq(visits.visitorProfileId, autor.perfilId),
        eq(visits.spaceId, mundoId),
        eq(spaces.gameId, jogo),
      ),
    );
  if (!pista) return null;
  try {
    return await comJogadorEAnfitriaoNaVisita(
      autor,
      {
        mundoId,
        origemId: PerfilIdSchema.parse(pista.convite.originProfileId),
        destinoId: autor.perfilId,
        conviteId: pista.convite.id,
      },
      pista.visita.hostPresenceId,
      async (tx, ctx, anfitriao) => {
        if (ctx.mundo.gameId !== jogo) return null;
        const concessao = await carregarConcessaoDaVisita(tx, ctx, anfitriao, autor.perfilId, {
          conviteId: pista.convite.id,
          visitaId,
        });
        const conferirPrazo = await conferirConcessaoDaVisita(
          tx,
          ctx,
          anfitriao,
          autor.perfilId,
          concessao,
        );
        await conferirPrazo();
        return { id: MundoIdSchema.parse(ctx.mundo.id), nome: ctx.mundo.name };
      },
    );
  } catch (erro) {
    const recusa = recusaDeVisita(erro);
    if (
      ehErroDoRecreio(recusa) &&
      [
        "NAO_AUTENTICADO",
        "SEM_PERFIL",
        "NAO_ENCONTRADO",
        "CONVITE_INVALIDO",
        "SESSAO_INVALIDA",
        "SESSAO_ENCERRADA",
        "POSSE_PERDIDA",
        "POSSE_DE_OUTRA_INSTANCIA",
        "ACESSO_NEGADO",
        "ACESSO_PERDIDO",
        "POLITICA_INCOMPATIVEL",
        "SEM_PERMISSAO",
        "JA_MEMBRO",
        "REVISAO_DIVERGENTE",
        "JOGO_INDISPONIVEL",
      ].includes(recusa.codigo)
    )
      return null;
    throw recusa;
  }
}
