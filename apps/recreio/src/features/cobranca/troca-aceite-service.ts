import "server-only";
import type { Product, StripeMode } from "@informach/config";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { envioComercialDisponivel } from "@/lib/commercial-mode";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { aceitarTrocaNoBanco, encerrarTrocaNaoEnviadaNoBanco } from "./troca-aceite-repository";
import { AceitarTrocaSchema } from "./troca-entrada";

export function criarAceiteDeTroca(
  obterCatalogo: () => { modo: StripeMode; produtos: readonly Product[] },
) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const pedido = AceitarTrocaSchema.parse(entrada);
    assertAllowed(
      envioComercialDisponivel(env.RECREIO_BILLING_MODE),
      "INDISPONIVEL",
      "As trocas de plano estão indisponíveis neste momento.",
    );
    await limitarTentativas({
      chave: `troca-aceitar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return aceitarTrocaNoBanco(autor, pedido, obterCatalogo());
  };
}

export function criarEncerramentoDeTroca(obterModo: () => StripeMode) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const id = z.uuid().parse(entrada);
    await limitarTentativas({
      chave: `troca-encerrar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return encerrarTrocaNaoEnviadaNoBanco(autor, id, obterModo());
  };
}
