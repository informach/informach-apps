import "server-only";
import { and, asc, db, eq, gt, inArray, isNotNull, sql } from "@informach/db";
import {
  estrelaParentAlerts as alerts,
  estrelaChildren as children,
  estrelaCompletions as completions,
  estrelaNotificationDeliveries as deliveries,
  estrelaDevices as devices,
  estrelaFamilies as families,
  estrelaGuardians as guardians,
  estrelaPushSubscriptions as pushes,
  estrelaReminderStates as states,
  estrelaTasks as tasks,
} from "@informach/db/schema";
import { MAX_TOQUES } from "@/domain/rotina";
import { assertAllowed } from "@/lib/errors";

/** O aparelho registra cada toque. O aviso conta uma vez; o "é agora" soma. */
export async function logReminder(
  childId: string,
  taskId: string,
  date: string,
  tipo: "aviso" | "agora",
  now = new Date(),
) {
  if (tipo === "aviso") {
    await db
      .insert(states)
      .values({ childId, taskId, date, warnedAt: now })
      .onConflictDoUpdate({
        target: [states.childId, states.taskId, states.date],
        set: { warnedAt: sql`coalesce(${states.warnedAt}, ${now.toISOString()}::timestamptz)` },
      });
    return;
  }
  await db
    .insert(states)
    .values({ childId, taskId, date, dueCount: 1, lastDueAt: now })
    .onConflictDoUpdate({
      target: [states.childId, states.taskId, states.date],
      set: {
        dueCount: sql`least(${states.dueCount} + 1, ${MAX_TOQUES + 2})`,
        lastDueAt: now,
        nudgeAt: null,
        updatedAt: now,
      },
    });
}

async function assertTask(ownerId: string, childId: string, taskId: string) {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(children, eq(tasks.childId, children.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.childId, childId), eq(children.userId, ownerId)));
  assertAllowed(row, "NOT_FOUND", "Tarefa não encontrada.");
}

/** "Adiar 15 min": nada toca antes disso; depois, toca de novo. */
export async function snooze(
  ownerId: string,
  childId: string,
  taskId: string,
  date: string,
  minutes: number,
  now = new Date(),
) {
  await assertTask(ownerId, childId, taskId);
  const until = new Date(now.getTime() + minutes * 60_000);
  await db
    .insert(states)
    .values({ childId, taskId, date, snoozeUntil: until })
    .onConflictDoUpdate({
      target: [states.childId, states.taskId, states.date],
      set: { snoozeUntil: until, nudgeAt: null, updatedAt: now },
    });
}

/** "Lembrar agora": o tablet toca na hora, fora do intervalo. */
export async function nudge(
  ownerId: string,
  childId: string,
  taskId: string,
  date: string,
  now = new Date(),
) {
  await assertTask(ownerId, childId, taskId);
  await db
    .insert(states)
    .values({ childId, taskId, date, nudgeAt: now })
    .onConflictDoUpdate({
      target: [states.childId, states.taskId, states.date],
      set: { nudgeAt: now, snoozeUntil: null, updatedAt: now },
    });
}

/** Alertas do dia cuja tarefa ainda não foi marcada. */
export async function openAlerts(ownerId: string, date: string) {
  return db
    .select({
      id: alerts.id,
      childId: alerts.childId,
      taskId: alerts.taskId,
      deviceOnline: alerts.deviceOnline,
      createdAt: alerts.createdAt,
      title: tasks.title,
      time: tasks.time,
      icon: tasks.icon,
      dueCount: sql<number>`coalesce((select ${states.dueCount} from ${states} where ${states.childId} = ${alerts.childId} and ${states.taskId} = ${alerts.taskId} and ${states.date} = ${alerts.date}), 0)::int`,
      snoozeUntil: sql<Date | null>`(select ${states.snoozeUntil} from ${states} where ${states.childId} = ${alerts.childId} and ${states.taskId} = ${alerts.taskId} and ${states.date} = ${alerts.date})`,
    })
    .from(alerts)
    .innerJoin(children, eq(alerts.childId, children.id))
    .innerJoin(tasks, eq(alerts.taskId, tasks.id))
    .where(
      and(
        eq(children.userId, ownerId),
        eq(alerts.date, date),
        sql`not exists (select 1 from ${completions} where ${completions.childId} = ${alerts.childId} and ${completions.taskId} = ${alerts.taskId} and ${completions.date} = ${alerts.date})`,
      ),
    )
    .orderBy(tasks.time);
}

