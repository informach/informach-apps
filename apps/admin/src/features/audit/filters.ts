/** Filtros da Auditoria, lidos da URL. Tudo aqui é puro para ser testado sem banco. */

export const AUDIT_GROUPS = [
  { key: "tudo", label: "Tudo" },
  { key: "equipe", label: "Ações da equipe" },
  { key: "contas", label: "Contas" },
  { key: "sessoes", label: "Sessões e acesso" },
  { key: "cobranca", label: "Cobrança" },
  { key: "emails", label: "E-mails" },
  { key: "produtos", label: "Produtos" },
] as const;
export type AuditGroupKey = (typeof AUDIT_GROUPS)[number]["key"];

/**
 * Banir, desbanir e mudar papel também são ações da equipe: só owner e admin
 * conseguem (`setUserBanState` e `setUserRole` em `@informach/auth` exigem a
 * permissão), e o único caminho sem conta é o script do primeiro owner. Por
 * isso entram pelo tipo, sem precisar cruzar o papel de quem agiu.
 */
export const TEAM_ACCOUNT_EVENTS = ["user.banned", "user.unbanned", "user.role_changed"];

/**
 * Prefixos de `event_type` de cada grupo. `exact` e `exclude` ajustam os casos
 * de borda. Um evento pode cair em mais de um filtro (banir está em Contas e em
 * Ações da equipe); `groupOf` devolve o primeiro, na ordem abaixo.
 */
export const GROUP_MATCH: Record<
  Exclude<AuditGroupKey, "tudo">,
  { prefixes: string[]; exact?: string[]; exclude?: string[] }
> = {
  equipe: { prefixes: ["admin."], exact: TEAM_ACCOUNT_EVENTS },
  contas: { prefixes: ["user.", "account.", "org."], exact: ["email.verified"] },
  sessoes: { prefixes: ["session.", "auth."] },
  cobranca: { prefixes: ["billing."] },
  emails: { prefixes: ["email."], exclude: ["email.verified"] },
  produtos: { prefixes: ["agenda.", "missao."] },
};

export function groupOf(eventType: string): Exclude<AuditGroupKey, "tudo"> | null {
  for (const [key, match] of Object.entries(GROUP_MATCH) as Array<
    [Exclude<AuditGroupKey, "tudo">, (typeof GROUP_MATCH)[keyof typeof GROUP_MATCH]]
  >) {
    if (match.exclude?.includes(eventType)) continue;
    if (match.exact?.includes(eventType)) return key;
    if (match.prefixes.some((prefix) => eventType.startsWith(prefix))) return key;
  }
  return null;
}

/**
 * Campos do payload que apontam para a pessoa, nos nomes usados pelos pacotes:
 * `targetId` e `targetUserId` (auth e Bastidores), `subjectId` (checkout,
 * pagamento e exclusão da conta), `ownerId` (créditos) e `userId`. Os avisos de
 * assinatura do Stripe só trazem `customerId`, o ID do cliente de cobrança em
 * `billing.customers`; esse é conferido à parte, pelos clientes da pessoa.
 */
export const PERSON_PAYLOAD_KEYS = [
  "targetId",
  "targetUserId",
  "subjectId",
  "ownerId",
  "userId",
] as const;
export const BILLING_CUSTOMER_PAYLOAD_KEY = "customerId";

export const AUDIT_PERIODS = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "tudo", label: "Desde o início" },
] as const;
export type AuditPeriodKey = (typeof AUDIT_PERIODS)[number]["key"];

export type AuditFilters = {
  group: AuditGroupKey;
  period: AuditPeriodKey;
  /** E-mail exato ou ID da conta, como digitado. */
  person: string;
  page: number;
};

export const AUDIT_PAGE_SIZE = 50;

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseAuditFilters(params: Params): AuditFilters {
  const group = first(params.grupo);
  const period = first(params.periodo);
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    group: AUDIT_GROUPS.some((item) => item.key === group) ? (group as AuditGroupKey) : "tudo",
    period: AUDIT_PERIODS.some((item) => item.key === period) ? (period as AuditPeriodKey) : "7d",
    person: first(params.pessoa).trim().slice(0, 200),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** Query string dos filtros, sem os valores padrão, para links e para a exportação. */
export function filtersQuery(filters: AuditFilters, override: Partial<AuditFilters> = {}): string {
  const merged = { ...filters, ...override };
  const params = new URLSearchParams();
  if (merged.group !== "tudo") params.set("grupo", merged.group);
  if (merged.period !== "7d") params.set("periodo", merged.period);
  if (merged.person) params.set("pessoa", merged.person);
  if (merged.page > 1) params.set("pagina", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Início do período. `startOfToday` vem de fora para o teste controlar o relógio. */
export function periodStart(period: AuditPeriodKey, now: Date, startOfToday: Date): Date | null {
  if (period === "hoje") return startOfToday;
  if (period === "7d") return new Date(now.getTime() - 7 * 86_400_000);
  if (period === "30d") return new Date(now.getTime() - 30 * 86_400_000);
  return null;
}
