import "server-only";
import { getRuntimeDaConciliacao } from "@/lib/billing";
import { env } from "@/lib/env";
import { packageLogger } from "@/lib/observability";
import { criarProcessadorDeConciliacao } from "./conciliacao-service";

type Resultado = Awaited<ReturnType<ReturnType<typeof criarProcessadorDeConciliacao>>>;

/** Partial processing must remain a failed operation for the scheduler and ops. */
export class ConciliacaoIncompleta extends Error {
  constructor(readonly resultado: Resultado) {
    super("Financial reconciliation requires review");
    this.name = "ConciliacaoIncompleta";
  }
}

export function criarRotinaDeConciliacao(deps: {
  habilitada: () => boolean;
  processar: () => Promise<Resultado>;
}) {
  return async () => {
    if (!deps.habilitada())
      return {
        habilitada: false,
        reservadas: 0,
        conciliadas: 0,
        emConferencia: 0,
        falhasTecnicas: 0,
      };
    const resultado = await deps.processar();
    if (resultado.emConferencia > 0 || resultado.falhasTecnicas > 0)
      throw new ConciliacaoIncompleta(resultado);
    return { habilitada: true, ...resultado };
  };
}

export const executarConciliacao = criarRotinaDeConciliacao({
  habilitada: () => env.RECREIO_FINANCIAL_JOBS_MODE === "on",
  processar: criarProcessadorDeConciliacao({
    modo: env.STRIPE_MODE,
    obterRuntime: getRuntimeDaConciliacao,
    relatarFalha: ({ reasonCode }) =>
      packageLogger.error("recreio.billing_reconciliation_failed", { reasonCode }),
  }),
});
