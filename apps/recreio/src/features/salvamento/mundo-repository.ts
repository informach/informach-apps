import "server-only";
import { createHash } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, type MundoId, PerfilIdSchema } from "@informach/recreio";
import { EstadoDeSalvamentoSchema, type SalvamentoDoHost } from "@informach/recreio/contrato";
import { limitesDoJogo } from "@/features/jogos/config";
import { conferirFotografiaDeCheckpoint } from "@/features/posse/prova-fotografia";
import { conferirConteudoDoMundo, conferirPosse } from "@/features/posse/repository";
import type { Host } from "@/features/posse/service";
import { conferirParticipacaoParaEncerramento } from "@/features/visitas/encerramento-contexto-repository";
import type { Transacao } from "@/lib/repository";
import { concluirSalvamentoNoBanco, prepararSalvamentoNoBanco } from "./repository";

/** Segredo/instância só alcançam a posse atual e o SID já vinculado a este mundo. */
export async function salvarSessaoDoMundoNoBanco(
  host: Host,
  mundoId: MundoId,
  entrada: SalvamentoDoHost,
) {
  const [escopo] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.id, mundoId), eq(spaces.gameId, host.jogo)));
  if (!escopo) throw new ErroDoRecreio("NAO_ENCONTRADO");
  const [pista] = await db
    .select({
      perfilId: games.profileId,
      reciboId: permits.id,
      versao: permits.policyVersion,
      expiraEm: permits.expiresAt,
    })
    .from(games)
    .innerJoin(
      permits,
      and(
        eq(permits.sessionId, games.id),
        eq(permits.profileId, games.profileId),
        eq(permits.mode, "server"),
      ),
    )
    .where(and(eq(games.id, entrada.sid), eq(games.gameId, host.jogo), eq(games.spaceId, mundoId)));
  if (!pista) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const capacidade = {
    reciboId: pista.reciboId,
    sid: entrada.sid,
    perfilId: PerfilIdSchema.parse(pista.perfilId),
    jogo: host.jogo,
    versaoDaPolitica: pista.versao,
    expiraEm: pista.expiraEm.getTime(),
  };
  const posse = { ...host, mundoId, cerca: entrada.cerca };
  const conferir = async (tx: Transacao) => {
    await conferirPosse(tx, posse);
  };
  const validar = async (
    tx: Transacao,
    politica: Parameters<typeof conferirConteudoDoMundo>[3],
  ) => {
    const { mundo } = await conferirPosse(tx, posse);
    const [sessao] = await tx
      .select({ mundoId: games.spaceId, encerradaEm: games.endedAt })
      .from(games)
      .where(eq(games.id, entrada.sid));
    if (sessao?.mundoId !== mundoId) throw new ErroDoRecreio("SEM_PERMISSAO");
    await conferirParticipacaoParaEncerramento(tx, {
      mundoId,
      perfilId: pista.perfilId,
      sid: entrada.sid,
    });
    await conferirConteudoDoMundo(tx, mundo, host.jogo, politica);
    return { mundo, sessao };
  };
  const opcoes = { modo: "server" as const, antesDoPerfil: conferir, conferirFinal: conferir };
  const resultado =
    entrada.operacao === "preparar"
      ? await prepararSalvamentoNoBanco(capacidade, {
          ...opcoes,
          validar: async (tx, admissao) => {
            await validar(tx, admissao.politica?.politica ?? null);
          },
        })
      : await concluirSalvamentoNoBanco(
          capacidade,
          createHash("sha256")
            .update("recreio:world-final-save:v1\0")
            .update(JSON.stringify({ mundoId, ...entrada }))
            .digest("hex"),
          {
            ...opcoes,
            persistir: async (tx, _contaId, _recibo, admissao) => {
              const { mundo, sessao } = await validar(tx, admissao.politica?.politica ?? null);
              if (!sessao.encerradaEm) throw new ErroDoRecreio("CHECKPOINT_NECESSARIO");
              await conferirFotografiaDeCheckpoint(tx, {
                mundoId,
                cerca: entrada.cerca,
                revisao: entrada.revisao,
                diarioSeq: entrada.diarioSeq,
                diarioAtual: mundo.journalSeq,
                fotografiaMaxBytes: limitesDoJogo(host.jogo).fotografiaMaxBytes,
                criadaApos: sql`(select ended_at from recreio.game_sessions where id=${entrada.sid}::uuid)`,
              });
              return {
                status: "completed",
                results: null,
                checkpointSpaceId: mundoId,
                checkpointFence: entrada.cerca,
                checkpointRevision: entrada.revisao,
                checkpointJournalSeq: entrada.diarioSeq,
              };
            },
          },
        );
  return EstadoDeSalvamentoSchema.parse({
    estado: resultado.recibo.status,
    expiraEm: resultado.expiraEm.toISOString(),
  });
}
