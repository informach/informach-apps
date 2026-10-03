"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import {
  changePlan,
  checkout,
  closeBillingAndFamily,
  portal,
  reactivate,
} from "../billing/service";
import {
  clearFamily,
  clearFamilyChallenge,
  setFamilyChallenge,
  setRoutine,
  setWeeklyReportEmail,
} from "../learning/repository";
import { weekStart } from "./desafio";

export async function routineAction(minutes: number) {
  return runAction(async () => {
    z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]).parse(minutes);
    await setRoutine((await verifiedUser()).id, minutes);
    revalidatePath("/", "layout");
  });
}
/** Aceitar, ajustar ou encerrar o desafio da semana. Zero encerra. */
export async function familyChallengeAction(goal: number) {
  return runAction(async () => {
    const meta = z.number().int().min(0).max(40).parse(goal);
    assertAllowed(meta === 0 || meta >= 4, "GOAL", "A meta da semana vai de 4 a 40 estratégias.");
    const user = await verifiedUser();
    const semana = weekStart(new Date());
    if (meta === 0) await clearFamilyChallenge(user.id, semana);
    else await setFamilyChallenge(user.id, semana, meta);
    revalidatePath("/", "layout");
  });
}
export async function weeklyReportEmailAction(enabled: boolean) {
  return runAction(async () => {
    await setWeeklyReportEmail((await verifiedUser()).id, z.boolean().parse(enabled));
    revalidatePath("/familia/conta");
  });
}
export async function checkoutAction(productId: string) {
  return runAction(async () => {
    z.string().max(80).parse(productId);
    const user = await recentParent();
    return checkout(user.id, productId);
  });
}
export async function portalAction() {
  return runAction(async () => portal((await recentParent()).id));
}
export async function changePlanAction(productId: string, retainedProfileId?: string) {
  return runAction(async () => {
    z.string().max(80).parse(productId);
    const retained = z.string().uuid().optional().parse(retainedProfileId);
    const result = await changePlan((await recentParent()).id, productId, retained);
    revalidatePath("/familia/conta");
    return result;
  });
}
export async function reactivateAction() {
  return runAction(async () => {
    await reactivate((await recentParent()).id);
    revalidatePath("/familia/conta");
  });
}
export async function clearAction(confirmation: string) {
  return runAction(async () => {
    assertAllowed(
      confirmation === "ENCERRAR E APAGAR",
      "CONFIRM",
      "Digite ENCERRAR E APAGAR para confirmar.",
    );
    const user = await recentParent();
    await closeBillingAndFamily(user.id, () => clearFamily(user.id));
    (await cookies()).delete("ms-profile");
    revalidatePath("/", "layout");
  });
}
