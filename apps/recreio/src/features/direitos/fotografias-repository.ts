import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioSpaceJournal as journal,
  recreioRightsOperations as operations,
  recreioRightsWorldProjection,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { type ResumoDoMundo, ResumoDoMundoSchema } from "@informach/recreio/contrato";
import { z } from "zod";
import { travarColetaDeObjetos } from "@/features/backup/captura-repository";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  bancoDaCoordenacao,
  type CoordenacaoDeEfeitos,
  conferirCoordenacaoDeDireitos,
  conferirIntencaoDaCoordenacao,
  escopoDaCoordenacao,
  resolverLimitesDaCoordenacao,
} from "./coordenacao-repository";
import { comEfeitoNativoDeDireitos } from "./efeitos-repository";
import {
  conferirFinanceiroDosEfeitos,
  escopoFinanceiroDosEfeitos,
} from "./encerramento-efeitos-repository";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}
function conferirMundo(
  mundo: typeof spaces.$inferSelect | undefined,
  passo: typeof worlds.$inferSelect,
) {
  assertAllowed(
    mundo &&
      mundo.rightsOperationId === passo.operationId &&
      !mundo.rightsDraining &&
      mundo.status === "archived" &&
      mundo.revision === passo.sourceRevision &&
      mundo.journalSeq === passo.sourceJournalSeq &&
      mundo.leaseEpoch === passo.sourceLeaseEpoch + 1 &&
      mundo.managementRevision === passo.sourceManagementRevision + 1,
    "DIREITOS_INTEGRIDADE",
    "A barreira do mundo precisa de revisão.",
  );
  return mundo;
}

/** No máximo uma foto por lease. Só prepara referência limitada, sem rede,
 * gzip ou simulação na transação. O worker operacional verifica o livro antes
 * de transformar/publicar. Operações sem mundos seguem o executor de domínio. */
type CoordenacaoDuravel = CoordenacaoDeEfeitos;
export async function reservarFotografiaDeDireitos(config: CoordenacaoDuravel) {
  const livroId = z.uuid().parse(config.assinatura.livroId);
  conferirCoordenacaoDeDireitos(config);
  const banco = bancoDaCoordenacao(config),
    limitesDoManifesto = await resolverLimitesDaCoordenacao(config);
  const token = randomUUID();
  return banco.transaction(async (tx) => {
    await limites(tx);
    const [operacao] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.ledgerId, livroId),
          escopoDaCoordenacao(config),
          escopoFinanceiroDosEfeitos(),
          inArray(operations.state, ["admitted", "running"]),
          sql`${operations.nextAttemptAt}<=${AGORA}`,
          or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
          sql`exists(select 1 from ${worlds} where ${worlds.operationId}=${operations.id} and ${worlds.phase} in ('frozen','snapshots'))`,
        ),
      )
      .orderBy(operations.nextAttemptAt, operations.id)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!operacao) return null;
    assertAllowed(
      config.prova.referencias.some(
        (r) =>
          r.operacaoId === operacao.id &&
          r.revisao === operacao.revision &&
          r.sha256 === operacao.intentSha256,
      ),
      "DIREITOS_LIVRO",
      "Intenção não admitida no prefixo verificado.",
    );
    const selecionados = await tx
      .select({ id: subjects.profileReference })
      .from(subjects)
      .where(eq(subjects.operationId, operacao.id))
      .orderBy(subjects.profileReference);
    const { plano } = await conferirIntencaoDaCoordenacao(tx, operacao, config);
    await conferirFinanceiroDosEfeitos(tx, operacao, plano);
    const [pista] = await tx
      .select()
      .from(worlds)
      .where(
        and(eq(worlds.operationId, operacao.id), inArray(worlds.phase, ["frozen", "snapshots"])),
      )
      .orderBy(worlds.spaceId)
      .limit(1);
    assertAllowed(pista, "DIREITOS_INTEGRIDADE", "Etapa do mundo ausente.");
    const [mundo] = await tx
      .select()
      .from(spaces)
      .where(eq(spaces.id, pista.spaceId))
      .for("update");
    const atual = conferirMundo(mundo, pista);
    const [foto] = await tx
      .select({ revision: snapshots.revision })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.spaceId, atual.id),
          sql`${snapshots.revision}>${pista.snapshotCursor}`,
          sql`${snapshots.revision}<=${pista.sourceRevision}`,
        ),
      )
      .orderBy(snapshots.revision)
      .limit(1);
    if (!foto) {
      assertAllowed(
        pista.snapshotCursor === pista.sourceRevision,
        "DIREITOS_INTEGRIDADE",
        "A última fotografia não foi processada.",
      );
      await tx
        .update(worlds)
        .set({ phase: "dependencies" })
        .where(and(eq(worlds.operationId, operacao.id), eq(worlds.spaceId, atual.id)));
      await tx
        .update(operations)
        .set({ nextAttemptAt: AGORA, updatedAt: AGORA })
        .where(eq(operations.id, operacao.id));
      return { tipo: "fotos_prontas" as const, operacaoId: operacao.id };
    }
    const fonte = await armazenamentoPg.prepararLeituraDaFotografia(
      tx,
      MundoIdSchema.parse(atual.id),
      limitesDoManifesto(atual.gameId).fotografiaMaxBytes,
      foto.revision,
    );
    assertAllowed(fonte, "DIREITOS_INTEGRIDADE", "Fotografia não disponível.");
    await tx
      .update(operations)
      .set({
        state: "running",
        leaseToken: token,
        leaseUntil: sql`${AGORA}+interval '2 minutes'`,
        attempts: sql`${operations.attempts}+1`,
        updatedAt: AGORA,
      })
      .where(eq(operations.id, operacao.id));
    return {
      tipo: "fotografia" as const,
      operacao,
      preparacao,
      selecionados,
      mundo: atual,
      passo: pista,
      fonte,
      token,
    };
  });
}

