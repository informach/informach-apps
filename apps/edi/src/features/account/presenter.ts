import type { suitePricing } from "../billing/pricing";

/** What the account page needs from `loadAccount`, independent of the server action module. */
export type AccountSnapshot = {
  user: { name: string; email: string; emailVerified: boolean };
  access:
    | { allowed: true; paidThrough: string }
    | { allowed: false; reason: "subscription_required" | "payment_required" | "suspended" };
  plans: readonly {
    status: string;
    productId: string | null;
    periodEnd: string;
    cancelAtPeriodEnd: boolean;
  }[];
  devices: readonly { id: string; name: string; lastSeenAt: string }[];
};

export type SubscriptionView =
  | {
      kind: "active";
      planLabel: string | null;
      monthly: boolean;
      dateLabel: "Renova em" | "Acesso até";
      date: string;
      ending: boolean;
    }
  | { kind: "payment_required" }
  | { kind: "suspended" }
  | { kind: "none"; returning: boolean };

export type AccountView = {
  user: AccountSnapshot["user"];
  subscription: SubscriptionView;
  hasBillingHistory: boolean;
  devices: { id: string; name: string; lastSeen: string }[];
};

// Dates are rendered on the server, in the audience's time zone, so the server
// and browser render the same text.
const TIME_ZONE = "America/Sao_Paulo";
const longDate = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const shortDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TIME_ZONE });
const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TIME_ZONE });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export function formatLongDate(iso: string) {
  return longDate.format(new Date(iso));
}

export function describeLastSeen(iso: string, now: Date) {
  const seen = new Date(iso);
  const day = dayKey.format(seen);
  if (day === dayKey.format(now)) return `visto hoje às ${time.format(seen)}`;
  if (day === dayKey.format(new Date(now.getTime() - 86_400_000)))
    return `visto ontem às ${time.format(seen)}`;
  return `visto em ${shortDate.format(seen)}`;
}

// Só para escolher o que mostrar. Quem decide o acesso é `accountAccess`, pelos
// períodos pagos; estes conjuntos não liberam nada.
const CURRENT_STATUSES = new Set(["active", "trialing", "past_due"]);
const RENEWING_STATUSES = new Set(["active", "trialing"]);
// Cobrança em aberto que o cliente resolve atualizando o cartão. Fora disso,
// `payment_required` é só um período pago que acabou (assinatura encerrada), e
// a pessoa precisa ver os planos para assinar de novo.
const PAYMENT_PROBLEM_STATUSES = new Set(["past_due", "unpaid", "incomplete", "paused"]);

export function presentAccount(
  account: AccountSnapshot,
  now: Date,
  pricing: ReturnType<typeof suitePricing>,
): AccountView {
  const current =
    account.plans.find((plan) => CURRENT_STATUSES.has(plan.status)) ?? account.plans[0];
  let subscription: SubscriptionView;
  if (account.access.allowed) {
    const annual = current?.productId === pricing.annual.productId;
    const monthly = current?.productId === pricing.monthly.productId;
    // Cancelada no fim do período, ou já encerrada com período pago restante:
    // nos dois casos não renova.
    const ending =
      !current || Boolean(current.cancelAtPeriodEnd) || !RENEWING_STATUSES.has(current.status);
    subscription = {
      kind: "active",
      planLabel: annual
        ? `Anual · ${pricing.annual.price}`
        : monthly
          ? `Mensal · ${pricing.monthly.price}`
          : null,
      monthly,
      ending,
      dateLabel: ending ? "Acesso até" : "Renova em",
      date: formatLongDate(current && !ending ? current.periodEnd : account.access.paidThrough),
    };
  } else if (
    account.access.reason === "payment_required" &&
    account.plans.some((plan) => PAYMENT_PROBLEM_STATUSES.has(plan.status))
  ) {
    subscription = { kind: "payment_required" };
  } else if (account.access.reason === "suspended") {
    subscription = { kind: "suspended" };
  } else {
    subscription = { kind: "none", returning: account.plans.length > 0 };
  }
  return {
    user: account.user,
    subscription,
    hasBillingHistory: account.plans.length > 0,
    devices: account.devices.map((device) => ({
      id: device.id,
      name: device.name,
      lastSeen: describeLastSeen(device.lastSeenAt, now),
    })),
  };
}
