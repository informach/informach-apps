import { z } from "zod";

export const GeracaoDaObraSchema = z.uuid();
export const ReferenciaDaTravaSchema = z.strictObject({
  geracao: GeracaoDaObraSchema,
  numero: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type ReferenciaDaTrava = z.infer<typeof ReferenciaDaTravaSchema>;
