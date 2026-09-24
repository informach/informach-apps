"use server";

import { revalidatePath } from "next/cache";
import { action, err } from "@/lib/action";
import { saveSubjectKitSchema } from "./schemas";
import { saveSubjectKit } from "./service";

export const saveSubjectKitAction = action
  .input(saveSubjectKitSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "subject-kit-save", max: 100, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await saveSubjectKit(ctx.actor.id, input);
    // A mochila de amanhã e o horário de hoje leem a lista: as duas vivem no
    // dashboard.
    if (result.ok) revalidatePath("/dashboard", "page");
    return result;
  });
