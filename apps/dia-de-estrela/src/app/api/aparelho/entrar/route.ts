import { NextResponse } from "next/server";
import { deviceConnectionResponse, deviceRequestBody } from "@/features/aparelho/http";
import { deviceSchema } from "@/features/aparelho/policy";
import { createDevice } from "@/features/aparelho/repository";
import { familyAdult, recentParent, runAction } from "@/lib/action";

/** "Usar este aparelho para as crianças": o adulto sai e o aparelho fica da criança. */
export async function POST(request: Request) {
  const result = await runAction(async () => {
    const body = deviceSchema.parse(await deviceRequestBody(request));
    // Mesmo nível do código de pareamento: o aparelho dura 30 dias renováveis e
    // sobrevive ao fim da sessão, então pede uma entrada recente.
    await recentParent();
    const { ownerId } = await familyAdult();
    const access = await createDevice(ownerId, body);
    return deviceConnectionResponse(request, access);
  });
  if (result.ok) return result.data;
  return NextResponse.json(result, { status: result.code === "ORIGIN" ? 403 : 400 });
}
