"use server";

import { z } from "zod";
import { billing } from "@/features/billing/service";
import { listStudentProfilesForUser } from "@/features/students/service";
import { action, err, ok } from "@/lib/action";
import { getDashboardSnapshot } from "./service";

const inputSchema = z.object({
  profileFilter: z.string().uuid().nullable(),
});

export const exportDashboardPdfDataAction = action
  .input(inputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "dashboard-export-pdf", max: 10, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const subject = { type: "user" as const, id: userId };
    const isPro = await billing.hasProSubscription(subject);
    if (!isPro) return err({ code: "SUBSCRIPTION_REQUIRED" } as const);

    const profiles = await listStudentProfilesForUser(userId);
    const profileFilter =
      input.profileFilter && profiles.some((p) => p.id === input.profileFilter)
        ? input.profileFilter
        : null;

    const snapshot = await getDashboardSnapshot(userId, { profileFilter });

    return ok({
      snapshot,
      profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
      profileFilter,
      userName: ctx.actor?.name ?? "Responsável",
      generatedAtIso: new Date().toISOString(),
    } as const);
  });
