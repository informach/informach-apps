import { NextResponse } from "next/server";
import { z } from "zod";
import { studyConnectionResponse, studyRequestBody } from "@/features/study-access/http";
import { consumeCodeAttempt, redeemStudyCode } from "@/features/study-access/repository";
import { runAction } from "@/lib/action";

export async function POST(request: Request) {
  const result = await runAction(async () => {
    const body = z
      .object({ code: z.string().max(30), next: z.string().max(2000).optional() })
      .parse(await studyRequestBody(request));
    // The deployment proxy supplies the address. Unidentified requests share a
    // bounded bucket; raw addresses are never stored in the database.
    const address =
      request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unidentified";
    await consumeCodeAttempt(address);
    const access = await redeemStudyCode(body.code);
    return studyConnectionResponse(request, access, body.next);
  });
  if (result.ok) return result.data;
  return NextResponse.json(result, {
    status: result.code === "RATE_LIMIT" ? 429 : result.code === "ORIGIN" ? 403 : 400,
  });
}
