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
import { conferirIntencaoDoPlano } from "./intencao-persistida";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { lerPlanoDeDireitos } from "./plano-persistido";

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
  const mapa = Mapa.parse(fonte.origem.worldMap);
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
