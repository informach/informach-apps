/**
 * Troca de plano agendada, vista pelos eventos. No fim do período o Stripe
 * encerra a assinatura antiga (`billing.subscription_canceled`) e o pacote de
 * cobrança cria a nova, gravando `billing.subscription_created` com
 * `reason: "scheduled_downgrade"` e o ID da antiga em `previousSubscriptionId`.
 * Depois o Stripe ainda avisa da nova com outro `billing.subscription_created`.
 * Nada disso é cancelamento nem assinatura do zero, e as frases precisam saber.
 */

type BillingEvent = { eventType: string; payload: Record<string, unknown> | null };

export type SubscriptionLinks = {
  /** Assinaturas encerradas para dar lugar à troca agendada. */
  replaced: ReadonlySet<string>;
  /** Assinaturas criadas pela troca agendada. */
  replacements: ReadonlySet<string>;
};

export const NO_SUBSCRIPTION_LINKS: SubscriptionLinks = {
  replaced: new Set(),
  replacements: new Set(),
};

function id(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function subscriptionLinks(events: readonly BillingEvent[]): SubscriptionLinks {
  const replaced = new Set<string>();
  const replacements = new Set<string>();
  for (const event of events) {
    const payload = event.payload ?? {};
    if (event.eventType !== "billing.subscription_created") continue;
    if (payload.reason !== "scheduled_downgrade") continue;
    const previous = id(payload, "previousSubscriptionId");
    const next = id(payload, "subscriptionId");
    if (previous) replaced.add(previous);
    if (next) replacements.add(next);
  }
  return { replaced, replacements };
}

/** A troca agendada aplicada, e não o aviso do Stripe sobre a mesma assinatura. */
export function isScheduledSwitch(payload: Record<string, unknown>): boolean {
  return payload.reason === "scheduled_downgrade";
}

/** O ID da assinatura citada no evento, como os pacotes gravam. */
export function subscriptionIdOf(payload: Record<string, unknown>): string | null {
  return id(payload, "subscriptionId");
}
