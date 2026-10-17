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
import { buildBackpack } from "@/features/dashboard/page-of-day";
import { getTodaySubjectsForProfiles } from "@/features/dashboard/today-subjects-service";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { listNoticeActions } from "@/features/notices/repository";
import { purgeExpiredIdempotentWrites } from "@/features/offline-queue/repository";
import { listSubjectKits } from "@/features/subject-kits/service";
import { buildEmailUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { buildDailyDigest, buildReminder, type DigestItem, type PushText } from "./digest";
import { isAllowedPushEndpoint, isQuietHour } from "./schemas";
import { getNotificationPreferences } from "./service";
import { buildWeeklyDigest, weeklyWindow } from "./weekly";
import {
  buildWeeklyEmail,
  renderWeeklyEmailHtml,
  renderWeeklyEmailText,
  type WeeklyBackpack,
  type WeeklyEmail,
} from "./weekly-email";

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
/** O e-mail diz isto uma vez, no rodapé; a tela do app não repete em cada lista. */
const EMAIL_FOOTNOTE = "Marcar como feito vale só para a sua casa: a escola não recebe aviso.";

type NoticeRow = Awaited<ReturnType<typeof listNoticeActions>>[number];

function toDigestItem(row: NoticeRow): DigestItem {
  return {
    profileName: row.profileName,
    title: row.action.title,
    subjectName: row.subjectName,
    dueAt: row.action.dueAt,
    time: row.action.time,
    assignedName: row.assignedName,
  };
}

/**
 * `title` é o assunto do e-mail; `push` é o texto da tela bloqueada, sem nomes.
 * O resumo de domingo leva também o e-mail desenhado (`weeklyEmail`).
 */
type Message = {
  key: string;
  title: string;
  lines: string[];
  path: string;
  push: PushText;
  weeklyEmail?: WeeklyEmail;
};

/**
 * A mochila de cada dia da semana do resumo, por criança: o "levar sempre" das
 * aulas daquele dia. Sai do mesmo horário e dos mesmos kits que Hoje usa à
 * noite (`buildBackpack`), só que para cada dia da semana.
 */
async function weeklyBackpacks(
  userId: string,
  profileIds: readonly string[],
  window: { fromIso: string; toIso: string },
): Promise<Record<string, WeeklyBackpack[]>> {
  if (profileIds.length === 0) return {};
  const kits = Object.fromEntries(await listSubjectKits(userId, [...profileIds]));
  const days: string[] = [];
  for (let iso = window.fromIso; iso <= window.toIso; iso = addDaysIso(iso, 1)) days.push(iso);
  const schedules = await Promise.all(
    days.map((dateIso) => getTodaySubjectsForProfiles(userId, { dateIso })),
  );
  return Object.fromEntries(
    days.map((iso, index) => [
      iso,
      buildBackpack({
        schedule: (schedules[index] ?? []).filter((view) => profileIds.includes(view.profileId)),
        kits,
        tomorrow: [],
      }).map(({ profileName, items, onlyFrom }) => ({ profileName, items, onlyFrom })),
    ]),
  );
}

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
    const items = eligible.map(({ action, profileName, subjectName, subjectColorIndex }) => ({
      profileName,
      title: action.title,
      type: action.type,
      subjectName,
      subjectColorIndex,
      dueAt: action.dueAt,
      time: action.time,
      location: action.location,
      estimatedMinutes: action.estimatedMinutes,
      status: action.status,
    }));
    const weekly = buildWeeklyDigest(items, { todayIso: today });
    const week = weeklyWindow(today, items);
    // A semana que o resumo descreve, e não a que termina hoje (domingo).
    if (weekly)
      messages.push({
        key: `weekly:${today}`,
        ...weekly,
        path: `/calendario?date=${week.fromIso}`,
        weeklyEmail: buildWeeklyEmail({
          todayIso: today,
          items,
          backpacks: await weeklyBackpacks(
            userId,
            entitlement.proProfileIds,
            // A mochila de cada dia que o e-mail mostra, a partir de hoje.
            { fromIso: today, toIso: week.toIso },
          ),
          subject: weekly.title,
          digestDay: prefs.weeklyDigestDay,
          digestHour: prefs.weeklyDigestHour,
        }),
      });
  }
  if (hour === prefs.digestHour) {
    const daily = buildDailyDigest(eligible.map(toDigestItem), { todayIso: today });
    if (daily) messages.push({ key: `digest:${today}`, ...daily, path: "/dashboard" });
  }
  for (const row of eligible) {
    const a = row.action;
    if (
      a.reminderAt &&
      a.reminderAt <= now &&
      a.reminderAt.valueOf() >= now.valueOf() - 24 * 3600_000
    )
      messages.push({
        key: `action:${a.id}:v${a.version}`,
        ...buildReminder(toDigestItem(row), { todayIso: today }),
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
            const links = {
              weekUrl: url,
              settingsUrl: `${env.NEXT_PUBLIC_APP_URL}/familia/ajustes`,
              unsubscribeUrl,
              logoUrl: `${env.NEXT_PUBLIC_APP_URL}/web-app-manifest-192x192.png`,
              footnote: EMAIL_FOOTNOTE,
            };
            const text = fresh.weeklyEmail
              ? renderWeeklyEmailText(fresh.weeklyEmail, links)
              : `${fresh.title}\n\n${fresh.lines.join("\n")}\n\nAbrir a Agenda: ${url}\n\n${EMAIL_FOOTNOTE}\nNão quero mais receber: ${unsubscribeUrl}`;
            const result = await emails.sendEmail({
              to: recipient.email,
              userId,
              category: "agenda.routine",
              messageKey: `agenda:${userId}:${message.key}`,
              subject: fresh.title,
              text,
              html: fresh.weeklyEmail
                ? renderWeeklyEmailHtml(fresh.weeklyEmail, links)
                : `<h1>${escapeHtml(fresh.title)}</h1><ul>${fresh.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul><p><a href="${escapeHtml(url)}">Abrir a Agenda</a></p><p>${escapeHtml(EMAIL_FOOTNOTE)}</p><p><a href="${escapeHtml(unsubscribeUrl)}">Não quero mais receber</a></p>`,
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
            // A tela bloqueada nunca mostra nome de criança nem conteúdo escolar
            // (promessa da política de privacidade). `fresh.title` é o assunto
            // do e-mail e pode nomear a criança; o push usa só `fresh.push`,
            // montado e testado sem esses dados em `digest.ts` e `weekly.ts`.
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                title: fresh.push.title,
                body: fresh.push.body,
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
  // O recibo da fila offline é lembrança de curto prazo, não histórico.
  await purgeExpiredIdempotentWrites(now);
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
