import "server-only";
import { MembroIdSchema, MundoIdSchema, PerfilIdSchema, UuidSchema } from "@informach/recreio";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  cancelarResponsabilidadeDoMenor,
  lerTransferenciaDoMenor,
  proporResponsabilidadeDoMenor,
} from "./responsabilidade-repository";

export function painelDaTransferenciaDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  mundoId: unknown,
  apos?: unknown,
) {
  return lerTransferenciaDoMenor(
    { responsavel: autor, perfilId: PerfilIdSchema.parse(perfilId) },
    MundoIdSchema.parse(mundoId),
    MembroIdSchema.nullish().parse(apos) ?? null,
  );
}

const PropostaSchema = z.strictObject({
  mundoId: MundoIdSchema,
  membroId: MembroIdSchema,
  versaoDaGestao: z.number().int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
const CancelamentoSchema = z.strictObject({ mundoId: MundoIdSchema, pedidoId: UuidSchema });
export async function proporTransferenciaDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  entrada: unknown,
) {
  const perfil = PerfilIdSchema.parse(perfilId),
    pedido = PropostaSchema.parse(entrada);
  await limitarTentativas({
    chave: `sucessao-menor:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return proporResponsabilidadeDoMenor(
    { responsavel: autor, perfilId: perfil },
    pedido.mundoId,
    pedido.membroId,
    pedido.versaoDaGestao,
  );
}
export async function cancelarTransferenciaDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  entrada: unknown,
) {
  const perfil = PerfilIdSchema.parse(perfilId),
    pedido = CancelamentoSchema.parse(entrada);
  await limitarTentativas({
    chave: `sucessao-menor:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return cancelarResponsabilidadeDoMenor(
    { responsavel: autor, perfilId: perfil },
    pedido.mundoId,
    pedido.pedidoId,
  );
}
