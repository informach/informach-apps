"use server";
import { revalidatePath } from "next/cache";
import { action, err } from "@/lib/action";
import { confirmNoticeSchema, statusNoticeActionSchema, updateNoticeActionSchema } from "./schemas";
import { confirmNotice, setNoticeActionStatus, updateNoticeAction } from "./service";

function refreshRoutine() {
  for (const path of ["/dashboard", "/recados", "/calendario", "/atividades"])
    revalidatePath(path, "layout");
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
