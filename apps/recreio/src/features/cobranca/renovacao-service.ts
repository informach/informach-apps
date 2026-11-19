import "server-only";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { segredoStripeCompativel } from "@/lib/commercial-mode";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  AceiteDoCancelamentoDaRenovacaoSchema,
  ConsultaDoCancelamentoDaRenovacaoSchema,
} from "./renovacao-contrato";
import {
  aceitarCancelamentoDaRenovacaoNoBanco,
  consultarCancelamentoDaRenovacaoNoBanco,
} from "./renovacao-repository";

export function cancelamentoDaRenovacaoDisponivel() {
  return (
    env.RECREIO_RENEWAL_JOBS_MODE === "on" &&
    env.RECREIO_PORTAL_RENEWAL_MODE === "native" &&
    segredoStripeCompativel(env.STRIPE_MODE, env.STRIPE_SECRET_KEY) &&
    /^[a-f0-9]{40}$/.test(process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ?? "")
  );
}
/** Durable acceptance only. The private worker owns provider I/O and proof. */
export async function cancelarMinhaRenovacao(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = AceiteDoCancelamentoDaRenovacaoSchema.parse(entrada);
  assertAllowed(
    cancelamentoDaRenovacaoDisponivel(),
    "INDISPONIVEL",
    "O cancelamento da renovação ainda não está disponível por aqui.",
  );
  const fonte = process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA;
  assertAllowed(
    fonte && /^[a-f0-9]{40}$/.test(fonte),
    "INDISPONIVEL",
    "O cancelamento está indisponível.",
  );
  await limitarTentativas({
    chave: `renovacao-cancelar:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return aceitarCancelamentoDaRenovacaoNoBanco(autor, pedido, { modo: env.STRIPE_MODE, fonte });
}
export async function consultarMeuCancelamentoDaRenovacao(
  autor: IdentidadeNativa,
  entrada: unknown,
) {
  const pedido = ConsultaDoCancelamentoDaRenovacaoSchema.parse(entrada);
  await limitarTentativas({
    chave: `renovacao-ler:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return consultarCancelamentoDaRenovacaoNoBanco(autor, pedido.pedidoId, env.STRIPE_MODE);
}
