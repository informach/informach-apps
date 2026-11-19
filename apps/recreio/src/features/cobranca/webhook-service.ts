import "server-only";
import { readRequestBody } from "@informach/auth/request-body";
import type { BillingProviderClient } from "@informach/billing";
import type { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import type { StripeMode } from "@informach/config";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { admitirNotificacaoFinanceira } from "./webhook-repository";

const EVENTOS = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "invoice.voided",
  "invoice.finalized",
  "invoice.updated",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_reinstated",
  "charge.dispute.funds_withdrawn",
]);
const ADVERSOS = new Set([
  "checkout.session.async_payment_failed",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "invoice.payment_failed",
  "invoice.marked_uncollectible",
  "charge.dispute.created",
  "charge.dispute.funds_withdrawn",
]);
const EventoSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9_]{1,240}$/),
  type: z.string().min(2).max(100),
  livemode: z.boolean(),
  created: z.number().int().nonnegative(),
  account: z.never().optional(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

export type RuntimeDoWebhook = {
  modo: StripeMode;
  verificar: BillingProviderClient["verifyWebhookSignature"];
  clienteDoEvento: ReturnType<typeof createStripePaymentFactReader>["eventCustomerId"];
};

/** Signature is verified against bounded ORIGINAL bytes before interpretation.
 * A positive notification only schedules complete GET reconciliation.
 */
export function criarReceptorDoWebhook(obterRuntime: () => RuntimeDoWebhook) {
  return async (request: Request) => {
    const raw = await readRequestBody(request, 1_048_576);
    const runtime = obterRuntime();
    const verificado = runtime.verificar(raw, request.headers.get("stripe-signature"));
    const evento = EventoSchema.parse(verificado.payload);
    assertAllowed(
      evento.id === verificado.id &&
        evento.type === verificado.type &&
        evento.livemode === (runtime.modo === "prod"),
      "ORIGEM_FINANCEIRA",
      "O evento financeiro exige conferência.",
    );
    if (!EVENTOS.has(evento.type)) return { status: "ignored" as const };
    const objeto = evento.data.object;
    assertAllowed(
      objeto.livemode === undefined || objeto.livemode === evento.livemode,
      "ORIGEM_FINANCEIRA",
      "O recurso financeiro exige conferência.",
    );
    const objectId = z
      .string()
      .regex(/^[A-Za-z0-9_]{2,255}$/)
      .parse(objeto.id);
    const customer = await runtime.clienteDoEvento(objeto);
    if (!customer) return { status: "ignored" as const };
    const adverso =
      ADVERSOS.has(evento.type) ||
      (evento.type === "charge.refunded" && objeto.refunded === true) ||
      (evento.type === "customer.subscription.updated" &&
        typeof objeto.status === "string" &&
        !["active", "trialing"].includes(objeto.status));
    return admitirNotificacaoFinanceira({
      providerCustomerId: customer,
      modo: runtime.modo,
      eventId: evento.id,
      eventType: evento.type,
      objectId,
      created: evento.created,
      adverso,
    });
  };
}
