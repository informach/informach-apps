import "server-only";
import { z } from "zod/v4";
import { accountParticipation } from "@/lib/account-closure";
import { getBillingMaintenance } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { billingAvailability } from "./availability";
import {
  coordination,
  enqueueEvent,
  futureContract,
  anotherPayer as hasAnotherPayer,
  legacyContracts,
  legacyFamilyEligible,
  legacyWallets,
  payerAccount,
  payerAccounts,
  walletHistory,
} from "./repository";
export async function billingPanel(
  actorId: string,
  groupId: string | undefined,
  query: { pagamento?: string; contratos?: string; extrato?: number },
) {
  const participation = await accountParticipation(actorId);
  const operations = billingAvailability(getEnv(), participation.state === "active");
  const accounts = await payerAccounts(actorId, query.contratos);
  const selectedId =
    query.pagamento ??
    accounts.accounts.find((a) => a.groupId === groupId && !a.closedAt)?.id ??
    (!groupId && accounts.accounts.length === 1 && !accounts.nextCursor
      ? accounts.accounts[0]?.id
      : undefined);
  const [selected, history, anotherPayer, legacy, contracts, eligible] = await Promise.all([
    selectedId ? payerAccount(actorId, selectedId) : null,
    groupId ? walletHistory(actorId, groupId, query.extrato) : null,
    groupId ? hasAnotherPayer(actorId, groupId) : false,
    legacyWallets(actorId),
    groupId ? legacyContracts(actorId, groupId) : null,
    groupId ? legacyFamilyEligible(actorId, groupId) : false,
  ]);
  const [future, coordinationRequest] = selected
    ? await Promise.all([
        futureContract(actorId, selected.account.id),
        coordination(actorId, selected.account.id),
      ])
    : [null, null];
  return {
    accounts,
    selected,
    history,
    anotherPayer,
    legacy,
    legacyContracts: contracts,
    legacyFamilyEligible: eligible,
    futureContract: future,
    coordination: coordinationRequest,
    enabled: operations.subscribe,
    operations,
  };
}
export async function receiveBillingEvent(raw: string, signature: string | null) {
  const billing = getBillingMaintenance();
  const event = billing.providerClient.verifyWebhookSignature(raw, signature);
  if (
    !/^(checkout\.session\.|customer\.subscription\.|invoice\.|payment_intent\.|charge\.|subscription_schedule\.)/.test(
      event.type,
    )
  )
    return;
  const data = event.payload.data;
  const object = data && typeof data === "object" && "object" in data ? data.object : null;
  const reference = await billing.reader.eventPaymentReference(object);
  const scheduleEvent =
    event.type === "subscription_schedule.created"
      ? z
          .object({
            request: z.object({
              idempotency_key: z.string().regex(/^compasso:plan:[0-9a-f-]{36}:create$/),
            }),
            data: z.object({
              object: z.object({
                id: z.string().startsWith("sub_sched_"),
                subscription: z.string().startsWith("sub_"),
              }),
            }),
          })
          .safeParse(event.payload)
      : null;
  const intentId = scheduleEvent?.success
    ? scheduleEvent.data.request.idempotency_key.split(":")[2]
    : undefined;
  const scheduleCreated =
    scheduleEvent?.success && z.uuid().safeParse(intentId).success
      ? {
          intentId: intentId as string,
          scheduleId: scheduleEvent.data.data.object.id,
          subscriptionId: scheduleEvent.data.data.object.subscription,
        }
      : undefined;
  if (reference.customerId)
    await enqueueEvent({
      ...reference,
      customerId: reference.customerId,
      eventId: event.id,
      eventType: event.type,
      scheduleCreated,
    });
}
