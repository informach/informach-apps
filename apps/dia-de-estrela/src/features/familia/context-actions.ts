"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { CHILD_COOKIE, DEVICE_COOKIE, UNLOCK_COOKIE } from "@/features/aparelho/policy";
import { endDevice } from "@/features/aparelho/repository";
import { runAction, verifiedUser } from "@/lib/action";
import { env } from "@/lib/env";
import { FAMILY_COOKIE } from "./context";
import { validateFamilyChoice } from "./context-repository";

export async function selectFamilyAction(raw: string) {
  return runAction(async () => {
    const groupId = z.uuid().parse(raw);
    const user = await verifiedUser();
    await validateFamilyChoice(user.id, groupId);
    const jar = await cookies();
    const token = jar.get(DEVICE_COOKIE)?.value;
    if (token) await endDevice(token);
    jar.delete(DEVICE_COOKIE);
    jar.delete(CHILD_COOKIE);
    jar.delete(UNLOCK_COOKIE);
    jar.set(FAMILY_COOKIE, groupId, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  });
}
