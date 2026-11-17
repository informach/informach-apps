import "server-only";
import { PerfilIdSchema } from "@informach/recreio";
import { ConsultaSocialSchema, ProtecaoDeContatoSchema } from "@informach/recreio/contrato";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  lerSupervisaoSocial,
  marcarAvisoSocial,
  protegerContatoSupervisionado,
  removerContatoSupervisionado,
} from "./supervisao-repository";

async function limitar(autor: AutorNativoRecente, leitura = false) {
  await limitarTentativas({
    chave: `social-supervisao:${leitura ? "leitura" : "escrita"}:${autor.contaId}`,
    max: leitura ? 120 : 60,
    janelaEmSegundos: 600,
  });
}
export async function consultarContatosDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  entrada: unknown = {},
) {
  const id = PerfilIdSchema.parse(perfilId),
    consulta = ConsultaSocialSchema.parse(entrada);
  await limitar(autor, true);
  return lerSupervisaoSocial(autor, id, consulta.apos ?? null);
}
export async function protegerContatoDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  entrada: unknown,
) {
  const id = PerfilIdSchema.parse(perfilId),
    pedido = ProtecaoDeContatoSchema.parse(entrada);
  await limitar(autor);
  return protegerContatoSupervisionado(autor, id, pedido);
}
export async function removerContatoDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  alvo: unknown,
) {
  const id = PerfilIdSchema.parse(perfilId),
    contato = PerfilIdSchema.parse(alvo);
  await limitar(autor);
  return removerContatoSupervisionado(autor, id, contato);
}
export async function lerAvisoDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  avisoId: unknown,
) {
  const id = PerfilIdSchema.parse(perfilId),
    aviso = z.uuid().parse(avisoId);
  await limitar(autor);
  return marcarAvisoSocial(autor, id, aviso);
}
