import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { boundedBody } from "@/lib/http";
import { audit } from "@/lib/observability";
import { CHILD_COOKIE, DEVICE_COOKIE, DEVICE_LIFETIME_MS, UNLOCK_COOKIE } from "./policy";
import { type createDevice, endDevice } from "./repository";

export async function deviceRequestBody(request: Request): Promise<unknown> {
  assertAllowed(
    request.headers.get("origin") === new URL(env.NEXT_PUBLIC_APP_URL).origin,
    "ORIGIN",
    "Abra a conexão pelo próprio Dia de Estrela.",
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

export function deviceCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/**
 * O aparelho passa a ser da criança: a sessão do adulto (se houver) sai, e o
 * aparelho guarda só o seu token. A área dos pais nele passa a pedir o PIN.
 */
export async function deviceConnectionResponse(
  request: Request,
  access: Awaited<ReturnType<typeof createDevice>>,
) {
  const signOut = await auth.api.signOut({ headers: request.headers, asResponse: true });
  if (!signOut.ok) {
    await endDevice(access.token);
    throw new AppError("AUTH", "Não foi possível sair da conta adulta. Tente de novo.");
  }
  const response = NextResponse.json({ ok: true, data: { destination: "/crianca" } });
  // Keep Better Auth's cookie names/options and clear every cookie it owns.
  for (const cookie of signOut.headers.getSetCookie())
    response.headers.append("set-cookie", cookie);
  const options = deviceCookieOptions(
    new Date(Math.min(access.device.expiresAt.getTime(), Date.now() + DEVICE_LIFETIME_MS)),
  );
  response.cookies.set(DEVICE_COOKIE, access.token, options);
  if (access.childIds.length === 1 && access.childIds[0])
    response.cookies.set(CHILD_COOKIE, access.childIds[0], options);
  else response.cookies.delete(CHILD_COOKIE);
  response.cookies.delete(UNLOCK_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  audit({
    eventType: "estrela.device_connected",
    actorId: access.device.userId,
    payload: { deviceId: access.device.id, childIds: access.childIds },
  });
  return response;
}
