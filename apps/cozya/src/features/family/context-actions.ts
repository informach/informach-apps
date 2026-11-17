"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { env } from "@/lib/env";
import { FAMILY_COOKIE } from "./context";
import { validateFamilyChoice } from "./context-repository";
export const selectFamilyAction = action
  .input(z.object({ groupId: z.uuid().nullable() }))
  .auth({ require: "user" })
  .rateLimit({ key: "family-context", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    await validateFamilyChoice(ctx.actor.id, input.groupId);
    (await cookies()).set(FAMILY_COOKIE, input.groupId ?? "personal", {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    return ok({ selected: true });
  });
