import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { boundedBody } from "@/lib/http";
import { audit } from "@/lib/observability";
import { studyCookieOptions } from "./cookies";
import { PROFILE_COOKIE, STUDY_COOKIE, safeDestination } from "./policy";
import { type createStudyDevice, endStudyDevice } from "./repository";

export async function studyRequestBody(request: Request): Promise<unknown> {
  assertAllowed(
    request.headers.get("origin") === new URL(env.NEXT_PUBLIC_APP_URL).origin,
    "ORIGIN",
    "Abra a conexão pelo próprio Missão Saber.",
  );
  const body = await boundedBody(request, 4096);
  assertAllowed(body !== null, "INPUT", "Confira os dados de conexão.");
  try {
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) throw new AppError("INPUT", "Confira os dados de conexão.");
    throw error;
  }
}

export async function studyConnectionResponse(
  request: Request,
  access: Awaited<ReturnType<typeof createStudyDevice>>,
  destination: unknown,
) {
  const signOut = await auth.api.signOut({ headers: request.headers, asResponse: true });
  if (!signOut.ok) {
    await endStudyDevice(access.token);
    throw new AppError(
      "AUTH",
      "Não foi possível encerrar o acesso adulto. Tente abrir o estudo novamente.",
    );
  }
  const response = NextResponse.json({
    ok: true,
    data: { destination: safeDestination(destination, "study") },
  });
  // Keep Better Auth's cookie names/options and clear every cookie it owns.
  for (const cookie of signOut.headers.getSetCookie())
    response.headers.append("set-cookie", cookie);
  const options = studyCookieOptions(access.device);
  response.cookies.set(STUDY_COOKIE, access.token, options);
  const selected = access.profileIds[0];
  assertAllowed(selected, "PROFILE", "Selecione um estudante para continuar.");
  response.cookies.set(PROFILE_COOKIE, selected, options);
  response.headers.set("Cache-Control", "no-store");
  audit({
    eventType: "missao.study_connected",
    actorId: access.device.userId,
    payload: { deviceId: access.device.id, profileIds: access.profileIds },
  });
  return response;
}
