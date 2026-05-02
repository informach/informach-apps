import * as Sentry from "@sentry/nextjs";

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
