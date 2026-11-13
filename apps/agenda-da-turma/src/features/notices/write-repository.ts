import "server-only";
import { createHash } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { and, db, eq, inArray, ne, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityRevisions,
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
import { profileAccessCondition } from "@informach/family/access";
import type { z } from "zod";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import {
  type AgendaTransaction,
  countPendingActivities,
  lockPendingLimit,
} from "@/features/activities/pending-limit";
import { accessibleProfileCondition } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { lockAgendaProfiles, studentGroupId } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { lockAgendaUse } from "@/features/family/use-repository";
import {
  assertTaskSchoolContexts,
  lockTaskSchoolContexts,
  type SchoolContextLocks,
} from "@/features/turmas/transaction-repository";
import { ensureStoredActionIds, visibleDraftActions } from "./drafts";
import { resolveSeriesId } from "./recurrence";
import { sourceAccessCondition } from "./repository";
import {
  type confirmNoticeSchema,
  type discardDraftActionSchema,
  type discardNoticeSchema,
  type NoticeActionInput,
  type statusNoticeActionSchema,
  storedExtractionSchema,
  type updateNoticeActionSchema,
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

/** O que muda a cada gravação sem ser conteúdo: versão, datas de gravação e o vínculo com a turma. */
const BOOKKEEPING = new Set(["version", "updatedAt", "sharedActivityId", "fingerprint"]);

/** A gravação mudou algo que a família escreveu, e não só a contabilidade da linha? */
export function contentChanged(previous: object, current: object): boolean {
  const content = (row: object) =>
    JSON.stringify(Object.entries(row).filter(([key]) => !BOOKKEEPING.has(key)));
  return content(previous) !== content(current);
}

async function validAssignee(tx: AgendaTransaction, input: NoticeActionInput) {
  if (!input.assignedToUserId) return true;
  const [recipient] = await tx
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(
      and(
        eq(agendaStudentProfiles.id, input.profileId),
        profileAccessCondition(
          input.assignedToUserId,
          "agenda-da-turma",
          agendaStudentProfiles.familyProfileId,
          "read",
        ),
      ),
    );
  return !!recipient;
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
  actor: AgendaAuthority,
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
      createdByUserId: actor.userId,
      familyGroupId: actor.familyGroupId,
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

/** The household lock is acquired before any native row or original is locked. */
async function lockNoticeProfiles(
  tx: AgendaTransaction,
  actor: AgendaAuthority,
  noticeId: string,
  action: "read" | "write" = "write",
) {
  await lockPendingLimit(tx, actor);
  const [notice] = await tx
    .select({
      captureId: agendaNotices.captureProfileId,
      scope: agendaNotices.sourceProfileIds,
      status: agendaNotices.status,
    })
    .from(agendaNotices)
    .where(
      and(
        eq(agendaNotices.id, noticeId),
        eq(agendaNotices.familyGroupId, actor.familyGroupId),
        sourceAccessCondition(actor),
      ),
    );
  if (!notice) return false;
  const ids =
    notice.status === "confirmed"
      ? (notice.scope ?? [])
      : notice.captureId
        ? [notice.captureId]
        : [];
  if (!ids.length) return false;
  await lockAgendaProfiles(tx, actor, ids, action);
  return true;
}
async function lockTaskUse(tx: AgendaTransaction, actor: AgendaAuthority, taskId: string) {
  await lockPendingLimit(tx, actor);
  const [task] = await tx
    .select({ profileId: agendaTasks.profileId })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(eq(agendaTasks.id, taskId), accessibleProfileCondition(actor, "write")));
  return task ? lockAgendaUse(tx, actor, [task.profileId]) : null;
}

export async function insertConfirmedNotice(
  actor: AgendaAuthority,
  input: z.infer<typeof confirmNoticeSchema>,
) {
  const userId = actor.userId;
  return atomicAgendaResult(async (tx) => {
    const dependencies = {
      taskIds: input.resolutions?.flatMap((r) => (r.kind === "replace" ? [r.actionId] : [])) ?? [],
      subjectIds: input.actions.flatMap((a) => (a.subjectId ? [a.subjectId] : [])),
    };
    const schoolLocks = await lockTaskSchoolContexts(tx, dependencies);
    await lockPendingLimit(tx, actor);
    const profileIds = [...new Set(input.actions.map((a) => a.profileId))];
    const coverage = await lockAgendaUse(tx, actor, [
      ...new Set([...profileIds, ...(input.sourceProfileIds ?? [])]),
    ]);
    const isPro = coverage.enabled;
    await assertTaskSchoolContexts(tx, schoolLocks, dependencies);
    if (input.noticeId && !(await lockNoticeProfiles(tx, actor, input.noticeId)))
      return err({ code: "NOT_FOUND" } as const);
    let source: "teams" | "batista" | "notebook" | "whatsapp" | "other" | "manual" = "manual";
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
            eq(agendaNotices.familyGroupId, actor.familyGroupId),
            sourceAccessCondition(actor),
          ),
        )
        .for("update");
      if (!notice) return err({ code: "NOT_FOUND" } as const);
      // Descartado numa aba enquanto outra ainda mostrava a revisão: a tela
      // está velha, não é um processamento em curso. `NOT_READY` mandaria
      // esperar por algo que não vai acontecer.
      if (notice.status === "discarded") return err({ code: "NOT_DRAFT" } as const);
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
          .where(and(inArray(agendaStudentProfiles.id, scope), accessibleProfileCondition(actor)));
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

    if (input.noticeId && (!scope?.length || profileIds.some((id) => !scope.includes(id))))
      return err({ code: "INVALID_SOURCE_SCOPE" } as const);

    // Applying a document is idempotent per child, independently of extraction
    // caching and of later edits/corrections to the resulting actions.
    const work = input.actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => !appliedProfiles.includes(action.profileId));
    for (const { action } of work) {
      if (!(await validAssignee(tx, action))) return err({ code: "INVALID_ASSIGNEE" } as const);
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
    const pending = await countPendingActivities(tx, actor);
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
        // Corrigir pelo recado mantém na turma o que já foi, quando a correção
        // ainda traz a data e a matéria: é assim que a data nova chega às outras
        // famílias. Sem uma delas, vale a regra de antes (despublicar se ninguém
        // aceitou, recusar se já aceitaram), como a edição faz com
        // SHARED_REQUIRES_SCHOOL_FIELDS: uma cópia sem data ligada à turma
        // deixaria as outras famílias com a data velha, sem aviso.
        const keepShared = {
          ...action,
          shareWithTurma:
            action.shareWithTurma ||
            (previous.sharedActivityId !== null && Boolean(action.dueAt && action.subjectId)),
        };
        const sharing = await reconcileSharing(tx, actor, isPro, previous, keepShared, published);
        if (!sharing.ok) return err({ code: sharing.code } as const);
        const [current] = await tx
          .update(agendaTasks)
          .set({
            ...fields,
            sharedActivityId: sharing.sharedActivityId,
            version: previous.version + 1,
            updatedAt: new Date(),
            seriesId: resolveSeriesId(action.recurrence, previous.seriesId),
          })
          .where(eq(agendaTasks.id, previous.id))
          .returning();
        if (!current) throw new Error("Notice correction failed");
        if (sharing.publishedBySelf && sharing.sharedActivityId)
          await publishActivityCorrection(tx, sharing.sharedActivityId, actor, current);
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
              ? await publishToTurma(tx, actor, action, published)
              : null,
            seriesId: resolveSeriesId(action.recurrence, null),
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
          sharedWithinFamily: sql`CASE WHEN ${agendaNotices.createdByUserId} = ${actor.userId} THEN ${input.shareOriginal} ELSE ${agendaNotices.sharedWithinFamily} END`,
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
    // `indices[i]` é a posição, na revisão, da atividade que virou `ids[i]`: o
    // "Pronto" precisa saber quais acabaram de entrar para oferecer a turma.
    return ok({ alreadyConfirmed: ids.length === 0, ids, indices: values.map((v) => v.index) });
  });
}

