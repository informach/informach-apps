import type { ErrorEvent, Event, EventHint, StackFrame } from "@sentry/nextjs";

export const operationalErrors = [
  "auth.audit_persistence_failed",
  "billing.audit_persistence_failed",
  "email.audit_persistence_failed",
  "action.unexpected_failure",
  "billing.reconciliation_failed",
  "desktop.request_failed",
  "stripe.webhook_failed",
  "package.operation_failed",
] as const;
export type OperationalError = (typeof operationalErrors)[number];

const errorTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "ZodError",
  "PostgresError",
]);
const payloadFields = new Set([
  "userId",
  "organizationId",
  "sessionId",
  "subscriptionId",
  "invoiceId",
  "deliveryId",
  "messageKey",
  "category",
  "status",
  "role",
  "reason",
  "classification",
  "providerEvent",
  "source",
  "providerMessageId",
  "stripeEventId",
  "checkoutSessionId",
  "productId",
  "subjectType",
  "subjectId",
  "mode",
  "emailHash",
  "emailDomain",
  "fields",
  "deviceId",
]);

/** Only identifiers supplied by our server adapters, never arbitrary provider context. */
export function telemetryContext(input: Record<string, unknown> = {}) {
  const result: Record<string, string | string[]> = {};
  for (const key of ["actorId", "customerId", "deliveryId", "messageKey"]) {
    const value = input[key];
    if (typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value)) result[key] = value;
  }
  const eventType = input.eventType;
  if (
    typeof eventType === "string" &&
    /^(auth|user|session|billing|email)\.[a-z_.]{1,80}$/.test(eventType)
  )
    result.eventType = eventType;
  if (Array.isArray(input.payloadKeys))
    result.payloadKeys = input.payloadKeys.filter(
      (key): key is string => typeof key === "string" && payloadFields.has(key),
    );
  if (["activate", "license", "logout"].includes(String(input.operation)))
    result.operation = String(input.operation);
  return result;
}

function sourceFilename(filename: string | undefined) {
  // Keep source locations for diagnosis, but discard source text, variables, URL
  // credentials/query, and workstation paths that can identify an operator.
  const path = filename?.replaceAll("\\", "/").split(/[?#]/, 1)[0] ?? "";
  const source = path.match(/(?:^|\/)((?:\.next|src|node_modules)\/[^:]*\.[cm]?[jt]sx?)$/)?.[1];
  return source ?? path.match(/(?:^|\/)([A-Za-z0-9_.-]+\.[cm]?[jt]sx?)$/)?.[1];
}

function sanitizeFrame(frame: StackFrame): StackFrame {
  return {
    filename: sourceFilename(frame.filename),
    function:
      frame.function && /^[A-Za-z0-9_.$<> [\]-]{1,120}$/.test(frame.function)
        ? frame.function
        : undefined,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
  };
}

/** Rebuild instead of redacting keys: new SDK fields must opt into collection. */
export function sanitizeSentryEvent(event: Event, hint?: EventHint): ErrorEvent {
  if (hint) hint.attachments = [];
  const code = event.tags?.["edi.operation"];
  const operation = operationalErrors.find((value) => value === code);
  const message = operation ?? "Unhandled Edi server error";
  const trace = event.contexts?.trace;
  const traceId =
    typeof trace?.trace_id === "string" && /^[a-f0-9]{32}$/.test(trace.trace_id)
      ? trace.trace_id
      : undefined;
  const spanId =
    typeof trace?.span_id === "string" && /^[a-f0-9]{16}$/.test(trace.span_id)
      ? trace.span_id
      : undefined;
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: "node",
    environment: ["production", "development", "test"].includes(event.environment ?? "")
      ? event.environment
      : undefined,
    release: event.release && /^[a-f0-9]{7,64}$/.test(event.release) ? event.release : undefined,
    message: event.exception?.values?.length ? undefined : message,
    tags: { app: "edi", ...(operation ? { "edi.operation": operation } : {}) },
    extra: telemetryContext(event.extra),
    debug_meta: {
      images: event.debug_meta?.images?.flatMap((image) => {
        const filename = sourceFilename(image.code_file);
        if (image.type !== "sourcemap" || !filename || !/^[a-f0-9-]{36}$/i.test(image.debug_id))
          return [];
        return [{ type: "sourcemap", code_file: filename, debug_id: image.debug_id }];
      }),
    },
    contexts: traceId && spanId ? { trace: { trace_id: traceId, span_id: spanId } } : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map((exception) => ({
            type: errorTypes.has(exception.type ?? "") ? exception.type : "Error",
            value: message,
            stacktrace: exception.stacktrace
              ? { frames: exception.stacktrace.frames?.map(sanitizeFrame) }
              : undefined,
            mechanism: exception.mechanism
              ? { type: "generic", handled: exception.mechanism.handled }
              : undefined,
          })),
        }
      : undefined,
  };
}

export const privateTelemetryOptions = {
  sendDefaultPii: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  enableLogs: false,
  tracesSampleRate: 0,
  profilesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend: sanitizeSentryEvent,
  beforeSendTransaction: () => null,
};
