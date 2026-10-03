"use server";
import { revalidatePath } from "next/cache";
import { studyProfileFromInput } from "@/features/study-access/server";
import { runAction } from "@/lib/action";
import { assessLab, labToNotebook, readLab, saveLab, startLab } from "./repository";

export async function startLabAction(input: unknown) {
  return runAction(async () => startLab((await studyProfileFromInput(input)).userId, input));
}
export async function readLabAction(input: unknown) {
  return runAction(async () => readLab((await studyProfileFromInput(input)).userId, input));
}
export async function saveLabAction(input: unknown) {
  return runAction(async () => saveLab((await studyProfileFromInput(input)).userId, input));
}
export async function assessLabAction(input: unknown) {
  return runAction(async () => assessLab((await studyProfileFromInput(input)).userId, input));
}
export async function labToNotebookAction(input: unknown) {
  return runAction(async () => {
    const result = await labToNotebook((await studyProfileFromInput(input)).userId, input);
    revalidatePath("/caderno");
    return result;
  });
}
