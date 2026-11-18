import { GrupoIdSchema, PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";

export const CoberturaDoGrupoSchema = z
  .strictObject({
    grupoId: GrupoIdSchema,
    perfis: z
      .array(
        z.strictObject({
          perfilId: PerfilIdSchema,
          versao: z.number().int().min(1).max(2147483646),
          cobrir: z.boolean(),
        }),
      )
      .max(4),
  })
  .refine((pedido) => new Set(pedido.perfis.map((p) => p.perfilId)).size === pedido.perfis.length);
export type CoberturaDoGrupo = z.infer<typeof CoberturaDoGrupoSchema>;

/** Versioned confirmation of an applied commercial change. Keep this field
 * out of the reusable base used by quote preparation. */
export const ConfirmacaoCoberturaDoGrupoSchema = CoberturaDoGrupoSchema.safeExtend({
  revisaoDoContrato: z.int().min(2).max(2147483646).optional(),
});
export type ConfirmacaoCoberturaDoGrupo = z.infer<typeof ConfirmacaoCoberturaDoGrupoSchema>;
