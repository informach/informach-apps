import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { and, db, eq, inArray, ne, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityRevisions,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNoticeApplications,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaProductEvents,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
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

/**
 * A matéria escolhida precisa pertencer de fato à criança: ou é matéria da
 * turma em que ela participa AGORA, ou é uma extracurricular dela.
 *
 * Revalidado dentro da transação, como o resto: `active_turma_id` sozinho é
 * preferência, não participação, e o acesso pode ter sido revogado entre a
 * revisão e o salvamento.
 */
async function validSubject(tx: AgendaTransaction, input: NoticeActionInput) {
  if (input.subjectId) {
    const [row] = await tx
      .select({ id: agendaSubjects.id })
      .from(agendaSubjects)
      .innerJoin(agendaTurmaMembers, eq(agendaTurmaMembers.turmaId, agendaSubjects.turmaId))
      .innerJoin(
        agendaStudentProfiles,
        eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
      )
      .where(
        and(
          eq(agendaSubjects.id, input.subjectId),
          eq(agendaTurmaMembers.studentProfileId, input.profileId),
          eq(agendaStudentProfiles.activeTurmaId, agendaSubjects.turmaId),
        ),
      );
    return Boolean(row);
  }
  if (input.profileSubjectId) {
    const [row] = await tx
      .select({ id: agendaProfileSubjects.id })
      .from(agendaProfileSubjects)
      .where(
        and(
          eq(agendaProfileSubjects.id, input.profileSubjectId),
          eq(agendaProfileSubjects.profileId, input.profileId),
        ),
      );
    return Boolean(row);
  }
  return true;
}

/**
 * Publica a atividade na turma da criança e devolve o id do fato publicado.
 *
 * Havia dois formulários de nova atividade — um só para escola, que exigia
 * turma, matéria e prazo, e outro para o resto. O que separava os dois era
 * exatamente este campo, e agora ele é uma caixa no mesmo formulário: a turma
 * sai da matéria escolhida, e o fato publicado nasce como consequência da
 * atividade, não como uma coisa que se cadastra antes dela.
 *
 * `reuse` é a deduplicação dentro da mesma revisão: a mesma prova marcada para
 * dois filhos da mesma turma é UM fato publicado com duas tarefas, e não duas
 * cópias que a turma veria em dobro.
 */
async function publishToTurma(
  tx: AgendaTransaction,
  userId: string,
  action: NoticeActionInput,
  reuse: Map<string, string>,
): Promise<string> {
  // O schema exige matéria da turma e prazo para compartilhar, e `validSubject`
  // já conferiu que a matéria é da turma em que a criança participa agora.
  // Chegar aqui sem isso é defeito nosso, não escolha da família — falhar alto
  // é melhor do que gravar a atividade como privada em silêncio.
  if (!action.subjectId || !action.dueAt)
    throw new Error("publishToTurma requires subjectId and dueAt");
  const [subject] = await tx
    .select({ turmaId: agendaSubjects.turmaId })
    .from(agendaSubjects)
    .where(eq(agendaSubjects.id, action.subjectId));
  if (!subject) throw new Error("publishToTurma: subject vanished inside the transaction");
  const key = [subject.turmaId, action.subjectId, action.type, action.title, action.dueAt].join(
    "|",
  );
  const existing = reuse.get(key);
  if (existing) return existing;
  const [created] = await tx
    .insert(agendaActivities)
    .values({
      turmaId: subject.turmaId,
      subjectId: action.subjectId,
      createdByUserId: userId,
      type: action.type,
      visibility: "shared_with_turma",
      title: action.title,
      description: action.description,
      dueAt: action.dueAt,
    })
    .returning({ id: agendaActivities.id });
  if (!created) throw new Error("Shared activity insert failed");
  reuse.set(key, created.id);
  return created.id;
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
    let source: "teams" | "batista" | "notebook" | "other" | "manual" = "manual";
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
      if (!(await validSubject(tx, action))) return err({ code: "INVALID_SUBJECT" } as const);
      if (!isPro && (action.recurrence !== "none" || action.reminderAt))
        return err({ code: "PRO_REQUIRED" } as const);
      // Recusa em vez de rebaixar: salvar como privado o que a pessoa pediu
      // compartilhado entrega algo diferente do combinado, em silêncio.
      if (!isPro && action.shareWithTurma) return err({ code: "SHARE_REQUIRES_PRO" } as const);
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
          .from(agendaTasks)
          .where(
            and(
              inArray(agendaTasks.profileId, profileIds),
              sql`${agendaTasks.status} <> 'canceled'`,
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
    const replacements = new Map<number, typeof agendaTasks.$inferSelect>();
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
    const published = new Map<string, string>();
    for (const { action, index, fingerprint } of values) {
      const previous = replacements.get(index);
      const { shareWithTurma: _share, ...actionFields } = action;
      const fields = {
        ...actionFields,
        noticeId: input.noticeId,
        reminderAt: action.reminderAt ? new Date(action.reminderAt) : null,
        fingerprint,
      };
      if (previous) {
        // A retificação que veio no recado alcança a turma pelo mesmo caminho
        // da edição manual — publicar, despublicar e corrigir são a mesma
        // decisão, e é por isso que moram numa função só.
        const sharing = await reconcileSharing(tx, userId, isPro, previous, action, published);
        if (!sharing.ok) return err({ code: sharing.code } as const);
        const [current] = await tx
          .update(agendaTasks)
          .set({
            ...fields,
            sharedActivityId: sharing.sharedActivityId,
            version: previous.version + 1,
            updatedAt: new Date(),
            seriesId:
              action.recurrence === "weekly"
                ? (previous.seriesId ?? randomUUID())
                : previous.seriesId,
          })
          .where(eq(agendaTasks.id, previous.id))
          .returning();
        if (!current) throw new Error("Notice correction failed");
        if (sharing.publishedBySelf && sharing.sharedActivityId)
          await publishActivityCorrection(tx, sharing.sharedActivityId, userId, current);
        await tx.insert(agendaActivityRevisions).values({
          taskId: previous.id,
          actorId: userId,
          version: current.version,
          previous,
          current,
        });
        await cancelActionDeliveries(tx, previous.id, previous.version);
        ids.push(current.id);
      } else {
        const [created] = await tx
          .insert(agendaTasks)
          .values({
            ...fields,
            createdByUserId: userId,
            sharedActivityId: action.shareWithTurma
              ? await publishToTurma(tx, userId, action, published)
              : null,
            seriesId: action.recurrence === "weekly" ? randomUUID() : null,
          })
          .returning({ id: agendaTasks.id });

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
      .from(agendaTasks)
      .where(
        and(
          eq(agendaTasks.id, input.id),
          inArray(
            agendaTasks.profileId,
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
    if (!(await validSubject(tx, input.action))) return err({ code: "INVALID_SUBJECT" } as const);
    const addsAutomation =
      (input.action.recurrence !== "none" && input.action.recurrence !== previous.recurrence) ||
      (input.action.reminderAt !== null &&
        new Date(input.action.reminderAt).valueOf() !== previous.reminderAt?.valueOf());
    if (!isPro && addsAutomation) return err({ code: "PRO_REQUIRED" } as const);
    // Quem publicou a atividade na turma edita o que a turma inteira lê, e o
    // fato publicado exige matéria e prazo. Recusar é mais honesto do que
    // gravar a versão da família e deixar a turma com a antiga.
    if (
      previous.sharedActivityId &&
      input.action.shareWithTurma &&
      (await isPublishedBy(tx, previous.sharedActivityId, userId)) &&
      (!input.action.dueAt || !input.action.subjectId)
    )
      return err({ code: "SHARED_REQUIRES_SCHOOL_FIELDS" } as const);
    const sharing = await reconcileSharing(tx, userId, isPro, previous, input.action, new Map());
    if (!sharing.ok) return err({ code: sharing.code } as const);
    const { sharedActivityId, publishedBySelf } = sharing;
    const [current] = await tx
      .update(agendaTasks)
      .set({
        ...input.action,
        sharedActivityId,
        reminderAt: input.action.reminderAt ? new Date(input.action.reminderAt) : null,
        fingerprint: actionFingerprint(input.action),
        version: previous.version + 1,
        updatedAt: new Date(),
        seriesId:
          input.action.recurrence === "weekly"
            ? (previous.seriesId ?? randomUUID())
            : previous.seriesId,
      })
      .where(eq(agendaTasks.id, input.id))
      .returning();
    if (!current) throw new Error("Action update failed");
    if (publishedBySelf && sharedActivityId)
      await publishActivityCorrection(tx, sharedActivityId, userId, current);
    await cancelActionDeliveries(tx, previous.id, previous.version);
    await tx.insert(agendaActivityRevisions).values({
      taskId: input.id,
      actorId: userId,
      version: current.version,
      previous,
      current,
    });
    return ok({ id: input.id });
  });
}

/**
 * O que a turma passa a ver depois de gravar esta tarefa.
 *
 * Existe para ser chamado por TODOS os caminhos de escrita. A retificação que
 * chega por recado é a mesma retificação que a pessoa faria na mão — se só o
 * formulário avisasse a turma, a prova adiada por um comunicado continuaria
 * marcada para as outras famílias, e ninguém saberia.
 *
 * Devolve o `shared_activity_id` que a tarefa deve passar a ter, ou um erro
 * quando a escolha não é possível.
 */
async function reconcileSharing(
  tx: AgendaTransaction,
  userId: string,
  isPro: boolean,
  previous: { sharedActivityId: string | null },
  action: NoticeActionInput,
  reuse: Map<string, string>,
): Promise<
  | { ok: true; sharedActivityId: string | null; publishedBySelf: boolean }
  | {
      ok: false;
      code: "SHARE_REQUIRES_PRO" | "SHARE_NOT_YOURS" | "SHARE_ALREADY_ACCEPTED";
    }
> {
  const publishedBySelf = previous.sharedActivityId
    ? await isPublishedBy(tx, previous.sharedActivityId, userId)
    : false;
  if (!previous.sharedActivityId && action.shareWithTurma) {
    if (!isPro) return { ok: false, code: "SHARE_REQUIRES_PRO" };
    return {
      ok: true,
      sharedActivityId: await publishToTurma(tx, userId, action, reuse),
      publishedBySelf: false,
    };
  }
  if (previous.sharedActivityId && !action.shareWithTurma) {
    // Despublicar é retirar da turma o que outras famílias podem já ter
    // começado a cumprir. Só quem publicou pode, e só enquanto ninguém mais
    // tiver recebido — do contrário some da vista delas sem explicação.
    if (!publishedBySelf) return { ok: false, code: "SHARE_NOT_YOURS" };
    if (await hasOtherHouseholdTasks(tx, previous.sharedActivityId, userId))
      return { ok: false, code: "SHARE_ALREADY_ACCEPTED" };
    await tx.delete(agendaActivities).where(eq(agendaActivities.id, previous.sharedActivityId));
    return { ok: true, sharedActivityId: null, publishedBySelf: false };
  }
  return { ok: true, sharedActivityId: previous.sharedActivityId, publishedBySelf };
}

/** Alguma outra família já tem tarefa deste fato publicado? */
async function hasOtherHouseholdTasks(
  tx: AgendaTransaction,
  activityId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: agendaTasks.id })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.sharedActivityId, activityId),
        sql`${agendaStudentProfiles.userId} IS DISTINCT FROM ${userId}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** O fato publicado é deste usuário e ainda vale? */
async function isPublishedBy(tx: AgendaTransaction, activityId: string, userId: string) {
  const [row] = await tx
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(
      and(
        eq(agendaActivities.id, activityId),
        eq(agendaActivities.createdByUserId, userId),
        sql`${agendaActivities.canceledAt} IS NULL`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Leva a correção da família que publicou para a turma inteira.
 *
 * Sem isto, a tela de edição única corrigiria só a cópia de quem editou e as
 * outras famílias continuariam vendo o enunciado antigo — a mesma assimetria
 * que a convergência veio desfazer, só que invisível. A hora, o local, o
 * responsável e a conclusão de cada casa não viajam: o que a turma corrige é o
 * enunciado, não a rotina alheia.
 */
async function publishActivityCorrection(
  tx: AgendaTransaction,
  activityId: string,
  actorId: string,
  task: typeof agendaTasks.$inferSelect,
) {
  if (!task.dueAt || !task.subjectId) return;
  const [previous] = await tx
    .select()
    .from(agendaActivities)
    .where(eq(agendaActivities.id, activityId))
    .for("update");
  // Reconfere sob o lock: entre a checagem e aqui a atividade pode ter sido
  // cancelada por outra sessão, e ressuscitá-la em silêncio seria pior do que
  // deixar a correção valer só para esta família.
  if (!previous || previous.canceledAt || previous.createdByUserId !== actorId) return;
  const [current] = await tx
    .update(agendaActivities)
    .set({
      type: task.type,
      subjectId: task.subjectId,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      version: previous.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(agendaActivities.id, activityId))
    .returning();
  if (!current) throw new Error("Shared activity correction failed");
  await tx.insert(agendaActivityRevisions).values({
    activityId,
    actorId,
    version: current.version,
    previous,
    current,
  });
  await tx
    .update(agendaTasks)
    .set({
      type: current.type,
      subjectId: current.subjectId,
      title: current.title,
      description: current.description,
      dueAt: current.dueAt,
      dateOrigin: "school",
      fingerprint: actionFingerprint(current),
      version: sql`${agendaTasks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(agendaTasks.sharedActivityId, activityId), ne(agendaTasks.id, task.id)));
}

/**
 * Cancela o fato publicado e alcança as outras famílias.
 *
 * Só o que ainda estava por fazer é cancelado: quem já cumpriu continua tendo
 * cumprido, e o cancelamento de quem publicou não apaga a conclusão de
 * ninguém. A versão sobe porque é ela que diz ao calendário assinado que o
 * evento mudou.
 */
async function cancelPublishedActivity(
  tx: AgendaTransaction,
  activityId: string,
  actorId: string,
  taskId: string,
) {
  const [previous] = await tx
    .select()
    .from(agendaActivities)
    .where(eq(agendaActivities.id, activityId))
    .for("update");
  if (!previous || previous.canceledAt || previous.createdByUserId !== actorId) return;
  const [current] = await tx
    .update(agendaActivities)
    .set({ canceledAt: new Date(), version: previous.version + 1, updatedAt: new Date() })
    .where(eq(agendaActivities.id, activityId))
    .returning();
  if (!current) throw new Error("Shared activity cancellation failed");
  await tx.insert(agendaActivityRevisions).values({
    activityId,
    actorId,
    version: current.version,
    previous,
    current,
  });
  await tx
    .update(agendaTasks)
    .set({
      status: "canceled",
      version: sql`${agendaTasks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agendaTasks.sharedActivityId, activityId),
        eq(agendaTasks.status, "pending"),
        ne(agendaTasks.id, taskId),
      ),
    );
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
      .from(agendaTasks)
      .where(
        and(
          eq(agendaTasks.id, input.id),
          inArray(
            agendaTasks.profileId,
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
    // Cancelar alcança a turma; reabrir só a própria cópia deixaria as outras
    // famílias canceladas sem ninguém saber. O que foi cancelado fica no
    // histórico e vira uma atividade nova quando voltar a valer.
    if (previous.status === "canceled") return err({ code: "ALREADY_CANCELED" } as const);
    if (
      !isPro &&
      input.status === "pending" &&
      (await countPendingActivities(tx, ownerId)) >= FREE_ACTIVITY_LIMIT
    )
      return err({ code: "ACTIVITY_LIMIT_REACHED" } as const);
    const [current] = await tx
      .update(agendaTasks)
      .set({
        status: input.status,
        version: previous.version + 1,
        updatedAt: new Date(),
        completedAt: input.status === "done" ? new Date() : null,
      })
      .where(eq(agendaTasks.id, input.id))
      .returning();
    if (!current) throw new Error("Action status update failed");
    // Cancelar o que se publicou cancela para a turma. Sem isto, as outras
    // famílias continuariam cobrando uma prova que a escola desmarcou, e só a
    // casa de quem cancelou saberia.
    if (
      input.status === "canceled" &&
      previous.sharedActivityId &&
      (await isPublishedBy(tx, previous.sharedActivityId, userId))
    )
      await cancelPublishedActivity(tx, previous.sharedActivityId, userId, input.id);
    await tx.insert(agendaActivityRevisions).values({
      taskId: input.id,
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
          .insert(agendaTasks)
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
            target: [agendaTasks.seriesId, agendaTasks.profileId, agendaTasks.dueAt],
          });
      }
    }
    return ok({ id: input.id });
  });
}
