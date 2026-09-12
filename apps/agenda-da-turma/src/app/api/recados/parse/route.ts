import { jsonUtf8 } from "@/features/ai/_shared";
import { parseNotice } from "@/features/notices/parse-service";
import { parseNoticeSchema } from "@/features/notices/schemas";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";
import { RequestBodyTooLargeError, readJsonWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin)
    return jsonUtf8({ code: "FORBIDDEN" }, { status: 403 });
  const session = await getServerSession();
  if (!session?.user) return jsonUtf8({ code: "UNAUTHORIZED" }, { status: 401 });
  try {
    await enforceRateLimit({ key: `notices:${session.user.id}`, limit: 12, windowSeconds: 3600 });
    const parsed = parseNoticeSchema.safeParse(await readJsonWithSizeLimit(request, 7_200_000));
    if (!parsed.success) return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
    const result = await parseNotice(session.user.id, parsed.data);
    return result.ok
      ? jsonUtf8(result.value, { headers: { "Cache-Control": "no-store" } })
      : jsonUtf8(result.error, { status: result.error.code === "PROCESSING" ? 409 : 422 });
  } catch (error) {
    if (error instanceof RateLimitedError)
      return jsonUtf8(
        { code: "DAILY_LIMIT" },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    if (error instanceof RequestBodyTooLargeError)
      return jsonUtf8({ code: "INVALID_ATTACHMENT" }, { status: 413 });
    return jsonUtf8({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
