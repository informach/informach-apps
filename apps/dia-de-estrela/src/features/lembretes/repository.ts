import "server-only";
import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
  WebParticipationError,
} from "@informach/auth/web-participation";
import { and, asc, db, eq, gt, inArray, isNotNull, sql } from "@informach/db";
import {
  estrelaParentAlerts as alerts,
  estrelaChildren as children,
  estrelaCompletions as completions,
  estrelaNotificationDeliveries as deliveries,
  estrelaDeviceChildren as deviceChildren,
  estrelaDevices as devices,
  estrelaFamilies as families,
  familyAccessGrants,
  familyAppProfiles,
  estrelaPushSubscriptions as pushes,
  estrelaReminderStates as states,
  estrelaTasks as tasks,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { FamilyError } from "@informach/family";
import { profileAccessCondition } from "@informach/family/access";
import { relogioDa } from "@/domain/relogio";
import { aconteceNo, MAX_TOQUES, precisaAlertarPais } from "@/domain/rotina";
import { AppError, assertAllowed } from "@/lib/errors";
import { canUsePush } from "../acesso/policy";
import { DEVICE_ONLINE_MS } from "../aparelho/policy";
import { estrelaAccessInTransaction } from "../billing/access-repository";
import type { ChildAuthority, ParentAuthority } from "../familia/authority";
import { childAccessCondition, deviceChildCondition } from "../familia/scope";
import { assertParent, lockChildUse } from "../familia/use-repository";

async function reminderScope(
  tx: FamilyTransaction,
  actor: ChildAuthority | ParentAuthority,
  childId: string,
  taskId: string,
) {
  await lockChildUse(tx, actor, [childId]);
  const [task] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.childId, childId)));
  const [family] = await tx
    .select({ timezone: families.timezone })
    .from(families)
    .where(eq(families.familyGroupId, actor.familyGroupId));
  assertAllowed(task && family, "NOT_FOUND", "Tarefa não encontrada.");
  const now = new Date();
  return { now, date: relogioDa(now.getTime(), family.timezone).data };
}
/** One child's device may record only that child's current-day reminder. */
export async function logReminder(
  actor: ChildAuthority,
  childId: string,
  taskId: string,
  tipo: "aviso" | "agora",
) {
  assertAllowed(actor.kind === "child", "DEVICE", "Use o aparelho da criança.");
  return db.transaction(async (tx) => {
    const { now, date } = await reminderScope(tx, actor, childId, taskId);
    if (tipo === "aviso") {
      await tx
        .insert(states)
        .values({ childId, taskId, date, warnedAt: now })
        .onConflictDoUpdate({
          target: [states.childId, states.taskId, states.date],
          set: { warnedAt: sql`coalesce(${states.warnedAt}, ${now.toISOString()}::timestamptz)` },
        });
    } else {
      await tx
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
  });
}
export async function snooze(
  actor: ParentAuthority,
  childId: string,
  taskId: string,
  minutes: number,
) {
  assertParent(actor);
  assertAllowed(
    Number.isInteger(minutes) && minutes >= 1 && minutes <= 30,
    "INPUT",
    "Confira o intervalo.",
  );
  return db.transaction(async (tx) => {
    const { now, date } = await reminderScope(tx, actor, childId, taskId);
    const until = new Date(now.getTime() + minutes * 60_000);
    await tx
      .insert(states)
      .values({ childId, taskId, date, snoozeUntil: until })
      .onConflictDoUpdate({
        target: [states.childId, states.taskId, states.date],
        set: { snoozeUntil: until, nudgeAt: null, updatedAt: now },
      });
  });
}
export async function nudge(actor: ParentAuthority, childId: string, taskId: string) {
  assertParent(actor);
  return db.transaction(async (tx) => {
    const { now, date } = await reminderScope(tx, actor, childId, taskId);
    await tx
      .insert(states)
      .values({ childId, taskId, date, nudgeAt: now })
      .onConflictDoUpdate({
        target: [states.childId, states.taskId, states.date],
        set: { nudgeAt: now, snoozeUntil: null, updatedAt: now },
      });
  });
}

/** Alertas do dia cuja tarefa ainda não foi marcada. */
export async function openAlerts(actor: ParentAuthority, date: string) {
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
        childAccessCondition(actor, children.id),
        eq(alerts.date, date),
        sql`not exists (select 1 from ${completions} where ${completions.childId} = ${alerts.childId} and ${completions.taskId} = ${alerts.taskId} and ${completions.date} = ${alerts.date})`,
      ),
    )
    .orderBy(tasks.time);
}