/**
 * O rascunho de um recado `ready`, para a revisão retomar.
 *
 * Linhas anteriores aos ids por ação ganham os seus aqui, dentro da mesma
 * transação e com a linha travada: dois `retomar` concorrentes atribuiriam ids
 * diferentes, e a lixeira de quem perdesse devolveria NOT_FOUND.
 */
export async function loadNoticeDraft(actor: AgendaAuthority, noticeId: string) {
  return db.transaction(async (tx) => {
    if (!(await lockNoticeProfiles(tx, actor, noticeId, "read"))) return null;
    const [notice] = await tx
      .select()
      .from(agendaNotices)
      .where(
        and(
          eq(agendaNotices.id, noticeId),
          eq(agendaNotices.status, "ready"),
          sourceAccessCondition(actor),
        ),
      )
      .for("update");
    if (!notice) return null;
    const stored = storedExtractionSchema.safeParse(notice.parsedResult);
    if (!stored.success) return null;
    const { extraction, changed } = ensureStoredActionIds(stored.data);
    if (changed)
      await tx
        .update(agendaNotices)
        .set({ parsedResult: extraction })
        .where(eq(agendaNotices.id, notice.id));
    return { notice, extraction: visibleDraftActions(extraction) };
  });
}

/**
 * Descarta UMA ação do rascunho. Marca, não remove: reimportar o mesmo
 * conteúdo recupera a leitura inteira sem nova cobrança. Quando não sobra
 * nenhuma, o recado vira `discarded` e sai de "Falta conferir antes de salvar".
 * Só de `ready`: um recado `confirmed` já tem tarefas e aplicações por criança.
 */
