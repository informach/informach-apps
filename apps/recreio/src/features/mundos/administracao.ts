import "server-only";
import { MembroIdSchema, MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import { limitarTentativas } from "@/lib/rate-limit";
import { registrarGestaoDoMundo } from "./administracao-repository";
import type { AutorDaResponsabilidade } from "./gestao-repository";

const base = {
  mundoId: MundoIdSchema,
  versaoDaGestao: z.number().int().min(1).max(2147483646),
};
export const GestaoDoMundoSchema = z.discriminatedUnion("operacao", [
  z.strictObject({
    ...base,
    operacao: z.literal("coadministracao"),
    membroId: MembroIdSchema,
    papel: z.enum(["member", "coadmin"]),
  }),
  z.strictObject({
    ...base,
    operacao: z.literal("convites"),
    membrosConvidam: z.enum(["no", "with_approval", "yes"]),
  }),
  z.strictObject({ ...base, operacao: z.enum(["arquivar", "retomar"]) }),
]);
export type GestaoDoMundo = z.infer<typeof GestaoDoMundoSchema>;

export async function administrarMundo(autor: AutorDaResponsabilidade, entrada: unknown) {
  const pedido = GestaoDoMundoSchema.parse(entrada);
  await limitarTentativas({
    chave: `gestao-mundos:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 600,
  });
  return registrarGestaoDoMundo(autor, pedido);
}
