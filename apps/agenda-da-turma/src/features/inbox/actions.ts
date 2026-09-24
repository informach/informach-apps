"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordProductEvent } from "@/features/metrics/events";
import { action, err, ok } from "@/lib/action";
import { setInboxMessageStatus } from "./repository";
import { createInboxAddress, revokeInboxAddress } from "./service";

function refreshInbox() {
  for (const path of ["/dashboard", "/familia/ajustes"]) revalidatePath(path, "page");
}

export const createInboxAddressAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "inbox-address-create", max: 10, window: "1h" })
  .run(async ({ ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await createInboxAddress(ctx.actor.id);
    if (result.ok) refreshInbox();
    return result;
  });

export const revokeInboxAddressAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "inbox-address-revoke", max: 10, window: "1h" })
  .run(async ({ ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await revokeInboxAddress(ctx.actor.id);
    if (result.ok) refreshInbox();
    return result;
  });

/**
 * A mensagem virou recado: sai da caixa e passa a apontar para ele.
 *
 * Chamada quando a leitura fica pronta, não quando a revisão é salva — a
 * partir dali o acompanhamento é do card "Falta conferir antes de salvar", e
 * manter a mesma coisa em duas listas seria a duplicação que este app evita.
 */
export const useInboxMessageAction = action
  .input(z.object({ id: z.string().uuid(), noticeId: z.string().uuid() }))
  .auth({ require: "user" })
  .rateLimit({ key: "inbox-message-use", max: 100, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const used = await setInboxMessageStatus(ctx.actor.id, input.id, "used", input.noticeId);
    if (!used) return err({ code: "NOT_FOUND" } as const);
    await recordProductEvent(ctx.actor.id, { event: "inbox_message_used" });
    refreshInbox();
    return ok({ used: true } as const);
  });

export const discardInboxMessageAction = action
  .input(z.object({ id: z.string().uuid() }))
  .auth({ require: "user" })
  .rateLimit({ key: "inbox-message-discard", max: 100, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const discarded = await setInboxMessageStatus(ctx.actor.id, input.id, "discarded");
    if (!discarded) return err({ code: "NOT_FOUND" } as const);
    refreshInbox();
    return ok({ discarded: true } as const);
  });
