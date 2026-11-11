import "server-only";
import { err } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { recordProductEvent } from "@/features/metrics/events";
import { applyTaskStatusOnce } from "./repository";
import type { QUEUED_STATUSES, WriteReceipt } from "./schemas";
export type TaskStatusWriteInput = {
  key: string;
  id: string;
  version: number;
  status: (typeof QUEUED_STATUSES)[number];
  queued?: boolean;
};
export async function writeTaskStatusOnce(
  actor: AgendaAuthority,
  input: TaskStatusWriteInput,
): Promise<WriteReceipt> {
  try {
    const outcome = await applyTaskStatusOnce({
      key: input.key,
      actor,
      input: { id: input.id, version: input.version, status: input.status },
    });
    if (input.queued && !outcome.replayed && outcome.result.ok)
      await recordProductEvent(actor.userId, { event: "offline_queue_flushed", count: 1 });
    return outcome.result;
  } catch (error) {
    if (error instanceof FamilyError)
      return err({
        code: error.code === "CAPACITY_EXCEEDED" ? "PROFILE_LIMIT_REACHED" : "NOT_FOUND",
      });
    throw error;
  }
}

export { resolveLegacyQueueContexts } from "./repository";
