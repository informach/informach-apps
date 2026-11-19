import "server-only";
import type { PaymentReadBudget } from "@informach/billing/payment-facts";
import type { RecreioUpgradeProvider } from "@informach/billing/providers/stripe-recreio-upgrades";
import { assertAllowed } from "@/lib/errors";
import {
  capturarFaturaDoAumentoLocked,
  type TentativaDeAumento,
} from "./troca-aumento-execucao-repository";

/** Caller holds the payer lifecycle. The branded durable attempt authorizes an
 * exact retry; financial facts or a current price alone never authorize it. */
export async function recuperarAumentoAdmitido(
  prova: TentativaDeAumento,
  aumentos: RecreioUpgradeProvider,
  budget: PaymentReadBudget,
) {
  try {
    assertAllowed(
      Date.now() < budget.deadlineMs,
      "COBRANCA_EM_CONFERENCIA",
      "A confirmação excedeu o prazo.",
    );
    const observada = await aumentos.apply({ ...prova.entrada, budget });
    assertAllowed(
      Date.now() < budget.deadlineMs,
      "COBRANCA_EM_CONFERENCIA",
      "A confirmação excedeu o prazo.",
    );
    const observacao = await capturarFaturaDoAumentoLocked(prova, observada);
    assertAllowed(observacao, "COBRANCA", "A confirmação externa não foi registrada.");
    return { falhou: false, observacao };
  } catch (error) {
    try {
      await capturarFaturaDoAumentoLocked(prova, null);
    } catch (captura) {
      throw new AggregateError([error, captura], "O aumento e seu registro exigem conferência.");
    }
    return { falhou: true, observacao: null };
  }
}
