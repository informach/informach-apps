"use server";
import { revalidatePath } from "next/cache";
import { action, err } from "@/lib/action";
import {
  confirmNoticeSchema,
  discardDraftActionSchema,
  discardNoticeSchema,
  statusNoticeActionSchema,
  updateNoticeActionSchema,
} from "./schemas";
import {
  confirmNotice,
  discardDraftAction,
  discardNotice,
  setNoticeActionStatus,
  updateNoticeAction,
} from "./service";

function refreshRoutine() {
  for (const path of ["/dashboard", "/recados", "/calendario", "/atividades"])
    revalidatePath(path, "layout");
}
/**
 * Descartar não mexe em atividade nenhuma: só nos dois lugares que anunciam
 * "Falta conferir antes de salvar".
 *
 * `"page"`, nunca `"layout"`: revalidar `/recados` como layout alcança
 * `/recados/novo`, que é justamente a tela onde a pessoa está descartando. Ela
 * seria re-renderizada dentro da resposta da própria ação, com o recado já fora
 * de `ready`, e cairia em "não encontrado" levando junto o que estivesse
 * escrito à mão.
 */
function refreshDrafts() {
  for (const path of ["/dashboard", "/recados"]) revalidatePath(path, "page");
}
export const confirmNoticeAction = action
  .input(confirmNoticeSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "notice-confirm", max: 60, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await confirmNotice(ctx.actor.id, input);
    if (result.ok) refreshRoutine();
    return result;
  });
export const updateNoticeActionAction = action
  .input(updateNoticeActionSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "notice-update", max: 100, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await updateNoticeAction(ctx.actor.id, input);
    if (result.ok) refreshRoutine();
    return result;
  });
export const setNoticeStatusAction = action
  .input(statusNoticeActionSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "notice-status", max: 100, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await setNoticeActionStatus(ctx.actor.id, input);
    if (result.ok) refreshRoutine();
    return result;
  });
export const discardDraftActionAction = action
  .input(discardDraftActionSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "notice-discard-action", max: 100, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await discardDraftAction(ctx.actor.id, input);
    if (result.ok) refreshDrafts();
    return result;
  });
export const discardNoticeAction = action
  .input(discardNoticeSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "notice-discard", max: 60, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await discardNotice(ctx.actor.id, input);
    if (result.ok) refreshDrafts();
    return result;
  });
