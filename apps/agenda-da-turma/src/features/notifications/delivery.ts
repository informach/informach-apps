import { purgeAgendaAiReceipts } from "@/features/ai/wallet-repository";
import "server-only";
import { FamilyError } from "@informach/family";
import webpush from "web-push";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { buildBackpack } from "@/features/dashboard/page-of-day";
import { getTodaySubjectsForProfiles } from "@/features/dashboard/today-subjects-service";
import type { AgendaAuthority } from "@/features/family/authority";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { listNoticeActions } from "@/features/notices/repository";
import { purgeExpiredIdempotentWrites } from "@/features/offline-queue/repository";
import { listSubjectKits } from "@/features/subject-kits/service";
import { buildEmailUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import {
  claim,
  currentEmail,
  currentPushDevice,
  defer,
  finish,
  isCurrentDelivery,
  listPushDevices,
  listRecipients,
  purgeExpiredAttachments,
  retirePushDevice,
} from "./delivery-repository";
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
  actor: AgendaAuthority,
  profileIds: readonly string[],
  window: { fromIso: string; toIso: string },
): Promise<Record<string, WeeklyBackpack[]>> {
  if (profileIds.length === 0) return {};
  const kits = Object.fromEntries(await listSubjectKits(actor, [...profileIds]));
  const days: string[] = [];
  for (let iso = window.fromIso; iso <= window.toIso; iso = addDaysIso(iso, 1)) days.push(iso);
  const schedules = await Promise.all(
    days.map((dateIso) => getTodaySubjectsForProfiles(actor, { dateIso })),
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

// Rebuild from current grants, subscription, status and dates for each send.
export async function currentMessages(actor: AgendaAuthority, now: Date): Promise<Message[]> {
  try {
    return await buildCurrentMessages(actor, now);
  } catch (error) {
    if (error instanceof FamilyError) return [];
    throw error;
  }
}
async function buildCurrentMessages(actor: AgendaAuthority, now: Date): Promise<Message[]> {
  const prefs = await getNotificationPreferences(actor);
  const today = todayLocalIso(now);
  const hour = saoPauloHour(now);
  if (isQuietHour(hour, prefs.quietStart, prefs.quietEnd)) return [];
  const entitlement = await getFamilyEntitlements(actor);
  if (!entitlement.enabled) return [];
  // Uma lista só. O resumo já somou duas consultas — as providências de recado
  // e um snapshot por bucket das atividades escolares — e a mesma atividade
  // aparecia com dois textos diferentes conforme a tabela de origem. Com a
  // convergência, `listNoticeActions` (pendentes, por acesso à criança) é a
  // fonte inteira.
  const rows = await listNoticeActions(actor);
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
            actor,
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
  options: { afterPreferenceId?: string | null; limit?: number; budgetMs?: number } = {},
) {
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const deadline = Date.now() + Math.min(45_000, Math.max(1000, options.budgetMs ?? 40_000));
  const hour = saoPauloHour(now);
  const recipients = await listRecipients(options.afterPreferenceId, limit + 1);
  let sent = 0;
  let failed = 0;
  let completed = 0;
  let cursor = options.afterPreferenceId ?? null;
  let interrupted = false;
  recipientsLoop: for (const recipient of recipients.slice(0, limit)) {
    const prefs = recipient.preferences;
    const userId = prefs.userId;
    const actor = { userId, familyGroupId: prefs.familyGroupId };
    if (Date.now() >= deadline) {
      interrupted = true;
      break;
    }
    if (!recipient.verified || isQuietHour(hour, prefs.quietStart, prefs.quietEnd)) {
      cursor = prefs.id;
      completed++;
      continue;
    }
    const messages = await currentMessages(actor, now);
    const subscriptions = prefs.pushEnabled ? await listPushDevices(userId) : [];
    for (const message of messages) {
      if (Date.now() >= deadline) {
        interrupted = true;
        break recipientsLoop;
      }
      let currentPrefs: Awaited<ReturnType<typeof getNotificationPreferences>>;
      try {
        currentPrefs = await getNotificationPreferences(actor);
      } catch (error) {
        if (error instanceof FamilyError) continue;
        throw error;
      }
      if (isQuietHour(saoPauloHour(now), currentPrefs.quietStart, currentPrefs.quietEnd)) continue;
      if (currentPrefs.emailEnabled) {
        const delivery = await claim(actor, "email", message.key);
        if (delivery) {
          try {
            const fresh = (await currentMessages(actor, now)).find((m) => m.key === message.key);
            const consent = await getNotificationPreferences(actor);
            if (!fresh || !consent.emailEnabled) {
              await finish(delivery, "canceled", now);
              continue;
            }
            const unsubscribeUrl = buildEmailUnsubscribeUrl(userId, "agenda.routine");
            const url = `${env.NEXT_PUBLIC_APP_URL}${notificationPath(actor, fresh.path)}`;
            const recipientEmail = await currentEmail(userId);
            if (!recipientEmail) {
              await finish(delivery, "canceled", now);
              continue;
            }
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
              to: recipientEmail,
              userId,
              category: "agenda.routine",
              messageKey: `agenda:${userId}:${actor.familyGroupId}:${message.key}`,
              subject: fresh.title,
              text,
              html: fresh.weeklyEmail
                ? renderWeeklyEmailHtml(fresh.weeklyEmail, links)
                : `<h1>${escapeHtml(fresh.title)}</h1><ul>${fresh.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul><p><a href="${escapeHtml(url)}">Abrir a Agenda</a></p><p>${escapeHtml(EMAIL_FOOTNOTE)}</p><p><a href="${escapeHtml(unsubscribeUrl)}">Não quero mais receber</a></p>`,
              unsubscribeUrl,
              authorizeContent: async () => {
                if (!(await isCurrentDelivery(actor, delivery))) return false;
                const consent = await getNotificationPreferences(actor);
                const current = (await currentMessages(actor, now)).find(
                  (m) => m.key === fresh.key,
                );
                return (
                  consent.emailEnabled &&
                  (await currentEmail(userId)) === recipientEmail &&
                  JSON.stringify(current) === JSON.stringify(fresh)
                );
              },
            });
            if (result.status === "deferred") await defer(delivery);
            else
              await finish(
                delivery,
                result.ok ? "sent" : result.status === "skipped" ? "canceled" : "failed",
                now,
              );
            if (result.ok) sent++;
            else if (result.status === "failed") failed++;
          } catch {
            await finish(delivery, "failed", now);
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
          const delivery = await claim(actor, "push", `${message.key}:${subscription.id}`);
          if (!delivery) continue;
          try {
            const fresh = (await currentMessages(actor, now)).find((m) => m.key === message.key);
            const consent = await getNotificationPreferences(actor);
            const device = await currentPushDevice(userId, subscription.id);
            if (
              !fresh ||
              !consent.pushEnabled ||
              !device ||
              !(await isCurrentDelivery(actor, delivery))
            ) {
              await finish(delivery, "canceled", now);
              continue;
            }
            // A tela bloqueada nunca mostra nome de criança nem conteúdo escolar
            // (promessa da política de privacidade). `fresh.title` é o assunto
            // do e-mail e pode nomear a criança; o push usa só `fresh.push`,
            // montado e testado sem esses dados em `digest.ts` e `weekly.ts`.
            await webpush.sendNotification(
              {
                endpoint: device.endpoint,
                keys: { p256dh: device.p256dh, auth: device.auth },
              },
              JSON.stringify({
                title: fresh.push.title,
                body: fresh.push.body,
                url: notificationPath(actor, fresh.path),
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
            await finish(delivery, "sent", now);
            sent++;
          } catch (error) {
            if (
              typeof error === "object" &&
              error &&
              "statusCode" in error &&
              (error.statusCode === 410 || error.statusCode === 404)
            )
              await retirePushDevice(userId, subscription.id);
            await finish(delivery, "failed", now);
            failed++;
          }
        }
      }
    }
    cursor = prefs.id;
    completed++;
  }
  // Retention is enforced even when nobody has notifications enabled.
  // O recibo da fila offline é lembrança de curto prazo, não histórico.
  await purgeExpiredIdempotentWrites(now);
  await purgeExpiredAttachments(now);
  await purgeAgendaAiReceipts(now);
  return {
    sent,
    failed,
    recipients: completed,
    cursor,
    hasMore: interrupted || recipients.length > limit,
  };
}

function notificationPath(actor: AgendaAuthority, path: string) {
  return `/contexto?family=${encodeURIComponent(actor.familyGroupId)}&next=${encodeURIComponent(path)}`;
}
