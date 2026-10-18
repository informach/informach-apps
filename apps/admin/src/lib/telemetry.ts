import type { ErrorEvent, Event, EventHint, StackFrame } from "@sentry/nextjs";

/** Operações que o Bastidores reporta ao Sentry. Nada fora desta lista vira mensagem. */
export const operationalErrors = [
  "auth.audit_persistence_failed",
  "email.audit_persistence_failed",
  "action.unexpected_failure",
  "job.failed",
  "service.probe_failed",
  "alert.delivery_failed",
  "alert.delivery_skipped",
  "redis.unavailable",
  /** Uma parte de "encerrar sessões" no Postgres (sessões ou aparelhos confiados) falhou. */
  "sessions.revoke_failed",
  "package.operation_failed",
  /** A mudança aconteceu, mas o evento não entrou na auditoria. */
  "audit.change_unrecorded",
  /** As duas etapas foram ligadas e as outras sessões não puderam ser encerradas. */
  "auth.session_cleanup_failed",
  /** Conta sem acesso ao Bastidores cuja sessão não pôde ser encerrada no servidor. */
  "access.session_end_failed",
  /** O código por e-mail da ativação das duas etapas não saiu. */
  "two_factor.code_not_sent",
] as const;
export type OperationalError = (typeof operationalErrors)[number];

const errorTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "ZodError",
  "PostgresError",
]);

const contextKeys = ["actorId", "targetId", "job", "service", "category", "eventType"] as const;

/** Só identificadores e nomes de campo; nunca e-mail, motivo digitado ou conteúdo. */
export function telemetryContext(input: Record<string, unknown> = {}) {
  const result: Record<string, string | string[]> = {};
  for (const key of contextKeys) {
    const value = input[key];
    if (typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)) result[key] = value;
  }
  if (Array.isArray(input.payloadKeys))
    result.payloadKeys = input.payloadKeys.filter(
      (key): key is string => typeof key === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key),
    );
  return result;
}

function sourceFilename(filename: string | undefined) {
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

/** Reconstrói o evento em vez de apagar campos: campo novo do SDK precisa entrar de propósito. */
export function sanitizeSentryEvent(event: Event, hint?: EventHint): ErrorEvent {
  if (hint) hint.attachments = [];
  const code = event.tags?.["admin.operation"];
  const operation = operationalErrors.find((value) => value === code);
  const message = operation ?? "Unhandled Bastidores server error";
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
    tags: { app: "admin", ...(operation ? { "admin.operation": operation } : {}) },
    extra: telemetryContext(event.extra),
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
