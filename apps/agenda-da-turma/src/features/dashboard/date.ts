// Datas locais no formato "YYYY-MM-DD" (sem TZ) — mesmo formato da coluna
// `date` no Postgres usado em agenda.activities.dueAt. Comparação lexicográfica
// de strings funciona corretamente nesse formato (ano-mês-dia padded).
//
// **TZ**: "hoje" e cálculos relativos a hoje (`addDaysIso(todayLocalIso(), N)`)
// usam `America/Sao_Paulo` explicitamente — independente do TZ do servidor. Em
// produção o Railway roda UTC, então sem isso uma tarefa cadastrada às 21h BRT
// "viraria" pro dia seguinte na visão do back-end. `toLocalIso`/`parseLocalIso`/
// `addDaysLocalIso` ficam server-TZ neutros (operam sobre componentes wall-clock
// de Date sintéticos) — esses NÃO devem receber `new Date()` direto.

const APP_TIME_ZONE = "America/Sao_Paulo";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `formatToParts` é mais robusto que `format`: extrai year/month/day como
// strings padded sem depender de delimitadores ou ordering do locale (em
// algumas implementações `en-CA` retorna "2026/05/12" com `/`).
const SP_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Server-TZ-neutral: lê year/month/day como wall-clock do Date passado.
// USAR APENAS com Dates sintéticos (via parseLocalIso) — nunca com `new Date()`
// direto, porque o resultado dependeria do TZ do servidor.
export function toLocalIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidLocalIsoDate(iso: string): boolean {
  return parseLocalIsoToDate(iso) !== null;
}

function parseLocalIsoToDate(iso: string): Date | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  return toLocalIso(parsed) === iso ? parsed : null;
}

// "YYYY-MM-DD" → Date local meio-dia (evita TZ shift em fusos negativos).
// Date sintético — não representa um instante real, é só vehicle pra
// aritmética de dias via setDate/getDate.
export function parseLocalIso(iso: string): Date {
  const parsed = parseLocalIsoToDate(iso);
  if (!parsed) {
    throw new Error(`parseLocalIso: invalid ISO "${iso}"`);
  }
  return parsed;
}

// "Hoje" segundo o calendário de São Paulo. Independe do TZ do servidor.
// Aceita um Date opcional pra testes (poder fixar `now` sem mexer no clock).
export function todayLocalIso(now: Date = new Date()): string {
  const parts = SP_DATE_PARTS.formatToParts(now);
  let y = "";
  let m = "";
  let d = "";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
  }
  return `${y}-${m}-${d}`;
}

// Adiciona N dias a uma string ISO. Pure string-in, string-out — sem
// dependência de TZ do servidor (a aritmética acontece sobre um Date
// sintético construído via parseLocalIso). Use isto pra calcular "hoje + 7":
// `addDaysIso(todayLocalIso(), 7)`.
export function addDaysIso(iso: string, days: number): string {
  const d = parseLocalIso(iso);
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
}

// **Deprecated em favor de `addDaysIso(todayLocalIso(), days)`** quando o caller
// quer "hoje + N". Continua disponível pra date-math em Dates sintéticos vindos
// de `parseLocalIso` (esse uso é seguro porque o input não é um instante real).
export function addDaysLocalIso(now: Date, days: number): string {
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return toLocalIso(next);
}