/** O diário já materializado na última foto deixa de ser necessário à abertura
 * atual. Remove somente o prefixo coberto, em lotes de 100, preservando o
 * journalSeq autoritativo e as fotos históricas/fixadas já tratadas. Não reescreve
 * fatos individuais nem atribui ao simulador ações de uma pessoa retirada. */
export async function compactarDiarioDeDireitos(config: CoordenacaoDuravel) {
  const limitesDoManifesto = await resolverLimitesDaCoordenacao(config);
  return comEfeitoNativoDeDireitos(config, "diario", async (tx, op) => {
    const [passo] = await tx
      .select()
      .from(worlds)
      .where(
        and(
          eq(worlds.operationId, op.id),
          eq(worlds.phase, "dependencies"),
          sql`exists(select 1 from ${journal} where ${journal.spaceId}=${worlds.spaceId})`,
        ),
      )
      .orderBy(worlds.spaceId)
      .limit(1);
    assertAllowed(passo, "DIREITOS_INTEGRIDADE", "Etapa do mundo ausente.");
    const [mundo] = await tx
      .select()
      .from(spaces)
      .where(eq(spaces.id, passo.spaceId))
      .for("update");
    const atual = conferirMundo(mundo, passo);
    assertAllowed(
      passo.snapshotCursor === passo.sourceRevision && passo.sourceRevision > 0,
      "DIREITOS_INTEGRIDADE",
      "Fotografias ainda não concluídas.",
    );
    const [foto] = await tx
      .select({
        data: snapshots.data,
        bytes: snapshots.byteSize,
        sha256: snapshots.sha256,
        diario: snapshots.journalSeq,
      })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.spaceId, atual.id),
          eq(snapshots.revision, passo.sourceRevision),
          eq(snapshots.storage, "pg"),
          sql`octet_length(${snapshots.data})=${snapshots.byteSize} and ${snapshots.byteSize}<=${limitesDoManifesto(atual.gameId).fotografiaMaxBytes}`,
        ),
      );
    assertAllowed(
      foto?.data &&
        foto.diario === passo.sourceJournalSeq &&
        foto.data.length === foto.bytes &&
        createHash("sha256").update(foto.data).digest("hex") === foto.sha256,
      "DIREITOS_INTEGRIDADE",
      "Última fotografia inconsistente.",
    );
    const [semCobertura] = await tx
      .select({ seq: journal.seq })
      .from(journal)
      .where(and(eq(journal.spaceId, atual.id), sql`${journal.seq}>${passo.sourceJournalSeq}`))
      .limit(1);
    assertAllowed(!semCobertura, "DIREITOS_INTEGRIDADE", "Há diário sem cobertura da fotografia.");
    const lote = await tx
      .select({ seq: journal.seq })
      .from(journal)
      .where(and(eq(journal.spaceId, atual.id), sql`${journal.seq}<=${passo.sourceJournalSeq}`))
      .orderBy(journal.seq)
      .limit(100);
    const removidas = lote.length
      ? await tx
          .delete(journal)
          .where(
            and(
              eq(journal.spaceId, atual.id),
              inArray(
                journal.seq,
                lote.map((l) => l.seq),
              ),
            ),
          )
          .returning({ seq: journal.seq })
      : [];
    if (removidas.length)
      await logAuditEventStrict(
        "recreio.rights_journal_compacted",
        op.requesterUserId,
        { app: "recreio", operationId: op.id, gameId: atual.gameId, entryCount: removidas.length },
        { writer: tx },
      );
    return {
      situacao: "diario_compactado" as const,
      operacaoId: op.id,
      entradas: removidas.length,
    };
  });
}

