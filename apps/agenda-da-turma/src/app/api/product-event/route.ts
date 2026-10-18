import { clientIpFromHeaders } from "@informach/auth/client-ip";
import { recordProductEvent } from "@/features/metrics/events";
import { recordLandingEvent } from "@/features/metrics/landing-events";
import { landingEventSchema } from "@/features/metrics/landing-schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";
import {
  MalformedRequestBodyError,
  RequestBodyTooLargeError,
  readRequestBodyWithSizeLimit,
} from "@/lib/request-size";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin)
    return new Response(null, { status: 403 });
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  try {
    const bytes = await readRequestBodyWithSizeLimit(request, 1024);
    if (bytes.byteLength === 0) {
      // Older clients send an empty POST on the first signup click.
      await enforceRateLimit({ key: `product-visit:${ip}`, limit: 30, windowSeconds: 3600 });
      await recordProductEvent(null, { event: "qualified_visit" });
    } else {
      if (
        request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
        "application/json"
      )
        return new Response(null, { status: 415 });
      const parsed = landingEventSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      if (!parsed.success) return new Response(null, { status: 400 });
      await enforceRateLimit({ key: `product-landing:${ip}`, limit: 120, windowSeconds: 3600 });
      await recordLandingEvent(parsed.data);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return new Response(null, { status: 413 });
    if (error instanceof MalformedRequestBodyError || error instanceof SyntaxError)
      return new Response(null, { status: 400 });
    if (error instanceof RateLimitedError)
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      });
    logger.warn("agenda.landing.write_failed");
    return new Response(null, { status: 503 });
  }
}
