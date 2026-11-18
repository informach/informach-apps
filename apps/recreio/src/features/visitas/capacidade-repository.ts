import "server-only";
import { sql } from "@informach/db";
import { ErroDoRecreio } from "@informach/recreio";
import { jogoDoCatalogo } from "@/features/jogos/config";
import type { Transacao } from "@/lib/repository";

/** Mundo já travado: membros e visitantes disputam o mesmo orçamento. */
export async function conferirCapacidadeDeJogadores(
  tx: Transacao,
  pedido: { mundoId: string; jogo: string; sid: string },
) {
  const manifesto = jogoDoCatalogo(pedido.jogo);
  if (manifesto.capacidades.visitas !== true) return;
  const limite = manifesto.limites.jogadoresSimultaneosMax;
  if (
    limite === undefined ||
    !Number.isSafeInteger(limite) ||
    limite < (manifesto.capacidades.mundos?.membrosMax ?? 1) ||
    limite > 64
  )
    throw new ErroDoRecreio("INDISPONIVEL");
  const [total] = await tx.execute<{ valor: number }>(sql`
    select count(*)::integer as valor from recreio.game_sessions
    where space_id=${pedido.mundoId}::uuid and game_id=${pedido.jogo}
      and id<>${pedido.sid}::uuid and ended_at is null and expires_at>clock_timestamp()
  `);
  if ((total?.valor ?? 0) >= limite) throw new ErroDoRecreio("MUNDO_CHEIO");
}
