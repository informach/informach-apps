"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import {
  clearFamily,
  clearFamilyChallenge,
  setFamilyChallenge,
  setRoutine,
  setWeeklyReportEmail,
} from "../learning/repository";
import { parentAuthority } from "./context";
import { weekStart } from "./desafio";
import { chooseLimitedStudent } from "./student-repository";

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
    if (meta === 0) await clearFamilyChallenge(await parentAuthority(user.id), semana);
    else await setFamilyChallenge(await parentAuthority(user.id), semana, meta);
    revalidatePath("/", "layout");
  });
}
export async function weeklyReportEmailAction(enabled: boolean) {
  return runAction(async () => {
    await setWeeklyReportEmail((await verifiedUser()).id, z.boolean().parse(enabled));
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
    await clearFamily(await parentAuthority(user.id));
    (await cookies()).delete("ms-profile");
    revalidatePath("/", "layout");
  });
}

export async function chooseLimitedStudentAction(raw: string) {
  return runAction(async () => {
    const profileId = z.uuid().parse(raw);
    const user = await recentParent();
    await chooseLimitedStudent(await parentAuthority(user.id), profileId);
    revalidatePath("/", "layout");
  });
}
