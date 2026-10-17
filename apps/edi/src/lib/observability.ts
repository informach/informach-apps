import "server-only";
import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";
import { type OperationalError, telemetryContext } from "./telemetry";

export function reportOperationalError(
  operation: OperationalError,
  error?: unknown,
  context: Record<string, unknown> = {},
) {
  const safeContext = telemetryContext(context);
  logger.error(safeContext, operation);
  // beforeSend removes free-form error values/causes and request scope; retaining
  // the original stack here makes source locations available after sanitizing.
  Sentry.captureException(error instanceof Error ? error : new Error(operation), {
    level: "error",
    tags: { "edi.operation": operation },
    extra: safeContext,
  });
}

export const packageLogger = {
  debug: (message: string, context?: object) => logger.debug(context ?? {}, message),
  info: (message: string, context?: object) => logger.info(context ?? {}, message),
  warn: (message: string, context?: object) => logger.warn(context ?? {}, message),
  error: (_message: string, context?: object) => {
    // Package messages and provider context are not an approved telemetry schema.
    reportOperationalError("package.operation_failed", undefined, context ? { ...context } : {});
  },
};
