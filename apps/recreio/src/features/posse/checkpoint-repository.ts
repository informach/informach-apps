import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, type MundoId, PerfilIdSchema } from "@informach/recreio";
import type { CheckpointDoHost } from "@informach/recreio/contrato";
import { confirmarCheckpointDoJogo } from "@/features/sessao-de-jogo/checkpoint-repository";
import { conferirFotografiaDeCheckpoint } from "./prova-fotografia";
import { conferirConteudoDoMundo, conferirPosse } from "./repository";
import type { Host } from "./service";

/** O jogo é o do segredo. A posse precede perfil/aparelho/sessão e permanece travada até o commit. */
export async function confirmarCheckpointDoMundoNoBanco(
  host: Host,
  mundoId: MundoId,
  entrada: CheckpointDoHost,
) {
  const [escopo] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.id, mundoId), eq(spaces.gameId, host.jogo)));
  if (!escopo) throw new ErroDoRecreio("NAO_ENCONTRADO");
  const [pista] = await db
    .select({
      perfilId: games.profileId,
      expiraEm: games.expiresAt,
      versao: handoffs.policyVersion,
    })
    .from(games)
    .innerJoin(
      handoffs,
      and(
        eq(handoffs.id, entrada.id),
        eq(handoffs.fromSessionId, games.id),
        eq(handoffs.profileId, games.profileId),
      ),
    )
    .where(and(eq(games.id, entrada.sid), eq(games.gameId, host.jogo)));
  if (!pista) throw new ErroDoRecreio("SESSAO_ENCERRADA");
  const posse = { ...host, mundoId, cerca: entrada.cerca };
  return confirmarCheckpointDoJogo(
    {
      sid: entrada.sid,
      perfilId: PerfilIdSchema.parse(pista.perfilId),
      jogo: host.jogo,
      expiraEm: pista.expiraEm.getTime(),
      versaoDaPolitica: pista.versao,
    },
    entrada,
    {
      modo: "server",
      antesDoPerfil: async (tx) => {
        await conferirPosse(tx, posse);
      },
      conferirFinal: async (tx) => {
        await conferirPosse(tx, posse);
      },
      validar: async (tx, pedido, admissao) => {
        const { mundo } = await conferirPosse(tx, posse);
        const [sessao] = await tx
          .select({ mundoId: games.spaceId })
          .from(games)
          .where(eq(games.id, entrada.sid));
        const [membro] = await tx
          .select({ estado: members.state })
          .from(members)
          .where(and(eq(members.spaceId, mundoId), eq(members.profileId, pista.perfilId)));
        if (sessao?.mundoId !== mundoId || membro?.estado !== "active")
          throw new ErroDoRecreio("SEM_PERMISSAO");
        await conferirConteudoDoMundo(tx, mundo, host.jogo, admissao.politica?.politica ?? null);
        if (!entrada.confirmado) return null;
        const prova = {
          mundoId,
          cerca: entrada.cerca,
          revisao: entrada.revisao,
          diarioSeq: entrada.diarioSeq,
        };
        if (pedido.status === "confirmed") {
          if (
            pedido.checkpointSpaceId !== mundoId ||
            pedido.checkpointFence !== entrada.cerca ||
            pedido.checkpointRevision !== entrada.revisao ||
            pedido.checkpointJournalSeq !== entrada.diarioSeq
          )
            throw new ErroDoRecreio("SEM_PERMISSAO");
          return prova;
        }
        await conferirFotografiaDeCheckpoint(tx, {
          ...prova,
          diarioAtual: mundo.journalSeq,
          criadaApos: sql`(select requested_at from recreio.session_handoffs where id=${pedido.id}::uuid)`,
        });
        return prova;
      },
    },
  );
}
