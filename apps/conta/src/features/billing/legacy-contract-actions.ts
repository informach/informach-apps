"use server";
import { BillingError } from "@informach/billing";
import {
  confirmRecentLegacyContractAcceptance,
  prepareLegacyContractAcceptance,
} from "@informach/billing/legacy-contracts";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActions } from "@/lib/action";
import { getAuth } from "@/lib/auth";
import { getBilling } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";

const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("preview"), groupId: z.uuid(), subscriptionId: z.uuid() }),
  z.object({
    operation: z.literal("confirm"),
    groupId: z.uuid(),
    subscriptionId: z.uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal("on"),
  }),
]);
export type LegacyContractFormState = {
  ok: boolean;
  message: string;
  completed?: boolean;
  preview?: { revision: string; endsAt: string; cancellationScheduled: boolean };
};

export async function legacyContractAction(
  _previous: LegacyContractFormState,
  form: FormData,
): Promise<LegacyContractFormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Confira a família e a confirmação." };
  return getActions()
    .input(schema)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:legacy-contract", max: 4, window: "1m" })
    .run(async ({ ctx, input }): Promise<LegacyContractFormState> => {
      if (!ctx.actor?.emailVerified)
        return { ok: false, message: "Confirme seu e-mail para continuar." };
      if (!getEnv().COMPASSO_BILLING_ENABLED)
        return { ok: false, message: "A migração de contratos ainda não está disponível." };
      try {
        const runtime = getBilling();
        const deps = {
          db: runtime.db,
          products: runtime.legacyProducts,
          providerClient: runtime.providerClient,
        };
        if (input.operation === "preview") {
          const result = await prepareLegacyContractAcceptance(deps, ctx.actor.id, input);
          const endsAt = result.periods.reduce(
            (latest, period) => (period.end > latest ? period.end : latest),
            result.periods[0]?.end ?? new Date(0),
          );
          return {
            ok: true,
            message: "Confira o período e a família antes de confirmar.",
            preview: {
              revision: result.revision,
              endsAt: endsAt.toISOString(),
              cancellationScheduled: result.status === "canceled" || result.cancelAtPeriodEnd,
            },
          };
        }
        const session = await getAuth().getSession(await headers());
        if (!session || session.user.id !== ctx.actor.id)
          return { ok: false, message: "Entre novamente na conta antes de confirmar." };
        await confirmRecentLegacyContractAcceptance(deps, ctx.actor.id, session.session.id, input);
        revalidatePath("/");
        return {
          ok: true,
          completed: true,
          message:
            "Aceite registrado. A renovação anterior será conferida e encerrada ao fim do período pago.",
        };
      } catch (error) {
        reportOperationalError("billing.legacy_contract.failed", error);
        return {
          ok: false,
          message:
            error instanceof BillingError
              ? "Não foi possível confirmar. Entre novamente, atualize a prévia e confira o contrato."
              : "A conferência não terminou. Tente novamente em instantes.",
        };
      }
    })(parsed.data);
}