export async function discardDraftActionAtomically(
  actor: AgendaAuthority,
  input: z.infer<typeof discardDraftActionSchema>,
) {
  return atomicAgendaResult(async (tx) => {
    if (!(await lockNoticeProfiles(tx, actor, input.noticeId, "write")))
      return err({ code: "NOT_FOUND" } as const);
    const [notice] = await tx
      .select()
      .from(agendaNotices)
      .where(and(eq(agendaNotices.id, input.noticeId), sourceAccessCondition(actor)))
      .for("update");
    if (!notice) return err({ code: "NOT_FOUND" } as const);
    if (notice.status !== "ready") return err({ code: "NOT_DRAFT" } as const);
    const stored = storedExtractionSchema.safeParse(notice.parsedResult);
    if (!stored.success) return err({ code: "NOT_DRAFT" } as const);
    const { extraction } = ensureStoredActionIds(stored.data);
    if (!extraction.actions.some((a) => a.id === input.actionId && !a.discardedAt))
      return err({ code: "NOT_FOUND" } as const);
    const now = new Date();
    const actions = extraction.actions.map((a) =>
      a.id === input.actionId ? { ...a, discardedAt: now.toISOString() } : a,
    );
    const remaining = actions.filter((a) => !a.discardedAt).length;
    await tx
      .update(agendaNotices)
      .set({
        parsedResult: { ...extraction, actions },
        status: remaining ? "ready" : "discarded",
        updatedAt: now,
      })
      .where(eq(agendaNotices.id, notice.id));
    return ok({ remaining });
  });
}

