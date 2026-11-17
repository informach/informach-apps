import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray, lte } from "@informach/db";
import { recreioSessionHandoffs as handoffs } from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { IngressoVerificado } from "@informach/recreio/contrato";
import type { Admissao } from "@/features/autoridade-de-jogo/repository";
import { jogoDoCatalogo } from "@/features/jogos/config";
import type { Transacao } from "@/lib/repository";

/** Emissão já admitiu perfil, mutex e aparelho. Não toma linha de sessão antes do cursor. */
export async function prepararTrocaDeAparelho(
  tx: Transacao,
  admissao: Admissao,
  ingresso: IngressoVerificado,
  anterior: {
    id: string;
    jogo: string;
    mundoId: string | null;
    expiraEm: Date;
    congeladaEm: Date | null;
  },
): Promise<{ pronta: true; id: string; expiraEm: Date } | { pronta: false; erro: ErroDoRecreio }> {
  const agora = await admissao.conferirPrazo();
  const capacidades = jogoDoCatalogo(anterior.jogo).capacidades;
  const modo = capacidades.mundos ? "server" : "profile";
  if (
    modo === "server"
      ? capacidades.checkpoint !== "servidor" || !anterior.mundoId
      : capacidades.checkpoint !== "perfil"
  )
    return { pronta: false, erro: new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "manual" }) };
  await tx
    .update(handoffs)
    .set({ status: "expired", finishedAt: agora })
    .where(
      and(
        eq(handoffs.fromSessionId, anterior.id),
        inArray(handoffs.status, ["requested", "confirmed"]),
        lte(handoffs.expiresAt, agora),
      ),
    );
  const [propria] = await tx.select().from(handoffs).where(eq(handoffs.ticketJti, ingresso.jti));
  if (propria) {
    if (
      propria.fromSessionId !== anterior.id ||
      propria.profileId !== ingresso.perfilId ||
      propria.toDeviceSessionId !== ingresso.sessaoDeAparelhoId ||
      propria.policyVersion !== admissao.versaoDaPolitica ||
      propria.mode !== modo
    )
      throw new ErroDoRecreio("INGRESSO_INVALIDO");
    if (
      propria.status === "confirmed" &&
      propria.expiresAt > agora &&
      anterior.congeladaEm !== null &&
      propria.confirmedAt?.getTime() === anterior.congeladaEm.getTime() &&
      (modo === "profile" || propria.checkpointSpaceId === anterior.mundoId)
    )
      return { pronta: true, id: propria.id, expiraEm: propria.expiresAt };
    return {
      pronta: false,
      erro: new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: propria.status }),
    };
  }
  const [pendente] = await tx
    .select({ id: handoffs.id })
    .from(handoffs)
    .where(
      and(
        eq(handoffs.fromSessionId, anterior.id),
        inArray(handoffs.status, ["requested", "confirmed"]),
      ),
    );
  if (pendente || anterior.congeladaEm !== null)
    return { pronta: false, erro: new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "pending" }) };
  const expiraEm = new Date(
    Math.min(agora.getTime() + 30_000, ingresso.expiraEm, anterior.expiraEm.getTime()),
  );
  if (expiraEm.getTime() - agora.getTime() < 2000)
    return { pronta: false, erro: new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "manual" }) };
  const [pedido] = await tx
    .insert(handoffs)
    .values({
      profileId: ingresso.perfilId,
      fromSessionId: anterior.id,
      toDeviceSessionId: ingresso.sessaoDeAparelhoId,
      ticketJti: ingresso.jti,
      policyVersion: admissao.versaoDaPolitica,
      mode: modo,
      requestedAt: agora,
      expiresAt: expiraEm,
    })
    .returning({ id: handoffs.id });
  if (!pedido) throw new ErroDoRecreio("INDISPONIVEL");
  await logAuditEventStrict(
    "recreio.session_handoff_requested",
    admissao.contaId,
    {
      app: "recreio",
      profileId: ingresso.perfilId,
      sessionId: anterior.id,
      handoffId: pedido.id,
      targetId: admissao.contaId,
    },
    { writer: tx },
  );
  await admissao.conferirPrazo();
  return { pronta: false, erro: new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "requested" }) };
}
