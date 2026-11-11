"use server";
import { randomUUID } from "node:crypto";
import { BillingError } from "@informach/billing";
import {
  acceptLegacyCoordination,
  declineLegacyCoordination,
  previewLegacyCoordination,
} from "@informach/billing/legacy-coordination";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { accountParticipation } from "@/lib/account-closure";
import { getActions } from "@/lib/action";
import { getAuth } from "@/lib/auth";
import { getBillingMaintenance } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";
import { billingAvailability } from "./availability";

const decision = {
  accountId: z.uuid(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  requestKey: z.uuid(),
};
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("preview"), accountId: z.uuid() }),
  z.object({ operation: z.literal("accept"), ...decision, confirmed: z.literal("on") }),
  z.object({ operation: z.literal("decline"), ...decision }),
]);

export type CoordinationFormState = {
  ok: boolean;
  message: string;
  completed?: boolean;
  preview?: {
    accountId: string;
    revision: string;
    requestKey: string;
    amountCents: number;
    interval: "month" | "year";
    fromChargeAt: string;
    deferUntil: string;
  };
};

/** Only the family's payer can answer. The other adult's app, contract and
 * price are never part of what this action returns. */
export async function coordinationAction(
  _previous: CoordinationFormState,
  form: FormData,
): Promise<CoordinationFormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Confira a data e a confirmação." };
  const result = await getActions()
    .input(schema)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:legacy-coordination", max: 6, window: "1m" })
    .run(async ({ ctx, input }): Promise<CoordinationFormState> => {
      if (!ctx.actor?.emailVerified)
        return { ok: false, message: "Confirme seu e-mail para continuar." };
      const participation = await accountParticipation(ctx.actor.id);
      const operations = billingAvailability(getEnv(), participation.state === "active");
      // Moving a charge is a commercial change, gated like a plan change.
      // Keeping the current date changes nothing and stays available.
      if (
        !(input.operation === "decline"
          ? operations["cancel-plan-change"]
          : operations["change-plan"])
      )
        return { ok: false, message: "Esta operação não está disponível agora." };
      try {
        const deps = getBillingMaintenance().coordinationDeps;
        if (input.operation === "preview") {
          const offer = await previewLegacyCoordination(deps, ctx.actor.id, input);
          if (!offer)
            return { ok: false, message: "Não há pedido de adiamento para esta cobrança." };
          if (offer.effect === "none" || offer.state !== "open")
            return {
              ok: true,
              completed: true,
              message:
                "O período trazido termina antes da sua próxima cobrança. Nada muda na sua assinatura.",
            };
          if (
            !offer.revision ||
            !offer.amountCents ||
            !offer.fromChargeAt ||
            !offer.deferUntil ||
            (offer.interval !== "month" && offer.interval !== "year")
          )
            return { ok: false, message: "A conferência não terminou. Tente novamente." };
          return {
            ok: true,
            message: "Confira as datas antes de decidir.",
            preview: {
              accountId: input.accountId,
              revision: offer.revision,
              requestKey: randomUUID(),
              amountCents: offer.amountCents,
              interval: offer.interval,
              fromChargeAt: offer.fromChargeAt.toISOString(),
              deferUntil: offer.deferUntil.toISOString(),
            },
          };
        }
        const session = await getAuth().getSession(await headers());
        if (!session || session.user.id !== ctx.actor.id)
          return { ok: false, message: "Entre novamente na conta antes de decidir." };
        if (input.operation === "decline") {
          await declineLegacyCoordination(deps, ctx.actor.id, session.session.id, input);
          return {
            ok: true,
            completed: true,
            message: "Sua próxima cobrança continua na data atual.",
          };
        }
        const accepted = await acceptLegacyCoordination(
          deps,
          ctx.actor.id,
          session.session.id,
          input,
        );
        if (accepted.state === "applied" || accepted.state === "settled")
          return {
            ok: true,
            completed: true,
            message: "Pronto. Sua próxima cobrança passou para a nova data.",
          };
        if (accepted.state === "review")
          return {
            ok: false,
            completed: true,
            message:
              "Sua decisão foi registrada e a cobrança entrou em conferência. Nenhum valor extra será cobrado sem essa conferência.",
          };
        if (accepted.state === "invalidated" || accepted.state === "no_effect")
          return {
            ok: false,
            message: "Os períodos mudaram antes da alteração. Confira a nova prévia.",
          };
        return {
          ok: true,
          completed: true,
          message: "Sua decisão foi registrada. A nova data será aplicada nos próximos minutos.",
        };
      } catch (error) {
        reportOperationalError("billing.coordination.failed", error);
        return {
          ok: false,
          message:
            error instanceof BillingError
              ? "Não foi possível concluir. Entre novamente e atualize a prévia."
              : "A operação está em conferência. Consulte o andamento antes de tentar de novo.",
        };
      }
    })(parsed.data);
  revalidatePath("/");
  return result;
}
