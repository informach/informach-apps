import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { LimitesDoJogo } from "@informach/config/jogos";
import { and, type Database, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { z } from "zod";
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
  operacaoId?: string;
  autoridades?: ReadonlyMap<string, AutoridadeNoBackup>;
  pai?: CoordenacaoDeEfeitos;
};
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
/** Private scope is restricted to withdrawn profiles until the historical
 * financial coordinator is implemented. Closure is never silently settled. */
export function escopoDaCoordenacao(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
  const privado = contexto(config);
  if (privado && !privado.operacaoId) return sql`false`;
  return privado
    ? sql`(${operations.id}=${privado.operacaoId}::uuid and ${operations.kind}='retirar_perfil' and
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
    assertAllowed(
      privado.operacaoId === op.id,
      "DIREITOS_INTEGRIDADE",
      "A operação não possui escopo privado ativo.",
    );
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
    privadas.set(coordenacao, {
      banco: config.banco,
      execucaoId: run.id,
      cerca: head.sha256,
      storage: config.storage,
      signal,
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
    privado && !privado.operacaoId,
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
    privado && !privado.operacaoId && !filhasAtivas.has(config),
    "DIREITOS_LIVRO",
    "A execução já tem operação privada ativa.",
  );
  filhasAtivas.add(config);
  let emitida: CoordenacaoDeEfeitos | undefined;
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
          op.kind === "retirar_perfil" &&
          (op.state === "admitted" || op.state === "running" || op.state === "completed") &&
          op.admittedHeadSha256 === privado.cerca &&
          config.prova.referencias.some(
            (r) =>
              r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
          ),
        "DIREITOS_INTEGRIDADE",
        "Operação histórica não admitida.",
      );
      const lida = await conferirIntencaoHistoricaRecuperada(tx, op, config.assinatura);
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
    privadas.set(filha, { ...privado, operacaoId, autoridades, pai: config });
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
