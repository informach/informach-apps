import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaPushSubscriptions,
  users,
} from "@informach/db/schema";
import webpush from "web-push";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { purgeExpiredInboxMessages } from "@/features/inbox/repository";
import { listNoticeActions } from "@/features/notices/repository";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { buildEmailUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { isAllowedPushEndpoint, isQuietHour } from "./schemas";
import { getNotificationPreferences } from "./service";
import { buildWeeklyDigestLines } from "./weekly";

export function saoPauloHour(now: Date) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

/**
 * O dia da semana em São Paulo, 0 = domingo.
 *
 * Sai da data local (`todayLocalIso`), não de `now.getDay()`: o servidor roda
 * em UTC, e às 21h de um domingo brasileiro `getDay()` já responde segunda.
 */
export function weekdayInSaoPaulo(now: Date) {
  const [year, month, day] = todayLocalIso(now).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
type Message = { key: string; title: string; lines: string[]; path: string };

async function claim(userId: string, channel: "email" | "push", messageKey: string, now: Date) {
  await db
    .insert(agendaNotificationDeliveries)
    .values({ userId, channel, messageKey })
    .onConflictDoNothing();
  const [row] = await db
    .update(agendaNotificationDeliveries)
    .set({
      status: "processing",
      attempts: sql`CASE WHEN ${agendaNotificationDeliveries.status} = 'processing' THEN ${agendaNotificationDeliveries.attempts} ELSE ${agendaNotificationDeliveries.attempts} + 1 END`,
      lastAttemptAt: now,
    })
    .where(
      and(
        eq(agendaNotificationDeliveries.userId, userId),
        eq(agendaNotificationDeliveries.channel, channel),
        eq(agendaNotificationDeliveries.messageKey, messageKey),
        sql`(${agendaNotificationDeliveries.attempts} < 3 OR ${agendaNotificationDeliveries.status} = 'processing')`,
        sql`(${agendaNotificationDeliveries.status} = 'pending' OR (${agendaNotificationDeliveries.status} IN ('failed', 'processing') AND ${agendaNotificationDeliveries.lastAttemptAt} < ${new Date(now.valueOf() - 10 * 60_000).toISOString()}::timestamptz))`,
      ),
    )
    .returning();
  return row ?? null;
}
async function finish(id: string, status: "sent" | "failed" | "canceled", now: Date) {
  await db
    .update(agendaNotificationDeliveries)
    .set({ status, sentAt: status === "sent" ? now : null })
    .where(
      and(
        eq(agendaNotificationDeliveries.id, id),
        eq(agendaNotificationDeliveries.status, "processing"),
        eq(agendaNotificationDeliveries.lastAttemptAt, now),
      ),
    );
}

async function defer(id: string, now: Date) {
  // A busy/uncertain provider delivery is not a failed attempt and must not
  // exhaust this job's retry budget. The email layer owns reconciliation.
  await db
    .update(agendaNotificationDeliveries)
    .set({
      status: "failed",
      attempts: sql`greatest(0, ${agendaNotificationDeliveries.attempts} - 1)`,
    })
    .where(
      and(
        eq(agendaNotificationDeliveries.id, id),
        eq(agendaNotificationDeliveries.status, "processing"),
        eq(agendaNotificationDeliveries.lastAttemptAt, now),
      ),
    );
}

// Rebuild from current grants, subscription, status and dates for each send.
async function currentMessages(userId: string, now: Date): Promise<Message[]> {
  const prefs = await getNotificationPreferences(userId);
  const today = todayLocalIso(now);
  const tomorrow = addDaysIso(today, 1);
  const hour = saoPauloHour(now);
  if (isQuietHour(hour, prefs.quietStart, prefs.quietEnd)) return [];
  const entitlement = await getFamilyEntitlements(userId);
  if (!entitlement.enabled) return [];
  // Uma lista só. O resumo já somou duas consultas — as providências de recado
  // e um snapshot por bucket das atividades escolares — e a mesma atividade
  // aparecia com dois textos diferentes conforme a tabela de origem. Com a
  // convergência, `listNoticeActions` (pendentes, por acesso à criança) é a
  // fonte inteira.
  const rows = await listNoticeActions(userId);
  const eligible = rows.filter((r) => entitlement.proProfileIds.includes(r.action.profileId));
  const messages: Message[] = [];
  // O resumo da semana, no dia e na hora combinados. Sai da MESMA lista do
  // resumo diário — é a mesma rotina lida com outro alcance, não uma segunda
  // fonte que pode discordar.
  if (
    prefs.weeklyDigestEnabled &&
    hour === prefs.weeklyDigestHour &&
    weekdayInSaoPaulo(now) === prefs.weeklyDigestDay
  ) {
    const lines = buildWeeklyDigestLines(
      eligible.map(({ action, profileName }) => ({
        profileName,
        title: action.title,
        type: action.type,
        dueAt: action.dueAt,
        estimatedMinutes: action.estimatedMinutes,
        status: action.status,
      })),
      { todayIso: today },
    );
    if (lines.length)
      messages.push({
        key: `weekly:${today}`,
        title: "A semana que vem na sua casa",
        lines,
        path: "/calendario?view=week",
      });
  }
  if (hour === prefs.digestHour) {
    const relevant = eligible.filter(({ action: a }) => !a.dueAt || a.dueAt <= tomorrow);
    const lines = relevant.map(
      (r) =>
        `${r.profileName}: ${ACTIVITY_TYPE_LABELS[r.action.type]}, ${r.action.title}. ${r.action.dueAt ? `Data: ${r.action.dueAt}` : "Prazo a confirmar"}${r.action.time ? ` às ${r.action.time}` : ""}. Responsável: ${r.assignedName ?? "a combinar"}.`,
    );
    if (lines.length)
      messages.push({
        key: `digest:${today}`,
        title: "Sua rotina para amanhã",
        lines:
          lines.length > 20
            ? [
                ...lines.slice(0, 20),
                `Mais ${lines.length - 20} atividades na rotina. Abra o app para conferir todas.`,
              ]
            : lines,
        path: "/dashboard",
      });
  }
  for (const { action: a, profileName } of eligible) {
    if (
      a.reminderAt &&
      a.reminderAt <= now &&
      a.reminderAt.valueOf() >= now.valueOf() - 24 * 3600_000
    )
      messages.push({
        key: `action:${a.id}:v${a.version}`,
        title: "Uma atividade da família precisa de atenção",
        lines: [
          `${profileName}: ${a.title}. Data: ${a.dueAt ?? "a confirmar"}${a.time ? ` às ${a.time}` : ""}.`,
        ],
        path: `/atividades/${a.id}`,
      });
  }
  return messages;
}

export async function deliverRoutineNotifications(
  now = new Date(),
  options: { afterUserId?: string | null; limit?: number; budgetMs?: number } = {},
) {
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const deadline = Date.now() + Math.min(45_000, Math.max(1000, options.budgetMs ?? 40_000));
  const hour = saoPauloHour(now);
  const recipients = await db
    .select({
      preferences: agendaNotificationPreferences,
      email: users.email,
      verified: users.emailVerified,
    })
    .from(agendaNotificationPreferences)
    .innerJoin(users, eq(users.id, agendaNotificationPreferences.userId))
    .where(
      and(
        sql`(${agendaNotificationPreferences.emailEnabled} OR ${agendaNotificationPreferences.pushEnabled})`,
        options.afterUserId
          ? sql`${agendaNotificationPreferences.userId} > ${options.afterUserId}`
          : undefined,
      ),
    )
    .orderBy(agendaNotificationPreferences.userId)
    .limit(limit + 1);
  let sent = 0;
  let failed = 0;
  let completed = 0;
  let cursor = options.afterUserId ?? null;
  let interrupted = false;
  recipientsLoop: for (const recipient of recipients.slice(0, limit)) {
    const prefs = recipient.preferences;
    const userId = prefs.userId;
    if (Date.now() >= deadline) {
      interrupted = true;
      break;
    }
    if (!recipient.verified || isQuietHour(hour, prefs.quietStart, prefs.quietEnd)) {
      cursor = userId;
      completed++;
      continue;
    }
    const messages = await currentMessages(userId, now);
    const subscriptions = prefs.pushEnabled
      ? await db
          .select()
          .from(agendaPushSubscriptions)
          .where(eq(agendaPushSubscriptions.userId, userId))
      : [];
    for (const message of messages) {
      if (Date.now() >= deadline) {
        interrupted = true;
        break recipientsLoop;
      }
      const currentPrefs = await getNotificationPreferences(userId);
      if (isQuietHour(saoPauloHour(now), currentPrefs.quietStart, currentPrefs.quietEnd)) continue;
      if (currentPrefs.emailEnabled) {
        const delivery = await claim(userId, "email", message.key, now);
        if (delivery) {
          try {
            const fresh = (await currentMessages(userId, now)).find((m) => m.key === message.key);
            const consent = await getNotificationPreferences(userId);
            if (!fresh || !consent.emailEnabled) {
              await finish(delivery.id, "canceled", now);
              continue;
            }
            const unsubscribeUrl = buildEmailUnsubscribeUrl(userId, "agenda.routine");
            const url = `${env.NEXT_PUBLIC_APP_URL}${fresh.path}`;
            const text = `${fresh.title}\n\n${fresh.lines.join("\n")}\n\nAbrir rotina: ${url}\n\nFeito em casa não substitui entregas e autorizações no canal oficial.\nDesativar estes e-mails: ${unsubscribeUrl}`;
            const result = await emails.sendEmail({
              to: recipient.email,
              userId,
              category: "agenda.routine",
              messageKey: `agenda:${userId}:${message.key}`,
              subject: fresh.title,
              text,
              html: `<h1>${escapeHtml(fresh.title)}</h1><ul>${fresh.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul><p><a href="${escapeHtml(url)}">Abrir rotina</a></p><p>Feito em casa não substitui entregas e autorizações no canal oficial.</p><p><a href="${escapeHtml(unsubscribeUrl)}">Desativar estes e-mails</a></p>`,
              unsubscribeUrl,
            });
            if (result.status === "deferred") await defer(delivery.id, now);
            else
              await finish(
                delivery.id,
                result.ok ? "sent" : result.status === "skipped" ? "canceled" : "failed",
                now,
              );
            if (result.ok) sent++;
            else if (result.status === "failed") failed++;
          } catch {
            await finish(delivery.id, "failed", now);
            failed++;
          }
        }
      }
      if (currentPrefs.pushEnabled && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
        for (const subscription of subscriptions) {
          if (Date.now() >= deadline) {
            interrupted = true;
            break recipientsLoop;
          }
          if (!isAllowedPushEndpoint(subscription.endpoint)) continue;
          const delivery = await claim(userId, "push", `${message.key}:${subscription.id}`, now);
          if (!delivery) continue;
          try {
            const fresh = (await currentMessages(userId, now)).find((m) => m.key === message.key);
            const consent = await getNotificationPreferences(userId);
            const [device] = await db
              .select({ id: agendaPushSubscriptions.id })
              .from(agendaPushSubscriptions)
              .where(
                and(
                  eq(agendaPushSubscriptions.id, subscription.id),
                  eq(agendaPushSubscriptions.userId, userId),
                ),
              );
            if (!fresh || !consent.pushEnabled || !device) {
              await finish(delivery.id, "canceled", now);
              continue;
            }
            // Lock-screen text omits children's names and school content.
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                title: fresh.title,
                body: "Abra a Agenda da Turma para conferir as atividades.",
                url: fresh.path,
                tag: delivery.id,
              }),
              {
                TTL: 300,
                timeout: 10000,
                vapidDetails: {
                  subject: `mailto:${env.SENDGRID_FROM}`,
                  publicKey: env.VAPID_PUBLIC_KEY,
                  privateKey: env.VAPID_PRIVATE_KEY,
                },
              },
            );
            await finish(delivery.id, "sent", now);
            sent++;
          } catch (error) {
            if (
              typeof error === "object" &&
              error &&
              "statusCode" in error &&
              (error.statusCode === 410 || error.statusCode === 404)
            )
              await db
                .delete(agendaPushSubscriptions)
                .where(eq(agendaPushSubscriptions.id, subscription.id));
            await finish(delivery.id, "failed", now);
            failed++;
          }
        }
      }
    }
    cursor = userId;
    completed++;
  }
  // Retention is enforced even when nobody has notifications enabled.
  // A caixa de e-mail segue a mesma regra do original de um recado: o que não
  // virou atividade em 30 dias some inteiro, corpo e anexo.
  await purgeExpiredInboxMessages(now);
  await db
    .update(agendaNotices)
    .set({ attachmentData: null })
    .where(
      sql`${agendaNotices.attachmentExpiresAt} <= ${now.toISOString()}::timestamptz AND ${agendaNotices.attachmentData} IS NOT NULL`,
    );
  return {
    sent,
    failed,
    recipients: completed,
    cursor,
    hasMore: interrupted || recipients.length > limit,
  };
}
