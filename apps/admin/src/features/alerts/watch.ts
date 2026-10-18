import "server-only";
import { getEmails } from "@/lib/emails";
import { getEnv } from "@/lib/env";
import { formatDuration, formatTime, TIME_ZONE } from "@/lib/format";
import { reportOperationalError } from "@/lib/observability";
import { SERVICES, type ServiceKey } from "@/lib/products";
import { probeAll, problemText, readStoredStatus } from "@/lib/services";
import { type Alert, alertMessageKey, decideTransition, reachedDetail } from "./decide";
import { markAlerted, markReached, pruneJobRuns, saveServiceStatus } from "./repository";
import { alertRecipients, sendToAll } from "./send";

/** Quanto tempo as execuções de rotina ficam em `ops.job_runs`. */
export const JOB_RUN_RETENTION_DAYS = 90;

/** A limpeza roda na primeira passada depois das 04:00 UTC (01:00 em Brasília). */
function isPruneWindow(now: Date) {
  return now.getUTCHours() === 4 && now.getUTCMinutes() < 5;
}

function sinceText(date: Date): string {
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
  }).format(date);
  return `${day}, ${formatTime(date)}`;
}

/**
 * O aviso de queda é operacional: chega mesmo para quem se descadastrou (a
 * política do pacote de e-mails não o bloqueia), então o rodapé não oferece o
 * link de descadastro. Só bounce ou denúncia de spam param a entrega.
 */
async function sendAlert(alert: Alert, recipients: readonly string[]) {
  const env = getEnv();
  const serviceName = SERVICES[alert.service as ServiceKey]?.name ?? alert.service;
  const ctaUrl = `${env.NEXT_PUBLIC_APP_URL}/operacao`;
  const emails = getEmails();
  return sendToAll({
    category: "admin.alert",
    recipients,
    messageKey: (recipient) => alertMessageKey(alert, recipient),
    render: () =>
      alert.kind === "down"
        ? emails.renderTemplate("admin.alert", {
            appName: "Bastidores",
            kind: "down",
            serviceName,
            downSince: sinceText(alert.downSince),
            problem: alert.problem ?? undefined,
            ctaUrl,
          })
        : emails.renderTemplate("admin.alert", {
            appName: "Bastidores",
            kind: "up",
            serviceName,
            downSince: sinceText(alert.downSince),
            upAt: formatTime(alert.upAt),
            duration: formatDuration(alert.upAt.getTime() - alert.downSince.getTime()),
            ctaUrl,
          }),
  });
}

export type WatchResult = {
  checked: number;
  down: number;
  slow: number;
  alertsSent: number;
  alertsPending: number;
  /** Avisos que não chegaram a ninguém porque todo destinatário estava bloqueado pelo provedor. */
  alertsUndelivered: number;
  pruned: number;
};

/**
 * Uma passada da vigia (cron a cada 5 minutos): confere todos os serviços sem
 * cache, grava o estado e manda os avisos que a máquina de estado pedir. Um
 * aviso que não saiu fica pendente e é tentado de novo na próxima passada.
 */
export async function runAdminWatch(now: Date = new Date()): Promise<WatchResult> {
  const [checks, stored] = await Promise.all([probeAll({ fresh: true }), readStoredStatus()]);
  let recipients: string[] | null = null;
  const result: WatchResult = {
    checked: 0,
    down: 0,
    slow: 0,
    alertsSent: 0,
    alertsPending: 0,
    alertsUndelivered: 0,
    pruned: 0,
  };

  for (const check of checks) {
    result.checked += 1;
    if (check.state === "down") result.down += 1;
    if (check.state === "slow") result.slow += 1;
    const decision = decideTransition(
      stored.get(check.key),
      {
        key: check.key,
        state: check.state,
        latencyMs: check.latencyMs,
        commit: check.commit,
        problem: check.state === "down" ? problemText(check) || null : null,
      },
      now,
    );
    await saveServiceStatus(decision.row);
    if (!decision.alert) continue;
    recipients ??= await alertRecipients();
    const sent = await sendAlert(decision.alert, recipients);
    if (sent.skipped > 0)
      // Só bounce ou spam bloqueiam o aviso de queda: alguém da lista não está recebendo.
      reportOperationalError("alert.delivery_skipped", undefined, {
        category: "admin.alert",
        service: check.key,
      });
    if (sent.delivered) {
      await markAlerted(check.key, now);
      if (sent.sent > 0) result.alertsSent += 1;
      else result.alertsUndelivered += 1;
    } else {
      // Quem já recebeu não recebe de novo (a chave é por pessoa); a próxima
      // passada tenta só quem faltou. Se a queda chegou a alguém, a volta
      // também vai ser avisada.
      if (sent.sent > 0 && decision.alert.kind === "down")
        await markReached(check.key, reachedDetail(decision.row.detail));
      result.alertsPending += 1;
    }
  }

  if (isPruneWindow(now))
    result.pruned = await pruneJobRuns(
      new Date(now.getTime() - JOB_RUN_RETENTION_DAYS * 86_400_000),
    );
  return result;
}
