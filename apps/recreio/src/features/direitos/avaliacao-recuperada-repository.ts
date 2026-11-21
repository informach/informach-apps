import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "@informach/db";
import {
  recreioRightsRecoveryEvaluations as evaluations,
  type recreioRightsOperations as operations,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import {
  conferirMapaHistoricoDeMundos,
  lerPreparacaoInterativaDaOperacao,
} from "./fonte-intencao-repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { conferirIntencaoDoPlano } from "./intencao-persistida";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { lerPlanoDeDireitos } from "./plano-persistido";

/** Read-only current assessment. The birth source and original consent dates
 * are not rewritten when a later backup is restored. This does not authenticate
 * external head membership or mint a private execution capability. */
export async function conferirOperacaoNaAvaliacao(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  escopo: { execucaoId: string; cercaSha256: string },
) {
  return conferirOrigemNaAvaliacao(tx, op, assinatura, escopo, "admitida");
}

/** A pending native SQL publication may only be reconciled by the fixed
 * private admission, after external prefix membership has been verified. */
export async function conferirPublicacaoNativaNaAvaliacao(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  escopo: { execucaoId: string; cercaSha256: string },
) {
  return conferirOrigemNaAvaliacao(tx, op, assinatura, escopo, "publicacao");
}

async function conferirOrigemNaAvaliacao(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  escopo: { execucaoId: string; cercaSha256: string },
  estado: "admitida" | "publicacao",
) {
  const [fonte] = await tx
    .select({ avaliacao: evaluations, origem: sources, execucao: runs })
    .from(evaluations)
    .innerJoin(
      sources,
      and(
        eq(sources.operationId, evaluations.operationId),
        eq(sources.ledgerId, evaluations.ledgerId),
        eq(sources.requesterReference, evaluations.requesterReference),
        eq(sources.planSha256, evaluations.planSha256),
        eq(sources.kind, evaluations.kind),
      ),
    )
    .innerJoin(runs, and(eq(runs.id, evaluations.runId), eq(runs.ledgerId, evaluations.ledgerId)))
    .where(
      and(
        eq(evaluations.runId, escopo.execucaoId),
        eq(evaluations.operationId, op.id),
        eq(evaluations.ledgerId, op.ledgerId),
        eq(evaluations.requesterReference, op.requesterUserId),
        eq(evaluations.planSha256, op.planSha256),
        eq(evaluations.kind, op.kind),
      ),
    );
  assertAllowed(
    fonte &&
      fonte.execucao.state === "replaying" &&
      fonte.execucao.frozenHeadSha256 === escopo.cercaSha256 &&
      op.ledgerEpoch <= fonte.execucao.frozenEpoch &&
      (estado === "publicacao"
        ? op.state === "publishing" &&
          (op.kind === "retirar_perfil" || op.kind === "encerrar_conta") &&
          op.preparationId !== null &&
          op.recoverySourceId === null &&
          op.admittedHeadSha256 === null &&
          op.admittedAt === null &&
          op.completedAt === null &&
          fonte.avaliacao.state === "staged" &&
          fonte.avaliacao.readyAt === null &&
          fonte.avaliacao.admittedHeadSha256 === null
        : (op.state === "admitted" || op.state === "running" || op.state === "completed") &&
          op.admittedHeadSha256 !== null &&
          op.admittedAt !== null),
    "DIREITOS_INTEGRIDADE",
    "A operação exige avaliação da execução atual.",
  );
  const plano = lerPlanoDeDireitos(
    {
      requesterUserId: fonte.origem.requesterReference,
      kind: fonte.origem.kind,
      planSha256: fonte.origem.planSha256,
      plan: fonte.origem.plan,
    },
    op.requesterUserId,
  );
  const mapa = await conferirMapaHistoricoDeMundos(tx, plano, fonte.avaliacao.worldMap);
  const selecionados = await tx
    .select({ id: subjects.profileReference })
    .from(subjects)
    .where(eq(subjects.operationId, op.id))
    .orderBy(subjects.profileReference)
    .limit(257);
  const mundos = plano.mundos.map((m) => ({ id: m.id, jogo: m.jogo }));
  const conferida =
    op.preparationId !== null && op.recoverySourceId === null
      ? conferirIntencaoNativa(
          op,
          await lerPreparacaoInterativaDaOperacao(tx, op),
          selecionados,
          assinatura,
          mundos,
        )
      : conferirIntencaoDoPlano(op, plano, selecionados, assinatura, mundos);
  assertAllowed(
    isDeepStrictEqual(conferida.plano, plano) &&
      ((op.preparationId !== null && op.recoverySourceId === null) ||
        (op.preparationId === null && op.recoverySourceId === op.id)),
    "DIREITOS_INTEGRIDADE",
    "A origem não corresponde à avaliação atual.",
  );
  if (op.recoverySourceId !== null) {
    const [nascimento] = await tx
      .select({ cabecalho: runs.frozenHeadSha256 })
      .from(runs)
      .where(and(eq(runs.id, fonte.origem.runId), eq(runs.ledgerId, op.ledgerId)));
    assertAllowed(
      nascimento?.cabecalho === op.admittedHeadSha256,
      "DIREITOS_INTEGRIDADE",
      "A admissão original de recuperação diverge.",
    );
  }
  return {
    ...conferida,
    mapa,
    avaliacao: fonte.avaliacao,
    execucao: fonte.execucao,
    execucaoAutorizada: false as const,
  };
}

/** Only the receipt written by fixed admission can admit a child scope. */
export function conferirReciboDaAvaliacao(
  avaliacao: typeof evaluations.$inferSelect,
  op: typeof operations.$inferSelect,
) {
  assertAllowed(
    (avaliacao.state === "ready" || avaliacao.state === "verified") &&
      avaliacao.readyAt !== null &&
      avaliacao.admittedHeadSha256 === op.admittedHeadSha256 &&
      avaliacao.intentSha256 === op.intentSha256 &&
      avaliacao.preparationReference === op.preparationId &&
      avaliacao.recoverySourceReference === op.recoverySourceId &&
      avaliacao.origin === (op.preparationId !== null ? "native" : "recovered"),
    "DIREITOS_INTEGRIDADE",
    "Recibo de retomada ausente ou divergente.",
  );
}
