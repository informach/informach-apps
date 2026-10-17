import { enforceRateLimit, RateLimitError } from "@informach/auth/server-actions";
import { DesktopAccessError } from "@informach/edi-licensing";
import { ActivationError } from "@informach/edi-licensing/devices";
import { ZodError } from "zod";
import { getDesktopVerifier } from "../../lib/auth";
import { getLicensing } from "../../lib/licensing";
import { logger } from "../../lib/logger";
import {
  InvalidRequestBodyError,
  PayloadTooLargeError,
  readRequestBody,
} from "../../lib/request-body";
export async function desktopRequest(
  request: Request,
  operation: "activate" | "license" | "logout",
) {
  const responseHeaders = { "Cache-Control": "no-store" };
  try {
    const raw = await readRequestBody(request, 16384);
    const principal = await getDesktopVerifier()(
      request.headers.get("Authorization"),
      operation === "license" ? "edi:license" : "edi:devices",
    );
    await enforceRateLimit({ key: `edi:desktop:${principal.userId}`, max: 120, window: "1m" });
    const proof = request.headers.get("X-Edi-Proof") ?? "";
    const service = getLicensing();
    const result = await service[operation](principal, raw, proof);
    return result
      ? Response.json(result, { headers: responseHeaders })
      : new Response(null, { status: 204, headers: responseHeaders });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return Response.json(
        { error: "payload_too_large" },
        { status: 413, headers: responseHeaders },
      );
    if (error instanceof DesktopAccessError || error instanceof ActivationError)
      return Response.json(
        { error: error instanceof DesktopAccessError ? error.code : error.reason },
        { status: 403, headers: responseHeaders },
      );
    if (
      error instanceof InvalidRequestBodyError ||
      error instanceof ZodError ||
      error instanceof SyntaxError
    )
      return Response.json({ error: "invalid_input" }, { status: 400, headers: responseHeaders });
    if (error instanceof RateLimitError)
      return Response.json({ error: "rate_limited" }, { status: 429, headers: responseHeaders });
    if (
      error instanceof Error &&
      (error.message.startsWith("invalid_desktop") ||
        error.name.startsWith("JWT") ||
        error.name.startsWith("JOSE"))
    )
      return Response.json({ error: "unauthorized" }, { status: 401, headers: responseHeaders });
    logger.error(
      { operation, errorType: error instanceof Error ? error.name : "unknown" },
      "desktop.request_failed",
    );
    return Response.json(
      { error: "service_unavailable" },
      { status: 503, headers: responseHeaders },
    );
  }
}
