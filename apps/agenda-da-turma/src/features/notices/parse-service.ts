import "server-only";

import { createHash } from "node:crypto";
import { runBillableAgentCall } from "@informach/ai-core";
import { err, ok } from "@informach/auth/server-actions";
import type { z } from "zod";
import { agentRunRecorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { generateNoticeExtraction } from "@/ai/notices/extract";
import { todayLocalIso } from "@/features/dashboard/date";
import { findAccessibleProfile } from "@/features/family/access";
import { recordProductEvent } from "@/features/metrics/events";
import { findClosestSubject } from "@/features/subjects/match-subject";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { billing } from "@/lib/billing";
import { env } from "@/lib/env";
import { prepareNoticeAttachment } from "./attachment";
import { visibleDraftActions, withActionIds } from "./drafts";
import {
  finishNoticeParse,
  isNoticeRunCommitted,
  isNoticeUserVerified,
  persistNoticeExtraction,
  reserveNoticeParse,
} from "./parse-repository";
import { getNoticeSource, listNoticeApplications } from "./repository";
import { type parseNoticeSchema, type StoredExtraction, storedExtractionSchema } from "./schemas";
import { grantNoticeTrialCredits } from "./trial";

const FEATURE = "agenda.notices.parse";

export async function parseNotice(userId: string, input: z.infer<typeof parseNoticeSchema>) {
  const profile = await findAccessibleProfile(userId, input.profileId);
  if (!profile) return err({ code: "INVALID_PROFILE" } as const);
  if (!(await isNoticeUserVerified(userId))) return err({ code: "VERIFY_EMAIL" } as const);
  if (!env.OPENROUTER_API_KEY) return err({ code: "AI_DISABLED" } as const);
  const ownerId = profile.userId;
  const isPro = await billing.hasProSubscription({ type: "user", id: ownerId });
  let attachment: Awaited<ReturnType<typeof prepareNoticeAttachment>>;
  try {
    attachment = await prepareNoticeAttachment(input.attachment);
  } catch (error) {
    return err({
      code:
        error instanceof Error && error.message === "SELECT_PDF_PAGES"
          ? "SELECT_PDF_PAGES"
          : "INVALID_ATTACHMENT",
    } as const);
  }
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify([
        input.text.trim(),
        attachment?.originalData ?? null,
        attachment?.pages ?? [],
        input.publishedAt,
      ]),
    )
    .digest("hex");
  const now = new Date();
  const reserved = await reserveNoticeParse({
    userId,
    ownerId,
    profileId: profile.id,
    isPro,
    input,
    attachment,
    contentHash,
    now,
    trialDailyBudget: env.AGENDA_TRIAL_DAILY_BUDGET,
  });
  if (!reserved.ok) return reserved;
  const { notice, replay } = reserved.value;
  if (replay) {
    if (!(await getNoticeSource(userId, notice.id))) return err({ code: "NOT_FOUND" } as const);
    return ok({
      noticeId: notice.id,
      extraction: visibleDraftActions(storedExtractionSchema.parse(notice.parsedResult)),
      alreadyConfirmed: notice.status === "confirmed",
      appliedProfileIds: (await listNoticeApplications(userId, notice.id)).map((a) => a.profileId),
      sourceProfileIds: notice.sourceProfileIds,
      replay: true,
    });
  }

  if (!notice.billingRunId) throw new Error("Notice admission did not create a run id");
  try {
    // Dentro do try: a admissão já gravou a tentativa e deixou a linha em
    // `processing`. Uma falha de banco aqui fora não marcaria o recado como
    // `failed`, e ele ficaria dez minutos recusando o reenvio com PROCESSING.
    //
    // A leitura recebe só os NOMES das matérias da criança da captura: é o que
    // permite devolver `subjectHint` copiado da lista, que a revisão
    // pré-seleciona. Não entra no contentHash de propósito — um replay devolve
    // as pistas da leitura anterior, e o construtor de rascunho as resolve
    // contra a lista atual, então matéria cadastrada depois ainda casa.
    const subjectOptions = (await listSubjectOptionsByProfile(userId))[profile.id] ?? [];
    const subjectNames = subjectOptions.map((subject) => subject.name);
    const currentYear = todayLocalIso(now).slice(0, 4);
    if (!isPro) await grantNoticeTrialCredits(ownerId, "base");
    const out = await runBillableAgentCall<{ extraction: StoredExtraction; usage?: unknown }>({
      billing,
      owner: { type: "user", id: ownerId },
      app: "agenda-da-turma",
      feature: FEATURE,
      model: AGENDA_MODELS[FEATURE],
      agent: "noticeParser",
      recorder: agentRunRecorder,
      runId: notice.billingRunId ?? undefined,
      requestId: notice.id,
      retry: false,
      getUsage: (response) => response.usage,
      getErrorMetadata: () => ({ error: "NOTICE_EXTRACTION_FAILED" }),
      call: async ({ runId }) => {
        try {
          const { extraction, usage } = await generateNoticeExtraction(input, attachment, {
            runId,
            subjectNames,
            currentYear,
          });
          if (!extraction.actions.length) throw new Error("NO_ACTIONS");
          // Cada ação ganha id aqui, antes de existir em qualquer lugar: é por
          // ele que a lixeira da revisão chega ao servidor.
          const stored = withActionIds(extraction);
          // Persist the output before debit. Recovery checks the reservation after an interrupted request.
          await persistNoticeExtraction(notice.id, runId, stored);
          return { extraction: stored, usage };
        } catch (error) {
          throw new Error(
            error instanceof Error && error.message === "NO_ACTIONS"
              ? "NO_ACTIONS"
              : "NOTICE_EXTRACTION_FAILED",
          );
        }
      },
    });
    if (!(await finishNoticeParse(notice.id, notice.billingRunId, "ready")))
      return err({ code: "PROCESSING" } as const);
    await recordProductEvent(userId, {
      event: "notice_parsed",
      source: input.source,
      count: out.result.extraction.actions.length,
      durationMs: Date.now() - now.valueOf(),
    });
    // Quanto da leitura já chega com a matéria certa. Mesmo resolvedor que a
    // revisão usa, contra as mesmas opções — é a taxa de acerto do vínculo,
    // não uma segunda regra. Só números; nada do conteúdo escolar.
    const hinted = out.result.extraction.actions.filter((a) => a.subjectHint?.trim());
    const matched = hinted.filter((a) => findClosestSubject(subjectOptions, a.subjectHint)).length;
    if (matched)
      await recordProductEvent(userId, { event: "subject_auto_matched", count: matched });
    if (hinted.length - matched)
      await recordProductEvent(userId, {
        event: "subject_hint_unmatched",
        count: hinted.length - matched,
      });
    if (!(await getNoticeSource(userId, notice.id))) return err({ code: "NOT_FOUND" } as const);
    return ok({
      noticeId: notice.id,
      extraction: visibleDraftActions(out.result.extraction),
      alreadyConfirmed: false,
      appliedProfileIds: [],
      sourceProfileIds: null,
      replay: false,
    });
  } catch (error) {
    // A committed debit with persisted output is recoverable, never charged again.
    if (notice.billingRunId && (await isNoticeRunCommitted(notice.billingRunId)))
      return err({ code: "PROCESSING" } as const);
    const code =
      error instanceof Error && error.message === "NO_ACTIONS" ? "NO_ACTIONS" : "PARSE_FAILED";
    if (!(await finishNoticeParse(notice.id, notice.billingRunId, "failed", code)))
      return err({ code: "PROCESSING" } as const);
    await recordProductEvent(userId, { event: "notice_failed", source: input.source });
    return err({ code });
  }
}
