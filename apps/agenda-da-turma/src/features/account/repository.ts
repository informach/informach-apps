import "server-only";
import { and, db, eq, inArray, ne } from "@informach/db";
import { checkoutIntents, customers, subscriptions } from "@informach/db/schema";

// core.users is shared by Informach apps. This app must not delete an identity
// while another app can still bill it; cancellation belongs to that app's flow.
export async function hasOtherAppSubscriptions(userId: string) {
  const pending = await db
    .select({ id: checkoutIntents.id })
    .from(checkoutIntents)
    .innerJoin(customers, eq(checkoutIntents.customerId, customers.id))
    .where(and(eq(checkoutIntents.userId, userId), ne(customers.app, "agenda-da-turma")))
    .limit(1);
  if (pending.length) return true;
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, userId),
        ne(customers.app, "agenda-da-turma"),
        inArray(subscriptions.status, [
          "active",
          "trialing",
          "past_due",
          "unpaid",
          "incomplete",
          "paused",
        ]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
