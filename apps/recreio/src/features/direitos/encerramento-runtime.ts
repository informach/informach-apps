import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { cancelamentoDaRenovacaoDisponivel } from "@/features/cobranca/renovacao-service";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { comRuntimeDoConsentimento, retiradaDisponivel } from "./consentimento-runtime";
import { confirmarEncerramentoDeConta } from "./encerramento-service";

export function encerramentoDisponivel() {
  return (
    env.RECREIO_ACCOUNT_CLOSURE_MODE === "native" &&
    retiradaDisponivel() &&
    env.RECREIO_FINANCIAL_JOBS_MODE === "on" &&
    cancelamentoDaRenovacaoDisponivel()
  );
}

export function confirmarEncerramentoAtual(autor: AutorNativoRecente, entrada: unknown) {
  assertAllowed(
    encerramentoDisponivel(),
    "INDISPONIVEL",
    "A confirmação do encerramento ainda não está disponível.",
  );
  return comRuntimeDoConsentimento((config) =>
    confirmarEncerramentoDeConta(autor, entrada, { ...config, modo: env.STRIPE_MODE }),
  );
}
