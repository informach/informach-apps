import "server-only";
import { getEmails } from "@/lib/emails";
import { getEnv } from "@/lib/env";
import { formatBRL, formatDuration, formatUSD } from "@/lib/format";
import { PRODUCT_KEYS, productName, SERVICES, type ServiceKey } from "@/lib/products";
import { monthlyRevenueCents } from "../money/logic";
import { ROUTINES } from "../operations/routines";
import {
  alertKeysBetween,
  failedRunsBetween,
  newAccountsBetween,
  proSubscriptions,
  reportedAiCostBetween,
} from "./repository";
import { ownerRecipients, sendToAll } from "./send";
import { outagesFromAlertKeys, previousWeek, weekLabel } from "./weekly-logic";

function routineLabel(app: string, job: string): string {
  const routine = ROUTINES.find((item) => item.app === app && item.job === job);
  const where = app === "admin" ? "Bastidores" : productName(app);
  return `${routine?.label ?? job}, ${where}`;
}

export type WeeklyResult = {
  recipients: number;
  sent: number;
  /** Descadastro ou bloqueio do provedor: o resumo da semana obedece ao descadastro. */
  skipped: number;
  failed: number;
  week: string;
};

/**
 * Resumo da semana para as contas owner (cron segunda e terça, 08:00 em
 * Brasília). A chave da mensagem é a semana: a passada de terça só reenvia para
 * quem ficou sem o e-mail na segunda.
 */
export async function runAdminWeekly(now: Date = new Date()): Promise<WeeklyResult> {
  const { start, end } = previousWeek(now);
  const [newAccounts, subscriptions, aiCost, failed, alertKeys, recipients] = await Promise.all([
    newAccountsBetween(start, end),
    proSubscriptions(),
    reportedAiCostBetween(start, end),
    failedRunsBetween(start, end),
    alertKeysBetween(start, end),
    ownerRecipients(),
  ]);

  const products = PRODUCT_KEYS.map((key) => {
    const own = subscriptions.filter((item) => item.app === key);
    return {
      name: productName(key),
      proSubscribers: own.length,
      revenue: formatBRL(monthlyRevenueCents(own)),
    };
  });
  const outages = outagesFromAlertKeys(alertKeys).map((outage) => ({
    name: SERVICES[outage.service as ServiceKey]?.name ?? outage.service,
    duration: outage.upAt
      ? formatDuration(outage.upAt.getTime() - outage.downSince.getTime())
      : `pelo menos ${formatDuration(end.getTime() - outage.downSince.getTime())}`,
  }));
  const label = weekLabel(start, end);
  const week = start.toISOString().slice(0, 10);
  const env = getEnv();
  const emails = getEmails();

  const sent = await sendToAll({
    category: "admin.weekly-summary",
    recipients,
    messageKey: (recipient) => `admin.weekly-summary:${week}:${recipient}`,
    render: (unsubscribeUrl) =>
      emails.renderTemplate("admin.weekly-summary", {
        appName: "Bastidores",
        weekLabel: label,
        newAccounts,
        products,
        revenueTotal: formatBRL(monthlyRevenueCents(subscriptions)),
        aiCost: aiCost > 0 ? formatUSD(aiCost) : null,
        failedRoutines: failed
          .sort((a, b) => b.failures - a.failures)
          .map((item) => ({ label: routineLabel(item.app, item.job), failures: item.failures })),
        outages,
        ctaUrl: `${env.NEXT_PUBLIC_APP_URL}/`,
        unsubscribeUrl,
      }),
  });
  return {
    recipients: recipients.length,
    sent: sent.sent,
    skipped: sent.skipped,
    failed: sent.failed,
    week,
  };
}