/** Descarta o recado inteiro. Mesma regra: só de `ready`. */
export async function discardNoticeAtomically(
  actor: AgendaAuthority,
  input: z.infer<typeof discardNoticeSchema>,
) {
  return atomicAgendaResult(async (tx) => {
    if (!(await lockNoticeProfiles(tx, actor, input.noticeId, "write")))
      return err({ code: "NOT_FOUND" } as const);
    const [notice] = await tx
      .select({ id: agendaNotices.id, status: agendaNotices.status })
      .from(agendaNotices)
      .where(and(eq(agendaNotices.id, input.noticeId), sourceAccessCondition(actor)))
      .for("update");
    if (!notice) return err({ code: "NOT_FOUND" } as const);
    if (notice.status !== "ready") return err({ code: "NOT_DRAFT" } as const);
    await tx
      .update(agendaNotices)
      .set({ status: "discarded", updatedAt: new Date() })
      .where(eq(agendaNotices.id, notice.id));
    return ok({ id: notice.id });
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
  actor: AgendaAuthority,
  input: z.infer<typeof updateNoticeActionSchema>,
) {
  const userId = actor.userId;
  return atomicAgendaResult(async (tx) => {
    const dependencies = {
      taskIds: [input.id],
      subjectIds: input.action.subjectId ? [input.action.subjectId] : [],
    };
    const schoolLocks = await lockTaskSchoolContexts(tx, dependencies);
    const coverage = await lockTaskUse(tx, actor, input.id);
    if (!coverage) return err({ code: "NOT_FOUND" } as const);
    const isPro = coverage.enabled;
    await assertTaskSchoolContexts(tx, schoolLocks, dependencies);
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
              .where(accessibleProfileCondition(actor)),
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
    if (!(await validAssignee(tx, input.action))) return err({ code: "INVALID_ASSIGNEE" } as const);
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
      (await isPublishedBy(tx, previous.sharedActivityId, actor)) &&
      (!input.action.dueAt || !input.action.subjectId)
    )
      return err({ code: "SHARED_REQUIRES_SCHOOL_FIELDS" } as const);
    const sharing = await reconcileSharing(tx, actor, isPro, previous, input.action, new Map());
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
        seriesId: resolveSeriesId(input.action.recurrence, previous.seriesId),
      })
      .where(eq(agendaTasks.id, input.id))
      .returning();
    if (!current) throw new Error("Action update failed");
    if (publishedBySelf && sharedActivityId)
      await publishActivityCorrection(tx, sharedActivityId, actor, current);
    await cancelActionDeliveries(tx, previous.id, previous.version);
    // Mandar para a turma pelo "Pronto" passa por aqui sem mudar o conteúdo: a
    // versão sobe (é ela que segura a concorrência), mas não há revisão, senão o
    // card diria "Mudou depois de salva" e o histórico mostraria uma versão igual.
    if (contentChanged(previous, current))
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
  actor: AgendaAuthority,
  isPro: boolean,
  previous: { sharedActivityId: string | null },
  action: NoticeActionInput,
  reuse: Map<string, string>,
): Promise<
  | { ok: true; sharedActivityId: string | null; publishedBySelf: boolean }
  | {
      ok: false;
      code: "SHARE_REQUIRES_PRO" | "SHARE_NOT_YOURS" | "SHARE_ALREADY_ACCEPTED" | "INVALID_SUBJECT";
    }
> {
  if (previous.sharedActivityId && action.shareWithTurma) {
    const [publication] = await tx
      .select({ turmaId: agendaActivities.turmaId })
      .from(agendaActivities)
      .where(eq(agendaActivities.id, previous.sharedActivityId));
    const [subject] = action.subjectId
      ? await tx
          .select({ turmaId: agendaSubjects.turmaId })
          .from(agendaSubjects)
          .where(eq(agendaSubjects.id, action.subjectId))
      : [];
    if (!publication || !subject || subject.turmaId !== publication.turmaId)
      return { ok: false, code: "INVALID_SUBJECT" };
  }
  const publishedBySelf = previous.sharedActivityId
    ? await isPublishedBy(tx, previous.sharedActivityId, actor)
    : false;
  if (!previous.sharedActivityId && action.shareWithTurma) {
    if (!isPro) return { ok: false, code: "SHARE_REQUIRES_PRO" };
    return {
      ok: true,
      sharedActivityId: await publishToTurma(tx, actor, action, reuse),
      publishedBySelf: false,
    };
  }
  if (previous.sharedActivityId && !action.shareWithTurma) {
    // Despublicar é retirar da turma o que outras famílias podem já ter
    // começado a cumprir. Só quem publicou pode, e só enquanto ninguém mais
    // tiver recebido — do contrário some da vista delas sem explicação.
    if (!publishedBySelf) return { ok: false, code: "SHARE_NOT_YOURS" };
    if (await hasOtherHouseholdTasks(tx, previous.sharedActivityId, actor))
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
  actor: AgendaAuthority,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: agendaTasks.id })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.sharedActivityId, activityId),
        sql`${studentGroupId} IS DISTINCT FROM ${actor.familyGroupId}::uuid`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** O fato publicado é deste usuário e ainda vale? */
