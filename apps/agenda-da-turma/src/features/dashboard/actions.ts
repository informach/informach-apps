"use server";

import { z } from "zod";
import { isValidDateIso } from "@/features/calendar/date";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { listStudentProfilesForUser } from "@/features/students/service";
import { action, err, ok } from "@/lib/action";
import { getWeekPrintout } from "./week-print";

const inputSchema = z.object({
  profileFilter: z.string().uuid().nullable(),
  anchorIso: z.string().refine(isValidDateIso),
});

/**
 * Os dados da semana para imprimir.
 *
 * O plano que vale é o da FAMÍLIA: o segundo adulto convidado numa casa Pro
 * imprime a semana porque o titular paga. Antes a ação olhava só a assinatura
 * de quem tocava, e o convidado era mandado para a tela do Pro.
 */
export const exportWeekPdfDataAction = action
  .input(inputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "dashboard-export-pdf", max: 10, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const [entitlements, profiles] = await Promise.all([
      getFamilyEntitlements(userId),
      listStudentProfilesForUser(userId),
    ]);
    if (!entitlements.enabled) return err({ code: "SUBSCRIPTION_REQUIRED" } as const);

    const profileFilter =
      input.profileFilter && profiles.some((p) => p.id === input.profileFilter)
        ? input.profileFilter
        : null;
    const week = await getWeekPrintout(userId, { anchorIso: input.anchorIso, profileFilter });

    return ok({
      week,
      scope: profileFilter
        ? (profiles.find((p) => p.id === profileFilter)?.name ?? "")
        : "Todas as crianças",
      generatedAtIso: new Date().toISOString(),
    } as const);
  });
