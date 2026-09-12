import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivityRevisions,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNoticeActions,
  agendaNoticeApplications,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaProductEvents,
  agendaStudentProfiles,
} from "@informach/db/schema";
import type { z } from "zod";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import {
  type AgendaTransaction,
  countPendingActivities,
  lockPendingLimit,
} from "@/features/activities/pending-limit";
import { accessibleProfileCondition } from "@/features/family/access";
import { sourceAccessCondition } from "./repository";
import type {
  confirmNoticeSchema,
  NoticeActionInput,
  statusNoticeActionSchema,
  updateNoticeActionSchema,
} from "./schemas";

export function actionFingerprint(action: Pick<NoticeActionInput, "title" | "dueAt" | "type">) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        action.title.normalize("NFKC").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " "),
        action.dueAt,
        action.type,
      ]),
    )
    .digest("hex");
}

async function validAssignee(tx: AgendaTransaction, ownerId: string, input: NoticeActionInput) {
  if (!input.assignedToUserId || input.assignedToUserId === ownerId) return true;
  const [guest] = await tx
    .select({ id: agendaFamilyMembers.id })
    .from(agendaFamilyMembers)
    .innerJoin(
      agendaFamilyProfileAccess,
      eq(agendaFamilyProfileAccess.memberId, agendaFamilyMembers.id),
    )
    .where(
      and(
        eq(agendaFamilyMembers.ownerUserId, ownerId),
        eq(agendaFamilyMembers.userId, input.assignedToUserId),
        eq(agendaFamilyProfileAccess.profileId, input.profileId),
      ),
    );
  return Boolean(guest);
}

async function lockFamily(tx: AgendaTransaction, ownerId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${ownerId}`}))`);
  await lockPendingLimit(tx, ownerId);
}

