import { clientIpFromHeaders } from "@informach/auth/client-ip";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deviceConnectionResponse, deviceRequestBody } from "@/features/aparelho/http";
import { CODE_ATTEMPTS, CODE_WINDOW_MS } from "@/features/aparelho/policy";
import { consumeAttempt, privateHash, redeemPairingCode } from "@/features/aparelho/repository";
import { runAction } from "@/lib/action";

/** O aparelho da criança digita o código que os pais geraram no celular deles. */
export async function POST(request: Request) {
  const result = await runAction(async () => {
    const body = z.object({ code: z.string().max(30) }).parse(await deviceRequestBody(request));
    // Same address rule as the sign-in limit. Raw addresses are never stored.
    const address = clientIpFromHeaders(request.headers) ?? "unidentified";
    await consumeAttempt(
      privateHash("connection-address", address),
      CODE_ATTEMPTS,
      CODE_WINDOW_MS,
      "Muitas tentativas de conexão. Aguarde dez minutos e tente de novo.",
    );
    const access = await redeemPairingCode(body.code);
    return deviceConnectionResponse(request, access);
  });
  if (result.ok) return result.data;
  return NextResponse.json(result, {
    status: result.code === "RATE_LIMIT" ? 429 : result.code === "ORIGIN" ? 403 : 400,
  });
}
