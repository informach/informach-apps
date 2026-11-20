import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { z } from "zod";
import type { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import type { criarAssinaturaDoLivro } from "../../src/features/direitos/livro/assinatura";
import { FalhaDoLivroDeDireitos } from "../../src/features/direitos/livro/contrato";
import { conferirPrefixoDoLivro } from "../../src/features/direitos/livro/leitura";
import { reaplicarPlanosConsentidos } from "../../src/features/direitos/livro/reaplicacao-planos";
import { conferirCapacidadesRestauradas } from "./normalizar-capacidades";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";

const Identificacao = z.strictObject({
  capturaSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fonte: z.string().regex(/^[a-f0-9]{40}$/),
});
function exigir(v: unknown): asserts v {
  if (!v) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
}

/** Stages authenticated historical sources in the already restored, compared
 * and capability-normalized private cluster. It never recreates accounts,
 * issues interactive consent, creates native operations or authorizes effects.
 * A partial import remains replaying; repetitions compare rather than overwrite.
 * The owner of `copia` retains its connection and cluster cleanup obligations. */
export async function importarFontesHistoricasDeDireitos(config: {
  copia: postgres.Sql;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  capturaSha256: string;
  fonte: string;
  maxEntradas: number;
  maxBytesPlanos: number;
  tempoLimiteMs: number;
  signal?: AbortSignal;
}) {
  const identificacao = Identificacao.parse({
    capturaSha256: config.capturaSha256,
    fonte: config.fonte,
  });
  const { copia, storage, assinatura } = config;
  z.number().int().min(1).max(900_000).parse(config.tempoLimiteMs);
  await exigirBancoPrivadoDeRecuperacao(copia);
  await conferirCapacidadesRestauradas(copia);
  const prazo = AbortSignal.timeout(config.tempoLimiteMs),
    signal = config.signal ? AbortSignal.any([config.signal, prazo]) : prazo;
  const prova = await conferirPrefixoDoLivro({
    storage,
    maxEntradas: config.maxEntradas,
    tempoLimiteMs: config.tempoLimiteMs,
    signal,
  });
  const head = prova.cabecalho,
    doc = head.documento;
  exigir(
    doc.estado === "congelado" &&
      doc.livroId === assinatura.livroId &&
      doc.epoca < 15 &&
      !doc.chavesUtilizadas.includes(assinatura.chaveAtiva),
  );
  // This provenance schema stores one immutable decision per operation. Do
  // not silently collapse multiple revisions into the last observed plan.
  exigir(new Set(prova.referencias.map((r) => r.operacaoId)).size === prova.referencias.length);
  let runId: string | undefined;
  const propostaId = randomUUID();
  async function comExecucao<T>(executar: (tx: postgres.TransactionSql, id: string) => Promise<T>) {
    if (signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
    return copia.begin(async (tx) => {
      await tx.unsafe("set local statement_timeout='5000ms'");
      await tx.unsafe("set local lock_timeout='2000ms'");
      await tx.unsafe("set local transaction_timeout='15000ms'");
      await tx.unsafe(
        "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))",
        [`recreio:recovery-import:${doc.livroId}`],
      );
      await tx.unsafe(
        `insert into recreio.rights_recovery_runs
        (id,ledger_id,frozen_head_sha256,capture_sha256,frozen_epoch,frozen_signing_key_id,next_signing_key_id,source)
        values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(ledger_id,frozen_head_sha256) do nothing`,
        [
          propostaId,
          doc.livroId,
          head.sha256,
          identificacao.capturaSha256,
          doc.epoca,
          head.chaveId,
          assinatura.chaveAtiva,
          identificacao.fonte,
        ],
      );
      const [run] = await tx.unsafe<
        {
          id: string;
          capture_sha256: string;
          frozen_epoch: number;
          frozen_signing_key_id: string;
          next_signing_key_id: string;
          source: string;
          state: string;
        }[]
      >(
        `select id,capture_sha256,frozen_epoch,frozen_signing_key_id,next_signing_key_id,source,state
        from recreio.rights_recovery_runs where ledger_id=$1 and frozen_head_sha256=$2 for update`,
        [doc.livroId, head.sha256],
      );
      exigir(
        run &&
          run.capture_sha256 === identificacao.capturaSha256 &&
          run.frozen_epoch === doc.epoca &&
          run.frozen_signing_key_id === head.chaveId &&
          run.next_signing_key_id === assinatura.chaveAtiva &&
          run.source === identificacao.fonte &&
          run.state === "replaying",
      );
      runId = run.id;
      return executar(tx, run.id);
    });
  }
  const r = await reaplicarPlanosConsentidos({
    storage,
    maxEntradas: config.maxEntradas,
    maxBytesPlanos: config.maxBytesPlanos,
    tempoLimiteMs: config.tempoLimiteMs,
    cercaSha256: head.sha256,
    signal,
    aplicar: async (intencao, plano) => {
      await comExecucao(async (tx, id) => {
        const ids = plano.mundos.map((m) => m.id),
          vivos = ids.length
            ? await tx.unsafe<{ id: string; game_id: string }[]>(
                "select id,game_id from recreio.spaces where id=any($1::uuid[]) order by id for share",
                [ids],
              )
            : [];
        const mapa = plano.mundos.map((m) => {
          const vivo = vivos.find((v) => v.id === m.id);
          exigir(!vivo || vivo.game_id === m.jogo);
          return { mundoReferencia: m.id, jogo: m.jogo, mundoVivoId: vivo?.id ?? null };
        });
        await tx.unsafe(
          `insert into recreio.rights_recovery_sources
          (operation_id,run_id,ledger_id,requester_reference,kind,plan_sha256,plan,world_map)
          values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) on conflict(operation_id) do nothing`,
          [
            intencao.operacaoId,
            id,
            doc.livroId,
            intencao.contaId,
            intencao.tipo,
            intencao.planoSha256,
            JSON.stringify(plano),
            JSON.stringify(mapa),
          ],
        );
        const [fonte] = await tx.unsafe<
          {
            run_id: string;
            ledger_id: string;
            requester_reference: string;
            kind: string;
            plan_sha256: string;
            plan: unknown;
            world_map: unknown;
          }[]
        >(
          `select run_id,ledger_id,requester_reference,kind,plan_sha256,plan,world_map
          from recreio.rights_recovery_sources where operation_id=$1 for share`,
          [intencao.operacaoId],
        );
        exigir(
          fonte &&
            fonte.run_id === id &&
            fonte.ledger_id === doc.livroId &&
            fonte.requester_reference === intencao.contaId &&
            fonte.kind === intencao.tipo &&
            fonte.plan_sha256 === intencao.planoSha256 &&
            isDeepStrictEqual(fonte.plan, plano) &&
            isDeepStrictEqual(fonte.world_map, mapa),
        );
      });
    },
  });
  // Empty books have no callback; their run is created only after both complete
  // checks. No source or run is created before the full plan preflight succeeds.
  if (!runId) await comExecucao(async () => undefined);
  await conferirCapacidadesRestauradas(copia);
  exigir(runId);
  return {
    execucaoId: runId,
    cercaSha256: r.cabecalhoSha256,
    fontesConferidas: r.entradasReaplicadas,
    bytesConferidos: r.bytesConferidos,
    execucaoAutorizada: false as const,
    trafegoAutorizado: false as const,
  };
}
