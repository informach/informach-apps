import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, type Database, db, eq, isNull, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { z } from "zod";
import {
  CONSULTA_CAPACIDADES_TEMPORARIAS,
  CONSULTA_CONVITES_PENDENTES,
  CONSULTA_DESTINO_PRIVADO,
  conferirDestinoPrivado,
} from "@/features/recuperacao/cluster-privado";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import {
  conferirIntencaoHistoricaRecuperada,
  conferirMapaHistoricoDeMundos,
  lerPreparacaoInterativaDaOperacao,
} from "./fonte-intencao-repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { referenciasDeMundosDaOperacao } from "./intencao-repository";
import type { criarArmazenamentoDoLivro } from "./livro/armazenamento";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { conferirPrefixoDoLivro } from "./livro/leitura";
import { reaplicarPlanosConsentidos } from "./livro/reaplicacao-planos";

export type CoordenacaoDeEfeitos = {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  prova: Awaited<ReturnType<typeof conferirPrefixoDoLivro>>;
};
type Privada = { banco: Database; execucaoId: string; cerca: string };
const privadas = new WeakMap<CoordenacaoDeEfeitos, Privada>(),
  emitidas = new WeakSet<CoordenacaoDeEfeitos>(),
  ocupadas = new WeakSet<Database>();
function contexto(config: CoordenacaoDeEfeitos) {
  const privado = privadas.get(config);
  assertAllowed(
    !emitidas.has(config) || privado,
    "DIREITOS_LIVRO",
    "A coordenação privada terminou.",
  );
  return privado;
}
/** A normal config cannot opt into frozen execution with a boolean or a copied
 * object. Only the scoped factory below registers an actual private connection. */
export function conferirCoordenacaoDeDireitos(config: CoordenacaoDeEfeitos) {
  const privado = contexto(config),
    head = config.prova.cabecalho;
  assertAllowed(
    head.documento.livroId === config.assinatura.livroId &&
      (privado
        ? head.documento.estado === "congelado" && head.sha256 === privado.cerca
        : head.documento.estado === "aberto" && head.chaveId === config.assinatura.chaveAtiva),
    "DIREITOS_LIVRO",
    "Livro indisponível para execução.",
  );
}
export function bancoDaCoordenacao(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  return contexto(config)?.banco ?? db;
}
/** Private scope is restricted to withdrawn profiles until the historical
 * financial coordinator is implemented. Closure is never silently settled. */
export function escopoDaCoordenacao(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  return privado
    ? sql`(${operations.kind}='retirar_perfil' and
    ${operations.admittedHeadSha256}=${privado.cerca} and exists(
      select 1 from recreio.rights_recovery_sources s join recreio.rights_recovery_runs r
      on r.id=s.run_id and r.ledger_id=s.ledger_id
      where s.operation_id=${operations.recoverySourceId} and s.operation_id=${operations.id}
        and r.id=${privado.execucaoId}::uuid and r.state='replaying' and r.frozen_head_sha256=${privado.cerca}))`
    : isNull(operations.recoverySourceId);
}
export async function conferirIntencaoDaCoordenacao(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  config: CoordenacaoDeEfeitos,
) {
  conferirCoordenacaoDeDireitos(config);
  assertAllowed(
    config.prova.referencias.some(
      (r) => r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
    ),
    "DIREITOS_LIVRO",
    "Intenção ausente do prefixo verificado.",
  );
  const privado = contexto(config);
  if (privado) {
    const lida = await conferirIntencaoHistoricaRecuperada(tx, op, config.assinatura);
    assertAllowed(
      lida.execucao.id === privado.execucaoId &&
        lida.execucao.state === "replaying" &&
        op.admittedHeadSha256 === privado.cerca &&
        op.kind === "retirar_perfil" &&
        isDeepStrictEqual(
          await referenciasDeMundosDaOperacao(tx, op.id),
          lida.mapa
            .filter((m) => m.mundoVivoId !== null)
            .map((m) => ({ id: m.mundoReferencia, jogo: m.jogo })),
        ),
      "DIREITOS_INTEGRIDADE",
      "A operação não pertence à coordenação privada.",
    );
    return { plano: lida.plano, intencao: lida.intencao };
  }
  const preparacao = await lerPreparacaoInterativaDaOperacao(tx, op),
    selecionados = await tx
      .select({ id: subjects.profileReference })
      .from(subjects)
      .where(eq(subjects.operationId, op.id))
      .orderBy(subjects.profileReference)
      .limit(257);
  return conferirIntencaoNativa(
    op,
    preparacao,
    selecionados,
    config.assinatura,
    await referenciasDeMundosDaOperacao(tx, op.id),
  );
}

