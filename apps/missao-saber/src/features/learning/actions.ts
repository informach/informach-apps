"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { recentParent, runAction, verifiedUser } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import * as repo from "./repository";
import { noteSchema, reportSchema } from "./schemas";
import * as learning from "./service";

export async function startAction(input: unknown) {
  return runAction(async () => {
    const user = await verifiedUser();
    const session = await learning.begin(user.id, input);
    return { id: session.id };
  });
}
export async function answerAction(input: unknown) {
  return runAction(async () => learning.answer((await verifiedUser()).id, input));
}
export async function hintAction(input: unknown) {
  return runAction(async () => learning.hint((await verifiedUser()).id, input));
}
export async function interruptAction(sessionId: unknown) {
  return runAction(async () => learning.interrupt((await verifiedUser()).id, sessionId));
}
export async function readingSupportAction(sessionId: unknown) {
  return runAction(async () => ({
    marked: await learning.markReading((await verifiedUser()).id, sessionId),
  }));
}
export async function createProfileAction(input: unknown) {
  return runAction(async () => {
    const user = await recentParent();
    const profile = await learning.createProfile(user.id, input);
    (await cookies()).set("ms-profile", profile.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    revalidatePath("/", "layout");
    return { id: profile.id };
  });
}
export async function selectProfileAction(id: string) {
  return runAction(async () => {
    z.string().uuid().parse(id);
    const user = await verifiedUser();
    assertAllowed(
      (await repo.getProfiles(user.id)).some((profile) => profile.id === id),
      "PROFILE",
      "Perfil não encontrado.",
    );
    (await cookies()).set("ms-profile", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    revalidatePath("/", "layout");
  });
}
export async function courseAction(profileId: string, courseId: string) {
  return runAction(async () => {
    z.string().uuid().parse(profileId);
    z.string().max(40).parse(courseId);
    await learning.changeCourse((await verifiedUser()).id, profileId, courseId);
    revalidatePath("/", "layout");
  });
}
export async function noteAction(input: unknown) {
  return runAction(async () => {
    const data = noteSchema.parse(input);
    await repo.saveNote((await verifiedUser()).id, data.profileId, data.text);
    revalidatePath("/caderno");
  });
}
export async function removeNoteAction(profileId: string, id: string) {
  return runAction(async () => {
    z.string().uuid().parse(profileId);
    z.string().uuid().parse(id);
    await repo.removeNote((await verifiedUser()).id, profileId, id);
    revalidatePath("/caderno");
  });
}
export async function reportAction(input: unknown) {
  return runAction(async () => {
    const data = reportSchema.parse(input);
    await repo.saveReport((await verifiedUser()).id, data);
  });
}
