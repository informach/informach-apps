import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // LGPD/PII: scrub email/cookies/auth headers/request body antes do envio.
  // Compliance > debuggability — emails viram hash determinístico (preserva
  // agrupamento de issues recorrentes pro mesmo user).
  beforeSend: scrubSentryEvent,
});
