import { z } from "zod";
import { jsonUtf8 } from "@/features/ai/_shared";
import { resolveLegacyQueueContexts } from "@/features/offline-queue/service";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  AGENDA_RATE_LIMITS,
  enforceRateLimit,
  RateLimitedError,
  taskStatusKey,
} from "@/lib/rate-limit";
import {
  MalformedRequestBodyError,
  RequestBodyTooLargeError,
  readJsonWithSizeLimit,
} from "@/lib/request-size";

export const runtime = "nodejs";
const input = z
  .object({ userId: z.string().min(1).max(200), taskIds: z.array(z.uuid()).min(1).max(100) })
  .strict();
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin)
    return jsonUtf8({ code: "FORBIDDEN" }, { status: 403 });
  const session = await getServerSession();
  if (!session?.user) return jsonUtf8({ code: "UNAUTHORIZED" }, { status: 401 });
  try {
    await enforceRateLimit({
      key: taskStatusKey(session.user.id),
      ...AGENDA_RATE_LIMITS.TASK_STATUS_PER_HOUR,
    });
    const parsed = input.safeParse(await readJsonWithSizeLimit(request, 8192));
    if (!parsed.success) return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
    if (parsed.data.userId !== session.user.id)
      return jsonUtf8({ code: "ACCOUNT_CHANGED" }, { status: 401 });
    return jsonUtf8(await resolveLegacyQueueContexts(session.user.id, parsed.data.taskIds), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RateLimitedError)
      return jsonUtf8(
        { code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    if (error instanceof RequestBodyTooLargeError)
      return jsonUtf8({ code: "INVALID_INPUT" }, { status: 413 });
    if (error instanceof MalformedRequestBodyError || error instanceof SyntaxError)
      return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
    logger.error({ err: error }, "agenda.queue_context.failed");
    return jsonUtf8({ code: "READ_FAILED" }, { status: 500 });
  }
}
