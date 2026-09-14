"use server";
import { revalidatePath } from "next/cache";
import { recentParent, runAction } from "@/lib/action";
import { changeReportStatus, invalidateReportedVersion, setContentAvailability } from "./service";

export async function contentAvailabilityAction(raw: unknown) {
  return runAction(async () => {
    await setContentAvailability((await recentParent()).id, raw);
    revalidatePath("/", "layout");
  });
}
export async function updateReportAction(input: unknown) {
  return runAction(async () => {
    await changeReportStatus((await recentParent()).id, input);
    revalidatePath("/manutencao");
  });
}
export async function invalidateReportedVersionAction(input: unknown) {
  return runAction(async () => {
    await invalidateReportedVersion((await recentParent()).id, input);
    revalidatePath("/manutencao");
  });
}
