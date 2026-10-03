"use server";
import { revalidatePath } from "next/cache";
import { runAction, verifiedUser } from "@/lib/action";
import { assessLab, labToNotebook, readLab, saveLab, startLab } from "./repository";

export async function startLabAction(input: unknown) {
  return runAction(async () => startLab((await verifiedUser()).id, input));
}
export async function readLabAction(input: unknown) {
  return runAction(async () => readLab((await verifiedUser()).id, input));
}
export async function saveLabAction(input: unknown) {
  return runAction(async () => saveLab((await verifiedUser()).id, input));
}
export async function assessLabAction(input: unknown) {
  return runAction(async () => assessLab((await verifiedUser()).id, input));
}
export async function labToNotebookAction(input: unknown) {
  return runAction(async () => {
    const result = await labToNotebook((await verifiedUser()).id, input);
    revalidatePath("/caderno");
    return result;
  });
}
