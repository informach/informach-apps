"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { runAction, verifiedUser } from "@/lib/action";
import { env } from "@/lib/env";
import { FAMILY_COOKIE, validateFamilyChoice } from "./context";
import { PROFILE_COOKIE } from "./view";

export async function selectFamilyAction(raw: string) {
  return runAction(async () => {
    const groupId = z.uuid().parse(raw);
    const actor = await verifiedUser();
    await validateFamilyChoice(actor.id, groupId);
    const jar = await cookies();
    jar.set(FAMILY_COOKIE, groupId, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    jar.delete(PROFILE_COOKIE);
  });
}
