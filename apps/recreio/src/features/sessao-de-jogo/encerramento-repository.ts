import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, inArray, isNull, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import {
  type ContaId,
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import type { MotivoDeSessaoEncerrada } from "@informach/recreio/contrato";
import { AGORA, type Transacao, travar } from "@/lib/repository";

/** Cursor comum: admitir sua trava antes de qualquer linha de game_sessions. */
const TRAVA_DOS_ENCERRAMENTOS = "recreio:game_sessions:encerramento";

/** Admite a ordem de encerramento antes de travar as sessões e reler a autoridade. */
export async function travarEncerramentos(tx: Transacao): Promise<void> {
  await travar(tx, TRAVA_DOS_ENCERRAMENTOS);
}

export type SessaoEncerrada = { sid: SessaoDeJogoId; perfilId: PerfilId; jogo: string };

/**
 * Encerra as sessões de jogo abertas que casam com `filtro`, dentro da
 * transação de quem chama, e grava um evento de auditoria por sessão na mesma
 * transação. Repetir não faz nada: sessão já encerrada não casa mais.
 *
 * `porQuem` diz quem causou o fim: a `conta` da própria sessão (sair do jogo,
 * sair da conta, continuar em outro aparelho) ou o `recreio` (acesso perdido,
 * prazo vencido). No evento, a conta da sessão vai sempre em `targetId`, e é
 * também o ator quando foi ela. Uma ação de outra conta usa `ator` com a
 * identidade autenticada de quem agiu; não atribuir a decisão à conta afetada.
 */
export async function encerrarSessoesAbertas(
  tx: Transacao,
  filtro: ReturnType<typeof sql>,
  motivo: MotivoDeSessaoEncerrada,
  opcoes: { porQuem: "conta" | "recreio" } | { porQuem: "ator"; contaId: ContaId },
): Promise<SessaoEncerrada[]> {
  await travarEncerramentos(tx);
  const encerradas = await tx
    .update(gameSessions)
    .set({
      endedAt: AGORA,
      endReason: motivo,
      endedSeq: sql`nextval('recreio.game_session_end_seq')`,
    })
    .where(and(isNull(gameSessions.endedAt), filtro))
    .returning({
      id: gameSessions.id,
      profileId: gameSessions.profileId,
      gameId: gameSessions.gameId,
      deviceSessionId: gameSessions.deviceSessionId,
    });
  if (encerradas.length === 0) return [];
  const donos = await tx
    .select({ id: profiles.id, userId: profiles.userId })
    .from(profiles)
    .where(
      inArray(
        profiles.id,
        encerradas.map((sessao) => sessao.profileId),
      ),
    );
  const contaDoPerfil = new Map(donos.map((perfil) => [perfil.id, perfil.userId]));
  for (const sessao of encerradas) {
    const conta = contaDoPerfil.get(sessao.profileId) ?? null;
    const atorId =
      opcoes.porQuem === "ator" ? opcoes.contaId : opcoes.porQuem === "conta" ? conta : null;
    await logAuditEventStrict(
      "recreio.game_session_ended",
      atorId,
      {
        app: "recreio",
        sessionId: sessao.id,
        profileId: sessao.profileId,
        gameId: sessao.gameId,
        reason: motivo,
        targetId: conta,
      },
      { writer: tx },
    );
  }
  return encerradas.map((sessao) => ({
    sid: SessaoDeJogoIdSchema.parse(sessao.id),
    perfilId: PerfilIdSchema.parse(sessao.profileId),
    jogo: sessao.gameId,
  }));
}
