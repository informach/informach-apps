/**
 * As rotinas agendadas que o Bastidores acompanha, com a frequência dos crons
 * declarados em `.railway/railway.ts`. `app` e `job` são os mesmos gravados em
 * `ops.job_runs` por `recordJobRun` (o job é o segmento da rota
 * `/api/jobs/<job>`). Mudou um cron no Railway? Atualize aqui também.
 */
export type RoutineDefinition = {
  app: string;
  job: string;
  label: string;
  intervalMinutes: number;
  schedule: string;
  /**
   * Quanto tempo pode passar desde a última execução antes de virar atraso.
   * Sem valor, vale a regra de `lateAfterMinutes`.
   */
  lateAfterMinutes?: number;
  /** Quanto uma execução pode durar antes de contar como parada no meio. Padrão: 30 minutos. */
  maxRuntimeMinutes?: number;
  /** Rotina desligada de propósito: sem registro não é atraso. */
  pausedNote?: string;
};

const DAY = 24 * 60;
const WEEK = 7 * DAY;

/** Rotinas que o mesmo cron chama em cada app de assinatura (`APP_DOMAINS`). */
const PER_APP: Array<Omit<RoutineDefinition, "app">> = [
  {
    job: "billing-release-reservations",
    label: "Liberar reservas de crédito presas",
    intervalMinutes: 5,
    schedule: "a cada 5 minutos",
  },
  {
    job: "email-retry",
    label: "Reenviar e-mails que falharam",
    intervalMinutes: 5,
    schedule: "a cada 5 minutos",
  },
  {
    job: "email-recover-stale",
    label: "Recuperar envios de e-mail travados",
    intervalMinutes: 30,
    schedule: "a cada 30 minutos",
  },
  {
    job: "billing-dunning",
    label: "Nova tentativa de cobrança",
    intervalMinutes: 6 * 60,
    schedule: "a cada 6 horas",
  },
  {
    job: "billing-reconcile",
    label: "Conciliar cobrança com o Stripe",
    intervalMinutes: DAY,
    schedule: "todo dia, 00:00",
  },
  {
    job: "billing-expire-bonus",
    label: "Vencer créditos bônus",
    intervalMinutes: DAY,
    schedule: "todo dia, 00:30",
  },
  {
    job: "billing-grant-monthly",
    label: "Liberar créditos mensais dos planos anuais",
    intervalMinutes: DAY,
    schedule: "todo dia, 00:45",
  },
];

export const ROUTINES: readonly RoutineDefinition[] = [
  ...PER_APP.map((routine) => ({ ...routine, app: "cozya" })),
  {
    app: "cozya",
    job: "cozya-retention",
    label: "Retenção e conciliação do Cozya",
    intervalMinutes: 60,
    schedule: "de hora em hora",
  },
  {
    app: "cozya",
    job: "auth-cleanup",
    label: "Limpar códigos e convites vencidos",
    intervalMinutes: DAY,
    schedule: "todo dia, 01:00",
  },
  {
    app: "cozya",
    job: "email-suppression-sync",
    label: "Sincronizar a lista de bloqueio do SendGrid",
    intervalMinutes: DAY,
    schedule: "todo dia, 02:00",
  },
  ...PER_APP.map((routine) => ({ ...routine, app: "agenda-da-turma" })),
  {
    app: "agenda-da-turma",
    job: "agenda-routine",
    label: "Rotina e lembretes da Agenda",
    intervalMinutes: 5,
    schedule: "a cada 5 minutos",
  },
  {
    app: "missao-saber",
    job: "billing",
    label: "Manutenção da cobrança da Missão Saber",
    intervalMinutes: 5,
    schedule: "a cada 5 minutos",
  },
  {
    app: "missao-saber",
    job: "weekly-report",
    label: "Resumo semanal das famílias",
    intervalMinutes: WEEK,
    schedule: "segunda e terça, 09:00",
    // Roda na segunda e repete na terça; de terça a segunda são seis dias.
    lateAfterMinutes: 8 * DAY,
    // Monta e envia o resumo de cada família: pode demorar mais que as outras.
    maxRuntimeMinutes: 60,
  },
  {
    app: "edi",
    job: "reconcile",
    label: "Conciliação da Suíte Edi",
    intervalMinutes: 5,
    schedule: "a cada 5 minutos",
    // Ligada desde 17/10/2026, 20:09 UTC, com a cobrança: sem execução registrada
    // é "nunca rodou", e vira alerta como as outras.
  },
  {
    app: "admin",
    job: "admin-watch",
    label: "Vigia dos serviços e avisos",
    intervalMinutes: 5,
    schedule: "a cada 5 minutos",
  },
  {
    app: "admin",
    job: "admin-weekly",
    label: "Resumo da semana para as contas owner",
    intervalMinutes: WEEK,
    schedule: "segunda e terça, 08:00",
    lateAfterMinutes: 8 * DAY,
  },
];

