import "server-only";
import {
  assertRecreioRenewalObservation,
  type RecreioRenewalProvider,
  type RecreioRenewalReviewCode,
  RecreioRenewalReviewError,
} from "@informach/billing/providers/stripe-recreio-renewals";
import type { StripeMode } from "@informach/config";
import { AppError, assertAllowed } from "@/lib/errors";
import { comCicloDeCobranca } from "./lifecycle";
import {
  confirmarCancelamentoDaRenovacaoLocked,
  iniciarCancelamentoDaRenovacaoLocked,
  registrarFalhaDoCancelamentoDaRenovacaoLocked,
  reservarCancelamentoDaRenovacao,
} from "./renovacao-execucao-repository";

export type RuntimeDoCancelamentoDaRenovacao = {
  modo: StripeMode;
  renovacoes: RecreioRenewalProvider;
};
function motivo(error: unknown): RecreioRenewalReviewCode | null {
  if (error instanceof RecreioRenewalReviewError) return error.code;
  if (error instanceof AppError && error.code === "ORIGEM_FINANCEIRA") return "foreign_contract";
  return null;
}

/** Durable reduction consent survives logout. Never fabricates native authority
 * or admits a new commercial operation. No network inside row transactions. */
export function criarProcessadorDeCancelamentoDaRenovacao(deps: {
  modo: StripeMode;
  obterRuntime: () => RuntimeDoCancelamentoDaRenovacao;
  relatarFalha: (entrada: { reasonCode: RecreioRenewalReviewCode | "technical_failure" }) => void;
}) {
  return async () => {
    const resultado = { reservadas: 0, confirmadas: 0, emConferencia: 0, falhasTecnicas: 0 };
    const relatar = (reasonCode: RecreioRenewalReviewCode | "technical_failure") => {
      try {
        deps.relatarFalha({ reasonCode });
      } catch {
        // The durable receipt and HTTP failure do not depend on telemetry.
      }
    };
    const inicio = Date.now();
    let runtime: RuntimeDoCancelamentoDaRenovacao | undefined;
    for (let n = 0; n < 8 && Date.now() - inicio < 60_000; n++) {
      const trabalho = await reservarCancelamentoDaRenovacao(deps.modo);
      if (!trabalho) break;
      resultado.reservadas++;
      try {
        await comCicloDeCobranca(trabalho.paganteId, async () => {
          try {
            const tentativa = await iniciarCancelamentoDaRenovacaoLocked(trabalho);
            runtime ??= deps.obterRuntime();
            if (runtime.modo !== trabalho.modo) {
              throw new RecreioRenewalReviewError("namespace_mismatch");
            }
            const budget = { deadlineMs: Date.now() + 90_000 };
            const observacao = await runtime.renovacoes.stop({ ...tentativa.entrada, budget });
            assertAllowed(
              Date.now() < budget.deadlineMs,
              "COBRANCA",
              "A conferência excedeu o prazo.",
            );
            assertRecreioRenewalObservation(observacao, tentativa.entrada, trabalho.modo);
            await confirmarCancelamentoDaRenovacaoLocked(tentativa, observacao);
            resultado.confirmadas++;
          } catch (error) {
            const reasonCode = motivo(error);
            if (reasonCode === null) throw error;
            await registrarFalhaDoCancelamentoDaRenovacaoLocked(trabalho, reasonCode);
            resultado.emConferencia++;
            relatar(reasonCode);
          }
        });
      } catch {
        resultado.falhasTecnicas++;
        relatar("technical_failure");
      }
    }
    return resultado;
  };
}
