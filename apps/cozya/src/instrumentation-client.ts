import * as Sentry from "@sentry/nextjs";
import { env } from "./lib/env";

const sentryEnabled = Boolean(env.NEXT_PUBLIC_SENTRY_DSN);

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
