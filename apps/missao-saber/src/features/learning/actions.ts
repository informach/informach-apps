"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { endStudyAction } from "@/features/study-access/actions";
import { studyCookieOptions } from "@/features/study-access/cookies";
import {
  requireStudyIdentity,
  requireStudyProfile,
  requireStudySession,
  studyProfileFromInput,
  studySessionFromInput,
} from "@/features/study-access/server";
import { recentParent, runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import * as repo from "./repository";
import { editNoteSchema, noteSchema, reportSchema } from "./schemas";
import * as learning from "./service";

export async function startAction(input: unknown) {
  return runAction(async () => {
    const identity = await studyProfileFromInput(input);
    const session = await learning.begin(identity.userId, input);
    return { id: session.id };
  });
}
export async function answerAction(input: unknown) {
  return runAction(async () => learning.answer((await studySessionFromInput(input)).userId, input));
}
export async function hintAction(input: unknown) {
  return runAction(async () => learning.hint((await studySessionFromInput(input)).userId, input));
}
export async function interruptAction(sessionId: unknown) {
  return runAction(async () =>
    learning.interrupt((await requireStudySession(sessionId)).userId, sessionId),
  );
}
export async function readingSupportAction(sessionId: unknown) {
  return runAction(async () => ({
    marked: await learning.markReading((await requireStudySession(sessionId)).userId, sessionId),
  }));
}
/** Sair da conta esquece o perfil escolhido neste aparelho. */
export async function forgetProfileAction() {
  await endStudyAction();
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
export async function updateProfileAction(input: unknown) {
  return runAction(async () => {
    const user = await recentParent();
    await learning.updateProfile(user.id, input);
    revalidatePath("/", "layout");
  });
}
export async function selectProfileAction(id: string) {
  return runAction(async () => {
    z.string().uuid().parse(id);
    const identity = await requireStudyIdentity();
    assertAllowed(identity.profileIds.includes(id), "PROFILE", "Perfil não encontrado.");
    (await cookies()).set("ms-profile", id, studyCookieOptions(identity));
    revalidatePath("/", "layout");
  });
}
export async function courseAction(profileId: string, courseId: string) {
  return runAction(async () => {
    z.string().uuid().parse(profileId);
    z.string().max(40).parse(courseId);
    await learning.changeCourse((await requireStudyProfile(profileId)).userId, profileId, courseId);
    revalidatePath("/", "layout");
  });
}
export async function noteAction(input: unknown) {
  return runAction(async () => {
    const data = noteSchema.parse(input);
    await repo.saveNote(
      (await requireStudyProfile(data.profileId)).userId,
      data.profileId,
      data.text,
      data.context,
    );
    revalidatePath("/caderno");
  });
}
export async function removeNoteAction(profileId: string, id: string) {
  return runAction(async () => {
    z.string().uuid().parse(profileId);
    z.string().uuid().parse(id);
    await repo.removeNote((await requireStudyProfile(profileId)).userId, profileId, id);
    revalidatePath("/caderno");
  });
}
export async function editNoteAction(input: unknown) {
  return runAction(async () => {
    const data = editNoteSchema.parse(input);
    await repo.editNote(
      (await requireStudyProfile(data.profileId)).userId,
      data.profileId,
      data.id,
      data.text,
    );
    revalidatePath("/caderno");
  });
}
export async function archiveNoteAction(profileId: string, id: string, archived: boolean) {
  return runAction(async () => {
    z.string().uuid().parse(profileId);
    z.string().uuid().parse(id);
    z.boolean().parse(archived);
    await repo.archiveNote((await requireStudyProfile(profileId)).userId, profileId, id, archived);
    revalidatePath("/caderno");
  });
}
export async function reportAction(input: unknown) {
  return runAction(async () => {
    const data = reportSchema.parse(input);
    await repo.saveReport((await requireStudySession(data.sessionId)).userId, data);
  });
}
