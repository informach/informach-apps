import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioSnapshotObjectDeliveries as deliveries,
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import { travarColetaDeObjetos } from "@/features/backup/captura-repository";
import { limitesDoJogo } from "@/features/jogos/config";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import type { conferirPrefixoDoLivro } from "./livro/leitura";

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
export function reservarFotografiaDeDireitos(config: {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  prova: Awaited<ReturnType<typeof conferirPrefixoDoLivro>>;
}) {
  const livroId = z.uuid().parse(config.assinatura.livroId);
  assertAllowed(
    config.prova.cabecalho.documento.livroId === livroId &&
      config.prova.cabecalho.documento.estado === "aberto",
    "DIREITOS_LIVRO",
    "Livro indisponível para execução.",
  );
  const token = randomUUID();
  return db.transaction(async (tx) => {
    await limites(tx);
    const [operacao] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.ledgerId, livroId),
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
    const [preparacao] = await tx
      .select()
      .from(preparations)
      .where(eq(preparations.id, operacao.preparationId));
    const selecionados = await tx
      .select({ id: subjects.profileReference })
      .from(subjects)
      .where(eq(subjects.operationId, operacao.id))
      .orderBy(subjects.profileReference);
    conferirIntencaoNativa(operacao, preparacao, selecionados, config.assinatura);
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
      return { tipo: "fotos_prontas" as const, operacaoId: operacao.id };
    }
    const fonte = await armazenamentoPg.prepararLeituraDaFotografia(
      tx,
      MundoIdSchema.parse(atual.id),
      limitesDoJogo(atual.gameId).fotografiaMaxBytes,
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

export type FotografiaReservadaDeDireitos = Extract<
  NonNullable<Awaited<ReturnType<typeof reservarFotografiaDeDireitos>>>,
  { tipo: "fotografia" }
>;

export async function revisarFotografiaDeDireitos(
  reserva: FotografiaReservadaDeDireitos,
  motivo: "integrity" | "dependency",
) {
  const linhas = await db
    .update(operations)
    .set({
      state: "review",
      reviewCode: motivo,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: AGORA,
    })
    .where(
      and(
        eq(operations.id, reserva.operacao.id),
        eq(operations.state, "running"),
        eq(operations.leaseToken, reserva.token),
        sql`${operations.leaseUntil}>${AGORA}`,
      ),
    )
    .returning({ id: operations.id });
  return linhas.length === 1;
}

/** Commit único de bytes PG, desvínculo do objeto antigo e cursor. Não altera
 * formato, revisão, relógio ou journalSeq. Objeto antigo segue retenção/holds e
 * GC, sem DELETE externo dentro da transação nem perda de PUT em voo. */
export function confirmarFotografiaDeDireitos(
  reserva: FotografiaReservadaDeDireitos,
  resultado: {
    bytes: Uint8Array;
    sha256: string;
    schemaVersion: number;
    tick: number;
  },
) {
  const teto = limitesDoJogo(reserva.mundo.gameId).fotografiaMaxBytes;
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
  return db.transaction(async (tx) => {
    await limites(tx);
    await travarColetaDeObjetos(tx);
    const [operacao] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.id, reserva.operacao.id),
          eq(operations.state, "running"),
          eq(operations.leaseToken, reserva.token),
          sql`${operations.leaseUntil}>${AGORA}`,
        ),
      )
      .for("update");
    assertAllowed(operacao, "DIREITOS_POSSE", "A reserva de processamento terminou.");
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
    await tx
      .update(worlds)
      .set({ snapshotCursor: reserva.fonte.meta.revisao, phase: "snapshots" })
      .where(and(eq(worlds.operationId, operacao.id), eq(worlds.spaceId, reserva.mundo.id)));
    await tx
      .update(operations)
      .set({ leaseToken: null, leaseUntil: null, updatedAt: AGORA })
      .where(eq(operations.id, operacao.id));
    await logAuditEventStrict(
      "recreio.rights_photo_processed",
      operacao.requesterUserId,
      { app: "recreio", operationId: operacao.id, gameId: reserva.mundo.gameId, photoCount: 1 },
      { writer: tx },
    );
    return { processada: true as const, operacaoId: operacao.id };
  });
}
