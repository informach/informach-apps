import { z } from "zod";
import { ESTIMATE_PRESETS } from "@/features/unified-activities/estimate";
import { MAX_STUDY_SESSIONS } from "./plan";

export const studyPlanSchema = z.object({
  taskId: z.string().uuid(),
  sessions: z.number().int().min(1).max(MAX_STUDY_SESSIONS),
  /** Os mesmos degraus que o formulário oferece para duração. */
  minutesEach: z
    .number()
    .int()
    .refine(
      (value) => (ESTIMATE_PRESETS as readonly number[]).includes(value),
      "Escolha uma das durações oferecidas",
    ),
});
export const removeStudyPlanSchema = z.object({ taskId: z.string().uuid() });
