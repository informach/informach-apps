import "server-only";
import { and, desc, eq, gt, lt, or } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { PerfilIdSchema, UuidSchema } from "@informach/recreio";
import { type CaixaDeVisitas, ConsultaDeVisitasSchema } from "@informach/recreio/contrato";
import {
  comLeitorDeRecibosSociais,
  type LeitorDeRecibosSociais,
} from "@/features/social/leitura-de-recibos-repository";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { decisaoDaVisita } from "./recibos";

/** Pistas próprias e concessões históricas; nenhum nome/presença ou promessa de entrada. */
export async function caixaDeVisitas(
  autor: LeitorDeRecibosSociais,
  entrada: unknown,
): Promise<CaixaDeVisitas> {
  const consulta = ConsultaDeVisitasSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-consulta:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return comLeitorDeRecibosSociais(autor, async (tx, conferirPrazo) => {
    const agora = await conferirPrazo();
    // Uma única leitura MVCC inclui raiz/concessão. Não toma trava de mundo
    // depois da de perfil, nem faz uma consulta por item.
    const linhas = await tx
      .select({ convite: invites, jogo: spaces.gameId, visita: visits })
      .from(invites)
      .innerJoin(spaces, eq(spaces.id, invites.spaceId))
      .leftJoin(visits, eq(visits.inviteId, invites.id))
      .where(
        and(
          or(
            eq(invites.originProfileId, autor.perfilId),
            eq(invites.targetProfileId, autor.perfilId),
          ),
          gt(invites.retainUntil, agora),
          "sid" in autor ? eq(spaces.gameId, autor.jogo) : undefined,
          consulta.aposEm && consulta.aposId
            ? or(
                lt(invites.createdAt, new Date(consulta.aposEm)),
                and(
                  eq(invites.createdAt, new Date(consulta.aposEm)),
                  lt(invites.id, consulta.aposId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(invites.createdAt), desc(invites.id))
      .limit(11);
    const pagina = linhas.slice(0, 10),
      ultimo = pagina.at(-1)?.convite;
    return {
      convites: pagina.map(({ convite, jogo, visita }) => {
        const recibo = decisaoDaVisita(convite, jogo, visita);
        return {
          ...recibo.convite,
          visita: recibo.visita,
          perfilId: PerfilIdSchema.parse(
            convite.originProfileId === autor.perfilId
              ? convite.targetProfileId
              : convite.originProfileId,
          ),
          direcao:
            convite.originProfileId === autor.perfilId
              ? ("enviado" as const)
              : ("recebido" as const),
        };
      }),
      proximo:
        linhas.length > 10 && ultimo ? { em: ultimo.createdAt.toISOString(), id: ultimo.id } : null,
    };
  });
}

/** Fato próprio disponível pela gestão nativa mesmo após plano/amizade/presença terminarem. */
export async function consultarReciboDeVisita(autor: LeitorDeRecibosSociais, entrada: unknown) {
  const conviteId = UuidSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-consulta:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return comLeitorDeRecibosSociais(autor, async (tx, conferirPrazo) => {
    const [linha] = await tx
      .select({ convite: invites, jogo: spaces.gameId, visita: visits })
      .from(invites)
      .innerJoin(spaces, eq(spaces.id, invites.spaceId))
      .leftJoin(visits, eq(visits.inviteId, invites.id))
      .where(
        and(
          eq(invites.id, conviteId),
          or(
            eq(invites.originProfileId, autor.perfilId),
            eq(invites.targetProfileId, autor.perfilId),
          ),
          gt(invites.retainUntil, await conferirPrazo()),
          "sid" in autor ? eq(spaces.gameId, autor.jogo) : undefined,
        ),
      )
      .limit(1);
    assertAllowed(linha, "PEDIDO", "Convite não disponível.");
    return decisaoDaVisita(linha.convite, linha.jogo, linha.visita);
  });
}
