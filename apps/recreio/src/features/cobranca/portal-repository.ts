import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import { customers, recreioGroups as groups } from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";

const PORTAL = Symbol("recreio.portal.admission");
type ProvaDoPortal = {
  readonly [PORTAL]: true;
  readonly groupId: string;
  readonly payerId: string;
  readonly customerId: string;
};

/** Caller keeps financial lifecycle across I/O. Every phase reauthorizes the
 * native adult and the SAME owned customer; a player/coadmin is insufficient.
 */
export async function admitirPortalLocked(
  autor: AutorNativoRecente,
  fase: "requested" | "confirm" | "opened",
  prova?: ProvaDoPortal,
): Promise<ProvaDoPortal> {
  const [pista] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  assertAllowed(pista, "COBRANCA", "Dados de pagamento não disponíveis.");
  if (prova)
    assertAllowed(
      prova[PORTAL] && prova.payerId === autor.contaId && prova.groupId === pista.id,
      "AUTH",
      "Entre novamente para continuar.",
    );
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    const grupoId = GrupoIdSchema.parse(pista.id);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share", "financeiro");
    await atual.nativa.conferirPrazo(autor.login);
    const [cliente] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "recreio"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, autor.contaId),
        ),
      )
      .for("share");
    assertAllowed(
      cliente && (!prova || prova.customerId === cliente.id),
      "COBRANCA",
      "Dados de pagamento não disponíveis.",
    );
    if (fase !== "confirm")
      await logAuditEventStrict(
        fase === "requested" ? "recreio.billing_portal_requested" : "recreio.billing_portal_opened",
        autor.contaId,
        { app: "recreio", groupId: grupoId },
        { writer: tx },
      );
    await atual.nativa.conferirPrazo(autor.login);
    return { [PORTAL]: true, groupId: grupoId, payerId: autor.contaId, customerId: cliente.id };
  });
}