/** Bounded cursor over canonical households with at least one current device delegation. */
export async function familiesPage(
  afterGroupId: string | null,
  limit: number,
  upToGroupId: string | null = null,
) {
  return db
    .select({ groupId: families.familyGroupId })
    .from(families)
    .where(
      and(
        isNotNull(families.onboardedAt),
        afterGroupId ? gt(families.familyGroupId, afterGroupId) : undefined,
        upToGroupId ? sql`${families.familyGroupId} <= ${upToGroupId}::uuid` : undefined,
        sql`EXISTS (SELECT 1 FROM ${devices} alert_device JOIN ${deviceChildren} alert_child ON alert_child.device_id = alert_device.id
      WHERE alert_device.family_group_id = ${families.familyGroupId}
        AND ${deviceChildCondition(sql`alert_device.user_id`, sql`alert_device.id`, sql`alert_child.child_id`)})`,
      ),
    )
    .orderBy(asc(families.familyGroupId))
    .limit(limit);
}
/** Device authority is captured for this job, then checked again inside each child transaction. */
export async function alertCandidates(groupId: string) {
  return db
    .selectDistinctOn([deviceChildren.childId], {
      childId: deviceChildren.childId,
      deviceId: devices.id,
      userId: devices.userId,
      familyGroupId: devices.familyGroupId,
    })
    .from(deviceChildren)
    .innerJoin(devices, eq(devices.id, deviceChildren.deviceId))
    .where(
      and(
        eq(devices.familyGroupId, groupId),
        deviceChildCondition(devices.userId, devices.id, deviceChildren.childId),
      ),
    )
    .orderBy(deviceChildren.childId, devices.id);
}
/** Routine details never leave this repository for notification construction. */
export async function createDueAlerts(actor: ChildAuthority, now = Date.now()) {
  try {
    return await db.transaction(async (tx) => {
      const access = await lockChildUse(tx, actor, [actor.childId]);
      const [family] = await tx
        .select({
          timezone: families.timezone,
          repeatEvery: families.repeatEvery,
          alertAfter: families.alertAfter,
        })
        .from(families)
        .where(eq(families.familyGroupId, actor.familyGroupId));
      assertAllowed(family, "NOT_FOUND", "Família não encontrada.");
      const clock = relogioDa(now, family.timezone);
      const currentTasks = await tx
        .select({
          id: tasks.id,
          childId: tasks.childId,
          time: tasks.time,
          days: tasks.days,
          remind: tasks.remind,
        })
        .from(tasks)
        .where(and(eq(tasks.childId, actor.childId), eq(tasks.remind, true)));
      const done = await tx
        .select({ taskId: completions.taskId })
        .from(completions)
        .where(and(eq(completions.childId, actor.childId), eq(completions.date, clock.data)));
      const online = await tx
        .select({ id: devices.id })
        .from(devices)
        .innerJoin(deviceChildren, eq(deviceChildren.deviceId, devices.id))
        .where(
          and(
            eq(deviceChildren.childId, actor.childId),
            deviceChildCondition(devices.userId, devices.id, deviceChildren.childId),
            gt(devices.lastSeenAt, new Date(now - DEVICE_ONLINE_MS)),
          ),
        )
        .limit(1);
      const created: string[] = [];
      for (const task of currentTasks) {
        if (
          !aconteceNo(task.days, clock.diaDaSemana) ||
          !precisaAlertarPais(
            task,
            done.some((d) => d.taskId === task.id),
            family,
            clock,
          )
        )
          continue;
        const [row] = await tx
          .insert(alerts)
          .values({
            childId: actor.childId,
            taskId: task.id,
            date: clock.data,
            deviceOnline: online.length > 0,
          })
          .onConflictDoNothing()
          .returning({ id: alerts.id });
        if (row) created.push(row.id);
      }
      return { ids: created, pushAllowed: canUsePush(access) };
    });
  } catch (error) {
    // A queued candidate may lose permission/coverage before its turn. Skip that candidate only.
    if (
      error instanceof FamilyError ||
      error instanceof WebParticipationError ||
      (error instanceof AppError && ["CHILD", "DEVICE", "PLAN"].includes(error.code))
    )
      return { ids: [], pushAllowed: false };
    throw error;
  }
}
/** An adult's presence in a household alone never subscribes them to child activity. */
export async function familyAdults(groupId: string, childId: string) {
  const rows = await db
    .select({ userId: familyAccessGrants.userId })
    .from(familyAccessGrants)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, familyAccessGrants.profileId))
    .innerJoin(children, eq(children.familyProfileId, familyAppProfiles.id))
    .where(
      and(
        eq(children.id, childId),
        eq(familyAppProfiles.groupId, groupId),
        eq(familyAccessGrants.action, "read"),
        profileAccessCondition(familyAccessGrants.userId, "dia-de-estrela", familyAppProfiles.id),
      ),
    );
  return rows.map((r) => r.userId);
}
export async function canNotifyChild(
  groupId: string,
  childId: string,
  userId: string,
  delivery?: DeliveryClaim,
) {
  const actor = { kind: "adult" as const, userId, familyGroupId: groupId };
  try {
    return await db.transaction(async (tx) => {
      const access = await estrelaAccessInTransaction(tx, actor);
      if (!canUsePush(access)) return false;
      if (delivery) {
        await lockActiveWebParticipation(tx, userId, delivery.revision);
        const [pending] = await tx
          .select({ id: deliveries.id })
          .from(deliveries)
          .innerJoin(
            pushes,
            and(eq(pushes.id, delivery.subscriptionId), eq(pushes.userId, deliveries.userId)),
          )
          .where(
            and(
              eq(deliveries.id, delivery.id),
              eq(deliveries.userId, userId),
              eq(deliveries.webParticipationRevision, delivery.revision),
              liveDeliveryCondition(),
            ),
          )
          .for("share");
        if (!pending) return false;
      }
      const [child] = await tx
        .select({ id: children.id })
        .from(children)
        .where(and(eq(children.id, childId), childAccessCondition(actor, children.id)));
      return !!child;
    });
  } catch (error) {
    if (error instanceof FamilyError || error instanceof WebParticipationError) return false;
    throw error;
  }
}

