/** Formatação das telas: português do Brasil, horário de Brasília. */
export const TIME_ZONE = "America/Sao_Paulo";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return integer.format(value);
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${integer.format(value)}` : integer.format(value);
}

/** Valor em centavos. Por padrão sem centavos, como nos totais; `exact` mostra os centavos. */
export function formatBRL(cents: number, options: { exact?: boolean } = {}): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: options.exact ? 2 : 0,
    maximumFractionDigits: options.exact ? 2 : 0,
  }).format(cents / 100);
}

export function formatUSD(amount: number): string {
  return `US$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

/** Razão entre 0 e 1. Abaixo de 10% mostra uma casa decimal. */
export function formatPercent(ratio: number): string {
  const percent = ratio * 100;
  return `${percent < 10 && percent > 0 ? decimal.format(percent) : integer.format(percent)}%`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(value: number, one: string, many: string) {
  return `${value} ${value === 1 ? one : many}`;
}

/** "há 3 dias", "há 2 horas", "agora". Para datas futuras, "em 5 minutos". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MINUTE) return "agora";
  if (abs < HOUR) text = plural(Math.floor(abs / MINUTE), "minuto", "minutos");
  else if (abs < DAY) text = plural(Math.floor(abs / HOUR), "hora", "horas");
  else if (abs < 60 * DAY) text = plural(Math.floor(abs / DAY), "dia", "dias");
  else text = plural(Math.floor(abs / (30 * DAY)), "mês", "meses");
  return future ? `em ${text}` : `há ${text}`;
}

/** Duração em minutos, horas ou dias, sem "há". */
export function formatDuration(ms: number): string {
  if (ms < HOUR) return plural(Math.max(1, Math.floor(ms / MINUTE)), "minuto", "minutos");
  if (ms < DAY) return plural(Math.floor(ms / HOUR), "hora", "horas");
  return plural(Math.floor(ms / DAY), "dia", "dias");
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "12 de outubro" */
export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
  }).format(date);
}

/** "12 de outubro de 2026" */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "17/10 14:32", compacto para tabelas. */
export function formatDateTime(date: Date): string {
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `${day} ${formatTime(date)}`;
}

/** "Sábado, 17 de outubro" */
export function formatWeekday(date: Date): string {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function greeting(date: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function shortCommit(sha: string | null | undefined): string | null {
  return sha && /^[a-f0-9]{7,64}$/i.test(sha) ? sha.slice(0, 7) : null;
}

/** Início do dia de hoje em Brasília, para contagens "hoje". */
export function startOfToday(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Brasília não tem horário de verão desde 2019: o deslocamento é fixo em -03:00.
  return new Date(`${parts}T00:00:00-03:00`);
}

export function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY);
}
