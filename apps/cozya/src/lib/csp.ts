import "server-only";

import { env } from "./env";

/**
 * Deriva a `report-uri` do Sentry a partir do DSN público.
 *
 * DSN format: `https://<publicKey>@<host>/<projectId>`
 * Report URI format: `https://<host>/api/<projectId>/security/?sentry_key=<publicKey>`
 *
 * Retorna `null` se o DSN não estiver configurado — neste caso o CSP é emitido
 * sem `report-uri` (violações ainda aparecem no console do browser).
 */
export function cspReportUri(): string | null {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!publicKey || !projectId) return null;
    return `https://${url.host}/api/${projectId}/security/?sentry_key=${publicKey}`;
  } catch {
    return null;
  }
}

/**
 * Sources permitidos por origem externa. Manter agrupado para ficar fácil de
 * auditar quando uma feature nova precisa abrir um host.
 */
const SENTRY_HOSTS = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
];
const STRIPE_HOSTS = [
  "https://js.stripe.com",
  "https://hooks.stripe.com",
  "https://checkout.stripe.com",
];
const GOOGLE_FONTS_STYLE = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILE = "https://fonts.gstatic.com";
const GOOGLE_OAUTH = "https://accounts.google.com";

export type BuildCspOptions = {
  nonce: string;
  /** Quando true, anexa `report-uri` derivada do Sentry DSN se disponível. */
  includeReporting?: boolean;
  /**
   * Quando true, omite diretivas que browsers ignoram em modo Report-Only
   * (`upgrade-insecure-requests`) — só elimina ruído no console, sem mudar
   * postura de segurança. O proxy passa este flag baseado em `CSP_ENFORCE`.
   */
  reportOnly?: boolean;
};

/**
 * Constrói o valor do header CSP usando nonce per-request + `'strict-dynamic'`
 * para scripts. Estilos usam `'unsafe-inline'` por necessidade prática
 * (Tailwind 4 + shadcn injetam `<style>` em runtime — alinhado com a
 * recomendação atual da industria).
 *
 * Em **dev** (`NODE_ENV !== 'production'`), `'unsafe-eval'` é adicionado ao
 * `script-src` porque webpack/turbopack do Next 16 usa `eval` para HMR/Fast
 * Refresh. Em prod, Next emite bundles estáticos sem eval — a relaxação é
 * gateada e nunca chega ao usuário final.
 *
 * Comentários inline justificam cada origem para auditoria futura.
 */
export function buildCspHeader(opts: BuildCspOptions): string {
  const { nonce } = opts;
  const reportUri = opts.includeReporting !== false ? cspReportUri() : null;
  const isDev = env.NODE_ENV !== "production";

  // `'unsafe-eval'` é necessário em dev para HMR (webpack eval-source-maps,
  // Fast Refresh). Em prod, Next emite bundles estáticos — nunca relaxar.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const directives: string[] = [
    "default-src 'self'",
    scriptSrc,
    // Estilos: Tailwind 4 + shadcn precisam de inline. Aceito.
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLE}`,
    `font-src 'self' ${GOOGLE_FONTS_FILE} data:`,
    // Imagens: data: para os data-URLs de upload de receita por foto;
    // blob: para previews antes do submit.
    "img-src 'self' data: blob: https://*.stripe.com",
    // Conexões: server-side para OpenRouter/Stripe/etc; do browser só Sentry
    // beacons + Stripe API (elementos client-side não usados hoje, mas barato manter).
    `connect-src 'self' ${SENTRY_HOSTS.join(" ")} https://api.stripe.com`,
    // Frames: Stripe Checkout/Hooks (redirect-flow) + Google OAuth popup.
    `frame-src ${STRIPE_HOSTS.join(" ")} ${GOOGLE_OAUTH}`,
    // Workers: future-proof para service worker (PWA vai sem SW agora, mas
    // este header não custa nada).
    "worker-src 'self' blob:",
    // PWA manifest
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${STRIPE_HOSTS[2]}`,
    "frame-ancestors 'none'",
  ];

  // `upgrade-insecure-requests` é IGNORADO pelos browsers em Report-Only
  // (spec). Em vez de gerar warning no console, omitimos quando reportOnly.
  // Em produção sob HTTPS já é redundante (não há http:// pra upgrade), mas
  // mantém intent declarativa para auditorias.
  if (!opts.reportOnly && !isDev) {
    directives.push("upgrade-insecure-requests");
  }

  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join("; ");
}

/**
 * Pequeno helper para os route handlers/RSC pages que precisam injetar o
 * nonce em scripts inline (ex: schema.org JSON-LD, theme bootstrap).
 *
 * Uso em RSC:
 *   const nonce = (await headers()).get("x-nonce") ?? undefined;
 *   <script nonce={nonce} ... />
 */
export const CSP_HEADER = "Content-Security-Policy";
export const CSP_NONCE_HEADER = "x-nonce";

/**
 * Path prefixes que NÃO devem receber CSP. Webhooks, cron jobs e health checks
 * servem JSON para servidores externos, não browser; injetar CSP só polui logs.
 */
const CSP_SKIP_PREFIXES = ["/api/webhooks", "/api/jobs", "/api/health"];

export function shouldSkipCsp(pathname: string): boolean {
  return CSP_SKIP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
