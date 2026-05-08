import * as Sentry from "@sentry/nextjs";
import { env } from "./lib/env";

const sentryEnabled = Boolean(env.SENTRY_DSN);

Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  tracesSampleRate: env.NODE_ENV === "development" ? 1.0 : 0.1,
});
