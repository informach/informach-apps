import "server-only";

import { createHash } from "node:crypto";
import { runBillableAgentCall } from "@informach/ai-core";
import { err, ok } from "@informach/auth/server-actions";
import { InsufficientCreditsError } from "@informach/billing";
import { FamilyError } from "@informach/family";
import type { z } from "zod";
import { agentRunRecorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { generateNoticeExtraction } from "@/ai/notices/extract";
import { actualNoticeCredits, assertCostAcceptance, noticeCostQuote } from "@/features/ai/costs";
import { agendaAiBilling } from "@/features/ai/wallet-repository";
import { todayLocalIso } from "@/features/dashboard/date";
import { findAccessibleProfile } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { recordProductEvent } from "@/features/metrics/events";
import { findClosestSubject } from "@/features/subjects/match-subject";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { listTurmasForUser } from "@/features/turmas/repository";
import { formatTurmaShort } from "@/features/turmas/utils";
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

const FEATURE = "agenda.notices.parse";

export async function parseNotice(
  actor: AgendaAuthority,
  input: z.infer<typeof parseNoticeSchema>,
) {
  const { userId } = actor;
  const quote = noticeCostQuote(input);
  try {
    assertCostAcceptance(input.acceptedCost, quote);
  } catch {
    return err({ code: "AI_PRICE_CHANGED" } as const);
  }
  const profile = await findAccessibleProfile(actor, input.profileId);
  if (!profile?.canWrite || !profile.canUseAi) return err({ code: "INVALID_PROFILE" } as const);
  if (!(await isNoticeUserVerified(userId))) return err({ code: "VERIFY_EMAIL" } as const);
  if (!env.OPENROUTER_API_KEY) return err({ code: "AI_DISABLED" } as const);
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
    actor,
    input,
    attachment,
    contentHash,
    now,
  });
  if (!reserved.ok) return reserved;
  const { notice, replay } = reserved.value;
  if (replay) {
    if (!(await getNoticeSource(actor, notice.id))) return err({ code: "NOT_FOUND" } as const);
    return ok({
      noticeId: notice.id,
      extraction: visibleDraftActions(storedExtractionSchema.parse(notice.parsedResult)),
      alreadyConfirmed: notice.status === "confirmed",
      appliedProfileIds: (await listNoticeApplications(actor, notice.id)).map((a) => a.profileId),
      sourceProfileIds: notice.sourceProfileIds,
      sharedWithinFamily: notice.sharedWithinFamily,
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
    const subjectOptions = (await listSubjectOptionsByProfile(actor))[profile.id] ?? [];
    const subjectNames = subjectOptions.map((subject) => subject.name);
    const currentYear = todayLocalIso(now).slice(0, 4);
    // Série da criança escolhida e das outras da casa, sem nome de ninguém: a
    // leitura avisa quando o documento é claramente de outra turma.
    //
    // Only currently readable classroom metadata enters the prompt.
    const turmas = await listTurmasForUser(actor);
    const activeTurma = turmas.find((t) => t.id === profile.activeTurmaId) ?? null;
    const { billing, owner } = await agendaAiBilling(actor, input.profileId);
    const out = await runBillableAgentCall<{ extraction: StoredExtraction; usage?: unknown }>({
      billing,
      owner,
      estimateCost: () => ({ estimatedAmount: quote.maxCredits }),
      computeActualCost: (result) => ({ actualAmount: actualNoticeCredits(result.usage) }),
      reserveMetadata: { tariff: quote.version, maxCredits: quote.maxCredits },
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
            turmaLabel: activeTurma ? formatTurmaShort(activeTurma) : null,
            otherTurmaLabels: [],
          });
          if (!extraction.actions.length) throw new Error("NO_ACTIONS");
          // Cada ação ganha id aqui, antes de existir em qualquer lugar: é por
          // ele que a lixeira da revisão chega ao servidor.
          const stored = withActionIds(extraction);
          // Persist the output before debit. Recovery checks the reservation after an interrupted request.
          await persistNoticeExtraction(actor, notice.id, runId, stored);
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
    if (!(await getNoticeSource(actor, notice.id))) return err({ code: "NOT_FOUND" } as const);
    return ok({
      noticeId: notice.id,
      extraction: visibleDraftActions(out.result.extraction),
      alreadyConfirmed: false,
      appliedProfileIds: [],
      sourceProfileIds: null,
      sharedWithinFamily: false,
      replay: false,
    });
  } catch (error) {
    // A committed debit with persisted output is recoverable, never charged again.
    if (notice.billingRunId && (await isNoticeRunCommitted(notice.billingRunId)))
      return err({ code: "PROCESSING" } as const);
    const code =
      error instanceof InsufficientCreditsError
        ? "INSUFFICIENT_CREDITS"
        : error instanceof FamilyError
          ? "INVALID_PROFILE"
          : error instanceof Error && error.message === "NO_ACTIONS"
            ? "NO_ACTIONS"
            : "PARSE_FAILED";
    if (!(await finishNoticeParse(notice.id, notice.billingRunId, "failed", code)))
      return err({ code: "PROCESSING" } as const);
    await recordProductEvent(userId, { event: "notice_failed", source: input.source });
    return err({ code });
  }
}
