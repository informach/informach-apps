import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./src/lib/telemetry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
});
