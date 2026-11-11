import { BillingError } from "../errors";

const messages = {
  reservations: "Resolve all legacy reservations before migration",
  debt: "Resolve the legacy credit debt before conversion",
  suspended: "Resolve suspended funding before conversion",
  future: "Resolve future-effective financial entries before migration",
  review: "Resolve pending financial events before migration",
} as const;

export class CreditMigrationBlockedError extends BillingError {
  constructor(readonly reason: keyof typeof messages) {
    super(messages[reason]);
    this.name = "CreditMigrationBlockedError";
  }
}
