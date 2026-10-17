import * as Sentry from "@sentry/nextjs";
import { privateTelemetryOptions } from "./lib/telemetry";

Sentry.init({
  ...privateTelemetryOptions,
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
});
