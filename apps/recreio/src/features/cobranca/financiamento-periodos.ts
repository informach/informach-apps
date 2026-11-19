import "server-only";
import type { PaidPeriodFact, SubscriptionPaymentSnapshot } from "@informach/billing/payment-facts";
import { FinanciamentoInconclusivo } from "./financiamento-regras";
import {
  type ConferenciaFinanceiraDoCliente,
  conferirMarcaFinanceira,
} from "./financiamento-stripe";

/** Native projection only. Own invoice flags and original dates remain facts;
 * dependency revocation and credited cutoffs belong to the separate proof. */
export function prepararPeriodosDoFinanciamento(
  conferencia: ConferenciaFinanceiraDoCliente,
  observadoEm: Date,
): SubscriptionPaymentSnapshot[] {
  conferirMarcaFinanceira(conferencia);
  if (!Number.isFinite(observadoEm.getTime()))
    throw new FinanciamentoInconclusivo("relogio_nativo_invalido");
  const comprovados = new Map(
    conferencia.financiamento.periodos.map((p) => [JSON.stringify([p.faturaId, p.linhaId]), p]),
  );
  const vistos = new Set<string>();
  const snapshots = conferencia.leituras.map(({ snapshot, funding }) => {
    const capturas = new Map(funding.captures.map((c) => [c.id, c]));
    const periods: PaidPeriodFact[] = [];
    for (const invoice of funding.invoices) {
      const origens = invoice.captures.map((c) => {
        const captura = capturas.get(c.chargeId);
        if (!captura) throw new FinanciamentoInconclusivo("captura_da_fatura_ausente");
        return captura;
      });
      for (const line of invoice.lines) {
        if (line.amountCents <= 0) continue;
        const chave = JSON.stringify([invoice.id, line.id]),
          prova = comprovados.get(chave);
        if (
          !prova ||
          vistos.has(chave) ||
          prova.precoId !== line.priceId ||
          prova.inicio !== line.start ||
          prova.fimOriginal !== line.end
        )
          throw new FinanciamentoInconclusivo("periodo_sem_prova_correspondente");
        vistos.add(chave);
        periods.push({
          invoiceId: invoice.id,
          lineId: line.id,
          priceId: line.priceId,
          start: new Date(line.start * 1000),
          end: new Date(line.end * 1000),
          paidAt: new Date(invoice.paidAt * 1000),
          fullyRefunded:
            origens.length > 0 &&
            origens.every((c) => c.amountRefundedCents === c.amountCapturedCents),
          disputed: origens.some((c) => c.disputed),
        });
      }
    }
    return { ...snapshot, observedAt: observadoEm, periods };
  });
  if (vistos.size !== comprovados.size)
    throw new FinanciamentoInconclusivo("prova_sem_periodo_correspondente");
  return snapshots;
}
