import "server-only";
import { and, eq, gt, isNull } from "@informach/db";
import { recreioGameSessions as games } from "@informach/db/schema";
import { ErroDoRecreio, type PerfilId, SessaoDeAparelhoIdSchema } from "@informach/recreio";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import type { Transacao } from "@/lib/repository";

/** Só um booleano, a partir de contato recente e autoridade física ainda válida. */
export async function presencaDePartidaAtual(tx: Transacao, perfilId: PerfilId, agora: Date) {
  const [jogo] = await tx
    .select()
    .from(games)
    .where(and(eq(games.profileId, perfilId), isNull(games.endedAt), gt(games.expiresAt, agora)))
    .limit(1);
  if (!jogo) return false;
  const contato =
    jogo.controlSeenAt && jogo.controlSeenAt > jogo.lastRenewedAt
      ? jogo.controlSeenAt
      : jogo.lastRenewedAt;
  if (contato > agora || agora.getTime() - contato.getTime() > 90_000) return false;
  try {
    const referencia = {
      perfilId,
      sessaoDeAparelhoId: SessaoDeAparelhoIdSchema.parse(jogo.deviceSessionId),
      jogo: jogo.gameId,
      expiraEm: jogo.expiresAt.getTime(),
    };
    const identidade = await prepararIdentidadeDoJogo(tx, referencia);
    const admitida = await admitirAparelhoDeJogo(tx, referencia, identidade, async () => {});
    if (!admitida.admitida) return false;
    await admitida.conferirPrazo();
    return true;
  } catch (erro) {
    if (
      erro instanceof ErroDoRecreio &&
      [
        "SESSAO_INVALIDA",
        "SESSAO_ENCERRADA",
        "ACESSO_PERDIDO",
        "POLITICA_INCOMPATIVEL",
        "JOGO_INDISPONIVEL",
      ].includes(erro.codigo)
    )
      return false;
    throw erro;
  }
}
