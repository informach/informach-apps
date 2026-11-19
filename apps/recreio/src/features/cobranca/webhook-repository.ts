import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { recordUserProviderNotification } from "@informach/billing/user-provider-events";
import type { StripeMode } from "@informach/config";
import { and, db, eq, sql } from "@informach/db";
import {
  customers,
  recreioGroups as groups,
  recreioBillingReconciliations as jobs,
} from "@informach/db/schema";
import { ContaIdSchema, GrupoIdSchema } from "@informach/recreio";
import { revalidarSessoesDoGrupo } from "@/features/acesso/teste-repository";
import { admitirGrupoDaConciliacao } from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { agendarConciliacaoDaCompra } from "./conciliacao-fila-repository";
import { comCicloDeCobranca } from "./lifecycle";

export async function admitirNotificacaoFinanceira(entrada: {
  providerCustomerId: string;
  modo: StripeMode;
  eventId: string;
  eventType: string;
  objectId: string;
  created: number;
  adverso: boolean;
}) {
  const [cliente] = await db
    .select({ paganteId: customers.subjectId, grupoId: groups.id })
    .from(customers)
    .innerJoin(groups, eq(groups.ownerUserId, customers.subjectId))
    .where(
      and(
        eq(customers.app, "recreio"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.providerCustomerId, entrada.providerCustomerId),
      ),
    );
  if (!cliente) return { status: "ignored" as const };
  return comCicloDeCobranca(cliente.paganteId, () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      const grupo = await admitirGrupoDaConciliacao(
        tx,
        ContaIdSchema.parse(cliente.paganteId),
        GrupoIdSchema.parse(cliente.grupoId),
      );
      const recibo = await recordUserProviderNotification(tx, {
        app: "recreio",
        payerId: cliente.paganteId,
        providerCustomerId: entrada.providerCustomerId,
        mode: entrada.modo,
        eventId: entrada.eventId,
        eventType: entrada.eventType,
        objectId: entrada.objectId,
        created: entrada.created,
        adverse: entrada.adverso,
      });
      if (!recibo.admitted) return { status: "duplicate" as const };
      await agendarConciliacaoDaCompra(tx, {
        paganteId: cliente.paganteId,
        grupoId: grupo.grupo.id,
        modo: entrada.modo,
      });
      if (entrada.adverso) {
        await tx
          .update(jobs)
          .set({ reviewRequired: true, reviewReason: "adverse_event", updatedAt: AGORA })
          .where(
            and(
              eq(jobs.payerUserId, cliente.paganteId),
              eq(jobs.groupId, grupo.grupo.id),
              eq(jobs.providerMode, entrada.modo),
            ),
          );
        const [agora] = await tx
          .select({ valor: sql<Date>`${AGORA}`.mapWith(jobs.createdAt) })
          .from(jobs)
          .where(and(eq(jobs.payerUserId, cliente.paganteId), eq(jobs.providerMode, entrada.modo)));
        assertAllowed(agora, "COBRANCA", "Conciliação não disponível.");
        await revalidarSessoesDoGrupo(tx, grupo, agora.valor);
      }
      await logAuditEventStrict(
        "recreio.billing_provider_event_received",
        null,
        {
          app: "recreio",
          groupId: grupo.grupo.id,
          providerMode: entrada.modo,
          receiptId: recibo.id,
          eventType: entrada.eventType,
          adverse: entrada.adverso,
        },
        { writer: tx },
      );
      return { status: "scheduled" as const };
    }),
  );
}
