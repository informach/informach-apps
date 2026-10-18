import type { Database } from "@informach/db";
import { emailDeliveries, emailSuppressions, emailUnsubscribes, users } from "@informach/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export type DeliveryBlockReason =
  | { kind: "suppressed"; reason: string }
  | { kind: "unsubscribed"; userId: string; category: string };

/**
 * Categorias que chegam mesmo com descadastro: os e-mails de acesso (`auth.*`,
 * sem eles não dá para entrar) e o aviso de queda do Bastidores, que é
 * operacional. O resumo da semana do Bastidores e os demais obedecem.
 * Supressão por bounce ou spam vale para todas.
 */
const OPERATIONAL_CATEGORIES: ReadonlySet<string> = new Set(["admin.alert"]);

export function shouldRespectUnsubscribe(category: string): boolean {
  return !category.startsWith("auth.") && !OPERATIONAL_CATEGORIES.has(category);
}

export function describeDeliveryBlockReason(block: DeliveryBlockReason): string {
  if (block.kind === "suppressed") {
    return `recipient suppressed: ${block.reason}`;
  }
  return `recipient unsubscribed from ${block.category}`;
}

async function findUserIdByEmail(db: Database, email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user?.id ?? null;
}

export async function findDeliveryBlockReason(
  db: Database,
  input: {
    recipient: string;
    category: string;
    userId?: string | null;
  },
): Promise<DeliveryBlockReason | null> {
  const recipient = input.recipient.toLowerCase();

  const [suppression] = await db
    .select({ reason: emailSuppressions.reason })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, recipient))
    .limit(1);

  if (suppression) {
    return { kind: "suppressed", reason: suppression.reason };
  }

  if (!shouldRespectUnsubscribe(input.category)) {
    return null;
  }

  const userId = input.userId ?? (await findUserIdByEmail(db, recipient));
  if (!userId) {
    return null;
  }

  const [unsubscribe] = await db
    .select({ userId: emailUnsubscribes.userId })
    .from(emailUnsubscribes)
    .where(
      and(eq(emailUnsubscribes.userId, userId), eq(emailUnsubscribes.category, input.category)),
    )
    .limit(1);

  if (!unsubscribe) {
    return null;
  }

  return { kind: "unsubscribed", userId, category: input.category };
}

export async function markDeliveryBlocked(
  db: Database,
  deliveryId: string,
  block: DeliveryBlockReason,
  statuses: Array<"pending" | "failed" | "sending"> = ["pending", "failed", "sending"],
): Promise<boolean> {
  const status = block.kind === "suppressed" ? "dropped" : "skipped";
  const updated = await db
    .update(emailDeliveries)
    .set({
      status,
      lastError: describeDeliveryBlockReason(block),
      updatedAt: new Date(),
    })
    .where(and(eq(emailDeliveries.id, deliveryId), inArray(emailDeliveries.status, statuses)))
    .returning({ id: emailDeliveries.id });

  return updated.length > 0;
}
