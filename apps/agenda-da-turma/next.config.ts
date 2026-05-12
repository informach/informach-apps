import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;

const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://api.stripe.com",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
  ].join(" "),
  "frame-src https://checkout.stripe.com https://hooks.stripe.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const baseSecurityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    // `microphone=(self)` é necessário para a feature de cadastrar matérias
    // por voz (SpeechInput → MediaRecorder no client). Sem ele, o navegador
    // bloqueia getUserMedia silenciosamente e nem mostra o prompt de
    // permissão. `camera=(self)` permite o `<input type="file" capture="environment">`
    // no fluxo de "cadastrar por imagem" no mobile.
    value: [
      "camera=(self)",
      "geolocation=()",
      "microphone=(self)",
      "payment=()",
      "usb=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
      "midi=()",
      "interest-cohort=()",
    ].join(", "),
  },
];

const productionOnlyHeaders = isProd
  ? [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ]
  : [];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@informach/ai-core",
    "@informach/auth",
    "@informach/billing",
    "@informach/config",
    "@informach/db",
    "@informach/emails",
    "@informach/ui",
  ],
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...baseSecurityHeaders, ...productionOnlyHeaders],
      },
      {
        source: "/api/webhooks/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

const hasSentrySourceMapConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !hasSentrySourceMapConfig,
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
