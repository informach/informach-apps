import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // LGPD/PII: scrub no edge runtime também (proxy, middleware-like code).
  beforeSend: scrubSentryEvent,
});