/** Famílias que já começaram, em páginas, para a rotina dos alertas. */
/**
 * Famílias que podem receber alerta: já fizeram o primeiro uso e têm ao menos
 * um aparelho conectado (sem tablet, não há alerta). Assim a rotina não gasta o
 * tempo dela com famílias que nunca conectaram um aparelho.
 */
export async function familiesPage(
  afterUserId: string | null,
  limit: number,
  now = new Date(),
  upToUserId: string | null = null,
) {
  return db
    .select({
      userId: families.userId,
      timezone: families.timezone,
      repeatEvery: families.repeatEvery,
      alertAfter: families.alertAfter,
    })
    .from(families)
    .where(
      and(
        isNotNull(families.onboardedAt),
        afterUserId ? gt(families.userId, afterUserId) : undefined,
        upToUserId ? sql`${families.userId} <= ${upToUserId}` : undefined,
        sql`exists (select 1 from ${devices} where ${devices.userId} = ${families.userId} and ${devices.revokedAt} is null and ${devices.expiresAt} > ${now})`,
      ),
    )
    .orderBy(asc(families.userId))
    .limit(limit);
}

export async function tasksAndCompletions(childIds: string[], date: string) {
  if (!childIds.length) return { taskRows: [], done: [] };
  const [taskRows, done] = await Promise.all([
    db
      .select({
        id: tasks.id,
        childId: tasks.childId,
        time: tasks.time,
        days: tasks.days,
        remind: tasks.remind,
      })
      .from(tasks)
      .where(and(inArray(tasks.childId, childIds), eq(tasks.remind, true))),
    db
      .select({ childId: completions.childId, taskId: completions.taskId })
      .from(completions)
      .where(and(inArray(completions.childId, childIds), eq(completions.date, date))),
  ]);
  return { taskRows, done };
}

/** Cria o alerta uma vez por tarefa e dia; devolve se é novo. */
export async function insertAlert(
  childId: string,
  taskId: string,
  date: string,
  deviceOnline: boolean,
) {
  const rows = await db
    .insert(alerts)
    .values({ childId, taskId, date, deviceOnline })
    .onConflictDoNothing()
    .returning({ id: alerts.id });
  return rows[0]?.id ?? null;
}

/** Os adultos da família (titular e segundo responsável), para o push. */
export async function familyAdults(ownerId: string) {
  const rows = await db
    .select({ userId: guardians.userId })
    .from(guardians)
    .where(eq(guardians.ownerUserId, ownerId));
  return [ownerId, ...rows.map((r) => r.userId)];
}

export async function pushSubscriptionsOf(userIds: string[]) {
  if (!userIds.length) return [];
  return db.select().from(pushes).where(inArray(pushes.userId, userIds));
}

export async function savePushSubscription(
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string },
) {
  await db
    .insert(pushes)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: pushes.endpoint,
      set: { userId, p256dh: input.p256dh, auth: input.auth },
    });
}

/** Tira a inscrição de um navegador. Sempre por endpoint: nunca apaga as dos outros aparelhos. */
export async function removePushSubscription(userId: string, endpoint: string) {
  await db.delete(pushes).where(and(eq(pushes.userId, userId), eq(pushes.endpoint, endpoint)));
}

export async function hasPushSubscription(userId: string) {
  const [row] = await db
    .select({ id: pushes.id })
    .from(pushes)
    .where(eq(pushes.userId, userId))
    .limit(1);
  return !!row;
}

export async function deletePushById(id: string) {
  await db.delete(pushes).where(eq(pushes.id, id));
}

/** Reserva o envio de uma mensagem para uma pessoa; null se já foi tratada. */
export async function claimDelivery(userId: string, messageKey: string, now = new Date()) {
  const [row] = await db
    .insert(deliveries)
    .values({ userId, messageKey, attempts: 1, lastAttemptAt: now })
    .onConflictDoNothing()
    .returning({ id: deliveries.id });
  return row?.id ?? null;
}

export async function finishDelivery(id: string, status: "sent" | "failed", now = new Date()) {
  await db
    .update(deliveries)
    .set({ status, sentAt: status === "sent" ? now : null })
    .where(eq(deliveries.id, id));
}

/** Estado de lembrete e entregas de push são operacionais: ficam poucos dias. */
export async function cleanupReminders(now = new Date()) {
  const corte = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  await db.delete(states).where(sql`${states.date} < ${corte}`);
  await db.delete(alerts).where(sql`${alerts.date} < ${corte}`);
  await db
    .delete(deliveries)
    .where(
      sql`${deliveries.createdAt} < ${new Date(now.getTime() - 7 * 86_400_000).toISOString()}::timestamptz`,
    );
}
