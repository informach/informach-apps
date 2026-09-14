import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./lib/telemetry";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: scrubEvent,
});
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
