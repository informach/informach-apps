import { NextResponse } from "next/server";
import { z } from "zod";
import { studyConnectionResponse, studyRequestBody } from "@/features/study-access/http";
import { studyDeviceSchema } from "@/features/study-access/policy";
import { createStudyDevice } from "@/features/study-access/repository";
import { runAction, verifiedUser } from "@/lib/action";

export async function POST(request: Request) {
  const result = await runAction(async () => {
    const body = studyDeviceSchema
      .extend({ next: z.string().max(2000).optional() })
      .parse(await studyRequestBody(request));
    const user = await verifiedUser();
    const access = await createStudyDevice(user.id, body);
    return studyConnectionResponse(request, access, body.next);
  });
  if (result.ok) return result.data;
  return NextResponse.json(result, { status: result.code === "ORIGIN" ? 403 : 400 });
}
