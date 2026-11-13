"use server";
import {
  AlreadySubscribedError,
  BillingError,
  CheckoutPendingError,
  LegacySubscriptionPendingError,
} from "@informach/billing";
import { assertAccountPayer, openCompassoAccount } from "@informach/billing/collection-accounts";
import { CompassoBillingReviewError } from "@informach/billing/collection-jobs";
import {
  type CreditPurchaseResult,
  cancelCreditPurchase,
  resumeCreditPurchase,
  startCreditPurchase,
} from "@informach/billing/credit-purchases";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accountParticipation } from "@/lib/account-closure";
import { getActions } from "@/lib/action";
import { getBillingMaintenance } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";
import { billingAvailability } from "./availability";
export type BillingFormState = { ok: boolean; message: string; url?: string };
const context = { accountId: z.uuid() };
const schema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("subscribe"),
    groupId: z.uuid(),
    productId: z.enum(["compasso_monthly", "compasso_annual"]),
    confirmed: z.literal("on"),
  }),
  z.object({
    operation: z.literal("buy-credits"),
    groupId: z.uuid(),
    accountId: z.uuid().optional(),
    productId: z.string().min(1).max(120),
    requestKey: z.uuid(),
    confirmed: z.literal("on"),
  }),
  z.object({ operation: z.literal("resume-purchase"), ...context, intentId: z.uuid() }),
  z.object({
    operation: z.literal("cancel-purchase"),
    ...context,
    intentId: z.uuid(),
    confirmed: z.literal("on"),
  }),
  z.object({
    operation: z.literal("cancel-subscription"),
    ...context,
    subscriptionId: z.uuid(),
    confirmed: z.literal("on"),
  }),
  z.object({
    operation: z.literal("restore-renewal"),
    ...context,
    subscriptionId: z.uuid(),
    confirmed: z.literal("on"),
  }),
  z.object({ operation: z.literal("portal"), ...context }),
  z.object({
    operation: z.literal("change-plan"),
    ...context,
    subscriptionId: z.uuid(),
    requestKey: z.uuid(),
    productId: z.enum(["compasso_monthly", "compasso_annual"]),
    expectedEnd: z.iso.datetime(),
    confirmed: z.literal("on"),
  }),
  z.object({
    operation: z.literal("cancel-plan-change"),
    ...context,
    changeId: z.uuid(),
    confirmed: z.literal("on"),
  }),
  z.object({ operation: z.literal("refresh"), ...context }),
]);
export async function billingAction(
  _previous: BillingFormState,
  form: FormData,
): Promise<BillingFormState> {
  const input = schema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { ok: false, message: "Confira os campos e a confirmação da operação." };
  const result = await getActions()
    .input(schema)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:billing", max: 8, window: "1m" })
    .run(async ({ ctx, input }): Promise<BillingFormState> => {
      if (!ctx.actor?.emailVerified)
        return { ok: false, message: "Confirme seu e-mail para continuar." };
      const participation = await accountParticipation(ctx.actor.id);
      if (!billingAvailability(getEnv(), participation.state === "active")[input.operation])
        return {
          ok: false,
          message:
            "Esta operação não está disponível agora. Você pode consultar seus dados de cobrança abaixo.",
        };
      try {
        const billing = getBillingMaintenance();
        switch (input.operation) {
          case "change-plan": {
            const change = await billing.commerce.changePlan(ctx.actor.id, input);
            return {
              ok: change.status === "scheduled" || change.status === "applied",
              message:
                change.status === "scheduled"
                  ? "Troca agendada para o fim do período atual. Nenhuma cobrança foi antecipada."
                  : change.status === "applied"
                    ? "A troca de periodicidade já entrou em vigor."
                    : "Essa tentativa foi encerrada. Atualize a cobrança antes de solicitar uma nova troca.",
            };
          }
          case "cancel-plan-change": {
            const change = await billing.commerce.cancelPlanChange(ctx.actor.id, input);
            return {
              ok: change.status === "canceled",
              message:
                change.status === "canceled"
                  ? "Troca desfeita. A assinatura continua no plano atual."
                  : "A troca já entrou em vigor. Confira o plano e o período atuais.",
            };
          }
          case "subscribe":
            return {
              ok: true,
              message: "Continue no pagamento seguro.",
              url: (await billing.commerce.subscribe(ctx.actor.id, input)).url,
            };
          case "portal":
            return {
              ok: true,
              message: "Abrindo seus dados de cobrança.",
              url: (await billing.commerce.portal(ctx.actor.id, input.accountId)).url,
            };
          case "cancel-subscription":
          case "restore-renewal":
            await billing.commerce.setCancellation(ctx.actor.id, {
              ...input,
              cancel: input.operation === "cancel-subscription",
            });
            return {
              ok: true,
              message:
                input.operation === "cancel-subscription"
                  ? "Renovação cancelada. O período já pago continua disponível."
                  : "Renovação automática restabelecida.",
            };
          case "refresh": {
            const state = await billing.commerce.refreshPayerAccount(ctx.actor.id, input.accountId);
            return {
              ok: state.failed === 0,
              message: state.failed
                ? "A confirmação continua pendente. Tentaremos novamente automaticamente."
                : "Os dados de cobrança foram atualizados.",
            };
          }
          default: {
            let state: CreditPurchaseResult;
            if (input.operation === "buy-credits") {
              await billing.verifyCatalog();
              const account = input.accountId
                ? (await assertAccountPayer(billing.db, ctx.actor.id, input.accountId)).account
                : await openCompassoAccount(billing.db, ctx.actor.id, input.groupId);
              if (account.groupId !== input.groupId)
                throw new BillingError("Purchase family does not match the payer account");
              state = await startCreditPurchase(billing, {
                ...input,
                accountId: account.id,
                actorId: ctx.actor.id,
              });
            } else {
              state = await (input.operation === "cancel-purchase"
                ? cancelCreditPurchase
                : resumeCreditPurchase)(billing, { ...input, actorId: ctx.actor.id });
            }
            if (state.status === "open")
              return { ok: true, message: "Continue no pagamento seguro.", url: state.url };
            return {
              ok: true,
              message:
                state.status === "paid"
                  ? "Compra processada. Confira o extrato para ver os créditos e eventuais estornos."
                  : state.status === "pending"
                    ? "Aguardando a confirmação do pagamento. Os créditos serão liberados automaticamente."
                    : "Essa tentativa de compra foi encerrada sem novos créditos.",
            };
          }
        }
      } catch (error) {
        if (error instanceof LegacySubscriptionPendingError)
          return {
            ok: false,
            message:
              "Há uma assinatura ou tentativa de pagamento anterior desta família em conferência. O Compasso poderá ser contratado após a resolução e o fim do período já pago.",
          };
        if (error instanceof CompassoBillingReviewError)
          return {
            ok: false,
            message: "A cobrança está em conferência. Aguarde a atualização antes de continuar.",
          };
        if (error instanceof AlreadySubscribedError)
          return {
            ok: false,
            message: "Esta família já tem uma assinatura. Gerencie o plano existente abaixo.",
          };
        if (error instanceof CheckoutPendingError)
          return {
            ok: false,
            message:
              "Há um pagamento em andamento. Continue ou encerre a tentativa existente antes de começar outra.",
          };
        reportOperationalError("billing.action.failed", error);
        return {
          ok: false,
          message:
            error instanceof BillingError
              ? "Não foi possível concluir essa operação. Atualize a cobrança e confira sua permissão como pagante."
              : "Não recebemos a confirmação agora. Consulte o andamento abaixo antes de tentar novamente.",
        };
      }
    })(input.data);
  revalidatePath("/");
  if (result.ok && result.url) {
    const destination = new URL(result.url);
    if (
      destination.protocol !== "https:" ||
      !["checkout.stripe.com", "billing.stripe.com"].includes(destination.hostname) ||
      destination.username ||
      destination.password
    )
      return { ok: false, message: "O endereço de pagamento não pôde ser confirmado." };
    redirect(destination.href);
  }
  return result;
}