async function isPublishedBy(tx: AgendaTransaction, activityId: string, actor: AgendaAuthority) {
  const [row] = await tx
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(
      and(
        eq(agendaActivities.id, activityId),
        eq(agendaActivities.createdByUserId, actor.userId),
        eq(agendaActivities.familyGroupId, actor.familyGroupId),
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
  actor: AgendaAuthority,
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
  if (
    !previous ||
    previous.canceledAt ||
    previous.createdByUserId !== actor.userId ||
    previous.familyGroupId !== actor.familyGroupId
  )
    return;
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
    actorId: actor.userId,
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
    .where(
      and(
        eq(agendaTasks.sharedActivityId, activityId),
        ne(agendaTasks.id, task.id),
        sql`EXISTS (SELECT 1 FROM ${agendaTurmaMembers} WHERE ${agendaTurmaMembers.studentProfileId} = ${agendaTasks.profileId} AND ${agendaTurmaMembers.turmaId} = ${previous.turmaId})`,
      ),
    );
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
  actor: AgendaAuthority,
  taskId: string,
) {
  const [previous] = await tx
    .select()
    .from(agendaActivities)
    .where(eq(agendaActivities.id, activityId))
    .for("update");
  if (
    !previous ||
    previous.canceledAt ||
    previous.createdByUserId !== actor.userId ||
    previous.familyGroupId !== actor.familyGroupId
  )
    return;
  const [current] = await tx
    .update(agendaActivities)
    .set({ canceledAt: new Date(), version: previous.version + 1, updatedAt: new Date() })
    .where(eq(agendaActivities.id, activityId))
    .returning();
  if (!current) throw new Error("Shared activity cancellation failed");
  await tx.insert(agendaActivityRevisions).values({
    activityId,
    actorId: actor.userId,
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
        sql`EXISTS (SELECT 1 FROM ${agendaTurmaMembers} WHERE ${agendaTurmaMembers.studentProfileId} = ${agendaTasks.profileId} AND ${agendaTurmaMembers.turmaId} = ${previous.turmaId})`,
      ),
    );
}

export function nextWeeklyDate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export async function setNoticeActionStatusAtomically(
  actor: AgendaAuthority,
  input: z.infer<typeof statusNoticeActionSchema>,
) {
  return atomicAgendaResult(async (tx) => {
    const schoolLocks = await lockTaskSchoolContexts(tx, { taskIds: [input.id] });
    return setNoticeActionStatusWithinTx(tx, actor, input, schoolLocks);
  });
}

/**
 * A mesma gravação, dentro de uma transação que já existe.
 *
 * Existe para a fila offline: o recibo de idempotência e a gravação precisam
 * ser a MESMA transação, senão uma queda entre as duas deixa a atividade
 * concluída sem recibo, e a retentativa do aparelho lê um conflito de versão
 * por uma gravação que foi dela mesma. Quem chama de fora continua usando
 * `setNoticeActionStatusAtomically`.
 */
export async function setNoticeActionStatusWithinTx(
  tx: AgendaTransaction,
  actor: AgendaAuthority,
  input: z.infer<typeof statusNoticeActionSchema>,
  schoolLocks: SchoolContextLocks,
) {
  const userId = actor.userId;
  const coverage = await lockTaskUse(tx, actor, input.id);
  if (!coverage) return err({ code: "NOT_FOUND" } as const);
  const isPro = coverage.enabled;
  await assertTaskSchoolContexts(tx, schoolLocks, { taskIds: [input.id] });
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
            .where(accessibleProfileCondition(actor)),
        ),
      ),
    )
    .for("update");
  if (!previous) return err({ code: "NOT_FOUND" } as const);
  if (previous.version !== input.version) return err({ code: "VERSION_CONFLICT" } as const);
  // A versão volta junto: é ela que deixa o mesmo card concluir e, logo em
  // seguida, desfazer. Sem ela o "Desfazer" mandava a versão de antes e
  // esbarrava sempre em VERSION_CONFLICT.
  if (previous.status === input.status) return ok({ id: input.id, version: previous.version });
  // Cancelar alcança a turma; reabrir só a própria cópia deixaria as outras
  // famílias canceladas sem ninguém saber. O que foi cancelado fica no
  // histórico e vira uma atividade nova quando voltar a valer.
  if (previous.status === "canceled") return err({ code: "ALREADY_CANCELED" } as const);
  if (
    !isPro &&
    input.status === "pending" &&
    (await countPendingActivities(tx, actor)) >= FREE_ACTIVITY_LIMIT
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
    (await isPublishedBy(tx, previous.sharedActivityId, actor))
  )
    await cancelPublishedActivity(tx, previous.sharedActivityId, actor, input.id);
  // Prova cancelada não deixa sessões de estudo órfãs cobrando preparação
  // para uma data que não existe mais. O que já foi estudado fica feito.
  if (input.status === "canceled")
    await tx
      .update(agendaTasks)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(agendaTasks.studyForTaskId, input.id), eq(agendaTasks.status, "pending")));
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
  return ok({ id: input.id, version: current.version });
}