export async function pushSubscriptionsOf(userIds: string[]) {
  if (!userIds.length) return [];
  return db
    .select()
    .from(pushes)
    .where(and(inArray(pushes.userId, userIds), activeWebParticipationCondition(pushes.userId)));
}

export async function savePushSubscription(
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string },
) {
  await db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, userId);
    const [saved] = await tx
      .insert(pushes)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: pushes.endpoint,
        set: { p256dh: input.p256dh, auth: input.auth },
        setWhere: eq(pushes.userId, userId),
      })
      .returning({ id: pushes.id });
    assertAllowed(
      saved,
      "DEVICE_ALREADY_LINKED",
      "Este navegador já está vinculado a outra conta.",
    );
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
    .where(and(eq(pushes.userId, userId), activeWebParticipationCondition(userId)))
    .limit(1);
  return !!row;
}

export async function deletePushById(id: string) {
  await db.delete(pushes).where(eq(pushes.id, id));
}

export type DeliveryClaim = { id: string; revision: number; subscriptionId: string };
/** The provider timeout is 10s. This wider admission window also bounds an
 * abandoned claim; closure waits for it, and delayed senders revalidate it. */
export const DELIVERY_LEASE_SECONDS = 60;
export const liveDeliveryCondition = () =>
  sql`${deliveries.status} = 'processing' and coalesce(${deliveries.lastAttemptAt}, ${deliveries.createdAt}) > clock_timestamp() - ${DELIVERY_LEASE_SECONDS} * interval '1 second'`;

/** Reserva o envio de uma mensagem para uma pessoa; null se já foi tratada. */
export async function claimDelivery(userId: string, messageKey: string, subscriptionId: string) {
  return db
    .transaction(async (tx) => {
      const revision = await lockActiveWebParticipation(tx, userId);
      // A subscription list read before suspension must not revive an endpoint
      // removed by the closure/resumption worker.
      const [target] = await tx
        .select({ id: pushes.id })
        .from(pushes)
        .where(and(eq(pushes.id, subscriptionId), eq(pushes.userId, userId)))
        .for("share");
      if (!target) return null;
      const [row] = await tx
        .insert(deliveries)
        .values({
          userId,
          messageKey,
          webParticipationRevision: revision,
          attempts: 1,
          lastAttemptAt: sql`clock_timestamp()`,
        })
        .onConflictDoNothing()
        .returning({ id: deliveries.id, revision: deliveries.webParticipationRevision });
      return row ? { ...row, subscriptionId } : null;
    })
    .catch((error) => {
      if (error instanceof WebParticipationError) return null;
      throw error;
    });
}

export async function finishDelivery(
  claim: DeliveryClaim,
  status: "sent" | "failed",
  now = new Date(),
) {
  await db
    .update(deliveries)
    .set({ status, sentAt: status === "sent" ? now : null })
    .where(
      and(
        eq(deliveries.id, claim.id),
        eq(deliveries.webParticipationRevision, claim.revision),
        liveDeliveryCondition(),
      ),
    );
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
