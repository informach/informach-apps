import type { ErrorEvent } from "@sentry/nextjs";

const privateField =
  /email|password|secret|token|cookie|authorization|answer|nickname|body|text|html|prompt|query|params|recipient|name|address|^ip$|ipAddress/i;

export function safeText(value: string): string {
  if (/failed query:|\bparams:/i.test(value)) return "Database operation failed (details withheld)";
  return value
    .replace(/\b(?:sk|rk)_(?:live|test)_[\w]+|\b(?:whsec_|SG\.|sk-or-v1-)[\w.-]+/g, "[secret]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/https?:\/\/[^\s)]+/g, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[url]";
      }
    });
}

export function safeContext(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (typeof value === "string") return safeText(value);
  if (value instanceof Error) return { type: value.name, message: safeText(value.message) };
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeContext(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        privateField.test(key) ? "[redacted]" : safeContext(item, depth + 1),
      ]),
    );
  return value;
}

/** Student work, request bodies, cookies and identities never leave the app. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.extra;
  delete event.contexts;
  delete event.breadcrumbs;
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? safeText(event.request.url) : undefined,
    };
  }
  if (event.message) event.message = safeText(event.message);
  if (event.logentry) event.logentry = { message: safeText(event.logentry.message ?? "Error") };
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = safeText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.context_line;
    }
  }
  return event;
}
