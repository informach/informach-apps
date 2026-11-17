import "server-only";
import { db } from "@informach/db";
import type { FamilyTransaction } from "@informach/family";

/** An application refusal rolls back earlier writes in the batch as well. */
export async function atomicAgendaResult<T extends { ok: boolean }>(
  work: (tx: FamilyTransaction) => Promise<T>,
  client: typeof db | FamilyTransaction = db,
): Promise<T> {
  const abort = Symbol("agenda-transaction-refused");
  let refused: T | undefined;
  try {
    return await client.transaction(async (tx) => {
      const result = await work(tx);
      if (!result.ok) {
        refused = result;
        throw abort;
      }
      return result;
    });
  } catch (error) {
    if (error === abort && refused) return refused;
    throw error;
  }
}
