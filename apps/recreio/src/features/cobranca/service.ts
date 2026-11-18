import "server-only";
import { z } from "zod";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { AceiteDaCompraSchema, ofertasParaOAdulto } from "./regras";
import {
  consultarMinhaCompraNoBanco,
  encerrarCompraNaoEnviadaNoBanco,
  prepararCompraNoBanco,
} from "./repository";

/** Somente aceite; não chama Stripe nem concede acesso. */
export async function prepararMinhaCompra(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = AceiteDaCompraSchema.parse(entrada);
  assertAllowed(
    env.RECREIO_BILLING_MODE !== "off",
    "INDISPONIVEL",
    "A compra ainda não está disponível.",
  );
  await limitarTentativas({
    chave: `compra-preparar:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return prepararCompraNoBanco(autor, pedido, env.STRIPE_MODE);
}
export async function consultarMinhaCompra(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `compra-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return consultarMinhaCompraNoBanco(autor);
}
export async function consultarMinhaCobranca(autor: IdentidadeNativa) {
  const compra = await consultarMinhaCompra(autor);
  return { modo: env.RECREIO_BILLING_MODE, compra, ofertas: ofertasParaOAdulto() };
}
export async function encerrarCompraNaoEnviada(autor: IdentidadeNativa, entrada: unknown) {
  const id = z.uuid().parse(entrada);
  await limitarTentativas({
    chave: `compra-encerrar:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return encerrarCompraNaoEnviadaNoBanco(autor, id);
}
