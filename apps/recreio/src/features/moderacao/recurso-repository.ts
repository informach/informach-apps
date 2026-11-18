import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, desc, eq, or } from "@informach/db";
import {
  recreioProfileRestrictions as restrictions,
  recreioRestrictionReviews as reviews,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { RecursoDaRestricao, RecursoRecebido } from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { comGestorDaRestricao } from "./restricao-contexto-repository";

const DIA = 86_400_000;
export function lerRestricaoDoPerfil(autor: AutorNativoRecente, perfilId: PerfilId) {
  return comGestorDaRestricao(autor, perfilId, true, async (tx, atual) => {
    const [restricao] = await tx
      .select({ revisao: restrictions.revision, estado: restrictions.state })
      .from(restrictions)
      .where(eq(restrictions.profileId, perfilId));
    const agora = await atual.conferirPrazo();
    const historico = await tx
      .select({
        protocolo: reviews.id,
        situacao: reviews.state,
        decisao: reviews.decision,
        recebidoEm: reviews.createdAt,
        respondidoEm: reviews.resolvedAt,
        expiraEm: reviews.expiresAt,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, perfilId),
          or(eq(reviews.state, "aberto"), eq(reviews.actorUserId, atual.contaId)),
        ),
      )
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(10);
    const [existente] = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, perfilId),
          eq(reviews.restrictionRevision, restricao?.revisao ?? atual.perfil.policyVersion),
          or(eq(reviews.state, "aberto"), eq(reviews.actorUserId, atual.contaId)),
        ),
      )
      .limit(1);
    return {
      perfilId,
      apelido: atual.perfil.nickname,
      versaoDoPerfil: atual.perfil.policyVersion,
      suspenso: atual.perfil.status === "suspended",
      podeRecorrer:
        atual.perfil.status === "suspended" &&
        (!restricao || restricao.estado === "suspended") &&
        !existente,
      recursos: historico
        .filter((r) => r.expiraEm > agora)
        .map((r) => ({
          ...r,
          recebidoEm: r.recebidoEm.toISOString(),
          respondidoEm: r.respondidoEm?.toISOString() ?? null,
          expiraEm: r.expiraEm.toISOString(),
        })),
    };
  });
}

export function pedirRevisaoDaRestricaoNoBanco(
  autor: AutorNativoRecente,
  entrada: RecursoDaRestricao,
): Promise<RecursoRecebido> {
  return comGestorDaRestricao(autor, entrada.perfilId, false, async (tx, atual) => {
    const resumo = createHash("sha256")
      .update("recreio:restriction-review:v1:")
      .update(JSON.stringify([entrada.perfilId, entrada.versaoDoPerfil, atual.contaId, atual.tipo]))
      .digest("hex");
    const [anterior] = await tx
      .select()
      .from(reviews)
      .where(and(eq(reviews.profileId, entrada.perfilId), eq(reviews.clientKey, entrada.recursoId)))
      .for("update");
    const agora = await atual.conferirPrazo();
    if (anterior) {
      assertAllowed(
        anterior.actorUserId === atual.contaId &&
          anterior.actorKind === atual.tipo &&
          anterior.requestHash === resumo &&
          anterior.expiresAt > agora,
        "CONFLITO",
        "Esta tentativa mudou ou venceu. Confira o pedido atual antes de continuar.",
      );
      return { protocolo: anterior.id, repetido: true };
    }
    assertAllowed(
      atual.perfil.status === "suspended" && atual.perfil.policyVersion === entrada.versaoDoPerfil,
      "CONFLITO",
      "A situação do perfil mudou. Reabra esta página antes de continuar.",
    );
    let [restricao] = await tx
      .select()
      .from(restrictions)
      .where(eq(restrictions.profileId, entrada.perfilId))
      .for("update");
    if (!restricao) {
      [restricao] = await tx
        .insert(restrictions)
        .values({
          profileId: entrada.perfilId,
          revision: atual.perfil.policyVersion,
          state: "suspended",
          reason: "legado_sem_recibo",
          createdAt: agora,
          updatedAt: agora,
        })
        .returning();
      await logAuditEventStrict(
        "recreio.restriction_reconciled",
        atual.contaId,
        {
          app: "recreio",
          profileId: entrada.perfilId,
          revision: atual.perfil.policyVersion,
          reason: "legado_sem_recibo",
        },
        { writer: tx },
      );
    }
    assertAllowed(
      restricao?.state === "suspended",
      "CONFLITO",
      "A situação da restrição precisa ser conferida pela equipe.",
    );
    const [existente] = await tx
      .select({ id: reviews.id, expiraEm: reviews.expiresAt })
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, entrada.perfilId),
          eq(reviews.restrictionRevision, restricao.revision),
          or(eq(reviews.state, "aberto"), eq(reviews.actorUserId, atual.contaId)),
        ),
      )
      .orderBy(desc(reviews.createdAt))
      .limit(1);
    if (existente) {
      assertAllowed(
        existente.expiraEm > agora,
        "CONFLITO",
        "O pedido anterior está vencido e aguarda a manutenção da equipe.",
      );
      return { protocolo: existente.id, repetido: true };
    }
    const criadoEm = await atual.conferirPrazo();
    const [recibo] = await tx
      .insert(reviews)
      .values({
        profileId: entrada.perfilId,
        restrictionRevision: restricao.revision,
        clientKey: entrada.recursoId,
        requestHash: resumo,
        actorUserId: atual.contaId,
        actorKind: atual.tipo,
        createdAt: criadoEm,
        expiresAt: new Date(criadoEm.getTime() + 180 * DIA),
      })
      .returning({ id: reviews.id });
    assertAllowed(recibo, "CONFLITO", "Não foi possível confirmar o recurso.");
    await logAuditEventStrict(
      "recreio.restriction_review_requested",
      atual.contaId,
      {
        app: "recreio",
        profileId: entrada.perfilId,
        reviewId: recibo.id,
        revision: restricao.revision,
        actorKind: atual.tipo,
      },
      { writer: tx },
    );
    return { protocolo: recibo.id, repetido: false };
  });
}