export type FotografiaReservadaDeDireitos = Extract<
  NonNullable<Awaited<ReturnType<typeof reservarFotografiaDeDireitos>>>,
  { tipo: "fotografia" }
>;

export async function revisarFotografiaDeDireitos(
  reserva: FotografiaReservadaDeDireitos,
  motivo: "integrity" | "dependency",
  config: CoordenacaoDuravel,
) {
  const banco = bancoDaCoordenacao(config);
  return banco.transaction(async (tx) => {
    await limites(tx);
    const posse = and(
      eq(operations.id, reserva.operacao.id),
      eq(operations.state, "running"),
      eq(operations.kind, reserva.operacao.kind),
      eq(operations.leaseToken, reserva.token),
      sql`${operations.leaseUntil}>${AGORA}`,
      escopoDaCoordenacao(config),
    );
    const [op] = await tx.select().from(operations).where(posse).for("update");
    if (!op) return false;
    assertAllowed(
      op.intentSha256 === reserva.operacao.intentSha256 &&
        op.signedIntent.equals(reserva.operacao.signedIntent),
      "DIREITOS_INTEGRIDADE",
      "A intenção original mudou.",
    );
    await conferirIntencaoDaCoordenacao(tx, op, config);
    const linhas = await tx
      .update(operations)
      .set({
        state: "review",
        reviewCode: motivo,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: AGORA,
      })
      .where(posse)
      .returning({ id: operations.id });
    if (!linhas.length) return false;
    await logAuditEventStrict(
      "recreio.rights_processing_blocked",
      op.requesterUserId,
      { app: "recreio", operationId: op.id, kind: op.kind, reasonCode: motivo },
      { writer: tx },
    );
    return true;
  });
}

/** Commit único de bytes PG, desvínculo do objeto antigo e cursor. Não altera
 * formato, revisão, relógio ou journalSeq. Objeto antigo segue retenção/holds e
 * GC, sem DELETE externo dentro da transação nem perda de PUT em voo. */
