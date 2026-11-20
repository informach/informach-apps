import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray } from "@informach/db";
import {
  type recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { conferirIntencaoDoPlano } from "./intencao-persistida";
import { referenciasDeMundosDaOperacao } from "./intencao-repository";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { lerPlanoDeDireitos } from "./plano-persistido";
import type { PlanoDeDireitos } from "./preparacao-contrato";

/** Normal workers cannot execute an imported decision through the interactive
 * path. The future offline coordinator needs its own verified cluster/fence
 * context; a nullable live preparation is never a permission bypass. */
export async function lerPreparacaoInterativaDaOperacao(
  tx: Transacao,
  op: typeof operations.$inferSelect,
) {
  assertAllowed(
    op.preparationId !== null && op.recoverySourceId === null,
    "DIREITOS_INTEGRIDADE",
    "A recuperação exige seu coordenador privado.",
  );
  const [preparacao] = await tx
    .select()
    .from(preparations)
    .where(eq(preparations.id, op.preparationId));
  return preparacao;
}

const Mapa = z
  .array(
    z.strictObject({
      mundoReferencia: z.uuid(),
      jogo: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
      mundoVivoId: z.uuid().nullable(),
    }),
  )
  .max(512);

/** Complete signed selection plus actual live/absent world identity. */
export async function conferirMapaHistoricoDeMundos(
  tx: Transacao,
  plano: PlanoDeDireitos,
  entrada: unknown,
) {
  const mapa = Mapa.parse(entrada);
  assertAllowed(
    isDeepStrictEqual(
      mapa.map((m) => ({ id: m.mundoReferencia, jogo: m.jogo })),
      plano.mundos.map((m) => ({ id: m.id, jogo: m.jogo })),
    ) && mapa.every((m) => m.mundoVivoId === null || m.mundoVivoId === m.mundoReferencia),
    "DIREITOS_INTEGRIDADE",
    "O mapa não corresponde à seleção completa.",
  );
  const vivos = mapa.length
    ? await tx
        .select({ id: spaces.id, jogo: spaces.gameId })
        .from(spaces)
        .where(
          inArray(
            spaces.id,
            mapa.map((m) => m.mundoReferencia),
          ),
        )
        .limit(513)
    : [];
  assertAllowed(
    mapa.every((m) =>
      m.mundoVivoId === null
        ? !vivos.some((v) => v.id === m.mundoReferencia)
        : vivos.some((v) => v.id === m.mundoVivoId && v.jogo === m.jogo),
    ),
    "DIREITOS_INTEGRIDADE",
    "As referências vivas da recuperação mudaram.",
  );
  return mapa;
}

async function lerFontePersistidaDaOperacao(tx: Transacao, op: typeof operations.$inferSelect) {
  const [fonte] = await tx
    .select({ origem: sources, execucao: runs })
    .from(sources)
    .innerJoin(runs, and(eq(runs.id, sources.runId), eq(runs.ledgerId, sources.ledgerId)))
    .where(
      and(
        eq(sources.operationId, op.id),
        eq(sources.requesterReference, op.requesterUserId),
        eq(sources.planSha256, op.planSha256),
        eq(sources.kind, op.kind),
        eq(sources.ledgerId, op.ledgerId),
      ),
    );
  return fonte;
}

/** Read/validation only. This does NOT authenticate the external prefix or
 * authorize native effects, mint authority, finish the run or admit traffic. */
export async function lerPlanoHistoricoRecuperado(
  tx: Transacao,
  op: typeof operations.$inferSelect,
) {
  assertAllowed(
    op.preparationId === null && op.recoverySourceId !== null && op.recoverySourceId === op.id,
    "DIREITOS_INTEGRIDADE",
    "Proveniência de recuperação ausente.",
  );
  const fonte = await lerFontePersistidaDaOperacao(tx, op);
  assertAllowed(
    fonte && fonte.execucao.frozenHeadSha256 === op.admittedHeadSha256,
    "DIREITOS_INTEGRIDADE",
    "A fonte histórica exige revisão.",
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
  const mapa = await conferirMapaHistoricoDeMundos(tx, plano, fonte.origem.worldMap);
  return {
    plano,
    mapa,
    execucao: fonte.execucao,
    importadaEm: fonte.origem.importedAt,
    execucaoAutorizada: false as const,
  };
}

/** Historical provenance plus original MAC and complete subject/world scope.
 * A frozen-prefix/private-cluster coordinator is still required for effects. */
export async function conferirIntencaoHistoricaRecuperada(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
) {
  const historica = await lerPlanoHistoricoRecuperado(tx, op);
  const selecionados = await tx
    .select({ id: subjects.profileReference })
    .from(subjects)
    .where(eq(subjects.operationId, op.id))
    .orderBy(subjects.profileReference)
    .limit(257);
  const conferida = conferirIntencaoDoPlano(
    op,
    historica.plano,
    selecionados,
    assinatura,
    historica.mapa.map((m) => ({ id: m.mundoReferencia, jogo: m.jogo })),
  );
  assertAllowed(
    op.ledgerEpoch <= historica.execucao.frozenEpoch,
    "DIREITOS_INTEGRIDADE",
    "A época da intenção excede a cerca histórica.",
  );
  return { ...historica, intencao: conferida.intencao };
}

/** Read-only comparison for a native-origin operation that was already in the
 * dump. Its preparation/admission/completion are NEVER rewritten as a fresh
 * import. The caller must separately authenticate membership of the exact old
 * admitted header, then bind the proof to an actual private execution scope. */
export async function conferirFonteNativaRecuperada(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  escopo: { execucaoId: string; cercaSha256: string },
) {
  const preparacao = await lerPreparacaoInterativaDaOperacao(tx, op),
    fonte = await lerFontePersistidaDaOperacao(tx, op);
  assertAllowed(
    fonte &&
      fonte.execucao.id === escopo.execucaoId &&
      fonte.execucao.state === "replaying" &&
      fonte.execucao.frozenHeadSha256 === escopo.cercaSha256 &&
      op.ledgerEpoch <= fonte.execucao.frozenEpoch &&
      (op.state === "admitted" || op.state === "running" || op.state === "completed") &&
      op.admittedHeadSha256 !== null &&
      op.admittedAt !== null,
    "DIREITOS_INTEGRIDADE",
    "A admissão nativa exige conferência histórica.",
  );
  const selecionados = await tx
    .select({ id: subjects.profileReference })
    .from(subjects)
    .where(eq(subjects.operationId, op.id))
    .orderBy(subjects.profileReference)
    .limit(257);
  const conferida = conferirIntencaoNativa(
    op,
    preparacao,
    selecionados,
    assinatura,
    await referenciasDeMundosDaOperacao(tx, op.id),
  );
  const planoExterno = lerPlanoDeDireitos(
    {
      requesterUserId: fonte.origem.requesterReference,
      kind: fonte.origem.kind,
      planSha256: fonte.origem.planSha256,
      plan: fonte.origem.plan,
    },
    op.requesterUserId,
  );
  assertAllowed(
    isDeepStrictEqual(conferida.plano, planoExterno),
    "DIREITOS_INTEGRIDADE",
    "O plano externo não corresponde à preparação nativa.",
  );
  const mapa = await conferirMapaHistoricoDeMundos(tx, planoExterno, fonte.origem.worldMap);
  return {
    ...conferida,
    mapa,
    execucao: fonte.execucao,
    admissaoPersistida: {
      operacaoId: op.id,
      revisao: op.revision,
      sha256: op.intentSha256,
      cabecalhoSha256: op.admittedHeadSha256,
    },
    origemNativaPreservada: true as const,
    execucaoAutorizada: false as const,
  };
}
