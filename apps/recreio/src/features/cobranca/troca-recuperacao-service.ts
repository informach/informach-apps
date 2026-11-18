import "server-only";
import type { PaymentReadBudget } from "@informach/billing/payment-facts";
import type { RecreioPlanScheduleProvider } from "@informach/billing/providers/stripe-plans";
import { assertAllowed } from "@/lib/errors";
import { capturarAgendaDaTrocaLocked, type TentativaDeTroca } from "./troca-execucao-repository";

/** Caller holds the payer lifecycle. A durable native capability, never a
 * financial price observation, authorizes these narrowly scoped mutations. */
export async function recuperarAgendaAdmitida(
  prova: TentativaDeTroca,
  agendas: RecreioPlanScheduleProvider,
  budget: PaymentReadBudget,
) {
  let agenda = prova.scheduleId;
  const entrada = { ...prova.entrada, budget };
  const conferirPrazo = () =>
    assertAllowed(
      Date.now() < budget.deadlineMs,
      "COBRANCA_EM_CONFERENCIA",
      "A confirmação da troca excedeu o prazo de leitura.",
    );
  try {
    conferirPrazo();
    agenda ??= prova.cancelar ? await agendas.find(entrada) : await agendas.create(entrada);
    assertAllowed(
      agenda,
      "COBRANCA_EM_CONFERENCIA",
      "O cancelamento aguarda a identificação exata da operação anterior.",
    );
    conferirPrazo();
    await capturarAgendaDaTrocaLocked(prova, agenda, "identified");
    const estado = await agendas.reconcile({
      ...entrada,
      scheduleId: agenda,
      cancel: prova.cancelar,
    });
    conferirPrazo();
    const observacao = await capturarAgendaDaTrocaLocked(prova, agenda, estado);
    assertAllowed(observacao, "COBRANCA", "A confirmação externa não foi registrada.");
    return { falhou: false, observacao };
  } catch (error) {
    try {
      await capturarAgendaDaTrocaLocked(prova, agenda, "unconfirmed");
    } catch (captura) {
      throw new AggregateError(
        [error, captura],
        "A operação externa e seu registro exigem conferência.",
      );
    }
    return { falhou: true, observacao: null };
  }
}
