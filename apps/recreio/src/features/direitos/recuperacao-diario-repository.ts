import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, db, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { ContaIdSchema, MundoIdSchema } from "@informach/recreio";
import { type ResumoDoMundo, ResumoDoMundoSchema } from "@informach/recreio/contrato";
import { serializarContaNativa } from "@/features/account/serializacao-repository";
import { travarColetaDeObjetos } from "@/features/backup/captura-repository";
import { limitesDoJogo } from "@/features/jogos/config";
import { armazenamentoPg } from "@/features/posse/armazenamento-repository";
import {
  lerMaterial,
  type MaterialDeRecuperacao,
  montarMaterial,
  type PedidoDeRecuperacao,
  RecusaDeRecuperacao,
} from "@/features/recuperacao/repository";
import { AppError, assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { type CoordenacaoDeEfeitos, comEfeitoNativoDeDireitos } from "./efeitos-repository";
import { lerPreparacaoInterativaDaOperacao } from "./fonte-intencao-repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { referenciasDeMundosDaOperacao } from "./intencao-repository";

/** Preparação otimista, sem simulação/gzip/rede sob SQL. A impressão do material
 * e a operação são relidas antes da gravação: dois workers podem preparar,
 * mas só o primeiro que ainda tem a mesma revisão pode confirmar a foto. */
export function prepararRecuperacaoDeDireitos(config: CoordenacaoDeEfeitos) {
  return comEfeitoNativoDeDireitos(config, "recuperacao", async (tx, op) => {
    await serializarContaNativa(tx, ContaIdSchema.parse(op.requesterUserId));
    const [alvo] = await tx
      .select({ passo: worlds, mundo: spaces })
      .from(worlds)
      .innerJoin(spaces, eq(spaces.id, worlds.spaceId))
      .where(
        and(
          eq(worlds.operationId, op.id),
          eq(worlds.phase, "draining"),
          sql`(${spaces.revision}>0 or ${spaces.journalSeq}>0)`,
          sql`not exists(select 1 from recreio.space_leases l where l.space_id=${spaces.id} and l.released_at is null)`,
          sql`not exists(select 1 from recreio.space_snapshots f where f.space_id=${spaces.id} and f.revision=${spaces.revision} and f.journal_seq=${spaces.journalSeq})`,
        ),
      )
      .orderBy(worlds.spaceId)
      .limit(1)
      .for("update");
    assertAllowed(
      alvo &&
        alvo.mundo.rightsOperationId === op.id &&
        alvo.mundo.rightsDraining &&
        alvo.mundo.status === "archived" &&
        alvo.mundo.leaseEpoch === alvo.passo.sourceLeaseEpoch &&
        alvo.mundo.managementRevision === alvo.passo.sourceManagementRevision,
      "DIREITOS_INTEGRIDADE",
      "Mundo fora da drenagem consentida.",
    );
    assertAllowed(
      alvo.mundo.gameId === "morada",
      "DIREITOS_DEPENDENCIA",
      "O jogo precisa de um adapter de recuperação.",
    );
    const limite = limitesDoJogo(alvo.mundo.gameId);
    const pedido: PedidoDeRecuperacao = {
      mundoId: MundoIdSchema.parse(alvo.mundo.id),
      jogo: alvo.mundo.gameId,
      revisaoFonte: alvo.mundo.revision,
      revisaoEsperada: alvo.mundo.revision,
      operacaoId: op.id,
      motivo: "retirada_dados",
      fotografiaMaxBytes: limite.fotografiaMaxBytes,
      diarioPendenteMaxBytes: limite.diarioPendenteMaxBytes,
    };
    try {
      const base = await lerMaterial(tx, pedido, "update", op.id);
      return { tipo: "material" as const, operacao: op, pedido, base };
    } catch (erro) {
      if (erro instanceof RecusaDeRecuperacao)
        throw new AppError(
          erro.codigo === "INTEGRIDADE" ? "DIREITOS_INTEGRIDADE" : "DIREITOS_DEPENDENCIA",
          "Material pendente de recuperação.",
        );
      throw erro;
    }
  });
}
export type ReservaDeRecuperacaoDeDireitos = Extract<
  Awaited<ReturnType<typeof prepararRecuperacaoDeDireitos>>,
  { tipo: "material" }
>;
export type ResultadoDeRecuperacaoDeDireitos = {
  bytes: Uint8Array;
  sha256: string;
  tick: number;
  schemaVersion: number;
  resumo: ResumoDoMundo;
};

async function conferirAtual(
  tx: Transacao,
  config: CoordenacaoDeEfeitos,
  r: ReservaDeRecuperacaoDeDireitos,
  material: MaterialDeRecuperacao,
) {
  const livroId = config.assinatura.livroId;
  assertAllowed(
    config.prova.cabecalho.documento.livroId === livroId &&
      config.prova.cabecalho.documento.estado === "aberto" &&
      config.prova.cabecalho.chaveId === config.assinatura.chaveAtiva &&
      config.prova.referencias.some(
        (ref) =>
          ref.operacaoId === r.operacao.id &&
          ref.revisao === r.operacao.revision &&
          ref.sha256 === r.operacao.intentSha256,
      ),
    "DIREITOS_LIVRO",
    "Livro indisponível para recuperação.",
  );
  const [op] = await tx
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.id, r.operacao.id),
        eq(operations.ledgerId, livroId),
        inArray(operations.state, ["admitted", "running"]),
        or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
      ),
    )
    .for("update");
  if (!op) return null;
  assertAllowed(
    op.intentSha256 === r.operacao.intentSha256 && op.signedIntent.equals(r.operacao.signedIntent),
    "DIREITOS_INTEGRIDADE",
    "A intenção nativa mudou.",
  );
  const p = await lerPreparacaoInterativaDaOperacao(tx, op);
  const selecionados = await tx
    .select({ id: subjects.profileReference })
    .from(subjects)
    .where(eq(subjects.operationId, op.id))
    .orderBy(subjects.profileReference);
  conferirIntencaoNativa(
    op,
    p,
    selecionados,
    config.assinatura,
    await referenciasDeMundosDaOperacao(tx, op.id),
  );
  await serializarContaNativa(tx, ContaIdSchema.parse(op.requesterUserId));
  const base = await lerMaterial(tx, r.pedido, "update", op.id);
  try {
    const atual = montarMaterial(
      base,
      base.fonte.origem.tipo === "pg" ? base.fonte.origem.bytes : material.foto.bytes,
    );
    if (atual.impressao !== material.impressao) throw new RecusaDeRecuperacao("MATERIAL_ALTERADO");
  } finally {
    if (base.fonte.origem.tipo === "pg") base.fonte.origem.bytes.fill(0);
    for (const e of base.entradas) e.bytes.fill(0);
  }
  return op;
}
async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}
export async function confirmarRecuperacaoDeDireitos(
  config: CoordenacaoDeEfeitos,
  r: ReservaDeRecuperacaoDeDireitos,
  material: MaterialDeRecuperacao,
  resultado: ResultadoDeRecuperacaoDeDireitos,
) {
  const limite = limitesDoJogo(r.pedido.jogo),
    tick = material.entradas.reduce((n, e) => Math.max(n, e.tick), material.foto.tick);
  assertAllowed(
    resultado.bytes.byteLength > 0 &&
      resultado.bytes.byteLength <= limite.fotografiaMaxBytes &&
      createHash("sha256").update(resultado.bytes).digest("hex") === resultado.sha256 &&
      resultado.schemaVersion === material.foto.schemaVersion &&
      resultado.tick === tick &&
      ResumoDoMundoSchema.safeParse(resultado.resumo).success,
    "DIREITOS_INTEGRIDADE",
    "Resultado de recuperação inválido.",
  );
  return db.transaction(async (tx) => {
    await limites(tx);
    await travarColetaDeObjetos(tx);
    const op = await conferirAtual(tx, config, r, material);
    if (!op) return false;
    const revisao = material.mundo.revision + 1;
    await armazenamentoPg.gravarFotografia(tx, r.pedido.mundoId, {
      revisao,
      cerca: material.mundo.leaseEpoch,
      schemaVersion: resultado.schemaVersion,
      diarioSeq: material.mundo.journalSeq,
      tick: resultado.tick,
      tipo: "hibernate",
      bytes: resultado.bytes,
      sha256: resultado.sha256,
    });
    await tx
      .update(spaces)
      .set({
        revision: revisao,
        schemaVersion: resultado.schemaVersion,
        summary: resultado.resumo,
        updatedAt: AGORA,
      })
      .where(eq(spaces.id, r.pedido.mundoId));
    await tx
      .update(operations)
      .set({ nextAttemptAt: AGORA, updatedAt: AGORA })
      .where(eq(operations.id, op.id));
    await logAuditEventStrict(
      "recreio.rights_world_recovered",
      op.requesterUserId,
      {
        app: "recreio",
        operationId: op.id,
        worldCount: 1,
        journalEntryCount: material.entradas.length,
      },
      { writer: tx },
    );
    return true;
  });
}
export function revisarRecuperacaoDeDireitos(
  config: CoordenacaoDeEfeitos,
  r: ReservaDeRecuperacaoDeDireitos,
  material: MaterialDeRecuperacao,
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const op = await conferirAtual(tx, config, r, material);
    if (!op) return false;
    await tx
      .update(operations)
      .set({
        state: "review",
        reviewCode: "integrity",
        leaseToken: null,
        leaseUntil: null,
        updatedAt: AGORA,
      })
      .where(eq(operations.id, op.id));
    await logAuditEventStrict(
      "recreio.rights_processing_blocked",
      op.requesterUserId,
      { app: "recreio", operationId: op.id, kind: op.kind, reasonCode: "integrity" },
      { writer: tx },
    );
    return true;
  });
}