export type LastRun = {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  errorName: string | null;
  summary: Record<string, number | boolean>;
};

export type RoutineState =
  | "ok"
  | "failed"
  | "running"
  | "interrupted"
  | "late"
  | "never"
  | "paused";

/** Rotinas de até uma hora: atraso depois de duas vezes e meia a frequência. */
export const LATE_FACTOR = 2.5;
/** Rotinas de seis em seis horas ou diárias: atraso depois da frequência mais duas horas. */
const LATE_SLACK_MINUTES = 2 * 60;
/** Uma execução sem fim registrado depois disso provavelmente caiu no meio. */
const MAX_RUNTIME_MINUTES = 30;

/** Prazo da rotina, em minutos desde a última execução, antes de contar como atrasada. */
export function lateAfterMinutes(routine: RoutineDefinition): number {
  if (routine.lateAfterMinutes !== undefined) return routine.lateAfterMinutes;
  return routine.intervalMinutes <= 60
    ? LATE_FACTOR * routine.intervalMinutes
    : routine.intervalMinutes + LATE_SLACK_MINUTES;
}

export function routineState(
  routine: RoutineDefinition,
  last: LastRun | null,
  now: Date,
): RoutineState {
  if (!last) return routine.pausedNote ? "paused" : "never";
  const age = now.getTime() - last.startedAt.getTime();
  if (last.finishedAt === null && last.ok === null)
    return age < (routine.maxRuntimeMinutes ?? MAX_RUNTIME_MINUTES) * 60_000
      ? "running"
      : "interrupted";
  if (age > lateAfterMinutes(routine) * 60_000) return "late";
  return last.ok ? "ok" : "failed";
}

/** Nome da falha para a tela: `Http503` vira "respondeu 503"; o resto fica em mono. */
export function failureText(errorName: string | null): string {
  if (!errorName) return "falhou";
  const http = /^Http(\d{3})$/.exec(errorName);
  if (http) return `respondeu ${http[1]}`;
  return `falhou com ${errorName}`;
}

const SUMMARY_WORDS: Record<string, [string, string]> = {
  released: ["liberada", "liberadas"],
  expired: ["vencida", "vencidas"],
  retried: ["reenviado", "reenviados"],
  recovered: ["recuperado", "recuperados"],
  sent: ["enviado", "enviados"],
  enviados: ["enviado", "enviados"],
  failed: ["falha", "falhas"],
  falhas: ["falha", "falhas"],
  ignorados: ["ignorado", "ignorados"],
  processed: ["processado", "processados"],
  scanned: ["conferido", "conferidos"],
  granted: ["liberado", "liberados"],
  attempted: ["tentativa", "tentativas"],
  synced: ["sincronizado", "sincronizados"],
  inserted: ["novo", "novos"],
  deleted: ["apagado", "apagados"],
  verifications: ["verificação apagada", "verificações apagadas"],
  invitations: ["convite vencido", "convites vencidos"],
};

/**
 * Resumo curto da execução a partir dos números que ela devolveu. Só entram
 * chaves conhecidas, em até três itens, para a coluna não virar log.
 */
export function summaryText(summary: Record<string, number | boolean>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(summary)) {
    if (parts.length >= 3) break;
    if (typeof value !== "number") continue;
    const words = SUMMARY_WORDS[key];
    if (!words) continue;
    parts.push(`${value.toLocaleString("pt-BR")} ${value === 1 ? words[0] : words[1]}`);
  }
  return parts.length ? parts.join(", ") : "sem números";
}
