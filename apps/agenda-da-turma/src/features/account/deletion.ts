import "server-only";
import { billing } from "@/lib/billing";
import { cleanAgendaAccount } from "./cleanup";
import { hasOtherAppSubscriptions } from "./repository";

export async function prepareAgendaAccountDeletion(userId: string): Promise<void> {
  if (await hasOtherAppSubscriptions(userId))
    throw new Error(
      "Encerre as assinaturas dos outros apps Informach antes de excluir a conta compartilhada.",
    );
  const result = await billing.cancelBillingForSubject({ type: "user", id: userId });
  if (result.failed > 0)
    throw new Error(
      "Não foi possível encerrar a cobrança. Sua conta foi preservada; tente novamente.",
    );
  await cleanAgendaAccount(userId);
}