export async function insertConfirmedNotice(
  userId: string,
  input: z.infer<typeof confirmNoticeSchema>,
  ownerId: string,
  isPro: boolean,
) {
  return db.transaction(async (tx) => {
    await lockFamily(tx, ownerId);
    const profileIds = [...new Set(input.actions.map((a) => a.profileId))];
    const profiles = await tx
      .select()
      .from(agendaStudentProfiles)
      .where(
        and(
          inArray(agendaStudentProfiles.id, profileIds),
          eq(agendaStudentProfiles.userId, ownerId),
          accessibleProfileCondition(userId),
        ),
      );
    if (profiles.length !== profileIds.length) return err({ code: "INVALID_PROFILE" } as const);
    let source: "teams" | "batista" | "other" | "manual" = "manual";
    let originalText = "";
    let scope: string[] | null = null;
    let appliedProfiles: string[] = [];
    if (input.noticeId) {
      const [notice] = await tx
        .select()
        .from(agendaNotices)
        .where(
          and(
            eq(agendaNotices.id, input.noticeId),
            eq(agendaNotices.ownerUserId, ownerId),
            sourceAccessCondition(userId),
          ),
        )
        .for("update");
      if (!notice) return err({ code: "NOT_FOUND" } as const);
      if (notice.status !== "ready" && notice.status !== "confirmed")
        return err({ code: "NOT_READY" } as const);
      source = notice.source;
      originalText = notice.text;
      scope = notice.sourceProfileIds;
      const applications = await tx
        .select({ profileId: agendaNoticeApplications.profileId })
        .from(agendaNoticeApplications)
        .where(eq(agendaNoticeApplications.noticeId, notice.id));
      appliedProfiles = applications.map((a) => a.profileId);
      if (input.sourceProfileIds) {
        // Scope can grow when a document is reused. Never silently narrow an
        // already reviewed original to disclose it to a more restricted adult.
        scope = [...new Set([...(scope ?? []), ...input.sourceProfileIds])];
        const scopedProfiles = await tx
          .select({ id: agendaStudentProfiles.id })
          .from(agendaStudentProfiles)
          .where(
            and(
              inArray(agendaStudentProfiles.id, scope),
              eq(agendaStudentProfiles.userId, ownerId),
              accessibleProfileCondition(userId),
            ),
          );
        if (
          scopedProfiles.length !== scope.length ||
          [...profileIds, ...appliedProfiles].some((id) => !scope?.includes(id))
        )
          return err({ code: "INVALID_SOURCE_SCOPE" } as const);
      } else if (scope && profileIds.some((id) => !scope?.includes(id))) {
        // Until reviewed again, keep the expanded original private.
        scope = null;
      }
    }

    // Applying a document is idempotent per child, independently of extraction
    // caching and of later edits/corrections to the resulting actions.
    const work = input.actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => !appliedProfiles.includes(action.profileId));
    for (const { action } of work) {
      if (!(await validAssignee(tx, ownerId, action)))
        return err({ code: "INVALID_ASSIGNEE" } as const);
      if (!isPro && (action.recurrence !== "none" || action.reminderAt))
        return err({ code: "PRO_REQUIRED" } as const);
    }
    const values = work.map(({ action, index }) => ({
      index,
      action,
      fingerprint: actionFingerprint(action),
    }));
    if (new Set(values.map((v) => `${v.action.profileId}:${v.fingerprint}`)).size !== values.length)
      return err({ code: "DUPLICATE_IN_REVIEW" } as const);

    const existing = work.length
      ? await tx
          .select()
          .from(agendaNoticeActions)
          .where(
            and(
              inArray(agendaNoticeActions.profileId, profileIds),
              sql`${agendaNoticeActions.status} <> 'canceled'`,
            ),
          )
          .for("update")
      : [];
    const explicitlyCorrected =
      /retifica[cç][aã]o|nova data|prazo corrigido|adiad[oa]|antecipad[oa]/i.test(originalText);
    const candidates = values.flatMap(({ action, index }) =>
      existing
        .filter(
          (row) =>
            row.profileId === action.profileId &&
            row.type === action.type &&
            row.dueAt !== action.dueAt &&
            (actionFingerprint({ ...row, dueAt: null }) ===
              actionFingerprint({ ...action, dueAt: null }) ||
              explicitlyCorrected),
        )
        .map((row) => ({
          index,
          id: row.id,
          version: row.version,
          title: row.title,
          dueAt: row.dueAt,
          profileId: row.profileId,
        })),
    );
    const resolutions = input.resolutions ?? [];
    if (new Set(resolutions.map((r) => r.index)).size !== resolutions.length)
      return err({ code: "INVALID_CORRECTION" } as const);
    const replacements = new Map<number, typeof agendaNoticeActions.$inferSelect>();
    for (const { index, action } of values) {
      const options = candidates.filter((c) => c.index === index);
      const resolution = resolutions.find((r) => r.index === index);
      if (options.length && !resolution)
        return err({ code: "POSSIBLE_CORRECTIONS", candidates } as const);
      if (!resolution || resolution.kind === "separate") continue;
      const previous = existing.find((a) => a.id === resolution.actionId);
      if (
        !previous ||
        previous.profileId !== action.profileId ||
        !options.some((c) => c.id === previous.id)
      )
        return err({ code: "INVALID_CORRECTION" } as const);
      if (previous.version !== resolution.version)
        return err({ code: "VERSION_CONFLICT" } as const);
      if ([...replacements.values()].some((p) => p.id === previous.id))
        return err({ code: "INVALID_CORRECTION" } as const);
      replacements.set(index, previous);
    }
    const duplicates = existing
      .filter((row) =>
        values.some(
          (v) =>
            v.action.profileId === row.profileId &&
            v.fingerprint === row.fingerprint &&
            replacements.get(v.index)?.id !== row.id,
        ),
      )
      .map((row) => ({
        id: row.id,
        profileId: row.profileId,
        fingerprint: row.fingerprint,
        title: row.title,
      }));
    if (duplicates.length && !input.allowDuplicates)
      return err({ code: "POSSIBLE_DUPLICATES", duplicates } as const);
    const newCount = values.length - replacements.size;
    const pending = await countPendingActivities(tx, ownerId);
    if (!isPro && newCount > 0 && pending + newCount > FREE_ACTIVITY_LIMIT)
      return err({
        code: "ACTIVITY_LIMIT_REACHED",
        current: pending,
        limit: FREE_ACTIVITY_LIMIT,
      } as const);

    // All decisions/versions/permissions have been checked before any mutation.
    const ids: string[] = [];
    for (const { action, index, fingerprint } of values) {
      const previous = replacements.get(index);
      const fields = {
        ...action,
        noticeId: input.noticeId,
        reminderAt: action.reminderAt ? new Date(action.reminderAt) : null,
        fingerprint,
      };
      if (previous) {
        const [current] = await tx
          .update(agendaNoticeActions)
          .set({
            ...fields,
            version: previous.version + 1,
            updatedAt: new Date(),
            seriesId:
              action.recurrence === "weekly"
                ? (previous.seriesId ?? randomUUID())
                : previous.seriesId,
          })
          .where(eq(agendaNoticeActions.id, previous.id))
          .returning();
        if (!current) throw new Error("Notice correction failed");
        await tx.insert(agendaActivityRevisions).values({
          noticeActionId: previous.id,
          actorId: userId,
          version: current.version,
          previous,
          current,
        });
        await cancelActionDeliveries(tx, previous.id, previous.version);
        ids.push(current.id);
      } else {
        const [created] = await tx
          .insert(agendaNoticeActions)
          .values({
            ...fields,
            createdByUserId: userId,
            seriesId: action.recurrence === "weekly" ? randomUUID() : null,
          })
          .returning({ id: agendaNoticeActions.id });
        if (!created) throw new Error("Notice action insert failed");
        ids.push(created.id);
      }
    }
    if (input.noticeId) {
      const noticeId = input.noticeId;
      await tx
        .insert(agendaNoticeApplications)
        .values(
          profileIds.map((profileId) => ({
            noticeId,
            profileId,
          })),
        )
        .onConflictDoNothing();
      await tx
        .update(agendaNotices)
        .set({
          status: "confirmed",
          sourceProfileIds: scope,
          confirmedAt: sql`coalesce(${agendaNotices.confirmedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(eq(agendaNotices.id, input.noticeId));
    }
    if (ids.length)
      await tx.insert(agendaProductEvents).values({
        userId,
        event: "notice_confirmed",
        count: ids.length,
        source,
      });
    return ok({ alreadyConfirmed: ids.length === 0, ids });
  });
}

async function cancelActionDeliveries(tx: AgendaTransaction, id: string, version: number) {
  const key = `action:${id}:v${version}`;
  await tx
    .update(agendaNotificationDeliveries)
    .set({ status: "canceled" })
    .where(
      and(
        sql`(${agendaNotificationDeliveries.messageKey} = ${key} OR ${agendaNotificationDeliveries.messageKey} LIKE ${`${key}:%`})`,
        sql`${agendaNotificationDeliveries.status} IN ('pending', 'failed', 'processing')`,
      ),
    );
}

export async function updateNoticeActionAtomically(
  userId: string,
  input: z.infer<typeof updateNoticeActionSchema>,
  ownerId: string,
  isPro: boolean,
) {
  return db.transaction(async (tx) => {
    await lockFamily(tx, ownerId);
    const [previous] = await tx
      .select()
      .from(agendaNoticeActions)
      .where(
        and(
          eq(agendaNoticeActions.id, input.id),
          inArray(
            agendaNoticeActions.profileId,
            tx
              .select({ id: agendaStudentProfiles.id })
              .from(agendaStudentProfiles)
              .where(accessibleProfileCondition(userId)),
          ),
        ),
      )
      .for("update");
    if (!previous) return err({ code: "NOT_FOUND" } as const);
    if (previous.version !== input.version || previous.status === "canceled")
      return err({ code: "VERSION_CONFLICT" } as const);
    // Moving an action to another child could disclose its original to a new adult.
    if (input.action.profileId !== previous.profileId)
      return err({ code: "INVALID_PROFILE" } as const);
    if (!(await validAssignee(tx, ownerId, input.action)))
      return err({ code: "INVALID_ASSIGNEE" } as const);
    const addsAutomation =
      (input.action.recurrence !== "none" && input.action.recurrence !== previous.recurrence) ||
      (input.action.reminderAt !== null &&
        new Date(input.action.reminderAt).valueOf() !== previous.reminderAt?.valueOf());
    if (!isPro && addsAutomation) return err({ code: "PRO_REQUIRED" } as const);
    const [current] = await tx
      .update(agendaNoticeActions)
      .set({
        ...input.action,
        reminderAt: input.action.reminderAt ? new Date(input.action.reminderAt) : null,
        fingerprint: actionFingerprint(input.action),
        version: previous.version + 1,
        updatedAt: new Date(),
        seriesId:
          input.action.recurrence === "weekly"
            ? (previous.seriesId ?? randomUUID())
            : previous.seriesId,
      })
      .where(eq(agendaNoticeActions.id, input.id))
      .returning();
    if (!current) throw new Error("Action update failed");
    await cancelActionDeliveries(tx, previous.id, previous.version);
    await tx.insert(agendaActivityRevisions).values({
      noticeActionId: input.id,
      actorId: userId,
      version: current.version,
      previous,
      current,
    });
    return ok({ id: input.id });
  });
}

export function nextWeeklyDate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export async function setNoticeActionStatusAtomically(
  userId: string,
  input: z.infer<typeof statusNoticeActionSchema>,
  ownerId: string,
  isPro: boolean,
) {
  return db.transaction(async (tx) => {
    await lockFamily(tx, ownerId);
    const [previous] = await tx
      .select()
      .from(agendaNoticeActions)
      .where(
        and(
          eq(agendaNoticeActions.id, input.id),
          inArray(
            agendaNoticeActions.profileId,
            tx
              .select({ id: agendaStudentProfiles.id })
              .from(agendaStudentProfiles)
              .where(accessibleProfileCondition(userId)),
          ),
        ),
      )
      .for("update");
    if (!previous) return err({ code: "NOT_FOUND" } as const);
    if (previous.version !== input.version) return err({ code: "VERSION_CONFLICT" } as const);
    if (previous.status === input.status) return ok({ id: input.id });
    if (
      !isPro &&
      input.status === "pending" &&
      (await countPendingActivities(tx, ownerId)) >= FREE_ACTIVITY_LIMIT
    )
      return err({ code: "ACTIVITY_LIMIT_REACHED" } as const);
    const [current] = await tx
      .update(agendaNoticeActions)
      .set({
        status: input.status,
        version: previous.version + 1,
        updatedAt: new Date(),
        completedAt: input.status === "done" ? new Date() : null,
      })
      .where(eq(agendaNoticeActions.id, input.id))
      .returning();
    if (!current) throw new Error("Action status update failed");
    await tx.insert(agendaActivityRevisions).values({
      noticeActionId: input.id,
      actorId: userId,
      version: current.version,
      previous,
      current,
    });
    if (input.status === "done") {
      await tx.insert(agendaProductEvents).values({ userId, event: "action_completed", count: 1 });
      if (isPro && previous.recurrence === "weekly" && previous.dueAt && previous.seriesId) {
        const dueAt = nextWeeklyDate(previous.dueAt);
        await tx
          .insert(agendaNoticeActions)
          .values({
            profileId: previous.profileId,
            createdByUserId: userId,
            assignedToUserId: previous.assignedToUserId,
            type: previous.type,
            title: previous.title,
            description: previous.description,
            dueAt,
            time: previous.time,
            location: previous.location,
            dateOrigin: "family",
            recurrence: "weekly",
            seriesId: previous.seriesId,
            fingerprint: actionFingerprint({ ...previous, dueAt }),
            reminderAt: previous.reminderAt
              ? new Date(previous.reminderAt.valueOf() + 7 * 86400_000)
              : null,
          })
          .onConflictDoNothing({
            target: [
              agendaNoticeActions.seriesId,
              agendaNoticeActions.profileId,
              agendaNoticeActions.dueAt,
            ],
          });
      }
    }
    return ok({ id: input.id });
  });
}
