// Datas locais no formato "YYYY-MM-DD" (sem TZ) — mesmo formato da coluna
// `date` no Postgres usado em agenda.activities.dueAt. Comparação lexicográfica
// de strings funciona corretamente nesse formato (ano-mês-dia padded).

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayLocalIso(now: Date = new Date()): string {
  return toLocalIso(now);
}

export function addDaysLocalIso(now: Date, days: number): string {
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return toLocalIso(next);
}
