import * as Sentry from "@sentry/nextjs";
import { env } from "./lib/env";

const sentryEnabled = Boolean(env.NEXT_PUBLIC_SENTRY_DSN);

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,
  enableLogs: sentryEnabled,
  // `process.env.NODE_ENV` is inlined by Next at build time on the client,
  // so it's safe here. Reading `env.NODE_ENV` (a server-only field on the
  // t3-env schema) from the client would trip `onInvalidAccess` and break
  // hydration — see the guard in `./lib/env.ts`.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
