import { checkoutIntents } from "@informach/db/schema";
import { sql } from "drizzle-orm";

/** A checkout intent still matters unless the provider proved it completed
 * into the historical contract it belongs to (`legacy_checkout_resolutions`).
 * Expiry or status alone never resolves it. */
export const unresolvedCheckoutIntent = sql`not exists (
  select 1 from billing.legacy_checkout_resolutions r
  where r.provider_session_id = ${checkoutIntents.providerSessionId}
    and r.customer_id = ${checkoutIntents.customerId})`;
