import { TIME_ZONE } from "@/lib/format";

/** Contas pelo resumo da semana: tudo puro, para testar sem banco nem relógio. */

const DAY = 86_400_000;

/**
 * A semana que terminou: de segunda 00:00 a segunda 00:00 em Brasília, antes
 * de `now`. Rodando na segunda ou na terça, a semana é a mesma, então a chave
 * da mensagem também.
 */
export function previousWeek(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const sinceMonday = Math.max(0, weekdays.indexOf(get("weekday")));
  // Brasília não tem horário de verão desde 2019: o deslocamento é fixo em -03:00.
  const today = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`);
  const end = new Date(today.getTime() - sinceMonday * DAY);
  return { start: new Date(end.getTime() - 7 * DAY), end };
}

/** "de 12 a 18 de outubro", ou "de 29 de setembro a 5 de outubro" quando o mês vira. */
export function weekLabel(start: Date, end: Date): string {
  const last = new Date(end.getTime() - DAY);
  const day = (date: Date) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "numeric" }).format(date);
  const month = (date: Date) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, month: "long" }).format(date);
  return month(start) === month(last)
    ? `de ${day(start)} a ${day(last)} de ${month(last)}`
    : `de ${day(start)} de ${month(start)} a ${day(last)} de ${month(last)}`;
}

const ALERT_KEY =
  /^admin\.alert:([a-z0-9-]+):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):(down|up):/;

export type Outage = { service: string; downSince: Date; upAt: Date | null };

/** Quedas avisadas no período, uma por serviço e início, a partir das chaves dos avisos. */
export function outagesFromAlertKeys(
  rows: ReadonlyArray<{ messageKey: string; createdAt: Date }>,
): Outage[] {
  const outages = new Map<string, Outage>();
  for (const row of rows) {
    const match = ALERT_KEY.exec(row.messageKey);
    if (!match) continue;
    const [, service = "", since = "", kind] = match;
    const id = `${service}|${since}`;
    const outage = outages.get(id) ?? { service, downSince: new Date(since), upAt: null };
    if (kind === "up" && (!outage.upAt || row.createdAt < outage.upAt)) outage.upAt = row.createdAt;
    outages.set(id, outage);
  }
  return [...outages.values()].sort((a, b) => a.downSince.getTime() - b.downSince.getTime());
}
