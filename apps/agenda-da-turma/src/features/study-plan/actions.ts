"use server";

import { refreshActivityViews } from "@/features/unified-activities/revalidate";
import { action, err } from "@/lib/action";
import { removeStudyPlanSchema, studyPlanSchema } from "./schemas";
import { createStudyPlan, removeStudyPlan } from "./service";

export const createStudyPlanAction = action
  .input(studyPlanSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "study-plan-create", max: 60, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await createStudyPlan(ctx.actor.id, input);
    if (result.ok) refreshActivityViews();
    return result;
  });

export const removeStudyPlanAction = action
  .input(removeStudyPlanSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "study-plan-remove", max: 60, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await removeStudyPlan(ctx.actor.id, input);
    if (result.ok) refreshActivityViews();
    return result;
  });
