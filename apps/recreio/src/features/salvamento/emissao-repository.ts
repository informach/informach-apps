import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq } from "@informach/db";
import { recreioSessionSavePermits as permits } from "@informach/db/schema";
import { ErroDoRecreio, PerfilIdSchema, type SessaoDeJogoId } from "@informach/recreio";
import { MARGEM_DE_SALVAMENTO_S } from "@informach/recreio/contrato";
import type { Emissor, TokenEmitido } from "@informach/recreio/emissor";
import type { Admissao } from "@/features/autoridade-de-jogo/repository";
import { jogoDoCatalogo } from "@/features/jogos/config";
import { env } from "@/lib/env";
import type { Transacao } from "@/lib/repository";

/** A transação normal já admitiu o perfil/mutex/aparelho e criou ou travou o SID. */
export async function emitirPermissaoDeSalvamento(
  tx: Transacao,
  admissao: Admissao,
  entrada: {
    sid: SessaoDeJogoId;
    jogo: string;
    emissor: Emissor;
    token: TokenEmitido;
    operacao: "abrir" | "renovar" | "recuperar";
    suportaSalvamento?: boolean;
  },
) {
  if (
    env.RECREIO_CHECKPOINT_MODE !== "on" ||
    (entrada.operacao === "abrir" && !entrada.suportaSalvamento)
  )
    return undefined;
  const capacidades = jogoDoCatalogo(entrada.jogo).capacidades;
  if (capacidades.checkpoint !== "perfil" && capacidades.checkpoint !== "servidor")
    return undefined;
  const modo = capacidades.checkpoint === "perfil" ? "profile" : "server";
  if ((modo === "profile") !== (capacidades.mundos === null))
    throw new ErroDoRecreio("INDISPONIVEL");
  const perfilId = PerfilIdSchema.parse(admissao.perfil.id);
  let [recibo] = await tx
    .select()
    .from(permits)
    .where(and(eq(permits.sessionId, entrada.sid), eq(permits.profileId, perfilId)))
    .for("update");
  const agora = await admissao.conferirPrazo();
  const expiraEm = new Date(entrada.token.expiraEm.getTime() + MARGEM_DE_SALVAMENTO_S * 1000);
  if (entrada.operacao === "abrir") {
    if (recibo) throw new ErroDoRecreio("INDISPONIVEL");
    [recibo] = await tx
      .insert(permits)
      .values({
        sessionId: entrada.sid,
        profileId: perfilId,
        policyVersion: admissao.versaoDaPolitica,
        mode: modo,
        createdAt: agora,
        renewedAt: agora,
        cutoffAt: entrada.token.expiraEm,
        expiresAt: expiraEm,
      })
      .returning();
    if (!recibo) throw new ErroDoRecreio("INDISPONIVEL");
    await logAuditEventStrict(
      "recreio.session_save_prepared",
      admissao.contaId,
      {
        app: "recreio",
        sessionId: entrada.sid,
        profileId: perfilId,
        gameId: entrada.jogo,
        savePermitId: recibo.id,
      },
      { writer: tx },
    );
  } else {
    // Um cliente antigo não passa a receber campos novos depois de já ter aberto.
    if (!recibo) return undefined;
    if (
      recibo.status !== "ready" ||
      recibo.policyVersion !== admissao.versaoDaPolitica ||
      recibo.mode !== modo
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    if (entrada.operacao === "renovar") {
      [recibo] = await tx
        .update(permits)
        .set({ renewedAt: agora, cutoffAt: entrada.token.expiraEm, expiresAt: expiraEm })
        .where(eq(permits.id, recibo.id))
        .returning();
    }
  }
  if (!recibo || expiraEm > recibo.expiresAt) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const emitida = await entrada.emissor.salvamento({
    sid: entrada.sid,
    jogo: entrada.jogo,
    perfilId: perfilId,
    versaoDaPolitica: admissao.versaoDaPolitica,
    reciboId: recibo.id,
    agora: await admissao.conferirPrazo(),
    fimDaConcessao: entrada.token.expiraEm,
  });
  if (emitida.expiraEm > recibo.expiresAt) throw new ErroDoRecreio("INDISPONIVEL");
  return { token: emitida.token, expiraEm: emitida.expiraEm.toISOString() };
}
