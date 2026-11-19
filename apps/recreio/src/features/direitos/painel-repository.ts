import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, desc, eq, inArray, or, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import {
  autorizarContaNativa,
  type IdentidadeNativa,
  lerContaNativa,
} from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";

/** Lista pessoal independente de jogador ativo, cobertura e grupo pagante.
 * A prévia de retirada e qualquer efeito continuam exigindo login recente. */
export function consultarPainelDeDireitosNoBanco(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await lerContaNativa(tx, autor.contaId);
    await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")))
      .for("share");
    const alvos = await tx
      .select({ id: profiles.id, apelido: profiles.nickname, tipo: profiles.kind })
      .from(profiles)
      .where(
        or(
          and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")),
          and(
            eq(profiles.kind, "minor"),
            sql`exists(select 1 from ${guardians}
          where ${guardians.profileId}=${profiles.id} and ${guardians.guardianUserId}=${autor.contaId})`,
          ),
        ),
      )
      .orderBy(profiles.id)
      .limit(257)
      .for("share");
    assertAllowed(alvos.length <= 256, "LIMITE", "Confira seus perfis com o suporte.");
    const atuais = alvos.length
      ? await tx
          .select({ perfilId: guardians.profileId, contaId: guardians.guardianUserId })
          .from(guardians)
          .where(
            inArray(
              guardians.profileId,
              alvos.map((p) => p.id),
            ),
          )
          .orderBy(guardians.profileId)
          .for("share")
      : [];
    assertAllowed(
      alvos.every(
        (p) =>
          p.tipo === "adult" ||
          atuais.some((v) => v.perfilId === p.id && v.contaId === autor.contaId),
      ),
      "CONFLITO",
      "A responsabilidade mudou. Reabra a página.",
    );
    const nativa = await autorizarContaNativa(tx, autor);
    const linhas = await tx
      .select({
        id: preparations.id,
        tipo: preparations.kind,
        planoSha256: preparations.planSha256,
        criadaEm: preparations.createdAt,
        expiraEm: preparations.expiresAt,
        canceladaEm: preparations.cancelledAt,
        operacaoEstado: operations.state,
        consentidaEm: operations.consentedAt,
        concluidaEm: operations.completedAt,
      })
      .from(preparations)
      .leftJoin(operations, eq(operations.preparationId, preparations.id))
      .where(eq(preparations.requesterUserId, autor.contaId))
      .orderBy(desc(preparations.createdAt), desc(preparations.id))
      .limit(21);
    await logAuditEventStrict(
      "recreio.rights_dashboard_viewed",
      autor.contaId,
      { app: "recreio", profileCount: alvos.length, preparationCount: Math.min(linhas.length, 20) },
      { writer: tx },
    );
    const agora = await nativa.conferirPrazo();
    return {
      perfis: alvos,
      temMais: linhas.length > 20,
      preparacoes: linhas.slice(0, 20).map((r) => ({
        preparacaoId: r.id,
        tipo: r.tipo,
        planoSha256: r.planoSha256,
        criadaEm: r.criadaEm.toISOString(),
        expiraEm: r.expiraEm.toISOString(),
        operacao: r.operacaoEstado
          ? {
              estado: r.operacaoEstado,
              consentidaEm: r.consentidaEm?.toISOString() ?? null,
              concluidaEm: r.concluidaEm?.toISOString() ?? null,
            }
          : null,
        situacao: r.canceladaEm
          ? ("cancelada" as const)
          : r.expiraEm <= agora
            ? ("expirada" as const)
            : ("preparada" as const),
      })),
    };
  });
}