export async function confirmarFotografiaDeDireitos(
  reserva: FotografiaReservadaDeDireitos,
  resultado: {
    bytes: Uint8Array;
    sha256: string;
    schemaVersion: number;
    tick: number;
    resumo: ResumoDoMundo;
  },
  config: CoordenacaoDuravel,
) {
  const banco = bancoDaCoordenacao(config),
    limitesDoManifesto = await resolverLimitesDaCoordenacao(config);
  const teto = limitesDoManifesto(reserva.mundo.gameId).fotografiaMaxBytes;
  assertAllowed(
    resultado.bytes instanceof Uint8Array &&
      resultado.bytes.length > 0 &&
      resultado.bytes.length <= teto &&
      resultado.schemaVersion === reserva.fonte.meta.schemaVersion &&
      resultado.tick === reserva.fonte.meta.tick &&
      createHash("sha256").update(resultado.bytes).digest("hex") === resultado.sha256,
    "DIREITOS_INTEGRIDADE",
    "Resultado da fotografia inconsistente.",
  );
  const bytes = Buffer.from(resultado.bytes);
  const resumo = ResumoDoMundoSchema.parse(resultado.resumo);
  try {
    return await banco.transaction(async (tx) => {
      await limites(tx);
      await travarColetaDeObjetos(tx);
      const [operacao] = await tx
        .select()
        .from(operations)
        .where(
          and(
            eq(operations.id, reserva.operacao.id),
            escopoDaCoordenacao(config),
            eq(operations.state, "running"),
            eq(operations.kind, reserva.operacao.kind),
            eq(operations.leaseToken, reserva.token),
            sql`${operations.leaseUntil}>${AGORA}`,
          ),
        )
        .for("update");
      assertAllowed(operacao, "DIREITOS_POSSE", "A reserva de processamento terminou.");
      assertAllowed(
        config.assinatura.livroId === operacao.ledgerId &&
          operacao.intentSha256 === reserva.operacao.intentSha256 &&
          operacao.signedIntent.equals(reserva.operacao.signedIntent) &&
          config.prova.referencias.some(
            (r) =>
              r.operacaoId === operacao.id &&
              r.revisao === operacao.revision &&
              r.sha256 === operacao.intentSha256,
          ),
        "DIREITOS_INTEGRIDADE",
        "A intenção original precisa de revisão.",
      );
      const selecionados = await tx
        .select({ id: subjects.profileReference })
        .from(subjects)
        .where(eq(subjects.operationId, operacao.id))
        .orderBy(subjects.profileReference);
      const { plano } = await conferirIntencaoDaCoordenacao(tx, operacao, config);
      assertAllowed(
        selecionados.length === reserva.selecionados.length &&
          selecionados.every((p, i) => p.id === reserva.selecionados[i]?.id),
        "DIREITOS_INTEGRIDADE",
        "A seleção pessoal mudou.",
      );
      await conferirFinanceiroDosEfeitos(tx, operacao, plano);
      const [mundo] = await tx
        .select()
        .from(spaces)
        .where(eq(spaces.id, reserva.mundo.id))
        .for("update");
      conferirMundo(mundo, reserva.passo);
      const [passo] = await tx
        .select()
        .from(worlds)
        .where(and(eq(worlds.operationId, operacao.id), eq(worlds.spaceId, reserva.mundo.id)))
        .for("update");
      assertAllowed(
        passo &&
          passo.snapshotCursor === reserva.passo.snapshotCursor &&
          ["frozen", "snapshots"].includes(passo.phase),
        "DIREITOS_POSSE",
        "A etapa de processamento mudou.",
      );
      const [foto] = await tx
        .select({ id: snapshots.id })
        .from(snapshots)
        .where(
          and(
            eq(snapshots.id, reserva.fonte.id),
            eq(snapshots.spaceId, reserva.mundo.id),
            eq(snapshots.revision, reserva.fonte.meta.revisao),
            eq(snapshots.sha256, reserva.fonte.meta.sha256),
            eq(snapshots.byteSize, reserva.fonte.meta.bytes),
            eq(snapshots.schemaVersion, reserva.fonte.meta.schemaVersion),
            eq(snapshots.tick, reserva.fonte.meta.tick),
            eq(snapshots.journalSeq, reserva.fonte.meta.diarioSeq),
          ),
        )
        .for("update");
      assertAllowed(foto, "DIREITOS_INTEGRIDADE", "A fotografia de origem mudou.");
      await tx
        .update(deliveries)
        .set({
          snapshotId: null,
          detachedAt: AGORA,
          state: "retiring",
          envelope: null,
          reviewReason: null,
          nextAttemptAt: sql`${AGORA}+interval '15 minutes'`,
        })
        .where(eq(deliveries.snapshotId, foto.id));
      await tx
        .update(snapshots)
        .set({
          storage: "pg",
          data: bytes,
          objectKey: null,
          byteSize: bytes.length,
          sha256: resultado.sha256,
        })
        .where(eq(snapshots.id, foto.id));
      if (reserva.fonte.meta.revisao === reserva.passo.sourceRevision) {
        const summary = sql`${JSON.stringify(resumo)}::jsonb`;
        await tx
          .update(spaces)
          .set({
            summary,
            rightsFrozenState: recreioRightsWorldProjection({ ...spaces, summary }),
            updatedAt: AGORA,
          })
          .where(eq(spaces.id, reserva.mundo.id));
      }
      await tx
        .update(worlds)
        .set({ snapshotCursor: reserva.fonte.meta.revisao, phase: "snapshots" })
        .where(and(eq(worlds.operationId, operacao.id), eq(worlds.spaceId, reserva.mundo.id)));
      await tx
        .update(operations)
        .set({ leaseToken: null, leaseUntil: null, nextAttemptAt: AGORA, updatedAt: AGORA })
        .where(eq(operations.id, operacao.id));
      await logAuditEventStrict(
        "recreio.rights_photo_processed",
        operacao.requesterUserId,
        { app: "recreio", operationId: operacao.id, gameId: reserva.mundo.gameId, photoCount: 1 },
        { writer: tx },
      );
      return { processada: true as const, operacaoId: operacao.id };
    });
  } finally {
    bytes.fill(0);
  }
}
