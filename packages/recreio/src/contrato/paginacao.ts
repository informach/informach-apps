import { z } from "zod";
import { UuidSchema } from "../dominio/ids";

/** Cursor temporal estável; as consultas continuam responsáveis pelo próprio escopo. */
export const CursorCronologicoSchema = z.strictObject({ em: z.iso.datetime(), id: UuidSchema });
export const ConsultaCronologicaSchema = z
  .strictObject({
    aposEm: z.iso.datetime().optional(),
    aposId: UuidSchema.optional(),
  })
  .refine((p) => (p.aposEm === undefined) === (p.aposId === undefined));
