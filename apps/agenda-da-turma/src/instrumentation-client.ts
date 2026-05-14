import * as Sentry from "@sentry/nextjs";
import { env } from "./lib/env";
import { scrubSentryEvent } from "./lib/sentry-scrub";

const sentryEnabled = Boolean(env.NEXT_PUBLIC_SENTRY_DSN);

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // LGPD/PII: scrub no client antes do envio pra Sentry (eventos client-side
  // de Error Boundary, unhandled rejection, etc).
  beforeSend: scrubSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
