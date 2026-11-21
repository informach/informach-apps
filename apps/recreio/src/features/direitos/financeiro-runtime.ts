import "server-only";
import { createStripeRecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import type { StripeMode } from "@informach/config";
import { segredoStripeCompativel } from "@/lib/commercial-mode";
import { assertAllowed } from "@/lib/errors";
import type { RuntimeFinanceiroDoEncerramento } from "./encerramento-financeiro-execucao-service";

type Entrada = {
  STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  RECREIO_PORTAL_RENEWAL_MODE?: string;
  RECREIO_RENEWAL_JOBS_MODE?: string;
};

/** Shared, narrow composition for portal and standalone worker. No auth,
 * mail, sale catalog, Checkout client or implicit global environment parser. */
export function conferirConfiguracaoFinanceiraDoEncerramento(
  input: Readonly<Entrada>,
): Readonly<{ modo: StripeMode; chave: string }> {
  assertAllowed(
    input.RECREIO_PORTAL_RENEWAL_MODE === "native" && input.RECREIO_RENEWAL_JOBS_MODE === "on",
    "INDISPONIVEL",
    "A coordenação do encerramento financeiro ainda não está disponível.",
  );
  const modo = input.STRIPE_MODE,
    chave = input.STRIPE_SECRET_KEY;
  assertAllowed(
    modo === "dev" || modo === "prod",
    "INDISPONIVEL",
    "O modo financeiro ainda não está configurado.",
  );
  assertAllowed(
    segredoStripeCompativel(modo, chave),
    "INDISPONIVEL",
    "A coordenação financeira ainda não está configurada.",
  );
  return Object.freeze({ modo, chave });
}

export function criarRuntimeFinanceiroDoEncerramento(
  input: Readonly<Entrada>,
): RuntimeFinanceiroDoEncerramento {
  const config = conferirConfiguracaoFinanceiraDoEncerramento(input);
  return {
    modo: config.modo,
    inventario: createStripeRecreioClosureInventory({ secretKey: config.chave, mode: config.modo }),
  };
}
