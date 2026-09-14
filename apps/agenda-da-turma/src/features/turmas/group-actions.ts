"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, err } from "@/lib/action";
import { removeGroupAdult, rotateGroupCode } from "./group-access";

const groupSchema = z.object({ turmaId: z.string().uuid() });
export const rotateGroupCodeAction = action
  .input(groupSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "group-rotate", max: 10, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await rotateGroupCode(ctx.actor.id, input.turmaId);
    if (result.ok) revalidatePath("/familia", "layout");
    return result;
  });
export const removeGroupAdultAction = action
  .input(groupSchema.extend({ memberUserId: z.string().min(1).max(128) }))
  .auth({ require: "user" })
  .rateLimit({ key: "group-remove", max: 20, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await removeGroupAdult(ctx.actor.id, input.turmaId, input.memberUserId);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  });
