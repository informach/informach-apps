import { z } from "zod";

const activityIdSchema = z.string().uuid("Identificador de atividade inválido");
export const respondSharedActivityInputSchema = z.object({
  activityId: activityIdSchema,
  accepted: z.boolean(),
});
export type RespondSharedActivityInput = z.output<typeof respondSharedActivityInputSchema>;
