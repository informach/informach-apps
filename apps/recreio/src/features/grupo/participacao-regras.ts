import { GrupoIdSchema, PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";

export const SaidaDoGrupoSchema = z.strictObject({
  grupoId: GrupoIdSchema,
  versao: z.number().int().min(1).max(2147483646),
});
export const RetiradaDeAdultoSchema = SaidaDoGrupoSchema.extend({ perfilId: PerfilIdSchema });
export const CoberturaPropriaSchema = z.strictObject({
  versao: z.number().int().min(1).max(2147483646),
});
export type SaidaDoGrupo = z.infer<typeof SaidaDoGrupoSchema>;
export type RetiradaDeAdulto = z.infer<typeof RetiradaDeAdultoSchema>;
export type CoberturaPropria = z.infer<typeof CoberturaPropriaSchema>;
