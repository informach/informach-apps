import "server-only";
import {
  assertRecreioRenewalObservation,
  type RecreioRenewalProvider,
  type RecreioRenewalReviewCode,
  RecreioRenewalReviewError,
} from "@informach/billing/providers/stripe-recreio-renewals";
import type { StripeMode } from "@informach/config";
import {
  comCicloFinanceiroDaCoordenacao,
  exigirFinanceiroPrivado,
  reconferirFinanceiroPrivado,
} from "@/features/direitos/coordenacao-repository";
import type { CoordenacaoDeEfeitos } from "@/features/direitos/efeitos-repository";
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
type DependenciasDaRenovacao = {
  modo: StripeMode;
  obterRuntime: () => RuntimeDoCancelamentoDaRenovacao;
  relatarFalha: (entrada: { reasonCode: RecreioRenewalReviewCode | "technical_failure" }) => void;
};
export function criarProcessadorDeCancelamentoDaRenovacao(deps: DependenciasDaRenovacao) {
  return processadorDeRenovacoes(deps);
}

/** Scoped private entry; an ordinary/copy/expired coordination is rejected.
 * The original child and its single private connection remain held across I/O. */
export function criarProcessadorDeRenovacaoRecuperada(
  config: CoordenacaoDeEfeitos,
  deps: DependenciasDaRenovacao,
) {
  exigirFinanceiroPrivado(config);
  return processadorDeRenovacoes(deps, config);
}

function processadorDeRenovacoes(deps: DependenciasDaRenovacao, config?: CoordenacaoDeEfeitos) {
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
      if (config) await reconferirFinanceiroPrivado(config);
      const trabalho = await reservarCancelamentoDaRenovacao(deps.modo, config);
      if (!trabalho) break;
      resultado.reservadas++;
      try {
        const comCiclo = <T>(executar: () => Promise<T>) =>
          config
            ? comCicloFinanceiroDaCoordenacao(config, trabalho.paganteId, executar)
            : comCicloDeCobranca(trabalho.paganteId, executar);
        await comCiclo(async () => {
          try {
            const tentativa = await iniciarCancelamentoDaRenovacaoLocked(trabalho, config);
            runtime ??= deps.obterRuntime();
            if (runtime.modo !== trabalho.modo) {
              throw new RecreioRenewalReviewError("namespace_mismatch");
            }
            const budget = { deadlineMs: Date.now() + 90_000 };
            const observacao = await runtime.renovacoes.stop({ ...tentativa.entrada, budget });
            if (config) await reconferirFinanceiroPrivado(config);
            assertAllowed(
              Date.now() < budget.deadlineMs,
              "COBRANCA",
              "A conferência excedeu o prazo.",
            );
            assertRecreioRenewalObservation(observacao, tentativa.entrada, trabalho.modo);
            await confirmarCancelamentoDaRenovacaoLocked(tentativa, observacao, config);
            resultado.confirmadas++;
          } catch (error) {
            const reasonCode = motivo(error);
            if (reasonCode === null) throw error;
            await registrarFalhaDoCancelamentoDaRenovacaoLocked(trabalho, reasonCode, config);
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
