import "server-only";
import { and, db, eq } from "@informach/db";
import { missaoSessions } from "@informach/db/schema";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import {
  PROFILE_COOKIE,
  STUDY_COOKIE,
  type StudyIdentity,
  safeDestination,
  selectedStudyProfile,
} from "./policy";
import { readStudyDevice } from "./repository";

export const getStudyIdentity = cache(async (): Promise<StudyIdentity | null> => {
  const jar = await cookies();
  const token = jar.get(STUDY_COOKIE)?.value;
  if (!token) return null;
  const access = await readStudyDevice(token);
  if (!access) return null;
  const profileId = selectedStudyProfile(access.profileIds, jar.get(PROFILE_COOKIE)?.value);
  if (!profileId) return null;
  return {
    deviceId: access.device.id,
    remember: access.device.remember,
    expiresAt: access.device.expiresAt,
    userId: access.device.userId,
    profileIds: access.profileIds,
    profileId,
  };
});

export async function requireStudyIdentity() {
  const identity = await getStudyIdentity();
  assertAllowed(
    identity,
    "STUDY_AUTH",
    "Abra o estudo de um estudante ou peça ao responsável para conectar este aparelho.",
  );
  return identity;
}

export async function requireStudyPage(destination?: string) {
  const identity = await getStudyIdentity();
  if (!identity)
    redirect(
      `/estudar?next=${encodeURIComponent(safeDestination(destination ?? (await headers()).get("x-missao-path"), "study"))}${(await cookies()).has(STUDY_COOKIE) ? "&conexao=encerrada" : ""}`,
    );
  return identity;
}

export async function requireStudyProfile(raw: unknown) {
  const profileId = z.string().uuid().parse(raw);
  const identity = await requireStudyIdentity();
  assertAllowed(
    identity.profileId === profileId && identity.profileIds.includes(profileId),
    "PROFILE_CHANGED",
    "O estudante selecionado mudou. Volte ao perfil desta atividade antes de continuar.",
  );
  return identity;
}

export async function requireStudySession(raw: unknown) {
  const id = z.string().uuid().parse(raw);
  const identity = await requireStudyIdentity();
  const [session] = await db
    .select({ id: missaoSessions.id })
    .from(missaoSessions)
    .where(and(eq(missaoSessions.id, id), eq(missaoSessions.profileId, identity.profileId)));
  assertAllowed(session, "NOT_FOUND", "Esta missão não pertence ao estudante selecionado.");
  return identity;
}

export async function studyProfileFromInput(raw: unknown) {
  return requireStudyProfile(z.object({ profileId: z.string().uuid() }).parse(raw).profileId);
}

export async function studySessionFromInput(raw: unknown) {
  return requireStudySession(z.object({ sessionId: z.string().uuid() }).parse(raw).sessionId);
}
