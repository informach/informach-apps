import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth/audit";
import {
  assertRecreioClosureInventory,
  type RecreioClosureInventory,
  type RecreioClosureInventoryScope,
} from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { and, eq, inArray, sql } from "@informach/db";
import {
  recreioRightsRecoveryFinances as assessments,
  recreioRenewalCancellations as cancellations,
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioRightsRecoveryRuns as runs,
} from "@informach/db/schema";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  type CoordenacaoDeEfeitos,
  conferirIntencaoFinanceiraDaCoordenacao,
  dadosFinanceirosDaCoordenacaoPrivada,
} from "./coordenacao-repository";
import { conferirFinanceiroDosEfeitos } from "./encerramento-efeitos-repository";
import {
  resumirConfirmacaoFinanceiraRecuperada,
  resumirOrigemFinanceiraRecuperada,
} from "./encerramento-financeiro-recuperado-guard";
import { lerOrigemFinanceiraDoEncerramentoLocked } from "./encerramento-origem-financeira-repository";

/** Fresh local assessment of a historically confirmed closure. No historical
 * financial row, consent, identity, evaluation or operation is updated here.
 * Both reads around provider I/O use this same owned private connection. */
async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}
async function conferirExecucao(tx: Transacao, config: CoordenacaoDeEfeitos) {
  const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  const [run] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.id, privado.execucaoId), eq(runs.ledgerId, config.assinatura.livroId)))
    .for("share");
  assertAllowed(
    run && run.state === "replaying" && run.frozenHeadSha256 === privado.cerca,
    "DIREITOS_INTEGRIDADE",
    "Execução financeira fora da cerca atual.",
  );
  return privado;
}
async function lerEstadoLocked(tx: Transacao, config: CoordenacaoDeEfeitos) {
  const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  const [op] = await tx
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.id, privado.operacaoId),
        eq(operations.requesterUserId, privado.contaId),
        eq(operations.kind, "encerrar_conta"),
        inArray(operations.state, ["admitted", "running", "completed"]),
      ),
    )
    .for("share");
  assertAllowed(op, "DIREITOS_INTEGRIDADE", "Encerramento fora da avaliação financeira privada.");
  const { plano } = await conferirIntencaoFinanceiraDaCoordenacao(tx, op, config);
  assertAllowed(
    plano.formato === "recreio-previa-encerramento-v2",
    "DIREITOS_INTEGRIDADE",
    "Plano financeiro original ausente.",
  );
  await conferirFinanceiroDosEfeitos(tx, op, plano, true);
  const [financeiro] = await tx
    .select()
    .from(finances)
    .where(eq(finances.operationId, op.id))
    .for("share");
  const [participacao] = await tx
    .select()
    .from(participations)
    .where(
      and(eq(participations.userId, op.requesterUserId), eq(participations.operationId, op.id)),
    )
    .for("share");
  assertAllowed(
    financeiro && participacao,
    "DIREITOS_INTEGRIDADE",
    "Recibos financeiros históricos ausentes.",
  );
  assertAllowed(
    op.state === "completed"
      ? participacao.state === "closed" && participacao.revision === 3
      : participacao.state === "closing" && participacao.revision === 2,
    "DIREITOS_INTEGRIDADE",
    "Participação histórica fora da fase de encerramento.",
  );
  const origem = await lerOrigemFinanceiraDoEncerramentoLocked(tx, plano);
  const ids = origem.assinaturas.map((s) => s.contrato.subscriptionId);
  const renovacoes = ids.length
    ? await tx
        .select()
        .from(cancellations)
        .where(
          and(
            eq(cancellations.payerUserId, op.requesterUserId),
            eq(cancellations.providerMode, financeiro.providerMode),
            inArray(cancellations.subscriptionId, ids),
          ),
        )
        .orderBy(cancellations.subscriptionId)
        .for("share")
    : [];
  dadosFinanceirosDaCoordenacaoPrivada(config);
  return { op, financeiro, participacao, origem, renovacoes };
}
type Estado = Awaited<ReturnType<typeof lerEstadoLocked>>;
function comEstado<T>(
  config: CoordenacaoDeEfeitos,
  executar: (tx: Transacao, estado: Estado) => Promise<T>,
) {
  const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  return privado.banco.transaction(async (tx) => {
    await limites(tx);
    await conferirExecucao(tx, config);
    return executar(tx, await lerEstadoLocked(tx, config));
  });
}
export function lerFinanceiroConfirmadoRecuperado(config: CoordenacaoDeEfeitos) {
  return comEstado(config, async (_tx, estado) => estado);
}
const hash = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");
const origemAtual = (estado: Estado) =>
  resumirOrigemFinanceiraRecuperada(estado.origem.sha256, estado.renovacoes);
type Tentativa = Readonly<{ token: string }>;
const tentativas = new WeakMap<
  Tentativa,
  { config: CoordenacaoDeEfeitos; estado: Estado; numero: number; deadlineMs: number }
