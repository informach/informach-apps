import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deviceCookieOptions } from "@/features/aparelho/http";
import { CHILD_COOKIE, DEVICE_COOKIE } from "@/features/aparelho/policy";
import { heartbeat, touchDevice } from "@/features/aparelho/repository";
import { getDeviceIdentity } from "@/features/aparelho/server";

export const dynamic = "force-dynamic";

/**
 * Sinal de vida do aparelho da criança, a cada poucos minutos: diz aos pais
 * que o tablet está ligado e renova os 30 dias da conexão (cookie incluído).
 */
export async function POST() {
  const device = await getDeviceIdentity();
  if (!device) return NextResponse.json({ ok: false }, { status: 401 });
  const renovado = await touchDevice(device.deviceId);
  if (!renovado) await heartbeat(device.deviceId);
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
