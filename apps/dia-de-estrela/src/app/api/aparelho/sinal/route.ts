import { FamilyError } from "@informach/family";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deviceCookieOptions } from "@/features/aparelho/http";
import { CHILD_COOKIE, DEVICE_COOKIE } from "@/features/aparelho/policy";
import { heartbeat, touchDevice } from "@/features/aparelho/repository";
import { getDeviceIdentity } from "@/features/aparelho/server";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * Sinal de vida do aparelho da criança, a cada poucos minutos: diz aos pais
 * que o tablet está ligado e renova os 30 dias da conexão (cookie incluído).
 */
export async function POST() {
  const device = await getDeviceIdentity();
  if (!device) return NextResponse.json({ ok: false }, { status: 401 });
  let renovado: Date | null;
  try {
    renovado = await touchDevice(device);
    if (!renovado) await heartbeat(device);
  } catch (error) {
    if (error instanceof FamilyError || (error instanceof AppError && error.code === "DEVICE"))
      return NextResponse.json(
        { ok: false },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  if (renovado) {
    const jar = await cookies();
    const token = jar.get(DEVICE_COOKIE)?.value;
    const child = jar.get(CHILD_COOKIE)?.value;
    if (token) response.cookies.set(DEVICE_COOKIE, token, deviceCookieOptions(renovado));
    if (child) response.cookies.set(CHILD_COOKIE, child, deviceCookieOptions(renovado));
  }
  return response;
}
