import "server-only";

import type { LedgerEntryType } from "@informach/billing";
import { cache } from "react";
import { billing } from "./service";

const CREDIT_RECEIVED_ENTRY_TYPES: LedgerEntryType[] = [
  "purchase",
  "bonus_grant",
  "promo_grant",
  "adjustment",
];

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

export const getBillingSubscriptionForUser = cache((userId: string) =>
  billing.getSubscription(userSubject(userId)),
);

export const getBillingBalanceForUser = cache((userId: string) =>
  billing.getBalance(userSubject(userId)),
);

export const getIsProForUser = cache((userId: string) =>
  billing.hasProSubscription(userSubject(userId)),
);

/** Every subscription of the user in the Cozya, in any status: who already subscribed once. */
export const getBillingSubscriptionHistoryForUser = cache((userId: string) =>
  billing.listSubscriptions(userSubject(userId)),
);

export const getBillingCreditHistoryForUser = cache((userId: string, limit: number) =>
  billing.getCreditHistory(userSubject(userId), { limit }),
);

export const getBillingCreditReceivedHistoryForUser = cache((userId: string, limit: number) =>
  billing.getCreditHistory(userSubject(userId), {
    entryTypes: CREDIT_RECEIVED_ENTRY_TYPES,
    limit,
  }),
);
