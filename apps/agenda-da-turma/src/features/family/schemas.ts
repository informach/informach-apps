import { z } from "zod";

export const familyInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe o e-mail do responsável").max(254),
  profileIds: z
    .array(z.string().uuid())
    .min(1, "Escolha pelo menos uma criança")
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length, "Crianças repetidas"),
});
export const familyAcceptSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const familyRevokeSchema = z.object({ id: z.string().uuid() });
export const familyAccessSchema = familyRevokeSchema.extend({
  profileIds: familyInviteSchema.shape.profileIds,
});
