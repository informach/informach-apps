import { APPS } from "@informach/config";

/**
 * Os produtos acompanhados pelo Bastidores. `app` é o slug gravado em
 * `billing.customers.app`, `billing.credit_ledger.app` e `ops.job_runs.app`.
 * As cores vêm do site de cada produto e só aparecem em marcadores pequenos.
 */
export const PRODUCT_KEYS = ["cozya", "agenda-da-turma", "missao-saber", "edi"] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

export type ProductInfo = {
  key: ProductKey;
  name: string;
  domain: string;
  /** Cor do marcador e do texto sobre ela. */
  mark: { background: string; foreground: string };
};

export const PRODUCTS: Record<ProductKey, ProductInfo> = {
  cozya: {
    key: "cozya",
    name: APPS.cozya.name,
    domain: APPS.cozya.domain,
    mark: { background: "#FF7A3D", foreground: "#173247" },
  },
  "agenda-da-turma": {
    key: "agenda-da-turma",
    name: APPS.agendaDaTurma.name,
    domain: APPS.agendaDaTurma.domain,
    mark: { background: "#0066EB", foreground: "#FFFFFF" },
  },
  "missao-saber": {
    key: "missao-saber",
    name: APPS.missaoSaber.name,
    domain: APPS.missaoSaber.domain,
    mark: { background: "#1E5A44", foreground: "#EAF6DD" },
  },
  edi: {
    key: "edi",
    name: APPS.edi.name,
    domain: APPS.edi.domain,
    mark: { background: "#1F242A", foreground: "#F4F1EA" },
  },
};

export function isProductKey(value: unknown): value is ProductKey {
  return PRODUCT_KEYS.includes(value as ProductKey);
}

export function productName(app: string): string {
  return isProductKey(app) ? PRODUCTS[app].name : app;
}

/**
 * Serviços conferidos pelo painel. `ready` diz se está pronto para tráfego;
 * `health` diz qual versão está servindo. O site não tem API: a página inicial
 * responde pelas duas perguntas, sem versão.
 */
export const SERVICE_KEYS = ["site", "cozya", "agenda-da-turma", "missao-saber", "edi"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type ServiceInfo = {
  key: ServiceKey;
  name: string;
  /** Nome do serviço no Railway. */
  railwayService: string;
  defaultOrigin: string;
  readyPath: string;
  healthPath: string | null;
};

export const SERVICES: Record<ServiceKey, ServiceInfo> = {
  site: {
    key: "site",
    name: "Site Informach",
    railwayService: "@informach/informach-site",
    defaultOrigin: "https://www.informach.com.br",
    readyPath: "/",
    healthPath: null,
  },
  cozya: {
    key: "cozya",
    name: PRODUCTS.cozya.name,
    railwayService: "@informach/cozya",
    defaultOrigin: `https://${PRODUCTS.cozya.domain}`,
    readyPath: "/api/ready",
    healthPath: "/api/health",
  },
  "agenda-da-turma": {
    key: "agenda-da-turma",
    name: PRODUCTS["agenda-da-turma"].name,
    railwayService: "@informach/agenda-da-turma",
    defaultOrigin: `https://${PRODUCTS["agenda-da-turma"].domain}`,
    readyPath: "/api/ready",
    healthPath: "/api/health",
  },
  "missao-saber": {
    key: "missao-saber",
    name: PRODUCTS["missao-saber"].name,
    railwayService: "@informach/missao-saber",
    defaultOrigin: `https://${PRODUCTS["missao-saber"].domain}`,
    readyPath: "/api/ready",
    healthPath: "/api/health",
  },
  edi: {
    key: "edi",
    name: PRODUCTS.edi.name,
    railwayService: "@informach/edi",
    defaultOrigin: `https://${PRODUCTS.edi.domain}`,
    readyPath: "/api/ready",
    healthPath: "/api/health",
  },
};

/** Endereços com a troca de `ADMIN_SERVICE_URLS` (JSON), usada em desenvolvimento e testes. */
export function serviceOrigins(override: string): Record<ServiceKey, string> {
  const origins = Object.fromEntries(
    SERVICE_KEYS.map((key) => [key, SERVICES[key].defaultOrigin]),
  ) as Record<ServiceKey, string>;
  if (!override) return origins;
  let parsed: unknown;
  try {
    parsed = JSON.parse(override);
  } catch {
    return origins;
  }
  if (typeof parsed !== "object" || parsed === null) return origins;
  for (const key of SERVICE_KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "string" && URL.canParse(value)) origins[key] = new URL(value).origin;
  }
  return origins;
}

/**
 * "no Cozya", "na Agenda da Turma": o lugar onde a pessoa entrou, a partir do
 * `appName` que o pacote de autenticação grava em `session.created`. Nome
 * desconhecido não vai para a tela.
 */
const APP_PHRASES: Record<string, string> = {
  [PRODUCTS.cozya.name]: `no ${PRODUCTS.cozya.name}`,
  [PRODUCTS["agenda-da-turma"].name]: `na ${PRODUCTS["agenda-da-turma"].name}`,
  [PRODUCTS["missao-saber"].name]: `na ${PRODUCTS["missao-saber"].name}`,
  [PRODUCTS.edi.name]: `na ${PRODUCTS.edi.name}`,
  Bastidores: "no Bastidores",
};

export function appPhrase(appName: string | null | undefined): string | null {
  return appName ? (APP_PHRASES[appName] ?? null) : null;
}

/** Produtos que guardam a sessão no Redis (os mesmos de `REDIS_SESSION_APPS`). */
const REDIS_SESSION_PRODUCTS: ProductKey[] = ["cozya", "agenda-da-turma", "missao-saber"];

/**
 * Onde um "encerrar sessões" chegou, a partir de `apps` do evento
 * `admin.sessions_revoked` (os Redis alcançados): " em todos os produtos", ou
 * quais ficaram de fora quando o Redis não respondeu.
 */
export function sessionsScope(reached: unknown): string {
  const list = Array.isArray(reached) ? reached.filter(isProductKey) : [];
  const missed = REDIS_SESSION_PRODUCTS.filter((key) => !list.includes(key)).map(
    (key) => PRODUCTS[key].name,
  );
  if (missed.length === 0) return " em todos os produtos";
  const names =
    missed.length > 1 ? `${missed.slice(0, -1).join(", ")} e ${missed.at(-1)}` : missed[0];
  return ` (sem alcançar ${names})`;
}
