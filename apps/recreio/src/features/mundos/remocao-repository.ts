import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, sql } from "@informach/db";
import { recreioGameSessions as games, recreioSpaceMembers as members } from "@informach/db/schema";
import { encerrarSessoesAbertas, travarEncerramentos } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { prepararRevogacaoDeConvites } from "./convites-revogacao-repository";
import { type AutorDaResponsabilidade, contextoDaGestao, limitarGestao } from "./gestao-repository";
import { revogarPropostasDoMembro } from "./responsabilidade-repository";

/** Encerrar um vínculo nunca apaga conteúdo ou a identidade histórica do membro. */
export async function registrarRemocao(
  autor: AutorDaResponsabilidade,
  mundoId: string,
  membroId: string,
) {
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    const ctx = await contextoDaGestao(tx, autor, mundoId, membroId);
    assertAllowed(
      ctx.proprio.state !== "former" &&
        ctx.proprio.role === "steward" &&
        ctx.mundo.responsavel === autor.perfilId,
      "RESPONSAVEL",
      "Somente o responsável atual pode remover um membro deste mundo.",
    );
    assertAllowed(
      ctx.outro.role !== "steward" && ctx.outro.profileId !== ctx.mundo.responsavel,
      "RESPONSAVEL",
      "Transfira a responsabilidade antes de encerrar esse vínculo.",
    );
    await ctx.conferirPrazo(true);
    if (ctx.outro.state === "former") return { removeu: false };
    const revogarConvites = await prepararRevogacaoDeConvites(tx, ctx.mundo.id, ctx.outro.id);
    await revogarPropostasDoMembro(tx, ctx.mundo.id, ctx.outro.id, autor.contaId);
    // O perfil pode já ter sido excluído; o membro histórico continua existindo.
    const filtro = sql`${games.spaceId} = ${ctx.mundo.id} and ${games.profileId} = ${ctx.outro.profileId}`;
    await travarEncerramentos(tx);
    await tx
      .select({ id: games.id })
      .from(games)
      .where(and(isNull(games.endedAt), filtro))
      .for("update");
    await ctx.conferirPrazo(true);
    await revogarConvites(autor.contaId, "member_removed");
    await tx
      .update(members)
      .set({ state: "former", leftAt: AGORA })
      .where(eq(members.id, ctx.outro.id));
    await encerrarSessoesAbertas(tx, filtro, "permissions_changed", {
      porQuem: "ator",
      contaId: autor.contaId,
    });
    await logAuditEventStrict(
      "recreio.space_member_removed",
      autor.contaId,
      {
        app: "recreio",
        spaceId: ctx.mundo.id,
        memberId: ctx.outro.id,
        profileId: ctx.outro.profileId,
      },
      { writer: tx },
    );
    return { removeu: true };
  });
}