async function comLeituraLimitada<T>(banco: Database, executar: (tx: Transacao) => Promise<T>) {
  return banco.transaction(
    async (tx) => {
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      return executar(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
async function conferirCapacidades(banco: Database) {
  return comLeituraLimitada(banco, async (tx) => {
    const [destino] = await tx.execute(sql.raw(CONSULTA_DESTINO_PRIVADO));
    conferirDestinoPrivado(destino);
    for (const consulta of [CONSULTA_CONVITES_PENDENTES, CONSULTA_CAPACIDADES_TEMPORARIAS]) {
      const [r] = await tx.execute<{ quantidade: number }>(sql.raw(consulta));
      assertAllowed(
        r?.quantidade === 0,
        "DIREITOS_INTEGRIDADE",
        "Capacidades antigas ainda existem no destino.",
      );
    }
  });
}
/** Scoped capability: complete authenticated prefix/plans and staged sources,
 * actual private PG/socket/version, revoked capabilities and a distinct next
 * key. No native operation, consent, finance, erasure or traffic is created by
 * this factory. A returned/retained config expires when the callback ends. */
export async function comCoordenacaoPrivadaDeDireitos<T>(config: {
  banco: Database;
  execucaoId: string;
  capturaSha256: string;
  fonte: string;
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  maxEntradas: number;
  maxBytesPlanos: number;
  tempoLimiteMs: number;
  signal?: AbortSignal;
  executar: (coordenacao: CoordenacaoDeEfeitos) => Promise<T>;
}) {
  z.strictObject({
    execucaoId: z.uuid(),
    capturaSha256: z.string().regex(/^[a-f0-9]{64}$/),
    fonte: z.string().regex(/^[a-f0-9]{40}$/),
    tempoLimiteMs: z.number().int().min(1).max(900000),
  }).parse({
    execucaoId: config.execucaoId,
    capturaSha256: config.capturaSha256,
    fonte: config.fonte,
    tempoLimiteMs: config.tempoLimiteMs,
  });
  assertAllowed(
    !ocupadas.has(config.banco),
    "DIREITOS_LIVRO",
    "A conexão já tem coordenação privada.",
  );
  ocupadas.add(config.banco);
  let emitida: CoordenacaoDeEfeitos | undefined;
  try {
    await conferirCapacidades(config.banco);
    const signal = config.signal
      ? AbortSignal.any([config.signal, AbortSignal.timeout(config.tempoLimiteMs)])
      : AbortSignal.timeout(config.tempoLimiteMs);
    const prova = await conferirPrefixoDoLivro({
      storage: config.storage,
      maxEntradas: config.maxEntradas,
      tempoLimiteMs: config.tempoLimiteMs,
      signal,
    });
    const [run] = await comLeituraLimitada(config.banco, async (tx) =>
      tx.select().from(runs).where(eq(runs.id, config.execucaoId)),
    );
    const head = prova.cabecalho,
      doc = head.documento;
    assertAllowed(
      run &&
        run.state === "replaying" &&
        run.ledgerId === config.assinatura.livroId &&
        run.captureSha256 === config.capturaSha256 &&
        run.source === config.fonte &&
        run.frozenHeadSha256 === head.sha256 &&
        doc.estado === "congelado" &&
        doc.livroId === run.ledgerId &&
        doc.epoca === run.frozenEpoch &&
        head.chaveId === run.frozenSigningKeyId &&
        run.nextSigningKeyId === config.assinatura.chaveAtiva &&
        !doc.chavesUtilizadas.includes(config.assinatura.chaveAtiva) &&
        new Set(prova.referencias.map((r) => r.operacaoId)).size === prova.referencias.length,
      "DIREITOS_INTEGRIDADE",
      "A execução não corresponde à captura e à cerca históricas.",
    );
    await reaplicarPlanosConsentidos({
      storage: config.storage,
      maxEntradas: config.maxEntradas,
      maxBytesPlanos: config.maxBytesPlanos,
      tempoLimiteMs: config.tempoLimiteMs,
      signal,
      cercaSha256: head.sha256,
      aplicar: async (i, plano) =>
        config.banco.transaction(
          async (tx) => {
            await tx.execute(sql`set local statement_timeout='5s'`);
            await tx.execute(sql`set local lock_timeout='2s'`);
            await tx.execute(sql`set local transaction_timeout='15s'`);
            const [fonte] = await tx
              .select()
              .from(sources)
              .where(and(eq(sources.operationId, i.operacaoId), eq(sources.runId, run.id)));
            assertAllowed(
              fonte &&
                fonte.ledgerId === i.livroId &&
                fonte.requesterReference === i.contaId &&
                fonte.kind === i.tipo &&
                fonte.planSha256 === i.planoSha256 &&
                isDeepStrictEqual(fonte.plan, plano),
              "DIREITOS_INTEGRIDADE",
              "A fonte não corresponde ao prefixo completo.",
            );
            await conferirMapaHistoricoDeMundos(tx, plano, fonte.worldMap);
          },
          { isolationLevel: "repeatable read", accessMode: "read only" },
        ),
    });
    const [total] = await comLeituraLimitada(config.banco, async (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n
      from recreio.rights_recovery_sources where run_id=${run.id}::uuid`),
    );
    assertAllowed(
      total?.n === prova.referencias.length,
      "DIREITOS_INTEGRIDADE",
      "Fontes fora do prefixo histórico.",
    );
    const coordenacao = Object.freeze({
      assinatura: config.assinatura,
      prova: Object.freeze(prova),
    });
    emitida = coordenacao;
    emitidas.add(coordenacao);
    privadas.set(coordenacao, { banco: config.banco, execucaoId: run.id, cerca: head.sha256 });
    const resultado = await config.executar(coordenacao);
    const atual = await config.storage.lerCabecalho(signal);
    assertAllowed(
      atual.sha256 === head.sha256 && atual.documento.estado === "congelado",
      "DIREITOS_LIVRO",
      "A cerca histórica mudou.",
    );
    await conferirCapacidades(config.banco);
    return resultado;
  } finally {
    if (emitida) privadas.delete(emitida);
    ocupadas.delete(config.banco);
  }
}