>();
export function iniciarAvaliacaoFinanceiraRecuperada(
  config: CoordenacaoDeEfeitos,
  esperado: Estado,
) {
  return comEstado(config, async (tx, estado) => {
    assertAllowed(
      isDeepStrictEqual(estado, esperado),
      "DIREITOS_INTEGRIDADE",
      "A origem mudou antes da avaliação financeira.",
    );
    const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
    const [anterior] = await tx
      .select()
      .from(assessments)
      .where(
        and(eq(assessments.runId, privado.execucaoId), eq(assessments.operationId, estado.op.id)),
      )
      .for("update");
    assertAllowed(
      !anterior ||
        (anterior.attempts < 2147483647 &&
          anterior.ledgerId === estado.op.ledgerId &&
          anterior.requesterReference === estado.op.requesterUserId &&
          anterior.planSha256 === estado.op.planSha256 &&
          anterior.providerMode === estado.financeiro.providerMode),
      "DIREITOS_INTEGRIDADE",
      "A avaliação financeira mudou de escopo.",
    );
    const numero = (anterior?.attempts ?? 0) + 1,
      token = randomUUID();
    const nova = {
      runId: privado.execucaoId,
      operationId: estado.op.id,
      ledgerId: estado.op.ledgerId,
      requesterReference: estado.op.requesterUserId,
      kind: "encerrar_conta" as const,
      planSha256: estado.op.planSha256,
      providerMode: estado.financeiro.providerMode,
      state: "attempted" as const,
      attempts: numero,
      attemptToken: token,
      sourceSha256: origemAtual(estado),
      historicalConfirmationSha256: resumirConfirmacaoFinanceiraRecuperada(estado.financeiro),
      result: null,
      observationSha256: null,
      receiptSha256: null,
      reviewCode: null,
      observedAt: null,
      attemptedAt: AGORA,
      updatedAt: AGORA,
    };
    await tx
      .insert(assessments)
      .values({ ...nova, createdAt: AGORA })
      .onConflictDoUpdate({ target: [assessments.runId, assessments.operationId], set: nova });
    await logAuditEventStrict(
      "recreio.rights_recovery_finance_started",
      null,
      {
        app: "recreio",
        runId: privado.execucaoId,
        operationId: estado.op.id,
        attemptCount: numero,
      },
      { writer: tx },
    );
    const prova = Object.freeze({ token });
    tentativas.set(prova, { config, estado, numero, deadlineMs: Date.now() + 90000 });
    return prova;
  });
}
function exigirTentativa(prova: Tentativa, config: CoordenacaoDeEfeitos) {
  const tentativa = tentativas.get(prova);
  assertAllowed(
    tentativa && tentativa.config === config,
    "DIREITOS_POSSE",
    "Tentativa financeira privada encerrada.",
  );
  dadosFinanceirosDaCoordenacaoPrivada(config);
  return tentativa;
}
export function prazoDaAvaliacaoFinanceiraRecuperada(
  prova: Tentativa,
  config: CoordenacaoDeEfeitos,
) {
  return exigirTentativa(prova, config).deadlineMs;
}
export function escopoDoInventarioFinanceiroRecuperado(
  estado: Estado,
  deadlineMs: number,
): RecreioClosureInventoryScope {
  assertAllowed(
    estado.origem.cliente,
    "DIREITOS_INTEGRIDADE",
    "Cliente da avaliação financeira ausente.",
  );
  return {
    operationId: estado.op.id,
    customerId: estado.origem.cliente.providerCustomerId,
    payerId: estado.op.requesterUserId,
    purchases: estado.origem.compras.map((p) => ({ authorizationId: p.id, productId: p.produto })),
    contracts: estado.origem.assinaturas.map(({ contrato, comum }) => ({
      subscriptionId: comum.providerSubscriptionId,
      authorizationId: contrato.purchaseId,
      productId: contrato.originProductId,
    })),
    budget: { deadlineMs },
  };
}
function escopoTentativa(prova: Tentativa, config: CoordenacaoDeEfeitos) {
  const tentativa = exigirTentativa(prova, config),
    privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  return and(
    eq(assessments.runId, privado.execucaoId),
    eq(assessments.operationId, privado.operacaoId),
    eq(assessments.state, "attempted"),
    eq(assessments.attemptToken, prova.token),
    eq(assessments.attempts, tentativa.numero),
    eq(assessments.sourceSha256, origemAtual(tentativa.estado)),
    eq(
      assessments.historicalConfirmationSha256,
      resumirConfirmacaoFinanceiraRecuperada(tentativa.estado.financeiro),
    ),
  );
}
const ReciboFinanceiroRecuperadoSchema = z.strictObject({
  formato: z.literal("recreio-avaliacao-financeira-recuperada-v1"),
  execucaoId: z.uuid(),
  operacaoId: z.uuid(),
  cercaSha256: z.string().regex(/^[a-f0-9]{64}$/),
  planoSha256: z.string().regex(/^[a-f0-9]{64}$/),
  modo: z.enum(["dev", "prod"]),
  origemSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observacaoOriginalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observacaoAtualSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  resultado: z.enum(["provider_inventory", "no_customer"]),
  avaliadaEm: z.iso.datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export function concluirAvaliacaoFinanceiraRecuperada(
  prova: Tentativa,
  config: CoordenacaoDeEfeitos,
  entrada: unknown,
  observacao: RecreioClosureInventory | null,
) {
  const recibo = ReciboFinanceiroRecuperadoSchema.parse(entrada);
  const { sha256, ...documento } = recibo;
  assertAllowed(
    hash(documento) === sha256,
    "DIREITOS_INTEGRIDADE",
    "O resumo financeiro atual não corresponde ao recibo.",
  );
  const tentativa = exigirTentativa(prova, config);
  return comEstado(config, async (tx, estado) => {
    const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
    assertAllowed(
      Date.now() < tentativa.deadlineMs &&
        isDeepStrictEqual(estado, tentativa.estado) &&
        recibo.execucaoId === privado.execucaoId &&
        recibo.operacaoId === estado.op.id &&
        recibo.cercaSha256 === privado.cerca &&
        recibo.planoSha256 === estado.op.planSha256 &&
        recibo.modo === estado.financeiro.providerMode &&
        recibo.origemSha256 === estado.origem.sha256 &&
        recibo.observacaoOriginalSha256 === estado.financeiro.observationSha256 &&
        recibo.resultado === (estado.origem.cliente ? "provider_inventory" : "no_customer") &&
        /^[a-f0-9]{64}$/.test(recibo.sha256) &&
        (recibo.resultado === "no_customer"
          ? recibo.observacaoAtualSha256 === null
          : recibo.observacaoAtualSha256 !== null &&
            /^[a-f0-9]{64}$/.test(recibo.observacaoAtualSha256)),
      "DIREITOS_INTEGRIDADE",
      "O recibo financeiro atual mudou de origem.",
    );
    if (estado.origem.cliente) {
      assertAllowed(observacao, "DIREITOS_INTEGRIDADE", "Inventário atual do provedor ausente.");
      assertRecreioClosureInventory(
        observacao,
        escopoDoInventarioFinanceiroRecuperado(estado, 0),
        estado.financeiro.providerMode,
      );
      assertAllowed(
        observacao.sha256 === recibo.observacaoAtualSha256,
        "DIREITOS_INTEGRIDADE",
        "O inventário atual mudou antes do recibo.",
      );
    } else
      assertAllowed(
        observacao === null,
        "DIREITOS_INTEGRIDADE",
        "Observação fora da origem sem cliente.",
      );
    const [linha] = await tx
      .update(assessments)
      .set({
        state: "current",
        result: recibo.resultado,
        observationSha256: recibo.observacaoAtualSha256,
        receiptSha256: recibo.sha256,
        observedAt: AGORA,
        updatedAt: AGORA,
      })
      .where(escopoTentativa(prova, config))
      .returning({ id: assessments.operationId });
    assertAllowed(linha, "DIREITOS_POSSE", "Outra avaliação financeira retomou esta tentativa.");
    await logAuditEventStrict(
      "recreio.rights_recovery_finance_assessed",
      null,
      {
        app: "recreio",
        runId: privado.execucaoId,
        operationId: estado.op.id,
        attemptCount: tentativa.numero,
        result: recibo.resultado,
      },
      { writer: tx },
    );
    dadosFinanceirosDaCoordenacaoPrivada(config);
    return recibo;
  });
}
export function registrarFalhaDaAvaliacaoFinanceiraRecuperada(
  prova: Tentativa,
  config: CoordenacaoDeEfeitos,
  motivo: NonNullable<(typeof assessments.$inferSelect)["reviewCode"]>,
) {
  exigirTentativa(prova, config);
  const privado = dadosFinanceirosDaCoordenacaoPrivada(config);
  return privado.banco.transaction(async (tx) => {
    await limites(tx);
    await conferirExecucao(tx, config);
    const [linha] = await tx
      .update(assessments)
      .set({ state: "review", reviewCode: motivo, updatedAt: AGORA })
      .where(escopoTentativa(prova, config))
      .returning({ id: assessments.operationId });
    assertAllowed(linha, "DIREITOS_POSSE", "Outra avaliação financeira retomou esta tentativa.");
    await logAuditEventStrict(
      "recreio.rights_recovery_finance_failed",
      null,
      {
        app: "recreio",
        runId: privado.execucaoId,
        operationId: privado.operacaoId,
        reasonCode: motivo,
      },
      { writer: tx },
    );
  });
}
export function encerrarTentativaFinanceiraRecuperada(prova: Tentativa) {
  tentativas.delete(prova);
}
