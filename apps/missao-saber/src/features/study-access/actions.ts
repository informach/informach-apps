"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { audit } from "@/lib/observability";
import { PROFILE_COOKIE, STUDY_COOKIE, safeDestination } from "./policy";
import { createStudyCode, endStudyDevice, revokeStudyDevice } from "./repository";

export async function endStudyAction() {
  const jar = await cookies();
  const token = jar.get(STUDY_COOKIE)?.value;
  if (token) await endStudyDevice(token);
  jar.delete(STUDY_COOKIE);
  jar.delete(PROFILE_COOKIE);
}

/** Called only after successful adult authentication, before changing UI context. */
export async function completeParentSignInAction(next: unknown) {
  return runAction(async () => {
    await verifiedUser();
    await endStudyAction();
    return { destination: safeDestination(next, "parent") };
  });
}

export async function createStudyCodeAction(input: unknown) {
  return runAction(async () => {
    const result = await createStudyCode((await recentParent()).id, input);
    audit({
      eventType: "missao.study_code_issued",
      actorId: result.device.userId,
      payload: { deviceId: result.device.id },
    });
    revalidatePath("/familia/conta");
    return {
      id: result.device.id,
      code: result.code,
      expiresAt: result.device.expiresAt.toISOString(),
    };
  });
}

export async function revokeStudyDeviceAction(raw: unknown) {
  return runAction(async () => {
    const user = await recentParent();
    const deviceId = z.string().uuid().parse(raw);
    if (await revokeStudyDevice(user.id, deviceId))
      audit({ eventType: "missao.study_revoked", actorId: user.id, payload: { deviceId } });
    revalidatePath("/familia/conta");
  });
}
