export function localDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar days in São Paulo between two moments: last night's dinner is "ontem" in the morning. */
export function daysBetween(from: Date, to = new Date()): number {
  const start = new Date(`${localDay(from)}T12:00:00Z`).getTime();
  const end = new Date(`${localDay(to)}T12:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

/** "feita hoje", "feita há 2 semanas": when a recipe was last cooked. */
export function cookedAgo(date: Date, now = new Date()): string {
  const days = daysBetween(new Date(date), now);
  if (days <= 0) return "feita hoje";
  if (days === 1) return "feita ontem";
  if (days < 7) return `feita há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `feita há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  const months = Math.floor(days / 30);
  return `feita há ${months} ${months === 1 ? "mês" : "meses"}`;
}

export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function weekStart(day = localDay()): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -(weekday === 0 ? 6 : weekday - 1));
}

export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${day}T12:00:00Z`));
}

function part(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...options }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** "Terça, 20 de outubro" */
export function longDayLabel(day: string): string {
  const weekday = part(day, { weekday: "long" }).replace("-feira", "");
  const date = part(day, { day: "numeric", month: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date}`;
}

/** "terça" */
export function weekdayName(day: string): string {
  return part(day, { weekday: "long" }).replace("-feira", "");
}

/** "SEG", "TER"… */
export function weekdayShort(day: string): string {
  return part(day, { weekday: "short" }).replace(".", "").slice(0, 3).toUpperCase();
}

/** "19 a 25 de outubro", "28 de setembro a 4 de outubro", with the year when it changes. */
export function weekRangeLabel(week: string): string {
  const end = addDays(week, 6);
  const sameMonth = week.slice(0, 7) === end.slice(0, 7);
  const sameYear = week.slice(0, 4) === end.slice(0, 4);
  const startLabel = sameMonth
    ? part(week, { day: "numeric" })
    : part(week, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
  const endLabel = part(end, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${startLabel} a ${endLabel}`;
}
