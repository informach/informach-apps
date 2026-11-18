import "server-only";
import { and, db, desc, eq, gt, lt, or } from "@informach/db";
import {
  recreioDirectedSpaceInvites as invites,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { MundoIdSchema, type PerfilId, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import {
  type CaixaDeConvitesDirigidos,
  ConsultaDeConvitesDirigidosSchema,
} from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { comLeitorDeRecibosSociais } from "@/features/social/leitura-de-recibos-repository";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import type { Transacao } from "@/lib/repository";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "./convites-dirigidos-amizade-repository";
import {
  type ContextoDeConvite,
  comLeitorDoConvite,
} from "./convites-dirigidos-contexto-repository";
import {
  aprovacoesDoConvite,
  type ConviteDoMundo,
  conferirRevisoesDoConvite,
  resumoDoConvite,
} from "./convites-dirigidos-estado-repository";

/** Só recibos próprios: sem nomes, presença, contas, papéis ou conteúdo do mundo. */
export async function caixaDeConvitesDirigidos(
  autor: AutorDeMundos | { responsavel: AutorNativoRecente; perfilId: PerfilId },
  entrada: unknown,
): Promise<CaixaDeConvitesDirigidos> {
  const consulta = ConsultaDeConvitesDirigidosSchema.parse(entrada);
  await limitarTentativas({
    chave: `convite-dirigido-consulta:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  const ler = async (tx: Transacao, conferirPrazo: () => Promise<Date>) => {
    const agora = await conferirPrazo();
    const linhas = await tx
      .select({
        convite: {
          id: invites.id,
          spaceId: invites.spaceId,
          originProfileId: invites.originProfileId,
          targetProfileId: invites.targetProfileId,
          state: invites.state,
          createdAt: invites.createdAt,
          expiresAt: invites.expiresAt,
        },
        jogo: spaces.gameId,
      })
      .from(invites)
      .innerJoin(spaces, eq(spaces.id, invites.spaceId))
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
      convites: pagina.map(({ convite: c, jogo }) => ({
        conviteId: c.id,
        mundoId: MundoIdSchema.parse(c.spaceId),
        jogo,
        estado: c.state,
        expiraEm: c.expiresAt.toISOString(),
        perfilId: PerfilIdSchema.parse(
          c.originProfileId === autor.perfilId ? c.targetProfileId : c.originProfileId,
        ),
        direcao:
          c.originProfileId === autor.perfilId ? ("enviado" as const) : ("recebido" as const),
        criadoEm: c.createdAt.toISOString(),
      })),
      proximo:
        linhas.length > 10 && ultimo ? { em: ultimo.createdAt.toISOString(), id: ultimo.id } : null,
    };
  };
  return comLeitorDeRecibosSociais(autor, ler);
}

async function comReciboDoPerfil<T>(
  autor: AutorDeMundos,
  entrada: unknown,
  executar: (tx: Transacao, ctx: ContextoDeConvite, convite: ConviteDoMundo) => Promise<T>,
) {
  const id = UuidSchema.parse(entrada);
  await limitarTentativas({
    chave: `convite-dirigido-consulta:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  const [pista] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, id),
        or(
          eq(invites.originProfileId, autor.perfilId),
          eq(invites.targetProfileId, autor.perfilId),
        ),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Convite não disponível.");
  return comLeitorDoConvite(
    autor,
    {
      mundoId: MundoIdSchema.parse(pista.spaceId),
      origemId: PerfilIdSchema.parse(pista.originProfileId),
      destinoId: PerfilIdSchema.parse(pista.targetProfileId),
      conviteId: id,
    },
    async (tx, ctx) => {
      const [convite] = await tx.select().from(invites).where(eq(invites.id, id));
      assertAllowed(
        convite &&
          convite.spaceId === ctx.mundo.id &&
          convite.originProfileId === pista.originProfileId &&
          convite.targetProfileId === pista.targetProfileId &&
          convite.retainUntil > (await ctx.conferirPrazo()),
        "PEDIDO",
        "Convite não disponível.",
      );
      if (convite.state === "pending") {
        const amizade = await amizadeAtualDoConvite(tx, ctx);
        conferirRevisoesDoConvite(ctx, convite, amizade.revision);
        assertAllowed(
          convite.expiresAt > (await ctx.conferirPrazo()),
          "PEDIDO",
          "O convite venceu.",
        );
      }
      return executar(tx, ctx, convite);
    },
  );
}

export function consultarConviteDirigido(autor: AutorDeMundos, entrada: unknown) {
  return comReciboDoPerfil(autor, entrada, async (tx, ctx, convite) =>
    resumoDoConvite(convite, ctx.mundo.gameId, await aprovacoesDoConvite(tx, ctx, convite)),
  );
}
/** O recibo histórico não autoriza ler nomes ou metadados atuais de um mundo. */
export function conferirConviteDirigido(autor: AutorDeMundos, entrada: unknown) {
  return comReciboDoPerfil(autor, entrada, async (tx, ctx, convite) => {
    assertAllowed(
      convite.state === "pending",
      "PEDIDO",
      "Este convite já foi concluído. Confira o recibo.",
    );
    await conferirConteudoDoConvite(tx, ctx);
    const origem = ctx.composicao.perfis.find((p) => p.id === convite.originProfileId),
      destino = ctx.composicao.perfis.find((p) => p.id === convite.targetProfileId);
    assertAllowed(origem && destino, "PEDIDO", "Convite não disponível.");
    return {
      convite: resumoDoConvite(
        convite,
        ctx.mundo.gameId,
        await aprovacoesDoConvite(tx, ctx, convite),
      ),
      nomeDoMundo: ctx.mundo.name,
      origem: { apelido: origem.nickname, avatar: origem.avatar },
      destino: { apelido: destino.nickname, avatar: destino.avatar },
    };
  });
}
