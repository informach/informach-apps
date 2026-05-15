import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const EMAIL_PATTERN = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.toLowerCase()),
  );

  return `email_${bytesToHex(new Uint8Array(digest)).slice(0, 12)}`;
}

async function maskEmailsInString(value: string): Promise<string> {
  const emails = Array.from(
    new Set(Array.from(value.matchAll(EMAIL_PATTERN), ([email]) => email.toLowerCase())),
  );

  if (emails.length === 0) {
    return value;
  }

  const hashedEmails = new Map<string, string>();

  await Promise.all(
    emails.map(async (email) => {
      hashedEmails.set(email, await hashEmail(email));
    }),
  );

  return value.replace(
    EMAIL_PATTERN,
    (email) => hashedEmails.get(email.toLowerCase()) ?? "[Filtered]",
  );
}

/**
 * Sanitiza um Sentry event antes de enviar pra ingest:
 *
 * - `event.user.email`: hashada (preserva agrupamento sem vazar email cru).
 * - `event.request.cookies` / `headers.cookie` / `Authorization`: removidos.
 * - `event.exception.values[*].value` + `message`: emails substituídos por hash.
 * - `event.request.data` (POST body): apagado se for string ou objeto (preserva
 *   só o tipo) — payloads de signup/reset trazem email + senha em plaintext.
 *
 * Não tenta sanitizar `breadcrumbs.data` em profundidade: dados estruturados
 * de breadcrumbs são pequenos e auto-gerados pelo SDK; o maior risco
 * documentado está em request body e em mensagens de exceção.
 */
export async function scrubSentryEvent<T extends ErrorEvent>(
  event: T,
  _hint?: EventHint,
): Promise<T | null> {
  if (event.user) {
    if (typeof event.user.email === "string" && event.user.email) {
      event.user.email = await hashEmail(event.user.email);
    }
    // ip_address pode ser PII no contexto LGPD; mantemos opt-in via Sentry server-side scrubbing.
  }

  if (event.request) {
    if (event.request.cookies) {
      delete event.request.cookies;
    }
    if (event.request.headers) {
      const headers = event.request.headers;
      if ("cookie" in headers) headers.cookie = "[Filtered]";
      if ("Cookie" in headers) headers.Cookie = "[Filtered]";
      if ("authorization" in headers) headers.authorization = "[Filtered]";
      if ("Authorization" in headers) headers.Authorization = "[Filtered]";
    }
    if (event.request.data !== undefined && event.request.data !== null) {
      event.request.data = "[Filtered]";
    }
  }

  if (event.message) {
    event.message = await maskEmailsInString(event.message);
  }

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = await maskEmailsInString(ex.value);
    }
  }

  return event;
}
