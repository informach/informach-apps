"use server";
import { randomUUID } from "node:crypto";
import { BillingError } from "@informach/billing";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import {
  confirmLegacyFutureSetup,
  createLegacyFutureIntent,
  openLegacyFutureSetup,
  prepareLegacyFutureIntent,
  requestLegacyFutureCancellation,
  scheduleLegacyFutureIntent,
} from "@informach/billing/legacy-future-contract";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accountParticipation } from "@/lib/account-closure";
import { getActions } from "@/lib/action";
import { getAuth } from "@/lib/auth";
import { getBillingMaintenance } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";
import { billingAvailability } from "./availability";

const product = z.enum(["compasso_monthly", "compasso_annual"]);
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("preview"), groupId: z.uuid(), productId: product }),
  z.object({
    operation: z.literal("begin"),
    accountId: z.uuid(),
    productId: product,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    requestKey: z.uuid(),
    confirmed: z.literal("on"),
  }),
  z.object({ operation: z.literal("open"), intentId: z.uuid() }),
  z.object({ operation: z.literal("confirm"), intentId: z.uuid() }),
  z.object({ operation: z.literal("schedule"), intentId: z.uuid() }),
  z.object({ operation: z.literal("cancel"), intentId: z.uuid(), confirmed: z.literal("on") }),
]);

export type FutureContractFormState = {
  ok: boolean;
  message: string;
  url?: string;
  preview?: {
    accountId: string;
    productId: z.infer<typeof product>;
    revision: string;
    requestKey: string;
    amountCents: number;
    startsAt: string;
    paidThrough: string;
  };
};

export async function futureContractAction(
  _previous: FutureContractFormState,
  form: FormData,
): Promise<FutureContractFormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Confira os campos e a confirmação." };
  const result = await getActions()
    .input(schema)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:future-contract", max: 8, window: "1m" })
    .run(async ({ ctx, input }): Promise<FutureContractFormState> => {
      if (!ctx.actor?.emailVerified)
        return { ok: false, message: "Confirme seu e-mail para continuar." };
      const participation = await accountParticipation(ctx.actor.id);
      const operations = billingAvailability(getEnv(), participation.state === "active");
      if (
        !(input.operation === "cancel" ? operations["cancel-subscription"] : operations.subscribe)
      )
        return { ok: false, message: "Esta operação não está disponível agora." };
      try {
        const runtime = getBillingMaintenance();
        const deps = { ...runtime, products: [...runtime.products, ...runtime.legacyProducts] };
        if (input.operation === "preview") {
          const account = await openCompassoAccount(runtime.db, ctx.actor.id, input.groupId);
          const terms = await prepareLegacyFutureIntent(deps, ctx.actor.id, {
            accountId: account.id,
            productId: input.productId,
          });
          return {
            ok: true,
            message: "Confira a data e o valor antes de confirmar.",
            preview: {
              accountId: account.id,
              productId: input.productId,
              revision: terms.revision,
              requestKey: randomUUID(),
              amountCents: terms.amountCents,
              startsAt: terms.startsAt.toISOString(),
              paidThrough: terms.paidThrough.toISOString(),
            },
          };
        }
        const session = await getAuth().getSession(await headers());
        if (!session || session.user.id !== ctx.actor.id)
          return { ok: false, message: "Entre novamente na conta antes de continuar." };
        const sid = session.session.id;
        if (input.operation === "begin") {
          const intent = await createLegacyFutureIntent(deps, ctx.actor.id, sid, input);
          const setup = await openLegacyFutureSetup(deps, ctx.actor.id, sid, {
            intentId: intent.id,
          });
          return setup.url && setup.status === "open"
            ? { ok: true, message: "Abrindo o formulário de pagamento.", url: setup.url }
            : { ok: true, message: "Confira o andamento da preparação abaixo." };
        }
        if (input.operation === "open") {
          const setup = await openLegacyFutureSetup(deps, ctx.actor.id, sid, input);
          return setup.url && setup.status === "open"
            ? { ok: true, message: "Abrindo o formulário de pagamento.", url: setup.url }
            : { ok: true, message: "Confira o andamento da preparação abaixo." };
        }
        if (input.operation === "cancel") {
          const canceled = await requestLegacyFutureCancellation(deps, ctx.actor.id, sid, input);
          return {
            ok: true,
            message:
              canceled.state === "canceled"
                ? "A programação futura foi cancelada. Seu período já pago permanece válido."
                : "A desistência foi registrada e está em conferência.",
          };
        }
        if (input.operation === "confirm") {
          const setup = await confirmLegacyFutureSetup(deps, ctx.actor.id, sid, input);
          if (setup.state !== "setup_ready")
            return {
              ok: false,
              message:
                setup.state === "setup_pending"
                  ? "O formulário ainda não foi concluído. Você pode abri-lo novamente."
                  : "A preparação precisa de conferência antes de continuar.",
            };
        }
        await scheduleLegacyFutureIntent(deps, ctx.actor.id, sid, input);
        return { ok: true, message: "Assinatura programada para depois do período já pago." };
      } catch (error) {
        reportOperationalError("billing.future_contract.failed", error);
        return {
          ok: false,
          message:
            error instanceof BillingError
              ? "Não foi possível concluir. Atualize a conferência e verifique a permissão do pagante."
              : "A operação está em conferência. Consulte o andamento antes de tentar novamente.",
        };
      }
    })(parsed.data);
  revalidatePath("/");
  if (result.ok && result.url) {
    if (!URL.canParse(result.url))
      return { ok: false, message: "O endereço de pagamento não pôde ser confirmado." };
    const destination = new URL(result.url);
    if (
      destination.protocol !== "https:" ||
      destination.hostname !== "checkout.stripe.com" ||
      destination.username ||
      destination.password
    )
      return { ok: false, message: "O endereço de pagamento não pôde ser confirmado." };
    redirect(destination.href);
  }
  return result;
}
