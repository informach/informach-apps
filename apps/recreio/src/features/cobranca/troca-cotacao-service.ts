import "server-only";
import type { Product, StripeMode } from "@informach/config";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { prepararCotacaoDeReducaoNoBanco } from "./troca-cotacao-repository";
import { PrepararTrocaSchema } from "./troca-entrada";

/** Server composition only; catalog/mode are not supplied by the browser. */
export function criarPreparacaoDeReducao(
  obterCatalogo: () => { modo: StripeMode; produtos: readonly Product[] },
) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const pedido = PrepararTrocaSchema.parse(entrada);
    assertAllowed(
      env.RECREIO_BILLING_MODE === "sandbox",
      "INDISPONIVEL",
      "As trocas ainda estão em homologação.",
    );
    await limitarTentativas({
      chave: `troca-cotar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return prepararCotacaoDeReducaoNoBanco(autor, pedido, obterCatalogo());
  };
}
