import "server-only";
import { PerfilIdSchema, SupervisaoSchema } from "@informach/recreio";
import { z } from "zod";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { gravarSupervisao, lerSupervisao } from "./repository";

const PedidoDeSupervisaoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  versao: z.number().int().min(1).max(2147483646),
  configuracao: SupervisaoSchema,
  reconheco: z.literal(true),
});
export function consultarSupervisao(autor: IdentidadeNativa, perfilId: unknown) {
  return lerSupervisao(autor, PerfilIdSchema.parse(perfilId));
}
export async function salvarSupervisao(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = PedidoDeSupervisaoSchema.parse(entrada);
  await limitarTentativas({
    chave: `supervisao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 3600,
  });
  return gravarSupervisao(autor, pedido);
}
