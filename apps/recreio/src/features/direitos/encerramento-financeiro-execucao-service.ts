import "server-only";
import type {
  RecreioClosureInventory,
  RecreioClosureInventoryReader,
} from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import type { StripeMode } from "@informach/config";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { AppError, assertAllowed } from "@/lib/errors";
import type { CoordenacaoDeEfeitos } from "./efeitos-repository";
import {
  concluirFinanceiroDoEncerramentoLocked,
  escopoDoInventarioDoEncerramento,
  haFinanceiroDoEncerramentoDevido,
  iniciarFinanceiroDoEncerramentoLocked,
  type MotivoFinanceiroDoEncerramento,
  registrarFalhaFinanceiraDoEncerramentoLocked,
  reservarFinanceiroDoEncerramento,
} from "./encerramento-financeiro-execucao-repository";
import { FalhaDoLivroDeDireitos } from "./livro/contrato";

export type RuntimeFinanceiroDoEncerramento = {
  modo: StripeMode;
  inventario: RecreioClosureInventoryReader;
};
/** Only static classifications cross the operational/Sentry boundary. */
export class FinanceiroDoEncerramentoIndisponivel extends Error {
  constructor(readonly reasonCode: MotivoFinanceiroDoEncerramento | "technical_failure") {
    super("Account closure financial coordination requires reconciliation");
    this.name = "FinanceiroDoEncerramentoIndisponivel";
  }
}
function motivo(error: unknown): MotivoFinanceiroDoEncerramento | null {
  if (error instanceof RecreioRenewalReviewError) return error.code;
  if (error instanceof FalhaDoLivroDeDireitos) return "invalid_evidence";
  if (error instanceof AppError) {
    if (error.code === "DIREITOS_LIVRO") return "ledger_unavailable";
    if (error.code === "DIREITOS_INTEGRIDADE") return "invalid_evidence";
    if (error.code === "INDISPONIVEL") return "scope_changed";
  }
  return null;
}

/** One financial receipt per pass. The durable consent, not a browser login,
 * authorizes reduction. No provider call inside a row transaction; a fresh
 * ledger preflight and the complete local source are checked again afterward. */
export function criarProcessadorFinanceiroDoEncerramento(deps: {
  livroId: string;
  obterCoordenacao: () => Promise<CoordenacaoDeEfeitos>;
  obterRuntime: () => RuntimeFinanceiroDoEncerramento;
}) {
  return async () => {
    if (!(await haFinanceiroDoEncerramentoDevido(deps.livroId)))
      return { situacao: "ociosa" as const };
    const config = await deps.obterCoordenacao().catch(() => {
      throw new FinanceiroDoEncerramentoIndisponivel("ledger_unavailable");
    });
    assertAllowed(
      config.assinatura.livroId === deps.livroId,
      "DIREITOS_LIVRO",
      "Livro fora da composição financeira.",
    );
    const trabalho = await reservarFinanceiroDoEncerramento(config);
    if (!trabalho) return { situacao: "ociosa" as const };
    return comCicloDeCobranca(trabalho.contaId, async () => {
      try {
        const tentativa = await iniciarFinanceiroDoEncerramentoLocked(trabalho, config);
        const budget = { deadlineMs: Date.now() + 90_000 };
        let observacao: RecreioClosureInventory | null = null;
        if (tentativa.origem.cliente) {
          const runtime = deps.obterRuntime();
          if (runtime.modo !== tentativa.modo)
            throw new RecreioRenewalReviewError("namespace_mismatch");
          observacao = await runtime.inventario.inspect(
            escopoDoInventarioDoEncerramento(tentativa, budget.deadlineMs),
          );
        }
        assertAllowed(
          Date.now() < budget.deadlineMs,
          "DIREITOS_INTEGRIDADE",
          "A leitura financeira excedeu seu prazo.",
        );
        const atual = await deps.obterCoordenacao().catch(() => {
          throw new FinanceiroDoEncerramentoIndisponivel("ledger_unavailable");
        });
        return await concluirFinanceiroDoEncerramentoLocked(tentativa, atual, observacao);
      } catch (error) {
        if (error instanceof AppError && error.code === "DIREITOS_POSSE")
          return { situacao: "posse_perdida" as const, operacaoId: trabalho.operacaoId };
        const reason =
          error instanceof FinanceiroDoEncerramentoIndisponivel ? error.reasonCode : motivo(error);
        if (reason === null || reason === "technical_failure")
          throw new FinanceiroDoEncerramentoIndisponivel("technical_failure");
        try {
          return await registrarFalhaFinanceiraDoEncerramentoLocked(trabalho, config, reason);
        } catch (failure) {
          if (failure instanceof AppError && failure.code === "DIREITOS_POSSE")
            return { situacao: "posse_perdida" as const, operacaoId: trabalho.operacaoId };
          throw new FinanceiroDoEncerramentoIndisponivel(reason);
        }
      }
    });
  };
}
