import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { LimitesDoJogo } from "@informach/config/jogos";
import { and, type Database, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioRightsRecoveryEvaluations as evaluations,
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { z } from "zod";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { manifestoNoCatalogo } from "@/features/jogos/catalogo";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import {
  CONSULTA_CAPACIDADES_TEMPORARIAS,
  CONSULTA_CONVITES_PENDENTES,
  CONSULTA_DESTINO_PRIVADO,
  conferirDestinoPrivado,
} from "@/features/recuperacao/cluster-privado";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import {
  conferirOperacaoNaAvaliacao,
  conferirPublicacaoNativaNaAvaliacao,
  conferirReciboDaAvaliacao,
} from "./avaliacao-recuperada-repository";
import {
  conferirFinanceiroAtualRecuperadoLocked,
  type SeloFinanceiroRecuperado,
} from "./encerramento-financeiro-recuperado-guard";
import {
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
type AutoridadeNoBackup = {
  tipo: "adult" | "minor";
  conta: string | null;
  politicaCongelada: number;
  responsabilidade: string | null;
  responsavel: string | null;
};
type Privada = {
  banco: Database;
  execucaoId: string;
  cerca: string;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  signal: AbortSignal;
  admissoes: ReadonlyMap<string, AdmissaoPersistidaNoBackup>;
  publicacoes: ReadonlyMap<string, PublicacaoPendenteNoBackup>;
  finalizando?: boolean;
  operacaoId?: string;
  financeiro?: { contaId: string };
  financeiroAvaliado?: SeloFinanceiroRecuperado;
  autoridades?: ReadonlyMap<string, AutoridadeNoBackup>;
  pai?: CoordenacaoDeEfeitos;
};
type PublicacaoPendenteNoBackup = {
  preparacaoId: string;
  intencaoSha256: string;
  revisao: number;
};
function correspondePublicacaoPendente(
  op: typeof operations.$inferSelect,
  anterior: PublicacaoPendenteNoBackup,
) {
  return (
    op.preparationId === anterior.preparacaoId &&
    op.recoverySourceId === null &&
    op.intentSha256 === anterior.intencaoSha256 &&
    op.revision === anterior.revisao
  );
}
type AdmissaoPersistidaNoBackup = {
  preparacaoId: string | null;
  fonteRecuperadaId: string | null;
  cabecalhoSha256: string;
  intencaoSha256: string;
  revisao: number;
};
function correspondeAdmissaoPersistida(
  op: typeof operations.$inferSelect,
  persistida: AdmissaoPersistidaNoBackup,
) {
  return (
    op.recoverySourceId === persistida.fonteRecuperadaId &&
    op.preparationId === persistida.preparacaoId &&
    op.admittedHeadSha256 === persistida.cabecalhoSha256 &&
    op.intentSha256 === persistida.intencaoSha256 &&
    op.revision === persistida.revisao
  );
}
const privadas = new WeakMap<CoordenacaoDeEfeitos, Privada>(),
  emitidas = new WeakSet<CoordenacaoDeEfeitos>(),
  ocupadas = new WeakSet<Database>();
const filhasAtivas = new WeakSet<CoordenacaoDeEfeitos>();
function contexto(config: CoordenacaoDeEfeitos) {
  const privado = privadas.get(config);
  assertAllowed(
    !emitidas.has(config) || privado,
    "DIREITOS_LIVRO",
    "A coordenação privada terminou.",
  );
  if (privado) {
    assertAllowed(
      !privado.signal.aborted,
      "DIREITOS_LIVRO",
      "O prazo da coordenação privada terminou.",
    );
    if (privado.pai) {
      const pai = privadas.get(privado.pai);
      assertAllowed(
        pai &&
          !pai.signal.aborted &&
          !pai.operacaoId &&
          !pai.finalizando &&
          pai.banco === privado.banco &&
          pai.execucaoId === privado.execucaoId &&
          pai.cerca === privado.cerca,
        "DIREITOS_LIVRO",
        "A execução privada da operação terminou.",
      );
    }
  }
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

export function conferirLeitorDaCoordenacao(
  config: CoordenacaoDeEfeitos,
  leitor: LeitorDeFotografiasPrivadas | null,
) {
  conferirCoordenacaoDeDireitos(config);
  assertAllowed(
    !contexto(config) || leitor === null,
    "DIREITOS_LIVRO",
    "A recuperação privada exige fotografias normalizadas no próprio banco.",
  );
}

/** Keep the exact private capability after I/O; copying its fields is not an
 * authorization. Normal jobs retain complete fresh-prefix verification. */
export async function reconferirCoordenacaoDeDireitos(
  config: CoordenacaoDeEfeitos,
  storage: ReturnType<typeof criarArmazenamentoDoLivro>,
) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  if (privado) {
    assertAllowed(
      storage === privado.storage,
      "DIREITOS_LIVRO",
      "Livro fora da coordenação privada.",
    );
    const head = await storage.lerCabecalho(privado.signal);
    conferirCoordenacaoDeDireitos(config);
    assertAllowed(
      head.sha256 === privado.cerca && head.documento.estado === "congelado",
      "DIREITOS_LIVRO",
      "A cerca histórica mudou.",
    );
    return config;
  }
  const prova = await conferirPrefixoDoLivro({
    storage,
    maxEntradas: 100000,
    tempoLimiteMs: 30000,
  });
  const atual = { assinatura: config.assinatura, prova };
  conferirCoordenacaoDeDireitos(atual);
  return atual;
}

/** Resolve composition before opening a SQL transaction. Offline recovery uses
 * the canonical manifest, including retired games; it never loads host/login
 * configuration or treats publication/classification as erasure authority. */
export async function resolverLimitesDaCoordenacao(
  config: CoordenacaoDeEfeitos,
): Promise<(jogo: string) => LimitesDoJogo> {
  conferirCoordenacaoDeDireitos(config);
  if (contexto(config))
    return (jogo) => {
      conferirCoordenacaoDeDireitos(config);
      const manifesto = manifestoNoCatalogo(jogo, false);
      assertAllowed(
        manifesto,
        "DIREITOS_DEPENDENCIA",
        "O manifesto histórico do jogo precisa de suporte.",
      );
      return manifesto.limites;
    };
  const { limitesDoJogo } = await import("@/features/jogos/config");
  return (jogo) => {
    conferirCoordenacaoDeDireitos(config);
    return limitesDoJogo(jogo);
  };
}
/** Every private data operation requires its own admitted evaluation. Native
 * closures additionally bind the current financial assessment and its token. */
export function escopoDaCoordenacao(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  if (privado?.financeiro) return sql`false`;
  if (privado && !privado.operacaoId) return sql`false`;
  const financeiro = privado?.financeiroAvaliado;
  const tipoPrivado =
    financeiro && privado
      ? sql`${operations.kind}='encerrar_conta' and exists(select 1 from recreio.rights_recovery_finances f
      where f.run_id=${privado.execucaoId}::uuid and f.operation_id=${operations.id} and f.state='current'
      and f.attempt_token=${financeiro.token}::uuid and f.attempts=${financeiro.numero}
      and f.receipt_sha256=${financeiro.reciboSha256} and f.observed_at<=clock_timestamp()
      and f.observed_at>=clock_timestamp()-interval '5 minutes')`
      : eq(operations.kind, "retirar_perfil");
  return privado
    ? sql`(${operations.id}=${privado.operacaoId}::uuid and (${tipoPrivado}) and
      exists(select 1 from recreio.rights_recovery_evaluations e join recreio.rights_recovery_runs r
        on r.id=e.run_id and r.ledger_id=e.ledger_id where e.operation_id=${operations.id}
        and e.ledger_id=${operations.ledgerId} and r.id=${privado.execucaoId}::uuid
        and r.state='replaying' and r.frozen_head_sha256=${privado.cerca}
        and e.state in ('ready','verified') and e.ready_at is not null
        and e.admitted_head_sha256=${operations.admittedHeadSha256}
        and e.intent_sha256=${operations.intentSha256}
        and e.preparation_reference is not distinct from ${operations.preparationId}
        and e.recovery_source_reference is not distinct from ${operations.recoverySourceId}
        and ((e.origin='native' and ${operations.preparationId} is not null and ${operations.recoverySourceId} is null)
          or (e.origin='recovered' and ${operations.preparationId} is null and ${operations.recoverySourceId}=${operations.id}))))`
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
    assertAllowed(
      !privado.financeiro,
      "DIREITOS_LIVRO",
      "Escopo financeiro não autoriza efeitos pessoais.",
    );
    assertAllowed(
      privado.operacaoId === op.id,
      "DIREITOS_INTEGRIDADE",
      "A operação não possui escopo privado ativo.",
    );
    const lida = await conferirAdmissaoPersistidaDaCoordenacao(tx, config, op);
    conferirReciboDaAvaliacao(lida.avaliacao, op);
    assertAllowed(
      lida.execucao.id === privado.execucaoId &&
        lida.execucao.state === "replaying" &&
        (op.kind === "retirar_perfil" ||
          (op.kind === "encerrar_conta" && privado.financeiroAvaliado !== undefined)) &&
        isDeepStrictEqual(
          await referenciasDeMundosDaOperacao(tx, op.id),
          lida.mapa
            .filter((m) => m.mundoVivoId !== null)
            .map((m) => ({ id: m.mundoReferencia, jogo: m.jogo })),
        ),
      "DIREITOS_INTEGRIDADE",
      "A operação não pertence à coordenação privada.",
    );
    if (op.kind === "encerrar_conta") {
      assertAllowed(
        privado.financeiroAvaliado && lida.plano.formato === "recreio-previa-encerramento-v2",
        "DIREITOS_INTEGRIDADE",
        "Encerramento privado fora do perfil qualificado.",
      );
      await conferirFinanceiroAtualRecuperadoLocked(
        tx,
        op,
        lida.plano,
        { execucaoId: privado.execucaoId, cercaSha256: privado.cerca },
        privado.financeiroAvaliado,
      );
    }
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
    maxEntradas: z.number().int().min(0).max(100000),
  }).parse({
    execucaoId: config.execucaoId,
    capturaSha256: config.capturaSha256,
    fonte: config.fonte,
    tempoLimiteMs: config.tempoLimiteMs,
    maxEntradas: config.maxEntradas,
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
    const linhasAdmitidas = await comLeituraLimitada(config.banco, (tx) =>
      tx
        .select({
          id: operations.id,
          preparacaoId: operations.preparationId,
          fonteRecuperadaId: operations.recoverySourceId,
          cabecalhoSha256: operations.admittedHeadSha256,
          intencaoSha256: operations.intentSha256,
          revisao: operations.revision,
        })
        .from(operations)
        .where(
          and(
            eq(operations.ledgerId, config.assinatura.livroId),
            inArray(operations.state, ["admitted", "running", "completed"]),
          ),
        )
        .orderBy(operations.id)
        .limit(config.maxEntradas + 1),
    );
    assertAllowed(
      linhasAdmitidas.length <= config.maxEntradas,
      "DIREITOS_INTEGRIDADE",
      "Admissões anteriores excedem o perfil.",
    );
    const admissoes = new Map<string, AdmissaoPersistidaNoBackup>();
    for (const linha of linhasAdmitidas) {
      assertAllowed(
        linha.cabecalhoSha256 &&
          ((linha.preparacaoId !== null && linha.fonteRecuperadaId === null) ||
            (linha.preparacaoId === null && linha.fonteRecuperadaId === linha.id)),
        "DIREITOS_INTEGRIDADE",
        "Admissão anterior incompleta.",
      );
      admissoes.set(linha.id, {
        preparacaoId: linha.preparacaoId,
        fonteRecuperadaId: linha.fonteRecuperadaId,
        cabecalhoSha256: linha.cabecalhoSha256,
        intencaoSha256: linha.intencaoSha256,
        revisao: linha.revisao,
      });
    }
    const prova = await conferirPrefixoDoLivro({
      storage: config.storage,
      maxEntradas: config.maxEntradas,
      tempoLimiteMs: config.tempoLimiteMs,
      signal,
      admissoes: [...admissoes].map(([operacaoId, n]) => ({
        operacaoId,
        revisao: n.revisao,
        sha256: n.intencaoSha256,
        cabecalhoSha256: n.cabecalhoSha256,
      })),
    });
    const publicacoesPendentes = await comLeituraLimitada(config.banco, (tx) =>
      tx
        .select({
          id: operations.id,
          kind: operations.kind,
          preparationId: operations.preparationId,
          recoverySourceId: operations.recoverySourceId,
          revision: operations.revision,
          intentSha256: operations.intentSha256,
          admittedHeadSha256: operations.admittedHeadSha256,
          admittedAt: operations.admittedAt,
          completedAt: operations.completedAt,
        })
        .from(operations)
        .where(
          and(
            eq(operations.ledgerId, config.assinatura.livroId),
            eq(operations.state, "publishing"),
          ),
        )
        .orderBy(operations.id)
        .limit(config.maxEntradas + 1),
    );
    assertAllowed(
      publicacoesPendentes.length <= config.maxEntradas,
      "DIREITOS_INTEGRIDADE",
      "Publicações anteriores excedem o perfil.",
    );
    const publicacoes = new Map<string, PublicacaoPendenteNoBackup>();
    const referenciasPorOperacao = new Map(prova.referencias.map((r) => [r.operacaoId, r]));
    for (const op of publicacoesPendentes) {
      const referencia = referenciasPorOperacao.get(op.id);
      if (
        (op.kind !== "retirar_perfil" && op.kind !== "encerrar_conta") ||
        referencia?.revisao !== op.revision ||
        referencia.sha256 !== op.intentSha256
      )
        continue;
      assertAllowed(
        op.preparationId !== null &&
          op.recoverySourceId === null &&
          op.admittedHeadSha256 === null &&
          op.admittedAt === null &&
          op.completedAt === null,
        "DIREITOS_INTEGRIDADE",
        "Publicação nativa anterior divergente.",
      );
      publicacoes.set(op.id, {
        preparacaoId: op.preparationId,
        intencaoSha256: op.intentSha256,
        revisao: op.revision,
      });
    }
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
              .where(eq(sources.operationId, i.operacaoId));
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
            const [avaliacao] = await tx
              .select()
              .from(evaluations)
              .where(and(eq(evaluations.runId, run.id), eq(evaluations.operationId, i.operacaoId)));
            assertAllowed(
              avaliacao &&
                avaliacao.ledgerId === i.livroId &&
                avaliacao.requesterReference === i.contaId &&
                avaliacao.kind === i.tipo &&
                avaliacao.planSha256 === i.planoSha256,
              "DIREITOS_INTEGRIDADE",
              "Avaliação fora do prefixo completo.",
            );
            await conferirMapaHistoricoDeMundos(tx, plano, avaliacao.worldMap);
            const publicacao = publicacoes.get(i.operacaoId);
            if (publicacao) {
              const [op] = await tx
                .select()
                .from(operations)
                .where(eq(operations.id, i.operacaoId));
              assertAllowed(
                op && correspondePublicacaoPendente(op, publicacao),
                "DIREITOS_INTEGRIDADE",
                "Publicação anterior mudou durante a conferência.",
              );
              await conferirPublicacaoNativaNaAvaliacao(tx, op, config.assinatura, {
                execucaoId: run.id,
                cercaSha256: head.sha256,
              });
            }
            const persistida = admissoes.get(i.operacaoId);
            if (persistida) {
              const [op] = await tx
                .select()
                .from(operations)
                .where(eq(operations.id, i.operacaoId));
              assertAllowed(
                op && correspondeAdmissaoPersistida(op, persistida),
                "DIREITOS_INTEGRIDADE",
                "Admissão anterior mudou durante a conferência.",
              );
              await conferirOperacaoNaAvaliacao(tx, op, config.assinatura, {
                execucaoId: run.id,
                cercaSha256: head.sha256,
              });
            }
          },
          { isolationLevel: "repeatable read", accessMode: "read only" },
        ),
    });
    const [total] = await comLeituraLimitada(config.banco, async (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n
      from recreio.rights_recovery_evaluations where run_id=${run.id}::uuid`),
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
    privadas.set(coordenacao, {
      banco: config.banco,
      execucaoId: run.id,
      cerca: head.sha256,
      storage: config.storage,
      signal,
      admissoes,
      publicacoes,
    });
    const resultado = await config.executar(coordenacao);
    conferirCoordenacaoDeDireitos(coordenacao);
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

/** Metadata for the fixed historical admission service; never mints a child
 * scope or transforms an operator into the original requester. */
export function dadosDaCoordenacaoPrivada(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  assertAllowed(
    privado && !privado.operacaoId && !privado.finalizando,
    "DIREITOS_LIVRO",
    "Coordenação privada de execução ausente.",
  );
  return {
    banco: privado.banco,
    execucaoId: privado.execucaoId,
    cerca: privado.cerca,
    storage: privado.storage,
    signal: privado.signal,
  };
}

/** Only the original native publication authenticated while minting this root
 * capability can receive SQL confirmation. Never admits a child or does I/O. */
export async function conferirPublicacaoPendenteDaCoordenacao(
  tx: Transacao,
  config: CoordenacaoDeEfeitos,
  op: typeof operations.$inferSelect,
) {
  dadosDaCoordenacaoPrivada(config);
  const privado = contexto(config),
    anterior = privado?.publicacoes.get(op.id);
  assertAllowed(
    privado && anterior && correspondePublicacaoPendente(op, anterior),
    "DIREITOS_INTEGRIDADE",
    "Publicação fora da prova privada.",
  );
  return conferirPublicacaoNativaNaAvaliacao(tx, op, config.assinatura, {
    execucaoId: privado.execucaoId,
    cercaSha256: privado.cerca,
  });
}

/** The original persisted admission was checked against the complete ancestor
 * chain before this private capability was minted. This never changes origin
 * or dates and does not admit a different operation through a child scope. */
export async function conferirAdmissaoPersistidaDaCoordenacao(
  tx: Transacao,
  config: CoordenacaoDeEfeitos,
  op: typeof operations.$inferSelect,
) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config),
    anterior = privado?.admissoes.get(op.id),
    publicacao = privado?.publicacoes.get(op.id);
  assertAllowed(
    privado &&
      (!privado.operacaoId || privado.operacaoId === op.id) &&
      (anterior
        ? correspondeAdmissaoPersistida(op, anterior)
        : op.admittedHeadSha256 === privado.cerca &&
          ((op.preparationId === null && op.recoverySourceId === op.id) ||
            (publicacao !== undefined && correspondePublicacaoPendente(op, publicacao)))),
    "DIREITOS_INTEGRIDADE",
    "Admissão fora da prova privada.",
  );
  return conferirOperacaoNaAvaliacao(tx, op, config.assinatura, {
    execucaoId: privado.execucaoId,
    cercaSha256: privado.cerca,
  });
}

/** Terminal private phase. No child or admission may start after this point;
 * in-flight children are refused and roll back before commit. The factory
 * still performs its final external fence check and owns connection cleanup. */
export async function comVerificacaoFinalPrivada<T>(
  config: CoordenacaoDeEfeitos,
  executar: (dados: ReturnType<typeof dadosDaCoordenacaoPrivada>) => Promise<T>,
) {
  const dados = dadosDaCoordenacaoPrivada(config),
    privado = contexto(config);
  assertAllowed(
    privado && !filhasAtivas.has(config),
    "DIREITOS_LIVRO",
    "A coordenação ainda tem uma operação ativa.",
  );
  privado.finalizando = true;
  try {
    return await executar(dados);
  } catch (erro) {
    privado.finalizando = false;
    throw erro;
  }
}

/** At most one active operation per execution; at most 256 authority records.
 * Original signed responsibility remains in the plan/subject. Backup authority
 * is only a sealed consistency snapshot, never a reassignment to that actor. */
export async function comOperacaoPrivadaDeDireitos<T>(
  config: CoordenacaoDeEfeitos,
  operacaoId: string,
  executar: (coordenacao: CoordenacaoDeEfeitos) => Promise<T>,
) {
  z.uuid().parse(operacaoId);
  const privado = contexto(config);
  conferirCoordenacaoDeDireitos(config);
  assertAllowed(
    privado && !privado.operacaoId && !privado.finalizando && !filhasAtivas.has(config),
    "DIREITOS_LIVRO",
    "A execução já tem operação privada ativa.",
  );
  filhasAtivas.add(config);
  let emitida: CoordenacaoDeEfeitos | undefined;
  let financeiroAvaliado: SeloFinanceiroRecuperado | undefined;
  try {
    const autoridades = await privado.banco.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      const [op] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, operacaoId))
        .for("update");
      assertAllowed(
        op &&
          (op.kind === "retirar_perfil" || op.kind === "encerrar_conta") &&
          (op.state === "admitted" || op.state === "running" || op.state === "completed") &&
          config.prova.referencias.some(
            (r) =>
              r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
          ),
        "DIREITOS_INTEGRIDADE",
        "Operação histórica não admitida.",
      );
      const lida = await conferirAdmissaoPersistidaDaCoordenacao(tx, config, op);
      conferirReciboDaAvaliacao(lida.avaliacao, op);
      if (op.kind === "encerrar_conta") {
        assertAllowed(
          op.preparationId !== null &&
            op.recoverySourceId === null &&
            lida.plano.formato === "recreio-previa-encerramento-v2",
          "DIREITOS_INTEGRIDADE",
          "Encerramento privado fora do perfil qualificado.",
        );
        financeiroAvaliado = await conferirFinanceiroAtualRecuperadoLocked(tx, op, lida.plano, {
          execucaoId: privado.execucaoId,
          cercaSha256: privado.cerca,
        });
      }
      assertAllowed(
        lida.execucao.id === privado.execucaoId &&
          lida.execucao.state === "replaying" &&
          isDeepStrictEqual(
            await referenciasDeMundosDaOperacao(tx, op.id),
            lida.mapa
              .filter((m) => m.mundoVivoId !== null)
              .map((m) => ({ id: m.mundoReferencia, jogo: m.jogo })),
          ),
        "DIREITOS_INTEGRIDADE",
        "Mundos fora da operação histórica.",
      );
      const mundos = lida.mapa.filter((m) => m.mundoVivoId !== null).map((m) => m.mundoReferencia);
      if (mundos.length)
        await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(inArray(spaces.id, mundos))
          .orderBy(spaces.id)
          .for("update");
      const alvos = await tx
        .select()
        .from(subjects)
        .where(eq(subjects.operationId, op.id))
        .orderBy(subjects.profileReference);
      const selecionados = alvos.filter((s) => s.phase === "selected");
      const ids = selecionados.map((s) => s.profileReference);
      const presentes = ids.length
        ? await tx
            .select()
            .from(profiles)
            .where(inArray(profiles.id, ids))
            .orderBy(profiles.id)
            .for("update")
        : [];
      const vinculos = ids.length
        ? await tx
            .select()
            .from(guardians)
            .where(inArray(guardians.profileId, ids))
            .orderBy(guardians.profileId)
            .for("share")
        : [];
      assertAllowed(
        presentes.length === ids.length,
        "DIREITOS_INTEGRIDADE",
        "Sujeito selecionado ausente sem recibo.",
      );
      const mapa = new Map<string, AutoridadeNoBackup>();
      for (const p of presentes) {
        const s = selecionados.find((s) => s.profileReference === p.id),
          original = lida.plano.perfis.find((s) => s.id === p.id),
          g = vinculos.find((g) => g.profileId === p.id);
        assertAllowed(
          s &&
            original &&
            p.kind === original.tipo &&
            p.rightsOperationId === op.id &&
            p.status === "suspended" &&
            p.rightsFrozenState !== null &&
            p.policyVersion === s.policyVersion + 1 &&
            s.guardianReference === original.responsabilidadeId &&
            (p.kind === "adult" ? p.userId === op.requesterUserId && !g : !!g),
          "DIREITOS_INTEGRIDADE",
          "A autoridade do backup não corresponde ao sujeito congelado.",
        );
        mapa.set(p.id, {
          tipo: p.kind,
          conta: p.userId,
          politicaCongelada: p.policyVersion,
          responsabilidade: g?.id ?? null,
          responsavel: g?.guardianUserId ?? null,
        });
      }
      return mapa;
    });
    const filha = Object.freeze({ assinatura: config.assinatura, prova: config.prova });
    emitida = filha;
    emitidas.add(filha);
    contexto(config);
    privadas.set(filha, { ...privado, operacaoId, autoridades, financeiroAvaliado, pai: config });
    const resultado = await executar(filha);
    conferirCoordenacaoDeDireitos(filha);
    const head = await privado.storage.lerCabecalho(privado.signal);
    assertAllowed(
      head.sha256 === privado.cerca && head.documento.estado === "congelado",
      "DIREITOS_LIVRO",
      "A cerca histórica mudou.",
    );
    return resultado;
  } finally {
    if (emitida) privadas.delete(emitida);
    filhasAtivas.delete(config);
  }
}

/** A financial child is deliberately disjoint from profile erasure. It only
 * admits an original native closure authenticated while minting the parent;
 * no browser login, recovery import or SQL-ready receipt is manufactured. */
export async function comFinanceiroPrivadoDeEncerramento<T>(
  config: CoordenacaoDeEfeitos,
  operacaoId: string,
  executar: (coordenacao: CoordenacaoDeEfeitos) => Promise<T>,
) {
  z.uuid().parse(operacaoId);
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  assertAllowed(
    privado && !privado.operacaoId && !privado.finalizando && !filhasAtivas.has(config),
    "DIREITOS_LIVRO",
    "A execução já tem operação privada ativa.",
  );
  filhasAtivas.add(config);
  let emitida: CoordenacaoDeEfeitos | undefined;
  try {
    const contaId = await privado.banco.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      const [op] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, operacaoId))
        .for("share");
      assertAllowed(
        op &&
          op.kind === "encerrar_conta" &&
          op.preparationId !== null &&
          op.recoverySourceId === null &&
          ["admitted", "running", "completed"].includes(op.state) &&
          config.prova.referencias.some(
            (r) =>
              r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
          ),
        "DIREITOS_INTEGRIDADE",
        "Encerramento nativo histórico não admitido.",
      );
      const lida = await conferirAdmissaoPersistidaDaCoordenacao(tx, config, op);
      assertAllowed(
        lida.execucao.id === privado.execucaoId &&
          lida.plano.formato === "recreio-previa-encerramento-v2",
        "DIREITOS_INTEGRIDADE",
        "Fonte financeira fora da recuperação atual.",
      );
      return op.requesterUserId;
    });
    const filha = Object.freeze({ assinatura: config.assinatura, prova: config.prova });
    emitida = filha;
    emitidas.add(filha);
    contexto(config);
    privadas.set(filha, {
      ...privado,
      operacaoId,
      financeiro: { contaId },
      autoridades: undefined,
      pai: config,
    });
    const resultado = await executar(filha);
    await reconferirCoordenacaoDeDireitos(filha, privado.storage);
    return resultado;
  } finally {
    if (emitida) privadas.delete(emitida);
    filhasAtivas.delete(config);
  }
}

function financeiroPrivado(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  assertAllowed(
    privado?.financeiro && privado.operacaoId,
    "DIREITOS_LIVRO",
    "Escopo financeiro privado ausente.",
  );
  return privado;
}
export function exigirFinanceiroPrivado(config: CoordenacaoDeEfeitos) {
  financeiroPrivado(config);
}
/** Technical financial scope only. These fields are not a data-effect capability. */
export function dadosFinanceirosDaCoordenacaoPrivada(config: CoordenacaoDeEfeitos) {
  const privado = financeiroPrivado(config);
  const operacaoId = privado.operacaoId,
    contaId = privado.financeiro?.contaId;
  assertAllowed(operacaoId && contaId, "DIREITOS_LIVRO", "Escopo financeiro privado ausente.");
  return {
    banco: privado.banco,
    execucaoId: privado.execucaoId,
    cerca: privado.cerca,
    operacaoId,
    contaId,
  };
}
export function reconferirFinanceiroPrivado(config: CoordenacaoDeEfeitos) {
  return reconferirCoordenacaoDeDireitos(config, financeiroPrivado(config).storage);
}
export function escopoFinanceiroDaCoordenacao(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  if (!privado) return isNull(operations.recoverySourceId);
  if (!privado.financeiro || !privado.operacaoId) return sql`false`;
  return sql`${operations.id}=${privado.operacaoId}::uuid and ${operations.kind}='encerrar_conta'
    and ${operations.preparationId} is not null and ${operations.recoverySourceId} is null`;
}
export async function conferirIntencaoFinanceiraDaCoordenacao(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  config: CoordenacaoDeEfeitos,
) {
  conferirCoordenacaoDeDireitos(config);
  if (!contexto(config)) return conferirIntencaoDaCoordenacao(tx, op, config);
  const privado = financeiroPrivado(config);
  assertAllowed(
    op.id === privado.operacaoId &&
      op.requesterUserId === privado.financeiro?.contaId &&
      op.kind === "encerrar_conta" &&
      op.preparationId !== null &&
      op.recoverySourceId === null &&
      config.prova.referencias.some(
        (r) => r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
      ),
    "DIREITOS_INTEGRIDADE",
    "Encerramento fora do escopo financeiro privado.",
  );
  const lida = await conferirAdmissaoPersistidaDaCoordenacao(tx, config, op);
  assertAllowed(
    lida.plano.formato === "recreio-previa-encerramento-v2",
    "DIREITOS_INTEGRIDADE",
    "Plano financeiro histórico inválido.",
  );
  return { plano: lida.plano, intencao: lida.intencao };
}
export function comCicloFinanceiroDaCoordenacao<T>(
  config: CoordenacaoDeEfeitos,
  contaId: string,
  executar: () => Promise<T>,
): Promise<T> {
  conferirCoordenacaoDeDireitos(config);
  if (!contexto(config)) return comCicloDeCobranca(contaId, executar);
  const privado = financeiroPrivado(config);
  assertAllowed(
    privado.financeiro?.contaId === contaId,
    "DIREITOS_INTEGRIDADE",
    "Pagante fora da operação privada.",
  );
  // The private socket has one parent and one active child, held across this
  // callback. Never open a second, implicit lock pool using DATABASE_URL.
  return executar();
}

export function autoridadeDoPerfilCongelado(
  config: CoordenacaoDeEfeitos,
  op: typeof operations.$inferSelect,
  perfil: typeof profiles.$inferSelect,
  vinculo: typeof guardians.$inferSelect | undefined,
  alvo: typeof subjects.$inferSelect | undefined,
) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  if (!privado)
    return perfil.kind === "adult"
      ? perfil.userId === op.requesterUserId
      : vinculo?.guardianUserId === op.requesterUserId && vinculo.id === alvo?.guardianReference;
  assertAllowed(
    privado.operacaoId === op.id,
    "DIREITOS_INTEGRIDADE",
    "Operação privada fora de escopo.",
  );
  const original = privado.autoridades?.get(perfil.id);
  return (
    !!original &&
    perfil.kind === original.tipo &&
    perfil.userId === original.conta &&
    perfil.policyVersion === original.politicaCongelada &&
    (vinculo?.id ?? null) === original.responsabilidade &&
    (vinculo?.guardianUserId ?? null) === original.responsavel
  );
}
