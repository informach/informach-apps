import "server-only";
import { and, db, eq, or } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { MundoIdSchema, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import type { DetalheDeConviteDeVisita, ReciboDeVisita } from "@informach/recreio/contrato";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import {
  aprovacoesDaVisita,
  conferirRevisoesDoConvite,
} from "@/features/mundos/convites-dirigidos-estado-repository";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { carregarConcessaoDaVisita, conferirConcessaoDaVisita } from "./concessao-atual-repository";
import { comJogadorEAnfitriaoNaVisita } from "./contexto-repository";
import { reciboDaVisita, reciboDoConviteDeVisita } from "./recibos";

/** Dados atuais só após amizade/conteúdo/partes/presença; histórico usa o leitor técnico. */
export async function conferirConviteDeVisita(
  autor: AutorDeMundos,
  entrada: unknown,
): Promise<DetalheDeConviteDeVisita> {
  const conviteId = UuidSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-conferencia:${autor.perfilId}`,
    max: 60,
    janelaEmSegundos: 600,
  });
  const [pista] = await db
    .select({ convite: invites })
    .from(invites)
    .innerJoin(spaces, eq(spaces.id, invites.spaceId))
    .where(
      and(
        eq(invites.id, conviteId),
        or(
          eq(invites.originProfileId, autor.perfilId),
          eq(invites.targetProfileId, autor.perfilId),
        ),
        "sid" in autor ? eq(spaces.gameId, autor.jogo) : undefined,
      ),
    );
  assertAllowed(pista, "PEDIDO", "Convite não disponível.");
  const origemId = PerfilIdSchema.parse(pista.convite.originProfileId),
    destinoId = PerfilIdSchema.parse(pista.convite.targetProfileId);
  return comJogadorEAnfitriaoNaVisita(
    autor,
    {
      mundoId: MundoIdSchema.parse(pista.convite.spaceId),
      origemId,
      destinoId,
      conviteId,
    },
    pista.convite.hostPresenceId,
    async (tx, ctx, anfitriao) => {
      const [convite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, conviteId))
        .for("share");
      const agora = await anfitriao.conferirPrazo();
      assertAllowed(
        convite &&
          convite.spaceId === ctx.mundo.id &&
          convite.originProfileId === origemId &&
          convite.targetProfileId === destinoId &&
          convite.hostPresenceId === anfitriao.presenca.id &&
          convite.retainUntil > agora &&
          (convite.state === "pending" || convite.state === "accepted"),
        "PEDIDO",
        "Este convite já foi concluído. Confira o recibo.",
      );
      let visita: ReciboDeVisita | null = null;
      let conferirPrazo = anfitriao.conferirPrazo;
      if (convite.state === "accepted") {
        const [concedida] = await tx
          .select({ id: visits.id })
          .from(visits)
          .where(eq(visits.inviteId, convite.id));
        if (!concedida) throw new Error("Convite de visita aceito sem concessão correspondente.");
        const concessao = await carregarConcessaoDaVisita(tx, ctx, anfitriao, destinoId, {
          conviteId,
          visitaId: concedida.id,
        });
        conferirPrazo = await conferirConcessaoDaVisita(tx, ctx, anfitriao, destinoId, concessao);
        visita = reciboDaVisita(concessao.visita);
      } else {
        assertAllowed(convite.expiresAt > agora, "PEDIDO", "O convite venceu.");
        const amizade = await amizadeAtualDoConvite(tx, ctx);
        conferirRevisoesDoConvite(ctx, convite, amizade.revision);
        await conferirConteudoDoConvite(tx, ctx);
      }
      const aprovacoes =
          convite.state === "pending" ? await aprovacoesDaVisita(tx, ctx, convite) : null,
        origem = ctx.composicao.perfis.find((p) => p.id === origemId),
        destino = ctx.composicao.perfis.find((p) => p.id === destinoId);
      assertAllowed(origem && destino, "PEDIDO", "Convite não disponível.");
      const fim = await conferirPrazo();
      assertAllowed(
        convite.state !== "pending" || convite.expiresAt > fim,
        "PEDIDO",
        "O convite venceu.",
      );
      return {
        direcao: convite.originProfileId === autor.perfilId ? "enviado" : "recebido",
        convite: {
          ...reciboDoConviteDeVisita(convite, ctx.mundo.gameId),
          aguardaMundo: aprovacoes !== null && !aprovacoes.mundo,
          aguardaOrigem: aprovacoes !== null && !aprovacoes.origem,
          aguardaDestino: aprovacoes !== null && !aprovacoes.destino,
        },
        visita,
        nomeDoMundo: ctx.mundo.name,
        origem: { apelido: origem.nickname, avatar: origem.avatar },
        destino: { apelido: destino.nickname, avatar: destino.avatar },
      };
    },
  );
}
