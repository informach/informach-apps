import "server-only";
import type { recreioSpaceVisitInvites } from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { jogoQueAbre } from "@/features/jogos/config";
import type { ContextoDeConvite } from "@/features/mundos/convites-dirigidos-contexto-repository";
import {
  comDecisorNativoDeVisita,
  type DecisaoNativa,
  type Decisor,
} from "@/features/mundos/convites-dirigidos-nativo-repository";
import { exigirNovosContatos } from "@/features/social/disponibilidade";
import { env } from "@/lib/env";
import type { Transacao } from "@/lib/repository";
import { type AnfitriaoAdmitido, admitirAnfitriaoNoContexto } from "./contexto-repository";

export type ConviteDeVisitaNoBanco = typeof recreioSpaceVisitInvites.$inferSelect;
/** Aprovação nativa recente; não exige plano do decisor, mas exige anfitrião atual. */
export async function comDecisorEAnfitriaoNaVisita<T>(
  autor: AutorNativoRecente,
  conviteId: string,
  decisao: DecisaoNativa,
  executar: (
    tx: Transacao,
    ctx: ContextoDeConvite,
    convite: ConviteDeVisitaNoBanco,
    decisor: Decisor,
    anfitriao: AnfitriaoAdmitido,
  ) => Promise<T>,
) {
  exigirNovosContatos();
  if (env.RECREIO_VISITS_MODE !== "on") throw new ErroDoRecreio("INDISPONIVEL");
  return comDecisorNativoDeVisita(autor, conviteId, decisao, async (tx, ctx, convite, decisor) => {
    if (jogoQueAbre(ctx.mundo.gameId).capacidades.visitas !== true)
      throw new ErroDoRecreio("INDISPONIVEL");
    const anfitriao = await admitirAnfitriaoNoContexto(tx, ctx, convite.hostPresenceId),
      valor = await executar(tx, ctx, convite, decisor, anfitriao);
    await anfitriao.conferirPrazo();
    return valor;
  });
}
