"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { runAction, verifiedUser } from "@/lib/action";
import { env } from "@/lib/env";
import { endStudyAction } from "../study-access/actions";
import { FAMILY_COOKIE } from "./context";
import { validateFamilyChoice } from "./context-repository";

export async function selectFamilyAction(raw: string) {
  return runAction(async () => {
    const groupId = z.uuid().parse(raw);
    const user = await verifiedUser();
    await validateFamilyChoice(user.id, groupId);
    await endStudyAction();
    (await cookies()).set(FAMILY_COOKIE, groupId, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  });
}
